package store

import (
	"strconv"
	"testing"
)

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

func TestFactionColorIsStoredValidatedAndRemoved(t *testing.T) {
	s, f, _ := setupCards(t)
	if err := s.SaveFactionColor(FactionColor{FactionID: f, Color: "#aa3344"}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.FactionColors(); len(list) != 1 || list[0].Color != "#aa3344" {
		t.Fatalf("unexpected %+v", list)
	}
	if s.SaveFactionColor(FactionColor{FactionID: f, Color: "red"}) == nil {
		t.Error("expected a non-hex colour to be rejected")
	}
	if err := s.SaveFactionColor(FactionColor{FactionID: f}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.FactionColors(); len(list) != 0 {
		t.Fatalf("expected the colour removed, got %+v", list)
	}
}

func TestNebulaPlacementIsPerFactionAndCardType(t *testing.T) {
	s, f, _ := setupCards(t)
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", X: 0.2, Y: -0.1, Rotation: 30}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "combat", X: -0.3}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", X: 0.5, Rotation: 45}); err != nil {
		t.Fatal(err)
	}
	list, _ := s.NebulaPlacements()
	if len(list) != 2 || list[1].X != 0.5 || list[0].X != -0.3 {
		t.Fatalf("unexpected %+v", list)
	}
	for _, bad := range []NebulaPlacement{{FactionID: f, Category: "base"}, {FactionID: f, Category: "combat", X: 2}, {FactionID: f, Category: "combat", Rotation: 500}} {
		if s.SaveNebulaPlacement(bad) == nil {
			t.Errorf("expected %+v to be rejected", bad)
		}
	}
}

func TestBackLogoScaleIsPerFactionAndKeptWhenOmitted(t *testing.T) {
	s, f, _ := setupCards(t)
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", LogoScale: 0.7}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", X: 0.1}); err != nil {
		t.Fatal(err)
	}
	list, _ := s.NebulaPlacements()
	if len(list) != 1 || list[0].LogoScale != 0.7 || list[0].X != 0.1 {
		t.Fatalf("logo scale should be kept: %+v", list)
	}
	if s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", LogoScale: 2}) == nil {
		t.Error("expected a logo scale above 1 to be rejected")
	}
}

func TestBackElementIsValidatedKeptAndCleared(t *testing.T) {
	s, f, _ := setupCards(t)
	var ct int64
	res, _ := s.db.Exec(`INSERT INTO card_types(name) VALUES('back element')`)
	ct, _ = res.LastInsertId()
	res, err := s.db.Exec(`INSERT INTO generations(faction_id,card_type_id,prompt,status,image_path) VALUES(?,?, 'p','done','generated/x.png')`, f, ct)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	key := "test-" + strconv.FormatInt(id, 10)
	if s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "combat", ElementKey: ptr("test-999")}) == nil {
		t.Error("expected an unknown element image to be rejected")
	}
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "combat", ElementKey: &key}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "combat", X: 0.1}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.NebulaPlacements(); len(list) != 1 || *list[0].ElementKey != key {
		t.Fatalf("the element should be kept when omitted: %+v", list)
	}
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "combat", ElementKey: ptr("")}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.NebulaPlacements(); *list[0].ElementKey != "" {
		t.Fatalf("the element should be cleared: %+v", list)
	}
}

func TestFactionBannerIsValidatedAndSaved(t *testing.T) {
	s, f, _ := setupCards(t)
	good := FactionBanner{FactionID: f, LogoScale: 0.4, ElementX: 0.1, ElementY: -0.05, ElementScale: 0.5}
	if err := s.SaveFactionBanner(good); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.FactionBanners(); len(list) != 1 || list[0].LogoScale != 0.4 || list[0].ElementScale != 0.5 {
		t.Fatalf("unexpected %+v", list)
	}
	for _, bad := range []FactionBanner{{FactionID: f, LogoScale: 2, ElementScale: 0.4}, {FactionID: f, LogoScale: 0.4, ElementX: 3, ElementScale: 0.4}, {FactionID: f, LogoScale: 0.4, ElementScale: 5}, {FactionID: f, LogoScale: 0.4, ElementScale: 0.4, ElementKey: "test-999"}} {
		if s.SaveFactionBanner(bad) == nil {
			t.Errorf("expected %+v to be rejected", bad)
		}
	}
}

func TestBannerScaleOfABackIsKeptWhenOmitted(t *testing.T) {
	s, f, _ := setupCards(t)
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "combat", BannerScale: 1.4}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "combat", X: 0.1}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.NebulaPlacements(); len(list) != 1 || list[0].BannerScale != 1.4 || list[0].X != 0.1 {
		t.Fatalf("banner scale should be kept: %+v", list)
	}
	if s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "combat", BannerScale: 9}) == nil {
		t.Error("expected an out-of-range banner scale to be rejected")
	}
}

func TestBackNebulaBrightnessIsOptionalKeptWhenOmittedAndValidated(t *testing.T) {
	s, f, _ := setupCards(t)
	b := 1.4
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", Brightness: &b}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", X: 0.1}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.NebulaPlacements(); len(list) != 1 || *list[0].Brightness != 1.4 {
		t.Fatalf("brightness should be kept when omitted: %+v", list)
	}
	zero, bad := 0.0, 5.0
	if err := s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", Brightness: &zero}); err != nil {
		t.Fatal(err)
	}
	if list, _ := s.NebulaPlacements(); *list[0].Brightness != 0 {
		t.Fatalf("0 should follow the faction's brightness: %+v", list)
	}
	if s.SaveNebulaPlacement(NebulaPlacement{FactionID: f, Category: "schema", Brightness: &bad}) == nil {
		t.Error("expected an out-of-range brightness to be rejected")
	}
}
