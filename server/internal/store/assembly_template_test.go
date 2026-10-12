package store

import "testing"

func TestAssemblyTemplatesSaveReplaceAndClear(t *testing.T) {
	s, f, _ := setupCards(t)
	if _, err := s.db.Exec(`INSERT INTO card_types(id,name,template_path) VALUES(3,'combat','t.png')`); err != nil {
		t.Fatal(err)
	}
	for _, id := range []int{5, 6} {
		if _, err := s.db.Exec(`INSERT INTO generations(id,faction_id,card_type_id,prompt,status,image_path) VALUES(?,?,3,'p','done','generated/x.png')`, id, f); err != nil {
			t.Fatal(err)
		}
	}
	if err := s.SaveAssemblyTemplate(AssemblyTemplate{FactionID: f, Category: "combat", ImageKey: "test-5"}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveAssemblyTemplate(AssemblyTemplate{FactionID: f, Category: "combat", ImageKey: "test-6"}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveAssemblyTemplate(AssemblyTemplate{FactionID: f, Category: "combat", Side: "back", ImageKey: "test-5"}); err != nil {
		t.Fatal(err)
	}
	got, err := s.AssemblyTemplates()
	if err != nil || len(got) != 2 || got[0].Side != "back" || got[0].ImageKey != "test-5" || got[1].Side != "front" || got[1].ImageKey != "test-6" {
		t.Fatalf("templates: %+v %v", got, err)
	}
	for _, bad := range []AssemblyTemplate{{f, "combat", "front", "test-99"}, {f, "event", "front", "test-5"}, {f, "combat", "side", "test-5"}} {
		if s.SaveAssemblyTemplate(bad) == nil {
			t.Fatalf("accepted %+v", bad)
		}
	}
	if err := s.SaveAssemblyTemplate(AssemblyTemplate{FactionID: f, Category: "combat"}); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.AssemblyTemplates(); len(got) != 1 || got[0].Side != "back" {
		t.Fatalf("not cleared: %+v", got)
	}
}

func TestAssemblyKeepsSubtype(t *testing.T) {
	s, f, _ := setupCards(t)
	c, err := s.Create(combatCard(f))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveAssembly(CardAssembly{CardID: c.ID, OverlayID: "auto", SubtypeID: 7, Transform: ArtworkTransform{Scale: 1}, Layout: []byte(`{}`)}); err != nil {
		t.Fatal(err)
	}
	if a, err := s.Assembly(c.ID); err != nil || a.SubtypeID != 7 {
		t.Fatalf("subtype: %+v %v", a, err)
	}
}
