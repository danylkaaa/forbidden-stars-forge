package store

import (
	"database/sql"
	"encoding/json"
	"errors"
)

// FactionCharacter is a faction's character picture and where it sits on a "with character" image.
type FactionCharacter struct {
	FactionID int64              `json:"faction_id"`
	Path      string             `json:"-"`
	Placement CharacterPlacement `json:"placement"`
}

// CharacterPlacement is the character's centre (fractions of the image's width and height) and its height
// (a fraction of the image's height); Flip mirrors it left to right.
type CharacterPlacement struct {
	X     float64 `json:"x"`
	Y     float64 `json:"y"`
	Scale float64 `json:"scale"`
	Flip  bool    `json:"flip"`
}

var DefaultCharacterPlacement = CharacterPlacement{X: 0.25, Y: 0.5, Scale: 0.9}

func parsePlacement(raw string) CharacterPlacement {
	p := DefaultCharacterPlacement
	if raw != "" && json.Unmarshal([]byte(raw), &p) != nil || p.Scale <= 0 {
		return DefaultCharacterPlacement
	}
	return p
}

type CharactersStore struct{ db *sql.DB }

func NewCharactersStore(db *sql.DB) *CharactersStore { return &CharactersStore{db: db} }

const characterCols = `faction_id, path, placement`

func (s *CharactersStore) List() ([]FactionCharacter, error) {
	rows, err := s.db.Query(`SELECT ` + characterCols + ` FROM faction_characters ORDER BY faction_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FactionCharacter{}
	for rows.Next() {
		c, err := scanCharacter(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func scanCharacter(row interface{ Scan(...any) error }) (FactionCharacter, error) {
	var c FactionCharacter
	var placement string
	err := row.Scan(&c.FactionID, &c.Path, &placement)
	c.Placement = parsePlacement(placement)
	return c, err
}

func (s *CharactersStore) Get(factionID int64) (FactionCharacter, error) {
	c, err := scanCharacter(s.db.QueryRow(`SELECT `+characterCols+` FROM faction_characters WHERE faction_id=?`, factionID))
	if errors.Is(err, sql.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}

func (s *CharactersStore) SetPlacement(factionID int64, p CharacterPlacement) error {
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	res, err := s.db.Exec(`UPDATE faction_characters SET placement=?, updated_at=datetime('now') WHERE faction_id=?`, string(raw), factionID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// Set stores a new picture and returns the replaced picture's path ("" if none) so the caller can remove it.
func (s *CharactersStore) Set(factionID int64, path string) (string, error) {
	old, err := s.Get(factionID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return "", err
	}
	_, err = s.db.Exec(`INSERT INTO faction_characters(faction_id,path) VALUES(?,?)
		ON CONFLICT(faction_id) DO UPDATE SET path=excluded.path, updated_at=datetime('now')`, factionID, path)
	return old.Path, err
}

func (s *CharactersStore) Delete(factionID int64) (string, error) {
	old, err := s.Get(factionID)
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec(`DELETE FROM faction_characters WHERE faction_id=?`, factionID)
	return old.Path, err
}
