package store

import (
	"encoding/json"
	"testing"
)

func TestAssemblyPersistsAfterRestartAndCardEdit(t *testing.T) {
	s, f, path := setupCards(t)
	c, err := s.Create(combatCard(f))
	if err != nil {
		t.Fatal(err)
	}
	a, err := s.Assembly(c.ID)
	if err != nil || a.Transform.Scale != 1 || a.ImageKey != "" {
		t.Fatalf("default %v %v", a, err)
	}
	a.ImageKey = "upload"
	a.ArtworkPath = "card-artwork/a.png"
	a.OverlayID = "none"
	a.Transform = ArtworkTransform{1.7, 12, -9}
	a.Layout = json.RawMessage(`{"upper_text":{"x":20,"y":70}}`)
	if _, err = s.SaveAssembly(a); err != nil {
		t.Fatal(err)
	}
	updated := c.CardInput
	updated.Name = "Edited"
	if _, err = s.Update(c.ID, updated); err != nil {
		t.Fatal(err)
	}
	db, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	loaded, err := NewCardsStore(db).Assembly(c.ID)
	if err != nil || loaded.ArtworkPath != a.ArtworkPath || loaded.Transform != a.Transform || string(loaded.Layout) != string(a.Layout) {
		t.Fatalf("round trip: %v %v", loaded, err)
	}
	other, _ := s.Create(combatCard(f))
	blank, _ := s.Assembly(other.ID)
	if blank.ImageKey != "" || blank.Transform.Scale != 1 {
		t.Fatal("configuration leaked between cards")
	}
}
func TestAssemblyRejectsInvalidTransformsAndLayout(t *testing.T) {
	s, f, _ := setupCards(t)
	c, _ := s.Create(combatCard(f))
	a, _ := s.Assembly(c.ID)
	for _, scale := range []float64{0, .09, 5.1} {
		bad := a
		bad.Transform.Scale = scale
		if _, err := s.SaveAssembly(bad); err == nil {
			t.Fatalf("accepted scale %v", scale)
		}
	}
	bad := a
	bad.Transform.X = 201
	if _, err := s.SaveAssembly(bad); err == nil {
		t.Fatal("accepted position")
	}
	bad = a
	bad.Layout = json.RawMessage(`[]`)
	if _, err := s.SaveAssembly(bad); err == nil {
		t.Fatal("accepted array layout")
	}
}
