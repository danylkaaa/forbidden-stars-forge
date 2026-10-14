package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"regexp"
)

var (
	factionCardColor = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	factionAssetKey  = regexp.MustCompile(`^[a-z0-9-]{1,40}$`)
)

const DefaultUnitColor = "#8e3a8a"

type FactionCard struct {
	FactionID     int64           `json:"faction_id"`
	Data          json.RawMessage `json:"data"`
	FrontImageKey string          `json:"front_image_key"`
	BackImageKey  string          `json:"back_image_key"`
	UnitColor     string          `json:"unit_color"`
	UpdatedAt     string          `json:"updated_at"`
}
type FactionCardAsset struct {
	Key       string `json:"key"`
	Path      string `json:"-"`
	UpdatedAt string `json:"-"`
}

type FactionCardsStore struct{ db *sql.DB }

func NewFactionCardsStore(db *sql.DB) *FactionCardsStore { return &FactionCardsStore{db} }

func ValidAssetKey(key string) bool { return factionAssetKey.MatchString(key) }

func ValidateFactionCard(c FactionCard) error {
	var data map[string]json.RawMessage
	if len(c.Data) > 256*1024 || json.Unmarshal(c.Data, &data) != nil || data == nil {
		return errors.New("data must be a JSON object under 256 KiB")
	}
	if !factionCardColor.MatchString(c.UnitColor) {
		return errors.New("unit colour must look like #rrggbb")
	}
	return nil
}

// Get returns an empty card with defaults when none was saved yet.
func (s *FactionCardsStore) Get(factionID int64) (FactionCard, error) {
	c := FactionCard{FactionID: factionID, Data: json.RawMessage(`{}`), UnitColor: DefaultUnitColor}
	var data string
	err := s.db.QueryRow(`SELECT data,front_image_key,back_image_key,unit_color,updated_at FROM faction_cards WHERE faction_id=?`, factionID).
		Scan(&data, &c.FrontImageKey, &c.BackImageKey, &c.UnitColor, &c.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return c, nil
	}
	c.Data = json.RawMessage(data)
	return c, err
}

func (s *FactionCardsStore) Save(c FactionCard) (FactionCard, error) {
	if err := ValidateFactionCard(c); err != nil {
		return c, err
	}
	_, err := s.db.Exec(`INSERT INTO faction_cards(faction_id,data,front_image_key,back_image_key,unit_color) VALUES(?,?,?,?,?)
ON CONFLICT(faction_id) DO UPDATE SET data=excluded.data,front_image_key=excluded.front_image_key,back_image_key=excluded.back_image_key,unit_color=excluded.unit_color,updated_at=datetime('now')`,
		c.FactionID, string(c.Data), c.FrontImageKey, c.BackImageKey, c.UnitColor)
	if err != nil {
		return c, err
	}
	return s.Get(c.FactionID)
}

// Layout returns the shared element layout, `{}` until one is saved.
func (s *FactionCardsStore) Layout() (json.RawMessage, error) {
	var layout string
	err := s.db.QueryRow(`SELECT layout FROM faction_card_layout WHERE id=1`).Scan(&layout)
	if errors.Is(err, sql.ErrNoRows) {
		return json.RawMessage(`{}`), nil
	}
	return json.RawMessage(layout), err
}

func (s *FactionCardsStore) SaveLayout(layout json.RawMessage) error {
	var parsed map[string]json.RawMessage
	if len(layout) > 64*1024 || json.Unmarshal(layout, &parsed) != nil || parsed == nil {
		return errors.New("layout must be a JSON object under 64 KiB")
	}
	_, err := s.db.Exec(`INSERT INTO faction_card_layout(id,layout) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET layout=excluded.layout,updated_at=datetime('now')`, string(layout))
	return err
}

// Saved lists the factions that have a saved card.
func (s *FactionCardsStore) Saved() ([]int64, error) {
	rows, err := s.db.Query(`SELECT faction_id FROM faction_cards ORDER BY faction_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []int64{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func (s *FactionCardsStore) Assets(factionID int64) ([]FactionCardAsset, error) {
	rows, err := s.db.Query(`SELECT key,path,updated_at FROM faction_card_assets WHERE faction_id=? ORDER BY key`, factionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FactionCardAsset{}
	for rows.Next() {
		var a FactionCardAsset
		if err := rows.Scan(&a.Key, &a.Path, &a.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func (s *FactionCardsStore) Asset(factionID int64, key string) (string, error) {
	var path string
	err := s.db.QueryRow(`SELECT path FROM faction_card_assets WHERE faction_id=? AND key=?`, factionID, key).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	}
	return path, err
}

// SetAsset returns the replaced file's path ("" if none) for the caller to remove.
func (s *FactionCardsStore) SetAsset(factionID int64, key, path string) (string, error) {
	old, err := s.Asset(factionID, key)
	if err != nil && !errors.Is(err, ErrNotFound) {
		return "", err
	}
	_, err = s.db.Exec(`INSERT INTO faction_card_assets(faction_id,key,path) VALUES(?,?,?) ON CONFLICT(faction_id,key) DO UPDATE SET path=excluded.path,updated_at=datetime('now')`, factionID, key, path)
	return old, err
}

func (s *FactionCardsStore) DeleteAsset(factionID int64, key string) (string, error) {
	old, err := s.Asset(factionID, key)
	if err != nil {
		return "", err
	}
	_, err = s.db.Exec(`DELETE FROM faction_card_assets WHERE faction_id=? AND key=?`, factionID, key)
	return old, err
}
