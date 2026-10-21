package store

import (
	"database/sql"
	"encoding/json"
	"errors"
)

// FactionCharacter is a faction's character picture and, once synced, its OpenAI file id; with where it is
// pasted on the faction card template, and that template's last upload.
type FactionCharacter struct {
	FactionID       int64              `json:"faction_id"`
	Path            string             `json:"-"`
	OpenAIFileID    string             `json:"openai_file_id"`
	Placement       CharacterPlacement `json:"placement"`
	CompositeKey    string             `json:"-"`
	CompositeFileID string             `json:"-"`
}

// CharacterPlacement is the character's centre (fractions of the template's width and height), its height
// (a fraction of the template's height) and the box it is cut to (fractions of the template).
type CharacterPlacement struct {
	X     float64      `json:"x"`
	Y     float64      `json:"y"`
	Scale float64      `json:"scale"`
	Box   PlacementBox `json:"box"`
}
type PlacementBox struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

// DefaultCharacterPlacement fills the faction card's illustration area on the left.
var DefaultCharacterPlacement = CharacterPlacement{X: 0.2, Y: 0.5, Scale: 1, Box: PlacementBox{X: 0, Y: 0, W: 0.42, H: 1}}

func parsePlacement(raw string) CharacterPlacement {
	p := DefaultCharacterPlacement
	if raw != "" && json.Unmarshal([]byte(raw), &p) != nil || p.Scale <= 0 {
		return DefaultCharacterPlacement
	}
	// Saved before there was a box: the whole template.
	if p.Box.W <= 0 || p.Box.H <= 0 {
		p.Box = PlacementBox{X: 0, Y: 0, W: 1, H: 1}
	}
	return p
}

type CharactersStore struct{ db *sql.DB }

func NewCharactersStore(db *sql.DB) *CharactersStore { return &CharactersStore{db: db} }

const characterCols = `faction_id, path, COALESCE(openai_file_id,''), placement, composite_key, composite_file_id`

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
	err := row.Scan(&c.FactionID, &c.Path, &c.OpenAIFileID, &placement, &c.CompositeKey, &c.CompositeFileID)
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

// SetPlacement stores where the character is pasted on the template.
func (s *CharactersStore) SetPlacement(factionID int64, p CharacterPlacement) error {
	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}
	return s.update(factionID, `placement=?`, string(raw))
}

// SetComposite remembers the template with the character uploaded to OpenAI, and what it was made from.
func (s *CharactersStore) SetComposite(factionID int64, key, fileID string) error {
	return s.update(factionID, `composite_key=?, composite_file_id=?`, key, fileID)
}

func (s *CharactersStore) update(factionID int64, set string, args ...any) error {
	res, err := s.db.Exec(`UPDATE faction_characters SET `+set+`, updated_at=datetime('now') WHERE faction_id=?`, append(args, factionID)...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// Set stores a new picture, dropping the old one's file id (it must be synced again), and returns the
// replaced picture's path ("" if none) so the caller can remove it.
func (s *CharactersStore) Set(factionID int64, path string) (string, error) {
	old, err := s.Get(factionID)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return "", err
	}
	_, err = s.db.Exec(`INSERT INTO faction_characters(faction_id,path) VALUES(?,?)
		ON CONFLICT(faction_id) DO UPDATE SET path=excluded.path, openai_file_id=NULL, updated_at=datetime('now')`, factionID, path)
	return old.Path, err
}

func (s *CharactersStore) SetFileID(factionID int64, fileID string) error {
	return s.update(factionID, `openai_file_id=?`, fileID)
}

func (s *CharactersStore) Delete(factionID int64) (string, error) {
	old, err := s.Get(factionID)
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec(`DELETE FROM faction_characters WHERE faction_id=?`, factionID)
	return old.Path, err
}
