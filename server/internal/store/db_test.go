package store

import (
	"path/filepath"
	"testing"
)

func TestOpenMigratesAndSeedsSettings(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var model string
	err = db.QueryRow(`SELECT value FROM settings WHERE key = 'openai_model'`).Scan(&model)
	if err != nil {
		t.Fatal(err)
	}
	if model != "gpt-image-2" {
		t.Fatalf("openai_model = %q, want gpt-image-2", model)
	}

	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM settings`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 8 {
		t.Fatalf("settings rows = %d, want 8", n)
	}
}

func TestOpenIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	for i := 0; i < 2; i++ {
		db, err := Open(path)
		if err != nil {
			t.Fatalf("open #%d: %v", i+1, err)
		}
		db.Close()
	}
}
