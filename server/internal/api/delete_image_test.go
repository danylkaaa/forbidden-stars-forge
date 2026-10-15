package api

import (
	"cardforge/internal/store"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestDeleteGeneratedImages(t *testing.T) {
	for _, source := range []string{"generation"} {
		t.Run(source, func(t *testing.T) {
			dir := t.TempDir()
			db, err := store.Open(filepath.Join(dir, "test.db"))
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			h := NewRouter(db, nil, dir)
			f := createFaction(t, h, "Tau")
			fid := int64(f["id"].(float64))
			ct, err := store.NewCardTypesStore(db).Create("combat", "", "", "")
			if err != nil {
				t.Fatal(err)
			}
			gens := store.NewGenerationsStore(db)
			path := "experiment.png"
			if err := os.WriteFile(filepath.Join(dir, path), artworkPNG(t), 0644); err != nil {
				t.Fatal(err)
			}
			var endpoint, imageURL, key, table string
			var imageID int64
			kind := "generation"
			if source == "generation" {
				g, err := gens.Create(fid, ct.ID, "draft", "m", "low", "-tau-combat-low", "p")
				if err != nil {
					t.Fatal(err)
				}
				imageID = g.ID
				endpoint, key, table = fmt.Sprintf("/api/generations/%d", g.ID), fmt.Sprintf("test-%d", g.ID), "generations"
				if rec, _ := doJSON(t, h, "DELETE", endpoint, ""); rec.Code != 409 {
					t.Fatal("deleted pending generation")
				}
				if err := gens.MarkDone(g.ID, path, 1, 2, 0.5, 100); err != nil {
					t.Fatal(err)
				}
			}
			imageURL = endpoint + "/image"
			descendant, _ := gens.Create(fid, ct.ID, "draft", "m", "low", "-tau-combat-low", "edited")
			gens.SetEditOrigin(descendant.ID, store.EditOrigin{Kind: kind, ID: imageID, Name: "original", Instruction: "change sky"})
			cards := store.NewCardsStore(db)
			choice := store.AssemblyTemplate{FactionID: fid, Category: "combat", Side: "back", ImageKey: key}
			if err := cards.SaveAssemblyTemplate(choice); err != nil {
				t.Fatal(err)
			}
			if rec, _ := doJSON(t, h, "DELETE", endpoint, ""); rec.Code != 409 {
				t.Fatal("deleted a chosen template")
			}
			if _, err := os.Stat(filepath.Join(dir, path)); err != nil {
				t.Fatal("used image file removed")
			}
			_, card := doJSON(t, h, "POST", "/api/cards", combatJSON(fid))
			assembly := fmt.Sprintf(`{"image_key":%q,"overlay_id":"none","transform":{"scale":1,"x":0,"y":0},"layout":{}}`, key)
			copied, saved := doJSON(t, h, "PUT", fmt.Sprintf("/api/cards/%.0f/assembly", card["id"]), assembly)
			if copied.Code != 200 {
				t.Fatal(copied.Body.String())
			}
			artworkURL := saved["image_url"].(string)
			choice.ImageKey = ""
			cards.SaveAssemblyTemplate(choice)
			if rec, _ := doJSON(t, h, "DELETE", endpoint, ""); rec.Code != 204 {
				t.Fatal(rec.Body.String())
			}
			if _, err := os.Stat(filepath.Join(dir, path)); !os.IsNotExist(err) {
				t.Fatal("image file remains")
			}
			if rec, _ := doJSON(t, h, "DELETE", endpoint, ""); rec.Code != 404 {
				t.Fatal("deleted twice")
			}
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, httptest.NewRequest("GET", imageURL, nil))
			if rec.Code != 404 {
				t.Fatal("deleted image still served")
			}
			copied = httptest.NewRecorder()
			h.ServeHTTP(copied, httptest.NewRequest("GET", artworkURL, nil))
			if copied.Code != 200 || copied.Body.Len() == 0 {
				t.Fatal("saved card artwork was removed")
			}
			if _, err := cards.AssemblySource(key); err != store.ErrNotFound {
				t.Fatal("deleted image can be selected")
			}
			child, _ := gens.Get(descendant.ID)
			if child.ParentKind != "" || child.ParentID != 0 || child.ParentName != "original" {
				t.Fatal("broken descendant reference")
			}
			var cost float64
			if err := db.QueryRow("SELECT cost_usd FROM "+table+" WHERE id=?", imageID).Scan(&cost); err != nil || cost != 0.5 {
				t.Fatal("cost history lost")
			}
			next, _ := gens.Create(fid, ct.ID, "draft", "m", "low", "-tau-combat-low", "next")
			expected := "3-tau-combat-low"
			if next.Name != expected {
				t.Fatalf("numbering: %s", next.Name)
			}
			list, _ := gens.List()
			for _, g := range list {
				if g.ID == imageID {
					t.Fatal("deleted experiment listed")
				}
			}
		})
	}
}
