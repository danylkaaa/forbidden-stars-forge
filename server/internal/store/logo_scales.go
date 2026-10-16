package store

import "errors"

// CardLogoScale is the size of a faction's logo on its cards of one category, as a multiple of the layout's logo box.
type CardLogoScale struct {
	FactionID int64   `json:"faction_id"`
	Category  string  `json:"category"`
	Scale     float64 `json:"scale"`
}

func (s *CardsStore) CardLogoScales() ([]CardLogoScale, error) {
	rows, err := s.db.Query(`SELECT faction_id,category,scale FROM card_logo_scales ORDER BY faction_id,category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []CardLogoScale{}
	for rows.Next() {
		var c CardLogoScale
		if err := rows.Scan(&c.FactionID, &c.Category, &c.Scale); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *CardsStore) SaveCardLogoScale(c CardLogoScale) error {
	if c.Category != "combat" && c.Category != "schema" && c.Category != "upgrade" {
		return errors.New("category must be combat, schema or upgrade")
	}
	if !(c.Scale >= 0.1 && c.Scale <= 3) {
		return errors.New("scale must be between 0.1 and 3")
	}
	_, err := s.db.Exec(`INSERT INTO card_logo_scales(faction_id,category,scale) VALUES(?,?,?) ON CONFLICT(faction_id,category) DO UPDATE SET scale=excluded.scale,updated_at=datetime('now')`, c.FactionID, c.Category, c.Scale)
	return err
}
