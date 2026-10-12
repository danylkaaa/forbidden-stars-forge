package store

import (
	"encoding/json"
	"testing"
)

func TestSharedLayoutPersistsAndSeparatesScope(t *testing.T) {
	s, f, path := setupCards(t)
	scope := LayoutScope{TemplateKey: "test-5", FactionID: f, CardTypeID: 3}
	layout := json.RawMessage(`{"upper_text":{"y":73}}`)
	if err := s.SaveAssemblyLayout(scope, layout); err != nil {
		t.Fatal(err)
	}
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	reopened := NewCardsStore(db)
	got, err := reopened.AssemblyLayout(scope)
	if err != nil || string(got) != string(layout) {
		t.Fatalf("layout after restart: %s %v", got, err)
	}
	for _, other := range []LayoutScope{{"test-6", f, 3}, {"test-5", f, 4}, {"test-5", f + 1, 3}} {
		got, err := reopened.AssemblyLayout(other)
		if err != nil || string(got) != "{}" {
			t.Fatalf("scope leaked: %v %s %v", other, got, err)
		}
	}
}

func TestSharedLayoutMigrationKeepsLatestCombination(t *testing.T) {
	s, f, _ := setupCards(t)
	for i, layout := range []string{`{"upper_text":{"y":70}}`, `{"upper_text":{"y":75}}`} {
		c, err := s.Create(combatCard(f))
		if err != nil {
			t.Fatal(err)
		}
		a := CardAssembly{CardID: c.ID, ImageKey: "upload", ArtworkPath: "card-artwork/shared.png", OverlayID: "3", Transform: ArtworkTransform{Scale: 1}, Layout: json.RawMessage(layout)}
		if _, err = s.SaveAssembly(a); err != nil {
			t.Fatal(err)
		}
		if _, err = s.db.Exec("UPDATE card_assemblies SET updated_at=? WHERE card_id=?", []string{"2026-01-01", "2026-01-02"}[i], c.ID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.db.Exec("DROP TABLE assembly_layouts"); err != nil {
		t.Fatal(err)
	}
	migration, err := migrationsFS.ReadFile("migrations/0017_shared_assembly_layouts.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = s.db.Exec(string(migration)); err != nil {
		t.Fatal(err)
	}
	got, err := s.AssemblyLayout(LayoutScope{"upload:shared.png", f, 3})
	if err != nil || string(got) != `{"upper_text":{"y":75}}` {
		t.Fatalf("migrated layout: %s %v", got, err)
	}
}
