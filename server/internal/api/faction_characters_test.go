package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

func TestAFactionCardIsGeneratedWithTheFactionsCharacterAsAReference(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	var files atomic.Int32
	var sent map[string]any
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/files" {
			fmt.Fprintf(w, `{"id":"file-%d"}`, files.Add(1))
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

	_, f := doJSON(t, h, http.MethodPost, "/api/factions", `{"name":"Tau","description":"blue-grey plating","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "faction card", "description": "base", "constraints": "frame"}, "a.png", artworkPNG(t))
	ctID := int64(ct["id"].(float64))
	if rec, _ := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", ctID), ""); rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}

	// The upload is stored and synced to OpenAI straight away.
	body, contentType := multipartBody(t, nil, "character", "hero.png", artworkPNG(t))
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/factions/%d/character", fid), body)
	req.Header.Set("Content-Type", contentType)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var up map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &up)
	if rec.Code != 200 || up["synced"] != true {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}

	// On the front, the character is pasted onto the template: one image, the combined template, uploaded once.
	_, assembled := doJSON(t, h, http.MethodPost, "/api/generate/assemble", fmt.Sprintf(`{"card_type_id":%d,"faction_id":%d,"name":"Tau"}`, ctID, fid))
	if p, _ := assembled["prompt"].(string); !strings.Contains(p, "## Character on the template") {
		t.Fatalf("assembled prompt: %v", assembled["prompt"])
	}
	generate := func(cardType int64) []any {
		t.Helper()
		_, g := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, cardType))
		if done := pollGeneration(t, h, int64(g["id"].(float64))); done["status"] != "done" {
			t.Fatalf("generation: %v", done)
		}
		images, _ := sent["images"].([]any)
		return images
	}
	fileOf := func(images []any, i int) any { return images[i].(map[string]any)["file_id"] }
	if images := generate(ctID); len(images) != 1 || fileOf(images, 0) != "file-3" {
		t.Fatalf("images: %v", images)
	}
	if p, _ := sent["prompt"].(string); !strings.Contains(p, "## Character on the template") || strings.Contains(p, "## Character reference") {
		t.Fatalf("prompt: %v", sent["prompt"])
	}
	if sent["background"] != "opaque" {
		t.Fatalf("a faction card is opaque: %v", sent["background"])
	}
	if images := generate(ctID); fileOf(images, 0) != "file-3" {
		t.Fatalf("an unchanged combined template is reused: %v", images)
	}
	// Moving the character makes a new combined template.
	if rec, out := doJSON(t, h, http.MethodPut, fmt.Sprintf("/api/factions/%d/character/placement", fid), `{"x":0.3,"y":0.5,"scale":0.8,"box":{"x":0,"y":0,"w":0.5,"h":1}}`); rec.Code != 200 || out["placement"].(map[string]any)["x"] != 0.3 {
		t.Fatalf("placement: %d %v", rec.Code, out)
	}
	if images := generate(ctID); fileOf(images, 0) != "file-4" {
		t.Fatalf("after a move: %v", images)
	}

	// The back does not use the character.
	_, back := doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "faction card back", "description": "base", "constraints": "frame"}, "a.png", pngBytes)
	backID := int64(back["id"].(float64))
	doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", backID), "")
	if images := generate(backID); len(images) != 1 || fileOf(images, 0) != "file-5" || strings.Contains(sent["prompt"].(string), "## Character") {
		t.Fatalf("back request: %v %v", images, sent["prompt"])
	}
	if sent["background"] != "opaque" {
		t.Fatalf("the back is opaque too: %v", sent["background"])
	}

	// Another card type does not use the character.
	_, combat := doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "combat", "description": "warriors", "constraints": "zone"}, "a.png", pngBytes)
	combatID := int64(combat["id"].(float64))
	doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", combatID), "")
	if images := generate(combatID); len(images) != 1 || strings.Contains(sent["prompt"].(string), "## Character") {
		t.Fatalf("combat request: %v", sent)
	}

	// Removing the character removes it from the list.
	if rec, _ := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/factions/%d/character", fid), ""); rec.Code != 204 {
		t.Fatalf("delete: %d", rec.Code)
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/faction-characters", nil))
	if strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Fatalf("list: %s", rec.Body.String())
	}
}
