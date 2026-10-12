package store

import (
	"errors"
	"testing"
)

func TestBuiltinSubtypesSeededOnceAndProtected(t *testing.T) {
	s := NewSubtypesStore(openCardTypes(t).db)
	for i := 0; i < 2; i++ {
		if err := s.EnsureBuiltins(); err != nil {
			t.Fatal(err)
		}
	}
	list, err := s.List()
	if err != nil || len(list) != 2 || list[0].Name != "Level 0" || list[1].Name != "Level 1+" {
		t.Fatalf("builtins: %+v %v", list, err)
	}
	if _, err := s.Rename(list[0].ID, "Zero"); !errors.Is(err, ErrBuiltinSubtype) {
		t.Fatalf("rename: %v", err)
	}
	if _, err := s.Delete(list[1].ID); !errors.Is(err, ErrBuiltinSubtype) {
		t.Fatalf("delete: %v", err)
	}
	if _, err := s.AddOverlay(list[0].ID, "subtype-overlays/a.png"); err != nil {
		t.Fatalf("builtins accept overlays: %v", err)
	}
}
