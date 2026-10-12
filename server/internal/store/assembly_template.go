package store

import "errors"

type AssemblyTemplate struct {
	FactionID int64   `json:"faction_id"`
	Category  string  `json:"category"`
	Side      string  `json:"side"` // "front" (default) or "back"
	ImageKey  string  `json:"image_key"`
	LogoPath  string  `json:"-"`
	LogoURL   string  `json:"logo_url,omitempty"`
	LogoScale float64 `json:"logo_scale,omitempty"`
}

func (s *CardsStore) AssemblyTemplates() ([]AssemblyTemplate, error) {
	rows, err := s.db.Query(`SELECT faction_id,category,side,image_key,logo_path,logo_scale FROM assembly_templates ORDER BY faction_id,category,side`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AssemblyTemplate{}
	for rows.Next() {
		var t AssemblyTemplate
		if err := rows.Scan(&t.FactionID, &t.Category, &t.Side, &t.ImageKey, &t.LogoPath, &t.LogoScale); err != nil {
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
	if t.LogoScale != 0 && (t.Side != "back" || t.LogoScale < 0.05 || t.LogoScale > 1) {
		return errors.New("back logo scale must be between 0.05 and 1")
	}
	if t.ImageKey == "" {
		_, err := s.db.Exec(`DELETE FROM assembly_templates WHERE faction_id=? AND category=? AND side=?`, t.FactionID, t.Category, t.Side)
		return err
	}
	if _, err := s.AssemblySource(t.ImageKey); err != nil {
		return errors.New("selected image does not exist")
	}
	scale := t.LogoScale
	if scale == 0 {
		scale = 0.5
	}
	_, err := s.db.Exec(`INSERT INTO assembly_templates(faction_id,category,side,image_key,logo_scale) VALUES(?,?,?,?,?) ON CONFLICT(faction_id,category,side) DO UPDATE SET image_key=excluded.image_key,logo_scale=CASE WHEN ?=0 THEN assembly_templates.logo_scale ELSE excluded.logo_scale END,updated_at=datetime('now')`, t.FactionID, t.Category, t.Side, t.ImageKey, scale, t.LogoScale)
	return err
}

func (s *CardsStore) BackLogo(factionID int64, category string) (string, error) {
	var path string
	err := s.db.QueryRow(`SELECT logo_path FROM assembly_templates WHERE faction_id=? AND category=? AND side='back'`, factionID, category).Scan(&path)
	return path, err
}

func (s *CardsStore) SetBackLogo(factionID int64, category, path string) error {
	result, err := s.db.Exec(`UPDATE assembly_templates SET logo_path=?,updated_at=datetime('now') WHERE faction_id=? AND category=? AND side='back'`, path, factionID, category)
	if err != nil {
		return err
	}
	n, err := result.RowsAffected()
	if err == nil && n == 0 {
		return ErrNotFound
	}
	return err
}
