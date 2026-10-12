package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func openCardTypes(t *testing.T) *CardTypesStore {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewCardTypesStore(db)
}

func TestCardTypeCreateAndGet(t *testing.T) {
	s := openCardTypes(t)
	ct, err := s.Create("combat", "frontline warriors", "fill the crimson zone", "")
	if err != nil {
		t.Fatal(err)
	}
	if ct.ID == 0 || ct.Name != "combat" || ct.TemplatePath != "" || ct.OpenAIFileID != "" {
		t.Fatalf("bad card type: %+v", ct)
	}
	got, err := s.Get(ct.ID)
	if err != nil || got.Constraints != "fill the crimson zone" {
		t.Fatalf("get: %+v err=%v", got, err)
	}
}

func TestCardTypeDuplicateName(t *testing.T) {
	s := openCardTypes(t)
	s.Create("schema", "", "", "")
	_, err := s.Create("schema", "", "", "")
	if !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("err = %v", err)
	}
}

func TestCardTypeListOrdersByName(t *testing.T) {
	s := openCardTypes(t)
	s.Create("upgrade", "", "", "")
	s.Create("combat", "", "", "")
	all, err := s.List()
	if err != nil || len(all) != 2 {
		t.Fatalf("list: %v len=%d", err, len(all))
	}
	if all[0].Name != "combat" || all[1].Name != "upgrade" {
		t.Fatalf("order: %s, %s", all[0].Name, all[1].Name)
	}
}

func TestCardTypeUpdateTemplateClearsFileID(t *testing.T) {
	s := openCardTypes(t)
	ct, _ := s.Create("combat", "", "", "templates/a.png")
	if err := s.SetFileID(ct.ID, "file-abc123"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(ct.ID)
	if got.OpenAIFileID != "file-abc123" {
		t.Fatalf("file id = %q", got.OpenAIFileID)
	}

	// fields-only update keeps the file id
	upd, err := s.Update(ct.ID, "combat", "new desc", "new constraints", nil)
	if err != nil || upd.OpenAIFileID != "file-abc123" {
		t.Fatalf("fields-only update: %+v err=%v", upd, err)
	}

	// template replacement clears it
	newPath := "templates/b.png"
	upd, err = s.Update(ct.ID, "combat", "new desc", "new constraints", &newPath)
	if err != nil {
		t.Fatal(err)
	}
	if upd.TemplatePath != "templates/b.png" || upd.OpenAIFileID != "" {
		t.Fatalf("template update: %+v", upd)
	}
}

func TestCardTypeUpdateNotFoundAndDuplicate(t *testing.T) {
	s := openCardTypes(t)
	if _, err := s.Update(999, "x", "", "", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing: %v", err)
	}
	s.Create("combat", "", "", "")
	ct, _ := s.Create("schema", "", "", "")
	if _, err := s.Update(ct.ID, "combat", "", "", nil); !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("rename to duplicate: %v", err)
	}
}

func TestCardTypeDelete(t *testing.T) {
	s := openCardTypes(t)
	ct, _ := s.Create("combat", "", "", "")
	if err := s.Delete(ct.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ct.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get after delete: %v", err)
	}
	if err := s.Delete(ct.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("double delete: %v", err)
	}
}

func TestCardTypeSetFileIDNotFound(t *testing.T) {
	s := openCardTypes(t)
	if err := s.SetFileID(999, "file-x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("set file id missing: %v", err)
	}
}

func TestEnsureBuiltinCardTypesIsIdempotent(t *testing.T) {
	s := openCardTypes(t)
	if _, err := s.Create("combat", "kept", "", ""); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 2; i++ {
		if err := s.EnsureBuiltins(); err != nil {
			t.Fatal(err)
		}
	}
	list, err := s.List()
	if err != nil || len(list) != 6 || list[0].Name != "combat" || list[0].Description != "kept" || list[3].Name != "combat back" || list[3].Description == "" || list[3].Constraints == "" {
		t.Fatalf("builtins: %+v %v", list, err)
	}
}
