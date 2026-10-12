package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func openFactions(t *testing.T) *FactionsStore {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewFactionsStore(db)
}

func TestCreateWritesFactionAndRevision(t *testing.T) {
	s := openFactions(t)
	f, err := s.Create(FactionInput{Name: "Tau Empire", Description: "blue-grey plating", DLC: "Galaxy in Flames"}, "manual")
	if err != nil {
		t.Fatal(err)
	}
	if f.ID == 0 || f.Name != "Tau Empire" || f.DLC != "Galaxy in Flames" {
		t.Fatalf("bad faction: %+v", f)
	}
	revs, err := s.Revisions(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(revs) != 1 || revs[0].Source != "manual" || revs[0].Description != "blue-grey plating" {
		t.Fatalf("bad revisions: %+v", revs)
	}
}

func TestCreateDuplicateName(t *testing.T) {
	s := openFactions(t)
	if _, err := s.Create(FactionInput{Name: "Eldar", Description: "", DLC: "Darkest Dawn"}, "manual"); err != nil {
		t.Fatal(err)
	}
	_, err := s.Create(FactionInput{Name: "Eldar", Description: "", DLC: "Darkest Dawn"}, "manual")
	if !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("err = %v, want ErrDuplicateName", err)
	}
}

func TestUpdateWritesRevisionOnlyWhenChanged(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create(FactionInput{Name: "Necrons", Description: "gunmetal", DLC: "Darkest Dawn"}, "manual")

	_, changed, err := s.Update(f.ID, FactionInput{Name: "Necrons", Description: "gunmetal and jade", DLC: "Darkest Dawn"}, "claude")
	if err != nil || !changed {
		t.Fatalf("changed=%v err=%v", changed, err)
	}
	// no-op save: identical state → no new revision, changed=false
	_, changed, err = s.Update(f.ID, FactionInput{Name: "Necrons", Description: "gunmetal and jade", DLC: "Darkest Dawn"}, "manual")
	if err != nil || changed {
		t.Fatalf("no-op save: changed=%v err=%v", changed, err)
	}
	revs, _ := s.Revisions(f.ID)
	if len(revs) != 2 {
		t.Fatalf("revisions = %d, want 2", len(revs))
	}
	if revs[0].Source != "claude" { // newest first
		t.Fatalf("newest revision source = %q", revs[0].Source)
	}
}

// TestListOrdersByUpdatedDesc asserts that List() orders rows by
// updated_at DESC, id DESC. "A" then "B" are created back-to-back, which
// may land in the same second since updated_at/created_at come from
// datetime('now') (1-second resolution). The id DESC tie-break makes the
// resulting order deterministic regardless: B always sorts before A.
//
// We deliberately do NOT extend this test with an update-then-reorder
// assertion (create A, create B, update A, expect A first): updating A
// could land in the same second as B's creation, in which case
// updated_at ties and the id tie-break puts B (higher id) first even
// though A was just touched - the exact opposite of "moved to the
// front". That would make the assertion flaky/wrong rather than
// deterministic, so per the reviewed defect writeup we keep only the
// id-tie-break assertions below, which hold unconditionally.
func TestListOrdersByUpdatedDesc(t *testing.T) {
	s := openFactions(t)
	s.Create(FactionInput{Name: "A", Description: "", DLC: "Galaxy in Flames"}, "manual")
	s.Create(FactionInput{Name: "B", Description: "", DLC: "Symphony of War"}, "manual")
	all, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("len = %d", len(all))
	}
	if all[0].Name != "B" || all[1].Name != "A" {
		t.Fatalf("order = [%s, %s], want [B, A] (id DESC tie-break)", all[0].Name, all[1].Name)
	}
}

func TestDeleteCascadesRevisions(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create(FactionInput{Name: "Orks", Description: "", DLC: "Symphony of War"}, "manual")
	if err := s.Delete(f.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(f.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get after delete: %v", err)
	}
	revs, _ := s.Revisions(f.ID)
	if len(revs) != 0 {
		t.Fatalf("revisions not cascaded: %d", len(revs))
	}
	if err := s.Delete(f.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("double delete: %v", err)
	}
}

func TestRestoreAppliesRevisionAndAppendsRollback(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create(FactionInput{Name: "Eldar", Description: "v1", DLC: "Darkest Dawn"}, "manual")
	s.Update(f.ID, FactionInput{Name: "Eldar", Description: "v2", DLC: "Darkest Dawn"}, "manual")
	revs, _ := s.Revisions(f.ID) // [v2, v1]
	oldest := revs[len(revs)-1]

	restored, err := s.Restore(f.ID, oldest.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Description != "v1" {
		t.Fatalf("description = %q, want v1", restored.Description)
	}
	revs, _ = s.Revisions(f.ID)
	if len(revs) != 3 || revs[0].Source != "rollback" || revs[0].Description != "v1" {
		t.Fatalf("bad history after restore: %+v", revs)
	}
}

func TestRestoreOfRollbackWorks(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create(FactionInput{Name: "Orks", Description: "v1", DLC: "Symphony of War"}, "manual")
	s.Update(f.ID, FactionInput{Name: "Orks", Description: "v2", DLC: "Symphony of War"}, "manual")
	revs, _ := s.Revisions(f.ID)
	s.Restore(f.ID, revs[len(revs)-1].ID) // back to v1 (rollback rev)
	revs, _ = s.Revisions(f.ID)           // [rollback(v1), v2, v1]
	if _, err := s.Restore(f.ID, revs[1].ID); err != nil {
		t.Fatal(err) // rollback of a rollback
	}
	cur, _ := s.Get(f.ID)
	if cur.Description != "v2" {
		t.Fatalf("description = %q, want v2", cur.Description)
	}
	revs, _ = s.Revisions(f.ID)
	if len(revs) != 4 {
		t.Fatalf("history length = %d, want 4 (never rewritten)", len(revs))
	}
}

func TestRestoreWrongFaction(t *testing.T) {
	s := openFactions(t)
	a, _ := s.Create(FactionInput{Name: "A2", Description: "", DLC: "Galaxy in Flames"}, "manual")
	b, _ := s.Create(FactionInput{Name: "B2", Description: "", DLC: "Galaxy in Flames"}, "manual")
	bRevs, _ := s.Revisions(b.ID)
	if _, err := s.Restore(a.ID, bRevs[0].ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-faction restore: %v", err)
	}
}
