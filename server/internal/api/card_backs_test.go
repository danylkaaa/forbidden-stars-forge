package api

import (
	"cardforge/internal/store"
	"image"
	"os"
	"path/filepath"
	"testing"
)

func TestBackTemplatesAreCreatedOnceAtTheFrontSize(t *testing.T) {
	db, err := store.Open(filepath.Join(t.TempDir(), "t.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	dir := t.TempDir()
	types := store.NewCardTypesStore(db)
	if err := types.EnsureBuiltins(); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := EnsureBackTemplates(db, dir); err != nil {
			t.Fatal(err)
		}
	}
	list, _ := types.List()
	files, _ := os.ReadDir(filepath.Join(dir, "templates"))
	if len(files) != 5 {
		t.Fatalf("templates: %d", len(files))
	}
	for _, ct := range list {
		if (store.IsBackCardType(ct.Name) || store.IsFactionCardType(ct.Name) || store.IsElementCardType(ct.Name)) != (ct.TemplatePath != "") {
			t.Fatalf("%s template %q", ct.Name, ct.TemplatePath)
		}
		if ct.TemplatePath == "" {
			continue
		}
		f, _ := os.Open(filepath.Join(dir, ct.TemplatePath))
		cfg, _, err := image.DecodeConfig(f)
		f.Close()
		// Faction cards are landscape.
		wantW, wantH := 816, 1104
		if store.IsFactionCardType(ct.Name) {
			wantW, wantH = 1583, 1063
		}
		// The upgrade element is a strip as wide as the card.
		if store.IsElementCardType(ct.Name) {
			wantH = 240
		}
		if err != nil || cfg.Width != wantW || cfg.Height != wantH {
			t.Fatalf("%s: %+v %v", ct.Name, cfg, err)
		}
	}
}
