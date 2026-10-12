package store

import "errors"

type AssemblyTemplate struct {
	FactionID int64  `json:"faction_id"`
	Category  string `json:"category"`
	Side      string `json:"side"` // "front" (default) or "back"
	ImageKey  string `json:"image_key"`
}

func (s *CardsStore) AssemblyTemplates() ([]AssemblyTemplate, error) {
	rows, err := s.db.Query(`SELECT faction_id,category,side,image_key FROM assembly_templates ORDER BY faction_id,category,side`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AssemblyTemplate{}
	for rows.Next() {
		var t AssemblyTemplate
		if err := rows.Scan(&t.FactionID, &t.Category, &t.Side, &t.ImageKey); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// SaveAssemblyTemplate picks a finished generated image for a faction,
// category and side. An empty image key clears the choice.
func (s *CardsStore) SaveAssemblyTemplate(t AssemblyTemplate) error {
	if t.Category != "combat" && t.Category != "schema" && t.Category != "upgrade" {
		return errors.New("category must be combat, schema or upgrade")
	}
	if t.Side == "" {
		t.Side = "front"
	}
	if t.Side != "front" && t.Side != "back" {
		return errors.New("side must be front or back")
	}
	if t.ImageKey == "" {
		_, err := s.db.Exec(`DELETE FROM assembly_templates WHERE faction_id=? AND category=? AND side=?`, t.FactionID, t.Category, t.Side)
		return err
	}
	if _, err := s.AssemblySource(t.ImageKey); err != nil {
		return errors.New("selected image does not exist")
	}
	_, err := s.db.Exec(`INSERT INTO assembly_templates(faction_id,category,side,image_key) VALUES(?,?,?,?) ON CONFLICT(faction_id,category,side) DO UPDATE SET image_key=excluded.image_key,updated_at=datetime('now')`, t.FactionID, t.Category, t.Side, t.ImageKey)
	return err
}
