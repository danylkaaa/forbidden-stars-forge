package store

import (
	"path/filepath"
	"testing"

	"github.com/golang-migrate/migrate/v4"
	migratesqlite "github.com/golang-migrate/migrate/v4/database/sqlite"
	"github.com/golang-migrate/migrate/v4/source/iofs"
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
	if n != 10 {
		t.Fatalf("settings rows = %d, want 10", n)
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

// Rebuilding the cards table must not cascade-delete card assemblies, and old
// upgrade cards must pick up a level, a price and the "dominate" order.
func TestUpgradeCardsMigrationKeepsAssemblies(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	drv, err := migratesqlite.WithInstance(db, &migratesqlite.Config{})
	if err != nil {
		t.Fatal(err)
	}
	m, err := migrate.NewWithInstance("iofs", src, "sqlite", drv)
	if err != nil {
		t.Fatal(err)
	}
	if err = m.Migrate(26); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO factions(id, name, dlc) VALUES (1, 'Orks', 'Darkest Dawn')`,
		`INSERT INTO cards(id, faction_id, name, category, text, upgrade_type) VALUES (7, 1, 'Old', 'upgrade', 'x', 'upgrade')`,
		`INSERT INTO card_assemblies(card_id, image_key) VALUES (7, 'art')`,
	} {
		if _, err = db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	if err = m.Migrate(27); err != nil {
		t.Fatal(err)
	}
	var level, cost int
	var kind, key string
	if err = db.QueryRow(`SELECT level, resource_cost, upgrade_type FROM cards WHERE id = 7`).Scan(&level, &cost, &kind); err != nil || level != 1 || cost != 0 || kind != "dominate" {
		t.Fatalf("upgrade card: %d %d %q %v", level, cost, kind, err)
	}
	if err = db.QueryRow(`SELECT image_key FROM card_assemblies WHERE card_id = 7`).Scan(&key); err != nil || key != "art" {
		t.Fatalf("assembly lost: %q %v", key, err)
	}
	if err = m.Migrate(26); err != nil {
		t.Fatal(err)
	}
	if err = db.QueryRow(`SELECT image_key FROM card_assemblies WHERE card_id = 7`).Scan(&key); err != nil || key != "art" {
		t.Fatalf("assembly lost on down: %q %v", key, err)
	}
}

// Migration 0031 drops combat cards (and their assemblies) and nothing else.
func TestDropCombatCardsMigration(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	src, _ := iofs.New(migrationsFS, "migrations")
	drv, _ := migratesqlite.WithInstance(db, &migratesqlite.Config{})
	m, err := migrate.NewWithInstance("iofs", src, "sqlite", drv)
	if err != nil {
		t.Fatal(err)
	}
	if err = m.Migrate(30); err != nil {
		t.Fatal(err)
	}
	for _, q := range []string{
		`INSERT INTO factions(id, name, dlc) VALUES (1, 'Orks', 'Darkest Dawn')`,
		`INSERT INTO cards(id, faction_id, name, category, level, resource_cost, shields, guns, eagles, upper_text, lower_text) VALUES (1, 1, 'Waaagh', 'combat', 0, 0, 1, 1, 1, '', '')`,
		`INSERT INTO cards(id, faction_id, name, category, level, resource_cost, text, upgrade_type) VALUES (2, 1, 'Forge', 'upgrade', 1, 0, 'x', 'deploy')`,
		`INSERT INTO card_assemblies(card_id, image_key, artwork_path) VALUES (1, 'art', 'card-artwork/a.png')`,
	} {
		if _, err = db.Exec(q); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	if err = m.Migrate(31); err != nil {
		t.Fatal(err)
	}
	var combat, other, assemblies int
	db.QueryRow(`SELECT COUNT(*) FROM cards WHERE category = 'combat'`).Scan(&combat)
	db.QueryRow(`SELECT COUNT(*) FROM cards WHERE category != 'combat'`).Scan(&other)
	db.QueryRow(`SELECT COUNT(*) FROM card_assemblies`).Scan(&assemblies)
	if combat != 0 || other != 1 || assemblies != 0 {
		t.Fatalf("combat %d other %d assemblies %d", combat, other, assemblies)
	}
}
