package store

import (
	"errors"
	"path/filepath"
	"testing"
)

// genFixtures creates a faction and a card type to satisfy the FKs.
func genFixtures(t *testing.T) (*GenerationsStore, int64, int64) {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	f, err := NewFactionsStore(db).Create(FactionInput{Name: "Tau", Description: "desc", DLC: "Galaxy in Flames"}, "manual")
	if err != nil {
		t.Fatal(err)
	}
	ct, err := NewCardTypesStore(db).Create("combat", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	return NewGenerationsStore(db), f.ID, ct.ID
}

func TestGenerationCreatePending(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	g, err := s.Create(fid, ctid, "draft", "gpt-image-2", "low", "-tau-combat-low", "the prompt")
	if err != nil {
		t.Fatal(err)
	}
	if g.Status != "pending" || g.Mode != "draft" || g.Prompt != "the prompt" || g.ImagePath != "" || g.CostUSD != 0 {
		t.Fatalf("bad generation: %+v", g)
	}
}

func TestGenerationMarkDone(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	g, _ := s.Create(fid, ctid, "final", "gpt-image-2", "low", "-tau-combat-low", "p")
	if err := s.MarkDone(g.ID, "generated/gen-1.png", 1200, 4800, 0.19, 43000); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(g.ID)
	if got.Status != "done" || got.ImagePath != "generated/gen-1.png" ||
		got.InputTokens != 1200 || got.OutputTokens != 4800 ||
		got.CostUSD != 0.19 || got.DurationMS != 43000 || got.Error != "" {
		t.Fatalf("after done: %+v", got)
	}
}

func TestGenerationMarkFailed(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	g, _ := s.Create(fid, ctid, "draft", "gpt-image-2", "low", "-tau-combat-low", "p")
	if err := s.MarkFailed(g.ID, "openai: boom (request id r1)"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(g.ID)
	if got.Status != "failed" || got.Error != "openai: boom (request id r1)" || got.ImagePath != "" {
		t.Fatalf("after failed: %+v", got)
	}
}

func TestGenerationListNewestFirst(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	a, _ := s.Create(fid, ctid, "draft", "gpt-image-2", "low", "-tau-combat-low", "p1")
	b, _ := s.Create(fid, ctid, "draft", "gpt-image-2", "low", "-tau-combat-low", "p2")
	all, err := s.List()
	if err != nil || len(all) != 2 {
		t.Fatalf("list: %v len=%d", err, len(all))
	}
	if all[0].ID != b.ID || all[1].ID != a.ID {
		t.Fatalf("order: %d, %d", all[0].ID, all[1].ID)
	}
}

func TestGenerationNotFound(t *testing.T) {
	s, _, _ := genFixtures(t)
	if _, err := s.Get(999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get: %v", err)
	}
	if err := s.MarkDone(999, "x", 0, 0, 0, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("done: %v", err)
	}
	if err := s.MarkFailed(999, "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("failed: %v", err)
	}
}

// TestFactionDeleteCascadesGenerations guards the PRD §7.1 intent: test
// generations are disposable artifacts, so deleting a faction that has
// generations must not fail on the FK - the generations should simply be
// removed along with it (migration 0005).
func TestFactionDeleteCascadesGenerations(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	fs := NewFactionsStore(db)
	cts := NewCardTypesStore(db)
	gs := NewGenerationsStore(db)

	f, err := fs.Create(FactionInput{Name: "Tau", Description: "desc", DLC: "Galaxy in Flames"}, "manual")
	if err != nil {
		t.Fatal(err)
	}
	ct, err := cts.Create("combat", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	g, err := gs.Create(f.ID, ct.ID, "draft", "gpt-image-2", "low", "-tau-combat-low", "the prompt")
	if err != nil {
		t.Fatal(err)
	}

	if err := fs.Delete(f.ID); err != nil {
		t.Fatalf("delete faction with generations: %v", err)
	}
	if _, err := gs.Get(g.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("generation survived faction delete: %v", err)
	}
}

// TestCardTypeDeleteCascadesGenerations mirrors the faction case for the
// other FK generations carries.
func TestCardTypeDeleteCascadesGenerations(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })

	fs := NewFactionsStore(db)
	cts := NewCardTypesStore(db)
	gs := NewGenerationsStore(db)

	f, err := fs.Create(FactionInput{Name: "Tau", Description: "desc", DLC: "Galaxy in Flames"}, "manual")
	if err != nil {
		t.Fatal(err)
	}
	ct, err := cts.Create("combat", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	g, err := gs.Create(f.ID, ct.ID, "draft", "gpt-image-2", "low", "-tau-combat-low", "the prompt")
	if err != nil {
		t.Fatal(err)
	}

	if err := cts.Delete(ct.ID); err != nil {
		t.Fatalf("delete card type with generations: %v", err)
	}
	if _, err := gs.Get(g.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("generation survived card type delete: %v", err)
	}
}

func TestImageNamesNumberPerPair(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	a, _ := s.Create(fid, ctid, "draft", "m", "low", ImageNameSuffix("Sisters of Battle", "combat", "low"), "p")
	b, _ := s.Create(fid, ctid, "final", "m", "high", ImageNameSuffix("Sisters of Battle", "combat", "high"), "p")
	if a.Name != "1-sisters_of_battle-combat-low" || b.Name != "2-sisters_of_battle-combat-high" || b.Quality != "high" {
		t.Fatalf("names: %q %q", a.Name, b.Name)
	}
	if err := s.SetFavorite(a.ID, true); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Get(a.ID); !got.Favorite {
		t.Fatal("favorite not saved")
	}
}
