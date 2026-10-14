package store

import (
	"errors"
	"math"
)

// FactionBanner is how a faction's banner is assembled: the logo's size inside
// the frame and the ornament over its edges (a library image, with its place
// and width as shares of the frame).
type FactionBanner struct {
	FactionID    int64   `json:"faction_id"`
	LogoScale    float64 `json:"logo_scale"`
	ElementKey   string  `json:"element_key"`
	ElementX     float64 `json:"element_x"`
	ElementY     float64 `json:"element_y"`
	ElementScale float64 `json:"element_scale"`
}

func (s *CardsStore) FactionBanners() ([]FactionBanner, error) {
	rows, err := s.db.Query(`SELECT faction_id,logo_scale,element_key,element_x,element_y,element_scale FROM faction_banners ORDER BY faction_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []FactionBanner{}
	for rows.Next() {
		var b FactionBanner
		if err := rows.Scan(&b.FactionID, &b.LogoScale, &b.ElementKey, &b.ElementX, &b.ElementY, &b.ElementScale); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *CardsStore) SaveFactionBanner(b FactionBanner) error {
	for _, v := range []float64{b.LogoScale, b.ElementX, b.ElementY, b.ElementScale} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New("banner settings must be numbers")
		}
	}
	if b.LogoScale < 0.05 || b.LogoScale > 1 {
		return errors.New("logo scale must be between 0.05 and 1")
	}
	if math.Abs(b.ElementX) > 1 || math.Abs(b.ElementY) > 1 {
		return errors.New("element position must be between -1 and 1")
	}
	if b.ElementScale < 0.05 || b.ElementScale > 1.5 {
		return errors.New("element size must be between 0.05 and 1.5")
	}
	if b.ElementKey != "" {
		if _, err := s.AssemblySource(b.ElementKey); err != nil {
			return errors.New("selected element image does not exist")
		}
	}
	_, err := s.db.Exec(`INSERT INTO faction_banners(faction_id,logo_scale,element_key,element_x,element_y,element_scale) VALUES(?,?,?,?,?,?) ON CONFLICT(faction_id) DO UPDATE SET logo_scale=excluded.logo_scale,element_key=excluded.element_key,element_x=excluded.element_x,element_y=excluded.element_y,element_scale=excluded.element_scale,updated_at=datetime('now')`, b.FactionID, b.LogoScale, b.ElementKey, b.ElementX, b.ElementY, b.ElementScale)
	return err
}
