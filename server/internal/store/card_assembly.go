package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"strings"
)

// ArtworkAdjust is the tone and colour correction applied to a card's artwork. Brightness,
// contrast, saturation and sharpness are 0 when neutral; levels are a black point, a white
// point (0–255) and a gamma.
type ArtworkAdjust struct {
	Brightness float64 `json:"brightness"` // -100–100
	Contrast   float64 `json:"contrast"`   // -100–100
	Saturation float64 `json:"saturation"` // -100–100
	Sharpness  float64 `json:"sharpness"`  // 0–100
	Black      float64 `json:"black"`      // 0–254
	White      float64 `json:"white"`      // 1–255, above black
	Gamma      float64 `json:"gamma"`      // 0.2–5
}
type ArtworkTransform struct {
	Scale  float64        `json:"scale"`
	X      float64        `json:"x"`
	Y      float64        `json:"y"`
	Adjust *ArtworkAdjust `json:"adjust,omitempty"`
}

func validAdjust(a *ArtworkAdjust) bool {
	if a == nil {
		return true
	}
	in := func(v, lo, hi float64) bool { return !math.IsNaN(v) && v >= lo && v <= hi }
	return in(a.Brightness, -100, 100) && in(a.Contrast, -100, 100) && in(a.Saturation, -100, 100) && in(a.Sharpness, 0, 100) &&
		in(a.Black, 0, 254) && in(a.White, 1, 255) && a.White > a.Black && in(a.Gamma, 0.2, 5)
}

type CardAssembly struct {
	CardID      int64            `json:"card_id"`
	ImageKey    string           `json:"image_key"`
	ArtworkPath string           `json:"-"`
	ImageURL    string           `json:"image_url"`
	OverlayID   string           `json:"overlay_id"`
	LogoScale   float64          `json:"logo_scale"`
	Transform   ArtworkTransform `json:"transform"`
	Layout      json.RawMessage  `json:"layout"`
	UpdatedAt   string           `json:"updated_at"`
}

func ValidateAssembly(a CardAssembly) error {
	if a.LogoScale != 0 && (math.IsNaN(a.LogoScale) || math.IsInf(a.LogoScale, 0) || a.LogoScale < .1 || a.LogoScale > 3) {
		return errors.New("logo scale must be 0.1–3")
	}
	t := a.Transform
	if math.IsNaN(t.Scale) || math.IsInf(t.Scale, 0) || t.Scale < .1 || t.Scale > 5 || math.IsNaN(t.X) || math.IsInf(t.X, 0) || math.Abs(t.X) > 200 || math.IsNaN(t.Y) || math.IsInf(t.Y, 0) || math.Abs(t.Y) > 200 {
		return errors.New("artwork scale must be 0.1–5 and position must be -200–200")
	}
	if !validAdjust(t.Adjust) {
		return errors.New("artwork adjustments are out of range")
	}
	if a.OverlayID != "auto" && a.OverlayID != "none" {
		n, e := strconv.ParseInt(a.OverlayID, 10, 64)
		if e != nil || n <= 0 {
			return errors.New("invalid overlay")
		}
	}
	var layout map[string]json.RawMessage
	if len(a.Layout) > 65536 || json.Unmarshal(a.Layout, &layout) != nil || layout == nil {
		return errors.New("layout must be an object under 64 KiB")
	}
	return nil
}
func (s *CardsStore) Assembly(id int64) (CardAssembly, error) {
	if _, err := s.Get(id); err != nil {
		return CardAssembly{}, err
	}
	a := CardAssembly{CardID: id, LogoScale: 1, OverlayID: "auto", Transform: ArtworkTransform{Scale: 1}, Layout: json.RawMessage(`{}`)}
	var transform, layout string
	err := s.db.QueryRow("SELECT image_key,artwork_path,overlay_id,logo_scale,transform,layout,updated_at FROM card_assemblies WHERE card_id=?", id).Scan(&a.ImageKey, &a.ArtworkPath, &a.OverlayID, &a.LogoScale, &transform, &layout, &a.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return a, nil
	}
	if err != nil {
		return a, err
	}
	if err = json.Unmarshal([]byte(transform), &a.Transform); err != nil {
		return a, err
	}
	a.Layout = json.RawMessage(layout)
	return a, nil
}
func (s *CardsStore) SaveAssembly(a CardAssembly) (CardAssembly, error) {
	if a.LogoScale == 0 {
		a.LogoScale = 1
	}
	if err := ValidateAssembly(a); err != nil {
		return a, err
	}
	if _, err := s.Get(a.CardID); err != nil {
		return a, err
	}
	t, err := json.Marshal(a.Transform)
	if err != nil {
		return a, err
	}
	_, err = s.db.Exec(`INSERT INTO card_assemblies(card_id,image_key,artwork_path,overlay_id,logo_scale,transform,layout) VALUES(?,?,?,?,?,?,?) ON CONFLICT(card_id) DO UPDATE SET image_key=excluded.image_key,artwork_path=excluded.artwork_path,overlay_id=excluded.overlay_id,logo_scale=excluded.logo_scale,transform=excluded.transform,layout=excluded.layout,updated_at=datetime('now')`, a.CardID, a.ImageKey, a.ArtworkPath, a.OverlayID, a.LogoScale, string(t), string(a.Layout))
	if err != nil {
		return a, err
	}
	return s.Assembly(a.CardID)
}

func (s *CardsStore) AssemblySource(key string) (string, error) {
	parts := strings.Split(key, "-")
	if len(parts) != 2 {
		return "", ErrNotFound
	}
	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil || id <= 0 {
		return "", ErrNotFound
	}
	table := ""
	switch parts[0] {
	case "test":
		table = "generations"
	default:
		return "", ErrNotFound
	}
	var path string
	err = s.db.QueryRow("SELECT image_path FROM "+table+" WHERE id=? AND status='done' AND image_path IS NOT NULL", id).Scan(&path)
	if errors.Is(err, sql.ErrNoRows) || path == "" {
		return "", ErrNotFound
	}
	return path, err
}
