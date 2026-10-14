package store

import (
	"os"
	"path/filepath"
	"testing"
)

// The migration that merges the back types keeps every generated image.
func TestMergingBackTypesKeepsTheirImages(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	f, err := NewFactionsStore(db).Create(FactionInput{Name: "Tau", DLC: "Galaxy in Flames"}, "manual")
	if err != nil {
		t.Fatal(err)
	}
	ids := map[string]int64{}
	for _, name := range []string{"combat back", "events back", "upgrade back"} {
		res, err := db.Exec(`INSERT INTO card_types(name) VALUES(?)`, name)
		if err != nil {
			t.Fatal(err)
		}
		ids[name], _ = res.LastInsertId()
	}
	for _, name := range []string{"combat back", "events back", "upgrade back"} {
		if _, err := db.Exec(`INSERT INTO generations(faction_id,card_type_id,prompt,status) VALUES(?,?,?, 'done')`, f.ID, ids[name], "p"); err != nil {
			t.Fatal(err)
		}
	}
	sql, err := os.ReadFile("migrations/0039_card_back_types.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(string(sql)); err != nil {
		t.Fatal(err)
	}
	var types, onCardBack, total int
	db.QueryRow(`SELECT COUNT(*) FROM card_types WHERE name IN ('combat back','events back','upgrade back')`).Scan(&types)
	db.QueryRow(`SELECT COUNT(*) FROM generations WHERE card_type_id=(SELECT id FROM card_types WHERE name='card back')`).Scan(&onCardBack)
	db.QueryRow(`SELECT COUNT(*) FROM generations`).Scan(&total)
	if types != 0 || onCardBack != 3 || total != 3 {
		t.Fatalf("old types left: %d, images on card back: %d of %d", types, onCardBack, total)
	}
}
