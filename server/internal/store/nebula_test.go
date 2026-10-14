package store

import "testing"

func TestNebulaSaveAndValidate(t *testing.T) {
	s, factionID, _ := setupCards(t)
	if list, err := s.Nebulas(); err != nil || len(list) != 0 {
		t.Fatalf("expected no nebulas, got %v, %v", list, err)
	}
	if err := s.SaveNebula(Nebula{FactionID: factionID, Color: "#112233", Seed: 42, Density: 1.5}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveNebula(Nebula{FactionID: factionID, Color: "", Seed: 43, Density: 1}); err != nil {
		t.Fatal(err)
	}
	list, _ := s.Nebulas()
	if len(list) != 1 || list[0].Seed != 43 || list[0].Color != "" {
		t.Fatalf("unexpected %+v", list)
	}
	for _, bad := range []Nebula{{FactionID: factionID, Color: "red", Seed: 1, Density: 1}, {FactionID: factionID, Seed: -1, Density: 1}, {FactionID: factionID, Seed: 1, Density: 5}} {
		if s.SaveNebula(bad) == nil {
			t.Errorf("expected %+v to be rejected", bad)
		}
	}
}

func TestStartingFlagIsStoredAndOnlyFlaggedCardsAreStarting(t *testing.T) {
	s, f, _ := setupCards(t)
	plain := combatCard(f)
	plain.Level = ptr[int64](0)
	c, err := s.Create(plain)
	if err != nil || c.Starting == nil || *c.Starting {
		t.Fatalf("level 0 card without the flag must not be starting: %+v %v", c.Starting, err)
	}
	flagged := plain
	flagged.Starting = ptr(true)
	if c, err = s.Create(flagged); err != nil || !*c.Starting {
		t.Fatalf("flagged card must be starting: %v", err)
	}
	if got, _ := s.Get(c.ID); got.Starting == nil || !*got.Starting {
		t.Fatal("starting flag was not stored")
	}
	bad := flagged
	bad.Level = ptr[int64](2)
	if _, err = s.Create(bad); err == nil {
		t.Fatal("a starting card above level 0 must be rejected")
	}
}

func TestNebulaAsTemplateIsStored(t *testing.T) {
	s, f, _ := setupCards(t)
	if err := s.SaveNebula(Nebula{FactionID: f, Seed: 1, Density: 1, AsTemplate: true}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.Nebulas(); len(list) != 1 || !list[0].AsTemplate {
		t.Fatalf("as_template was not stored: %+v", list)
	}
}
