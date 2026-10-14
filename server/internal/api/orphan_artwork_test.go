package api

import (
	"os"
	"path/filepath"
	"testing"

	"cardforge/internal/store"
)

func TestRemoveOrphanArtworkKeepsReferencedFiles(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.Exec(`INSERT INTO factions(id, name, dlc) VALUES (1, 'Orks', 'Darkest Dawn')`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO cards(id, faction_id, name, category, level, resource_cost, shields, guns, eagles, upper_text, lower_text) VALUES (1, 1, 'A', 'combat', 1, 0, 0, 0, 0, '', '')`); err != nil {
		t.Fatal(err)
	}
	if _, err = db.Exec(`INSERT INTO card_assemblies(card_id, artwork_path) VALUES (1, 'card-artwork/keep.png')`); err != nil {
		t.Fatal(err)
	}
	if n, err := RemoveOrphanArtwork(db, dir); err != nil || n != 0 {
		t.Fatalf("no artwork folder yet: %d %v", n, err)
	}
	art := filepath.Join(dir, "card-artwork")
	os.MkdirAll(art, 0o755)
	for _, name := range []string{"keep.png", "orphan.png", "orphan2.jpg"} {
		os.WriteFile(filepath.Join(art, name), []byte("x"), 0o644)
	}
	if n, err := RemoveOrphanArtwork(db, dir); err != nil || n != 2 {
		t.Fatalf("removed %d, %v", n, err)
	}
	if _, err := os.Stat(filepath.Join(art, "keep.png")); err != nil {
		t.Fatal("a referenced file was removed")
	}
}
