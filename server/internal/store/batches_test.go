package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func batchFixtures(t *testing.T) (*BatchesStore, *FactionsStore, *CardTypesStore, int64, int64) {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	fs := NewFactionsStore(db)
	cs := NewCardTypesStore(db)
	f, _ := fs.Create(FactionInput{Name: "Tau", Description: "d", DLC: "Galaxy in Flames"}, "manual")
	ct, _ := cs.Create("combat", "", "", "")
	return NewBatchesStore(db), fs, cs, f.ID, ct.ID
}

func mkBatch(t *testing.T, s *BatchesStore, fid, ctid int64) Batch {
	t.Helper()
	b, err := s.Create("draft", "gpt-image-2", "batches/1/requests.jsonl", []BatchItemInput{
		{FactionID: fid, CardTypeID: ctid, CustomID: "tau__combat"},
	})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestBatchCreateWithItems(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	b := mkBatch(t, s, fid, ctid)
	if b.Status != "created" || b.Mode != "draft" || b.JSONLPath != "batches/1/requests.jsonl" {
		t.Fatalf("batch: %+v", b)
	}
	items, err := s.Items(b.ID)
	if err != nil || len(items) != 1 || items[0].Status != "pending" || items[0].CustomID != "tau__combat" {
		t.Fatalf("items: %v %+v", err, items)
	}
}

func TestBatchSubmitAndStatusFlow(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	b := mkBatch(t, s, fid, ctid)
	if err := s.MarkSubmitted(b.ID, "batch_abc"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(b.ID)
	if got.Status != "submitted" || got.OpenAIBatchID != "batch_abc" || got.SubmittedAt == "" {
		t.Fatalf("after submit: %+v", got)
	}
	if err := s.SetStatus(b.ID, "in_progress"); err != nil {
		t.Fatal(err)
	}
	if err := s.Complete(b.ID, "batches/1/output.jsonl", 0.41); err != nil {
		t.Fatal(err)
	}
	got, _ = s.Get(b.ID)
	if got.Status != "completed" || got.TotalCostUSD != 0.41 || got.CompletedAt == "" || got.OutputPath == "" {
		t.Fatalf("after complete: %+v", got)
	}
	// terminal guard: SetStatus on completed batch is a silent no-op
	if err := s.SetStatus(b.ID, "in_progress"); err != nil {
		t.Fatal(err)
	}
	got, _ = s.Get(b.ID)
	if got.Status != "completed" {
		t.Fatalf("terminal overwritten: %+v", got)
	}
}

func TestBatchItemTransitions(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	b := mkBatch(t, s, fid, ctid)
	if err := s.MarkItemDone(b.ID, "tau__combat", "batches/1/tau__combat.png", 100, 400, 0.1); err != nil {
		t.Fatal(err)
	}
	items, _ := s.Items(b.ID)
	if items[0].Status != "done" || items[0].CostUSD != 0.1 || items[0].ImagePath == "" {
		t.Fatalf("done item: %+v", items[0])
	}
	if err := s.MarkItemFailed(b.ID, "missing__id", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing custom id: %v", err)
	}
}

func TestBatchNonTerminal(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	a := mkBatch(t, s, fid, ctid)
	s.MarkSubmitted(a.ID, "batch_1")
	done := mkBatch(t, s, fid, ctid)
	s.MarkSubmitted(done.ID, "batch_2")
	s.Complete(done.ID, "o", 0)
	nt, err := s.NonTerminal()
	if err != nil || len(nt) != 1 || nt[0].ID != a.ID {
		t.Fatalf("non-terminal: %v %+v", err, nt)
	}
}

func TestBatchList(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	a := mkBatch(t, s, fid, ctid)
	b := mkBatch(t, s, fid, ctid)
	all, err := s.List()
	if err != nil || len(all) != 2 || all[0].ID != b.ID || all[1].ID != a.ID {
		t.Fatalf("list: %v %+v", err, all)
	}
}

func TestReferencedGuards(t *testing.T) {
	s, fs, cs, fid, ctid := batchFixtures(t)
	ref, err := s.FactionReferenced(fid)
	if err != nil || ref {
		t.Fatalf("pre: %v %v", ref, err)
	}
	mkBatch(t, s, fid, ctid)
	if ref, _ = s.FactionReferenced(fid); !ref {
		t.Fatal("faction should be referenced")
	}
	if ref, _ = s.CardTypeReferenced(ctid); !ref {
		t.Fatal("card type should be referenced")
	}
	// FK (no cascade) blocks raw deletes at DB level too
	if err := fs.Delete(fid); err == nil {
		t.Fatal("faction delete should fail at FK level")
	}
	if err := cs.Delete(ctid); err == nil {
		t.Fatal("card type delete should fail at FK level")
	}
}

func TestDoneItemsJoinsBatchAndSkipsUnfinished(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	b, err := s.Create("final", "gpt-image-2.5-flare", "x", []BatchItemInput{
		{FactionID: fid, CardTypeID: ctid, CustomID: "a"},
		{FactionID: fid, CardTypeID: ctid, CustomID: "b"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.MarkItemDone(b.ID, "a", "batches/1/a.png", 1, 2, 0.5); err != nil {
		t.Fatal(err)
	}
	items, err := s.DoneItems()
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].CustomID != "a" || items[0].Mode != "final" ||
		items[0].Model != "gpt-image-2.5-flare" || items[0].CompletedAt == "" || items[0].CostUSD != 0.5 {
		t.Fatalf("items: %+v", items)
	}
}
