package store

import (
	"errors"
	"math"
)

// NebulaPlacement is where and how turned a card type's back shows the nebula.
type NebulaPlacement struct {
	FactionID int64   `json:"faction_id"`
	Category  string  `json:"category"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Rotation  float64 `json:"rotation"`
	// LogoScale is the faction logo's size on this back (share of the card width); 0 keeps the saved one.
	LogoScale float64 `json:"logo_scale"`
	// Brightness of the nebula on this back; 0 follows the faction's. nil keeps the saved one.
	Brightness *float64 `json:"brightness"`
	// BannerScale is how much larger or smaller than the template's banner size this back draws the banner; 0 keeps the saved one.
	BannerScale float64 `json:"banner_scale"`
	// ElementKey is the library image drawn over the frame's top and bottom; nil keeps the saved one, "" removes it.
	ElementKey *string `json:"element_key"`
}

func (s *CardsStore) NebulaPlacements() ([]NebulaPlacement, error) {
	rows, err := s.db.Query(`SELECT faction_id,category,x,y,rotation,logo_scale,element_key,banner_scale,brightness FROM nebula_placements ORDER BY faction_id,category`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []NebulaPlacement{}
	for rows.Next() {
		var p NebulaPlacement
		var key string
		var brightness float64
		if err := rows.Scan(&p.FactionID, &p.Category, &p.X, &p.Y, &p.Rotation, &p.LogoScale, &key, &p.BannerScale, &brightness); err != nil {
			return nil, err
		}
		p.ElementKey = &key
		p.Brightness = &brightness
		out = append(out, p)
	}
	return out, rows.Err()
}

func (s *CardsStore) SaveNebulaPlacement(p NebulaPlacement) error {
	if p.Category != "combat" && p.Category != "schema" && p.Category != "upgrade" {
		return errors.New("unknown card category")
	}
	for _, v := range []float64{p.X, p.Y, p.Rotation, p.LogoScale, p.BannerScale} {
		if math.IsNaN(v) || math.IsInf(v, 0) {
			return errors.New("placement must be numbers")
		}
	}
	if math.Abs(p.X) > 1 || math.Abs(p.Y) > 1 {
		return errors.New("x and y must be between -1 and 1")
	}
	if math.Abs(p.Rotation) > 360 {
		return errors.New("rotation must be between -360 and 360 degrees")
	}
	if p.LogoScale != 0 && (p.LogoScale < 0.05 || p.LogoScale > 1) {
		return errors.New("logo scale must be between 0.05 and 1")
	}
	if p.BannerScale != 0 && (p.BannerScale < 0.2 || p.BannerScale > 3) {
		return errors.New("banner scale must be between 0.2 and 3")
	}
	bright, setBright := 0.0, 0
	if p.Brightness != nil {
		bright, setBright = *p.Brightness, 1
		if math.IsNaN(bright) || bright != 0 && (bright < 0.2 || bright > 2) {
			return errors.New("brightness must be 0 or between 0.2 and 2")
		}
	}
	banner := p.BannerScale
	if banner == 0 {
		banner = 1
	}
	scale := p.LogoScale
	if scale == 0 {
		scale = 0.5
	}
	key, setKey := "", 0
	if p.ElementKey != nil {
		key, setKey = *p.ElementKey, 1
		if key != "" {
			if _, err := s.AssemblySource(key); err != nil {
				return errors.New("selected element image does not exist")
			}
		}
	}
	_, err := s.db.Exec(`INSERT INTO nebula_placements(faction_id,category,x,y,rotation,logo_scale,element_key,banner_scale,brightness) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(faction_id,category) DO UPDATE SET x=excluded.x,y=excluded.y,rotation=excluded.rotation,logo_scale=CASE WHEN ?=0 THEN nebula_placements.logo_scale ELSE excluded.logo_scale END,element_key=CASE WHEN ?=1 THEN excluded.element_key ELSE nebula_placements.element_key END,banner_scale=CASE WHEN ?=0 THEN nebula_placements.banner_scale ELSE excluded.banner_scale END,brightness=CASE WHEN ?=1 THEN excluded.brightness ELSE nebula_placements.brightness END,updated_at=datetime('now')`, p.FactionID, p.Category, p.X, p.Y, p.Rotation, scale, key, banner, bright, p.LogoScale, setKey, p.BannerScale, setBright)
	return err
}
