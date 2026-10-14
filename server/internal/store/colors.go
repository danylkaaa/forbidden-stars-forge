package store

import "errors"

// FactionColor is a faction's own colour as "#rrggbb".
type FactionColor struct {
	FactionID int64  `json:"faction_id"`
	Color     string `json:"color"` // empty removes it
}

func (s *CardsStore) FactionColors() ([]FactionColor, error) {
	rows, err := s.db.Query(`SELECT faction_id,color FROM faction_colors ORDER BY faction_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FactionColor{}
	for rows.Next() {
		var c FactionColor
		if err := rows.Scan(&c.FactionID, &c.Color); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *CardsStore) SaveFactionColor(c FactionColor) error {
	if c.Color == "" {
		_, err := s.db.Exec(`DELETE FROM faction_colors WHERE faction_id=?`, c.FactionID)
		return err
	}
	if !nebulaColor.MatchString(c.Color) {
		return errors.New("color must be empty or #rrggbb")
	}
	_, err := s.db.Exec(`INSERT INTO faction_colors(faction_id,color) VALUES(?,?) ON CONFLICT(faction_id) DO UPDATE SET color=excluded.color,updated_at=datetime('now')`, c.FactionID, c.Color)
	return err
}
