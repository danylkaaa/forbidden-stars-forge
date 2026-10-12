package store

import (
	"database/sql"
	"encoding/json"
	"errors"
	"io/fs"
	"path/filepath"
	"strings"
	"testing"
)

func ptr[T any](v T) *T { return &v }
func combatCard(f int64) CardInput {
	return CardInput{FactionID: f, Name: "Огонь", Category: "combat", Level: ptr[int64](0), ResourceCost: ptr[int64](0), Shields: ptr[int64](1), Guns: ptr[int64](2), Eagles: ptr[int64](0), UpperText: ptr("Верх"), LowerText: ptr("")}
}
func setupCards(t *testing.T) (*CardsStore, int64, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "cards.db")
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	f, err := NewFactionsStore(db).Create(FactionInput{Name: "Tau", DLC: "Galaxy in Flames"}, "manual")
	if err != nil {
		t.Fatal(err)
	}
	return NewCardsStore(db), f.ID, path
}
func TestCardsRoundTripCategoriesFiltersAndRestart(t *testing.T) {
	s, f, path := setupCards(t)
	inputs := []CardInput{}
	for level := int64(0); level <= 3; level++ {
		c := combatCard(f)
		c.Level = ptr(level)
		inputs = append(inputs, c)
	}
	for _, sub := range []string{"schema", "tactic"} {
		for _, action := range []string{"rotate_clockwise", "rotate_counterclockwise", "move_vertical", "move_horizontal"} {
			inputs = append(inputs, CardInput{FactionID: f, Name: "План", Category: "schema", Subtype: ptr(sub), Action: ptr(action), Text: ptr("")})
		}
	}
	for _, kind := range []string{"deploy", "advance", "strategize", "upgrade"} {
		inputs = append(inputs, CardInput{FactionID: f, Name: "Улучшение", Category: "upgrade", UpgradeType: ptr(kind), Text: ptr("Текст")})
	}
	for _, in := range inputs {
		c, err := s.Create(in)
		if err != nil {
			t.Fatal(err)
		}
		a, _ := json.Marshal(c.CardInput)
		b, _ := json.Marshal(in)
		if string(a) != string(b) {
			t.Fatalf("round trip %s != %s", a, b)
		}
	}
	list, err := s.List(f, "combat")
	if err != nil || len(list) != 4 {
		t.Fatalf("filter: %v %d", err, len(list))
	}
	list, _ = s.List(f+100, "")
	if len(list) != 0 {
		t.Fatal("faction filter")
	}
	c, err := s.Update(1, inputs[len(inputs)-1])
	if err != nil || c.Level != nil || c.UpperText != nil || c.UpgradeType == nil {
		t.Fatalf("change category: %+v %v", c, err)
	}
	if err = s.db.Close(); err != nil {
		t.Fatal(err)
	}
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	got, err := NewCardsStore(db).Get(1)
	if err != nil || got.Name != "Улучшение" || *got.Text != "Текст" {
		t.Fatalf("restart: %+v %v", got, err)
	}
}
func TestCardsValidationAndAtomicImport(t *testing.T) {
	s, f, _ := setupCards(t)
	valid := combatCard(f)
	valid.Guns = ptr(MaxCardInteger)
	if _, err := s.Create(valid); err != nil {
		t.Fatal(err)
	}
	mutations := []func(*CardInput){func(c *CardInput) { c.Level = ptr[int64](4) }, func(c *CardInput) { c.ResourceCost = ptr[int64](-1) }, func(c *CardInput) { c.Shields = ptr(MaxCardInteger + 1) }, func(c *CardInput) { c.Guns = nil }, func(c *CardInput) { c.Eagles = ptr[int64](-1) }, func(c *CardInput) { c.Name = " " }, func(c *CardInput) { c.Text = ptr("wrong category") }, func(c *CardInput) { c.UpperText = nil }}
	for _, mutate := range mutations {
		c := combatCard(f)
		mutate(&c)
		if _, err := s.Create(c); err == nil {
			t.Fatalf("accepted %+v", c)
		}
	}
	missing := combatCard(f + 1)
	if _, err := s.Import([]CardInput{combatCard(f), missing}); !errors.Is(err, ErrInvalidFaction) {
		t.Fatalf("err: %v", err)
	}
	list, _ := s.List(0, "")
	if len(list) != 1 {
		t.Fatal("partial import persisted")
	}
	// Force a failure after the first successful INSERT, not only prevalidation.
	_, err := s.db.Exec(`CREATE TRIGGER fail_import BEFORE INSERT ON cards WHEN NEW.name='fail' BEGIN SELECT RAISE(ABORT,'forced failure'); END`)
	if err != nil {
		t.Fatal(err)
	}
	bad := combatCard(f)
	bad.Name = "fail"
	if _, err = s.Import([]CardInput{combatCard(f), bad}); err == nil {
		t.Fatal("trigger did not reject")
	}
	list, _ = s.List(0, "")
	if len(list) != 1 {
		t.Fatal("transaction was not rolled back")
	}
	if err := NewFactionsStore(s.db).Delete(f); err == nil {
		t.Fatal("deleted referenced faction")
	}
	if _, err = s.Update(999, valid); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}
func TestCardsMigrationPreservesExistingData(t *testing.T) {
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	names, err := fs.Glob(migrationsFS, "migrations/*.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	for _, name := range names {
		if strings.Contains(name, "0015_") {
			continue
		}
		data, _ := migrationsFS.ReadFile(name)
		if _, err = db.Exec(string(data)); err != nil {
			t.Fatalf("%s: %v", name, err)
		}
	}
	for _, q := range []string{`CREATE TABLE schema_migrations(version uint64, dirty bool)`, `INSERT INTO schema_migrations VALUES(14,0)`, `INSERT INTO factions(name,dlc) VALUES('Old faction','Galaxy in Flames')`, `INSERT INTO card_types(name,description,constraints) VALUES('combat','old','old')`} {
		if _, err = db.Exec(q); err != nil {
			t.Fatal(err)
		}
	}
	db.Close()
	db, err = Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	for _, table := range []string{"factions", "card_types"} {
		var count int
		if err = db.QueryRow("SELECT count(*) FROM " + table).Scan(&count); err != nil || count != 1 {
			t.Fatalf("%s: %d %v", table, count, err)
		}
	}
	if _, err = NewCardsStore(db).Create(combatCard(1)); err != nil {
		t.Fatal(err)
	}
}
