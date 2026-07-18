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
	f, err := NewFactionsStore(db).Create("Tau", "desc", "Galaxy in Flames", "manual")
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
	g, err := s.Create(fid, ctid, "draft", "the prompt")
	if err != nil {
		t.Fatal(err)
	}
	if g.Status != "pending" || g.Mode != "draft" || g.Prompt != "the prompt" || g.ImagePath != "" || g.CostUSD != 0 {
		t.Fatalf("bad generation: %+v", g)
	}
}

func TestGenerationMarkDone(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	g, _ := s.Create(fid, ctid, "final", "p")
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
	g, _ := s.Create(fid, ctid, "draft", "p")
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
	a, _ := s.Create(fid, ctid, "draft", "p1")
	b, _ := s.Create(fid, ctid, "draft", "p2")
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
