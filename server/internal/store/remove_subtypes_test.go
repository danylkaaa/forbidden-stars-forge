package store

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

// Removing subtypes keeps the positions their built-in combat subtypes held.
func TestRemovingSubtypesMovesTheirPositionsIntoTheCombatLayout(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	run := func(file string) {
		sql, err := os.ReadFile(filepath.Join("migrations", file))
		if err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(string(sql)); err != nil {
			t.Fatalf("%s: %v", file, err)
		}
	}
	run("0043_remove_subtypes.down.sql") // the tables as they were
	exec := func(q string, args ...any) {
		if _, err := db.Exec(q, args...); err != nil {
			t.Fatal(err)
		}
	}
	exec(`UPDATE card_type_layouts SET layout = ? WHERE category = 'combat'`, `{"name":{"x":27},"level":{"x":1}}`)
	exec(`INSERT INTO card_subtypes(category,name,layout) VALUES('combat','Level 0',?)`, `{"logo":{"x":5}}`)
	exec(`INSERT INTO card_subtypes(category,name,layout) VALUES('combat','Level 1+',?)`, `{"level":{"x":12.2},"resources":{"x":10}}`)
	run("0043_remove_subtypes.up.sql")
	var raw string
	if err := db.QueryRow(`SELECT layout FROM card_type_layouts WHERE category = 'combat'`).Scan(&raw); err != nil {
		t.Fatal(err)
	}
	var layout map[string]map[string]float64
	if err := json.Unmarshal([]byte(raw), &layout); err != nil {
		t.Fatal(err)
	}
	if layout["name"]["x"] != 27 || layout["logo"]["x"] != 5 || layout["level"]["x"] != 12.2 || layout["resources"]["x"] != 10 {
		t.Fatalf("positions were not merged: %s", raw)
	}
	var left int
	db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE name IN ('card_subtypes','subtype_overlays')`).Scan(&left)
	if left != 0 {
		t.Fatal("the subtype tables should be gone")
	}
}
