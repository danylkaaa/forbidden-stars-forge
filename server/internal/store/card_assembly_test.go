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
	if err != nil || a.Transform.Scale != 1 || a.LogoScale != 1 || a.ImageKey != "" {
		t.Fatalf("default %v %v", a, err)
	}
	a.ImageKey = "upload"
	a.ArtworkPath = "card-artwork/a.png"
	a.OverlayID = "none"
	a.LogoScale = 1.65
	a.Transform = ArtworkTransform{Scale: 1.7, X: 12, Y: -9}
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
	if err != nil || loaded.ArtworkPath != a.ArtworkPath || loaded.LogoScale != a.LogoScale || loaded.Transform != a.Transform || string(loaded.Layout) != string(a.Layout) {
		t.Fatalf("round trip: %v %v", loaded, err)
	}
	other, _ := s.Create(combatCard(f))
	blank, _ := s.Assembly(other.ID)
	if blank.ImageKey != "" || blank.LogoScale != 1 || blank.Transform.Scale != 1 {
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

func TestValidateAssemblyArtworkAdjust(t *testing.T) {
	ok := CardAssembly{OverlayID: "auto", Layout: json.RawMessage(`{}`), Transform: ArtworkTransform{Scale: 1, Adjust: &ArtworkAdjust{Black: 10, White: 240, Gamma: 1, Contrast: 20}}}
	if err := ValidateAssembly(ok); err != nil {
		t.Fatal(err)
	}
	bad := ok
	bad.Transform.Adjust = &ArtworkAdjust{Black: 200, White: 100, Gamma: 1}
	if ValidateAssembly(bad) == nil {
		t.Fatal("white below black accepted")
	}
	bad.Transform.Adjust = &ArtworkAdjust{White: 255, Gamma: 1, Brightness: 500}
	if ValidateAssembly(bad) == nil {
		t.Fatal("brightness out of range accepted")
	}
}

func TestAssemblyArtworkRotationMustBeQuarterTurns(t *testing.T) {
	ok := CardAssembly{OverlayID: "auto", Layout: json.RawMessage(`{}`), Transform: ArtworkTransform{Scale: 1, Flip: true, Rotate: 270}}
	if err := ValidateAssembly(ok); err != nil {
		t.Fatal(err)
	}
	bad := ok
	bad.Transform.Rotate = 45
	if ValidateAssembly(bad) == nil {
		t.Fatal("accepted a 45 degree rotation")
	}
}
