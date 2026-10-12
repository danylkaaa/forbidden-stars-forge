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
	if len(files) != 3 {
		t.Fatalf("templates: %d", len(files))
	}
	for _, ct := range list {
		if store.IsBackCardType(ct.Name) != (ct.TemplatePath != "") {
			t.Fatalf("%s template %q", ct.Name, ct.TemplatePath)
		}
		if ct.TemplatePath == "" {
			continue
		}
		f, _ := os.Open(filepath.Join(dir, ct.TemplatePath))
		cfg, _, err := image.DecodeConfig(f)
		f.Close()
		if err != nil || cfg.Width != 816 || cfg.Height != 1104 {
			t.Fatalf("%s: %+v %v", ct.Name, cfg, err)
		}
	}
}
