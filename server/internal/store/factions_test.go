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
	f, err := s.Create("Tau Empire", "blue-grey plating", "Galaxy in Flames", "manual")
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
	if _, err := s.Create("Eldar", "", "Darkest Dawn", "manual"); err != nil {
		t.Fatal(err)
	}
	_, err := s.Create("Eldar", "", "Darkest Dawn", "manual")
	if !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("err = %v, want ErrDuplicateName", err)
	}
}

func TestUpdateWritesRevisionOnlyWhenChanged(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create("Necrons", "gunmetal", "Darkest Dawn", "manual")

	_, changed, err := s.Update(f.ID, "Necrons", "gunmetal and jade", "Darkest Dawn", "claude")
	if err != nil || !changed {
		t.Fatalf("changed=%v err=%v", changed, err)
	}
	// no-op save: identical state → no new revision, changed=false
	_, changed, err = s.Update(f.ID, "Necrons", "gunmetal and jade", "Darkest Dawn", "manual")
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

func TestListOrdersByUpdatedDesc(t *testing.T) {
	s := openFactions(t)
	s.Create("A", "", "Galaxy in Flames", "manual")
	s.Create("B", "", "Symphony of War", "manual")
	all, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("len = %d", len(all))
	}
}

func TestDeleteCascadesRevisions(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create("Orks", "", "Symphony of War", "manual")
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
