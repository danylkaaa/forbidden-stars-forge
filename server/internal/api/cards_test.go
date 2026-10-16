package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"testing"
)

func combatJSON(f int64) string {
	return fmt.Sprintf(`{"faction_id":%d,"name":"Fire","category":"combat","level":0,"resource_cost":0,"shields":1,"guns":2,"eagles":0,"upper_text":"Upper","units":[],"unit_text":""}`, f)
}
func TestCardsCRUDImportAndFactionDeletion(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	id := int64(f["id"].(float64))
	body := combatJSON(id)
	rec, c := doJSON(t, h, "POST", "/api/cards", body)
	if rec.Code != 201 {
		t.Fatal(rec.Body.String())
	}
	cid := int64(c["id"].(float64))
	rec, c = doJSON(t, h, "GET", fmt.Sprintf("/api/cards/%d", cid), "")
	if rec.Code != 200 || c["upper_text"] != "Upper" {
		t.Fatal(c)
	}
	for _, category := range []string{"schema", "upgrade"} {
		extra := `"subtype":"tactic","action":"move_vertical"`
		if category == "upgrade" {
			extra = `"upgrade_type":"dominate","level":2,"resource_cost":1`
		}
		update := fmt.Sprintf(`{"faction_id":%d,"name":"New","category":"%s","text":"Text",%s}`, id, category, extra)
		rec, c = doJSON(t, h, "PUT", fmt.Sprintf("/api/cards/%d", cid), update)
		if rec.Code != 200 || (category == "schema" && c["level"] != nil) || c["text"] != "Text" {
			t.Fatalf("%d %v", rec.Code, c)
		}
	}
	mixed := fmt.Sprintf(`{"cards":[%s,{"faction_id":%d,"name":"Plan","category":"schema","subtype":"schema","action":"rotate_clockwise","text":""},{"faction_id":%d,"name":"Upgrade","category":"upgrade","upgrade_type":"deploy","level":1,"resource_cost":0,"text":""}]}`, body, id, id)
	for i := 0; i < 2; i++ {
		rec, c = doJSON(t, h, "POST", "/api/cards/import", mixed)
		if rec.Code != 201 || c["count"] != float64(3) {
			t.Fatalf("%d %v", rec.Code, c)
		}
	}
	rec, _ = doJSON(t, h, "GET", fmt.Sprintf("/api/cards?faction_id=%d&category=combat", id), "")
	var cards []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &cards)
	if len(cards) != 2 {
		t.Fatal(cards)
	}
	rec, _ = doJSON(t, h, "DELETE", fmt.Sprintf("/api/factions/%d", id), "")
	if rec.Code != 409 || !strings.Contains(rec.Body.String(), "card") {
		t.Fatal(rec.Body.String())
	}
	free := createFaction(t, h, "Free")
	rec, _ = doJSON(t, h, "DELETE", fmt.Sprintf("/api/factions/%d", int64(free["id"].(float64))), "")
	if rec.Code != 204 {
		t.Fatal(rec.Code)
	}
	rec, _ = doJSON(t, h, "GET", "/api/cards/999", "")
	if rec.Code != 404 {
		t.Fatal(rec.Code)
	}
}
func TestCardsJSONValidationAndNoPartialImport(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	body := combatJSON(int64(f["id"].(float64)))
	invalid := []string{"null", "[]", "not json", body + " {}", strings.Replace(body, `"level":0`, `"level":4`, 1), strings.Replace(body, `"level":0`, `"level":null`, 1), strings.Replace(body, `"level":0`, `"level":"0"`, 1), strings.Replace(body, `"level":0`, `"level":0.5`, 1), strings.Replace(body, `"level":0,`, "", 1), strings.Replace(body, `"guns":2`, `"guns":-1`, 1), strings.Replace(body, `"guns":2`, `"guns":9007199254740992`, 1), strings.Replace(body, `"name":"Fire"`, `"name":null`, 1), strings.Replace(body, `"units":[],"unit_text":""`, `"lower_text":null`, 1), strings.Replace(body, `"units":[],"unit_text":""`, `"units":[],"unit_text":"","text":null`, 1), strings.Replace(body, `"units":[],"unit_text":""`, `"units":[],"unit_text":"","other":true`, 1), combatJSON(999), strings.Replace(body, `"category":"combat"`, `"category":"other"`, 1)}
	for _, bad := range invalid {
		rec, _ := doJSON(t, h, http.MethodPost, "/api/cards", bad)
		if rec.Code != 400 {
			t.Fatalf("accepted %s: %d %s", bad, rec.Code, rec.Body.String())
		}
	}
	for _, bad := range []string{`{"cards":[]}`, `{"cards":null}`, `{"cards":[null]}`, `{"cards":[` + body + `,` + combatJSON(999) + `]}`, `{"cards":[` + body + `],"extra":1}`} {
		rec, out := doJSON(t, h, "POST", "/api/cards/import", bad)
		if rec.Code != 400 || out["errors"] == nil {
			t.Fatalf("%d %s", rec.Code, rec.Body.String())
		}
	}
	rec, _ := doJSON(t, h, "GET", "/api/cards", "")
	if strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatal("partial import", rec.Body.String())
	}
	for _, path := range []string{"/api/cards?category=bad", "/api/cards?faction_id=0", "/api/cards?faction_id=no"} {
		rec, _ = doJSON(t, h, "GET", path, "")
		if rec.Code != 400 {
			t.Fatal(path)
		}
	}
}

func TestCardsSharedJSONValidationFixtures(t *testing.T) {
	data, err := os.ReadFile("../../../testdata/card-validation.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name  string
		Card  json.RawMessage
		Valid bool
	}
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	h := newTestRouter(t)
	createFaction(t, h, "Tau")
	for _, c := range fixtures {
		t.Run(c.Name, func(t *testing.T) {
			rec, _ := doJSON(t, h, "POST", "/api/cards", string(c.Card))
			if (rec.Code == 201) != c.Valid {
				t.Fatalf("%d %s", rec.Code, rec.Body.String())
			}
			rec, _ = doJSON(t, h, "POST", "/api/cards/import", `{"cards":[`+string(c.Card)+`]}`)
			if (rec.Code == 201) != c.Valid {
				t.Fatalf("import: %d %s", rec.Code, rec.Body.String())
			}
		})
	}
}

func TestCardsEquivalentJSONIntegerForms(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	body := combatJSON(int64(f["id"].(float64)))
	for _, value := range []string{"0.0", "0e0", "1e0", "3.000"} {
		raw := strings.Replace(body, `"level":0`, `"level":`+value, 1)
		rec, _ := doJSON(t, h, "POST", "/api/cards", raw)
		if rec.Code != 201 {
			t.Fatalf("%s: %d %s", value, rec.Code, rec.Body.String())
		}
	}
}

func TestDeleteAllCardsRemovesEveryCardAndItsArtwork(t *testing.T) {
	h, _ := newTestRouterWithStore(t)
	f := createFaction(t, h, "Tau")
	fid := int64(f["id"].(float64))
	for i := 0; i < 3; i++ {
		if rec, out := doJSON(t, h, "POST", "/api/cards", combatJSON(fid)); rec.Code != 201 {
			t.Fatalf("create: %d %v", rec.Code, out)
		}
	}
	rec, out := doJSON(t, h, "DELETE", "/api/cards", "")
	if rec.Code != 200 || out["deleted"] != float64(3) {
		t.Fatalf("delete all: %d %v", rec.Code, out)
	}
	if rec, _ = doJSON(t, h, "GET", "/api/cards", ""); strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("cards left: %s", rec.Body.String())
	}
	if rec, out = doJSON(t, h, "DELETE", "/api/cards", ""); rec.Code != 200 || out["deleted"] != float64(0) {
		t.Fatalf("empty reset: %d %v", rec.Code, out)
	}
}

func TestCardLogoScaleIsSharedPerFactionAndCategory(t *testing.T) {
	h, _ := newTestRouterWithStore(t)
	f := createFaction(t, h, "Tau")
	base := fmt.Sprintf("/api/card-logo-scales/%.0f/combat", f["id"])
	if rec, out := doJSON(t, h, "PUT", base, `{"scale":1.5}`); rec.Code != 200 || out["scale"] != 1.5 {
		t.Fatalf("save: %d %v", rec.Code, out)
	}
	if rec, out := doJSON(t, h, "PUT", base, `{"scale":1.25}`); rec.Code != 200 || out["scale"] != 1.25 {
		t.Fatalf("replace: %d %v", rec.Code, out)
	}
	for _, bad := range []string{`{"scale":0}`, `{"scale":3.5}`, `{"scale":"big"}`, `{"scale":1,"x":2}`} {
		if rec, _ := doJSON(t, h, "PUT", base, bad); rec.Code != 400 {
			t.Errorf("%s accepted: %d", bad, rec.Code)
		}
	}
	if rec, _ := doJSON(t, h, "PUT", fmt.Sprintf("/api/card-logo-scales/%.0f/tactic", f["id"]), `{"scale":1}`); rec.Code != 400 {
		t.Errorf("unknown category accepted: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "PUT", "/api/card-logo-scales/999/combat", `{"scale":1}`); rec.Code != 400 {
		t.Errorf("unknown faction accepted: %d", rec.Code)
	}
	rec, _ := doJSON(t, h, "GET", "/api/card-logo-scales", "")
	if strings.Count(rec.Body.String(), "faction_id") != 1 || !strings.Contains(rec.Body.String(), `"scale":1.25`) {
		t.Fatalf("list: %s", rec.Body.String())
	}
}
