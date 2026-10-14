package api

import (
	"cardforge/internal/store"
	"database/sql"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"time"
)

// EnsureBackTemplates gives each built-in back card type without a template
// a plain chroma-green card of the front template's size (816 × 1104 when
// there is none), so backs can be generated in Faction Lab right away.
func EnsureBackTemplates(db *sql.DB, dataDir string) error {
	types := store.NewCardTypesStore(db)
	list, err := types.List()
	if err != nil {
		return err
	}
	w, h := 816, 1104
	// Faction cards are landscape; this is half of their 3165 x 2126 px size
	// (268 x 180 mm with bleed at 300 dpi).
	fw, fh := 1583, 1063
	for _, ct := range list {
		if ct.Name == "combat" && ct.TemplatePath != "" {
			if f, err := os.Open(filepath.Join(dataDir, ct.TemplatePath)); err == nil {
				if cfg, _, err := image.DecodeConfig(f); err == nil {
					w, h = cfg.Width, cfg.Height
				}
				f.Close()
			}
		}
	}
	for _, ct := range list {
		faction, element := store.IsFactionCardType(ct.Name), store.IsElementCardType(ct.Name)
		if !(store.IsBackCardType(ct.Name) || faction || element) || ct.TemplatePath != "" || ct.NoTemplate {
			continue
		}
		w, h := w, h
		if faction {
			w, h = fw, fh
		}
		if element {
			// A strip as wide as the card, at the element's own proportions.
			h = w * store.ElementCanvas[1] / store.ElementCanvas[0]
		}
		img := image.NewRGBA(image.Rect(0, 0, w, h))
		green := color.RGBA{0, 255, 65, 255}
		for y := 0; y < h; y++ {
			for x := 0; x < w; x++ {
				img.Set(x, y, green)
			}
		}
		if err := os.MkdirAll(filepath.Join(dataDir, "templates"), 0o755); err != nil {
			return err
		}
		rel := filepath.Join("templates", fmt.Sprintf("template-back-%d.png", time.Now().UnixNano()))
		f, err := os.Create(filepath.Join(dataDir, rel))
		if err != nil {
			return err
		}
		err = png.Encode(f, img)
		f.Close()
		if err != nil {
			return err
		}
		if err := types.SetTemplatePath(ct.ID, rel); err != nil {
			return err
		}
	}
	return nil
}
