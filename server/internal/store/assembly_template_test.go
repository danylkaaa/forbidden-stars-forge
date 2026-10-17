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
	for _, bad := range []AssemblyTemplate{{FactionID: f, Category: "combat", Side: "front", ImageKey: "test-99"}, {FactionID: f, Category: "event", Side: "front", ImageKey: "test-5"}, {FactionID: f, Category: "combat", Side: "side", ImageKey: "test-5"}} {
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

func TestTemplateAdjustSavesClearsAndSurvivesReplace(t *testing.T) {
	s, f, _ := setupCards(t)
	if _, err := s.db.Exec(`INSERT INTO card_types(id,name,template_path) VALUES(3,'combat','t.png')`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`INSERT INTO generations(id,faction_id,card_type_id,prompt,status,image_path) VALUES(5,?,3,'p','done','generated/x.png')`, f); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTemplateAdjust(f, "combat", "front", &ArtworkAdjust{White: 255, Gamma: 1}); err != ErrNotFound {
		t.Fatalf("adjusted an unchosen template: %v", err)
	}
	if err := s.SaveAssemblyTemplate(AssemblyTemplate{FactionID: f, Category: "combat", ImageKey: "test-5"}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetTemplateAdjust(f, "combat", "front", &ArtworkAdjust{White: 255, Gamma: 1, Hue: 20, Contrast: 10}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveAssemblyTemplate(AssemblyTemplate{FactionID: f, Category: "combat", ImageKey: "test-5"}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.AssemblyTemplates()
	if len(got) != 1 || got[0].Adjust == nil || got[0].Adjust.Hue != 20 || got[0].Adjust.Contrast != 10 {
		t.Fatalf("adjust lost: %+v", got)
	}
	if s.SetTemplateAdjust(f, "combat", "front", &ArtworkAdjust{White: 255, Gamma: 1, Hue: 500}) == nil {
		t.Fatal("accepted out-of-range hue")
	}
	if err := s.SetTemplateAdjust(f, "combat", "front", nil); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.AssemblyTemplates(); got[0].Adjust != nil {
		t.Fatalf("not cleared: %+v", got[0].Adjust)
	}
}

func TestOverlayAdjustmentsPerFactionAndOverlay(t *testing.T) {
	s, f, _ := setupCards(t)
	a := &ArtworkAdjust{White: 255, Gamma: 1, Hue: 30}
	if err := s.SaveOverlayAdjustment(f, "ribbon", a); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveOverlayAdjustment(f, "ribbon", &ArtworkAdjust{White: 255, Gamma: 1, Hue: 40}); err != nil {
		t.Fatal(err)
	}
	if err := s.SaveOverlayAdjustment(f, "bottom", a); err != nil {
		t.Fatal(err)
	}
	got, err := s.OverlayAdjustments()
	if err != nil || len(got) != 2 || got[1].Overlay != "ribbon" || got[1].Adjust.Hue != 40 {
		t.Fatalf("overlays: %+v %v", got, err)
	}
	if s.SaveOverlayAdjustment(f, "sparkles", a) == nil || s.SaveOverlayAdjustment(f, "ribbon", &ArtworkAdjust{White: 255, Gamma: 1, Hue: 999}) == nil {
		t.Fatal("accepted a bad overlay or value")
	}
	if err := s.SaveOverlayAdjustment(f, "ribbon", nil); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.OverlayAdjustments(); len(got) != 1 {
		t.Fatalf("not removed: %+v", got)
	}
}
