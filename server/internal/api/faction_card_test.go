package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"cardforge/internal/store"
)

func TestTheFactionCardFinalUsesItsOwnQualityWhereTheModelHasIt(t *testing.T) {
	all := map[string]string{"draft_quality": "low", "final_quality": "high", "faction_card_quality": "max"}
	board, combat := store.CardType{Name: "faction card"}, store.CardType{Name: "combat"}
	cases := []struct {
		mode  string
		ct    store.CardType
		model string
		want  string
	}{
		{"final", board, "gpt-image-2.5-flare", "max"},
		{"final", store.CardType{Name: "faction card back"}, "gpt-image-2.5-sunburst-2026-09-08", "max"},
		{"final", board, "gpt-image-2", "high"}, // no xhigh or max on this model
		{"draft", board, "gpt-image-2.5-flare", "low"},
		{"final", combat, "gpt-image-2.5-flare", "high"},
	}
	for _, c := range cases {
		if got := qualityFor(c.mode, all, c.ct, c.model); got != c.want {
			t.Errorf("%s %s %s: %s, want %s", c.mode, c.ct.Name, c.model, got, c.want)
		}
	}
	all["faction_card_quality"] = ""
	if got := qualityFor("final", all, board, "gpt-image-2.5-flare"); got != "high" {
		t.Errorf("unset: %s", got)
	}
}

func TestBothSidesOfTheFactionCardAreGeneratedTransparentFromTheTemplateAlone(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	var sent map[string]any
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/files" {
			w.Write([]byte(`{"id":"file-template"}`))
			return
		}
		sent = nil
		json.NewDecoder(r.Body).Decode(&sent)
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}]}`, base64.StdEncoding.EncodeToString(pngBytes))
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()
	_, f := doJSON(t, h, http.MethodPost, "/api/factions", `{"name":"Tau","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	for _, name := range []string{"faction card", "faction card back", "combat"} {
		_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": name, "description": "d", "constraints": "c"}, "a.png", pngBytes)
		id := int64(ct["id"].(float64))
		doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", id), "")
		_, g := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, int64(f["id"].(float64)), id))
		if done := pollGeneration(t, h, int64(g["id"].(float64))); done["status"] != "done" {
			t.Fatalf("%s: %v", name, done)
		}
		images, _ := sent["images"].([]any)
		want := map[string]any{"faction card": "transparent", "faction card back": "transparent", "combat": "auto"}[name] // combat: the Settings background
		if len(images) != 1 || sent["background"] != want {
			t.Fatalf("%s: images %v, background %v", name, images, sent["background"])
		}
	}
}

func TestARunsChosenQualityIsSentAndSetsItsMode(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	fid, ct := setupGenFixtures(t, h)
	var sent map[string]any
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sent = nil
		json.NewDecoder(r.Body).Decode(&sent)
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}]}`, base64.StdEncoding.EncodeToString(pngBytes))
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()
	for _, c := range []struct{ quality, model, sent, mode string }{
		{"max", "gpt-image-2.5-flare", "max", "final"},
		{"xhigh", "gpt-image-2", "high", "final"},
		{"low", "gpt-image-2.5-flare", "low", "draft"},
	} {
		_, g := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"quality":%q,"model":%q}`, fid, ct, c.quality, c.model))
		done := pollGeneration(t, h, int64(g["id"].(float64)))
		if sent["quality"] != c.sent || done["mode"] != c.mode || done["quality"] != c.sent {
			t.Fatalf("%s on %s: sent %v, run %v %v", c.quality, c.model, sent["quality"], done["mode"], done["quality"])
		}
	}
	if rec, _ := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"quality":"ultra"}`, fid, ct)); rec.Code != 400 {
		t.Fatalf("an unknown quality: %d", rec.Code)
	}
	_, preview := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/generate/preview?faction_id=%d&card_type_id=%d&model=gpt-image-2", fid, ct), "")
	if e, _ := preview["estimates"].(map[string]any); e == nil || e["max"].(map[string]any)["quality"] != "high" {
		t.Fatalf("estimates: %v", preview["estimates"])
	}
}
