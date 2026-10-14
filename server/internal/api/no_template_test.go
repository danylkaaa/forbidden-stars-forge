package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestACardTypeWithoutATemplateIsGeneratedFromItsPromptAlone(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	fid, ct := setupGenFixtures(t, h)
	var path string
	var sent map[string]any
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/files" {
			w.Write([]byte(`{"id":"file-1"}`))
			return
		}
		path = r.URL.Path
		sent = nil
		json.NewDecoder(r.Body).Decode(&sent)
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}]}`, base64.StdEncoding.EncodeToString(pngBytes))
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()
	// With its template, the type edits it.
	if rec, _ := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", ct), ""); rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	_, g := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ct))
	pollGeneration(t, h, int64(g["id"].(float64)))
	if path != "/v1/images/edits" {
		t.Fatalf("with a template: %s", path)
	}
	// Dropping the template removes the file and the OpenAI file, and the type is generated from text.
	rec, dropped := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d/template", ct), "")
	if rec.Code != 200 || dropped["no_template"] != true || dropped["template_path"] != "" || dropped["openai_file_id"] != "" {
		t.Fatalf("drop: %d %v", rec.Code, dropped)
	}
	_, g = doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ct))
	done := pollGeneration(t, h, int64(g["id"].(float64)))
	if done["status"] != "done" || path != "/v1/images/generations" {
		t.Fatalf("without a template: %v %s", done, path)
	}
	if _, has := sent["images"]; has || sent["size"] == "" {
		t.Fatalf("a text-only request has no images and a size: %v", sent)
	}
	if p, _ := sent["prompt"].(string); p == "" || !strings.Contains(p, "There is no template image") {
		t.Fatalf("prompt: %v", sent["prompt"])
	}
	// The type reports that it has no template, and the preview says it can generate.
	_, preview := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/generate/preview?faction_id=%d&card_type_id=%d", fid, ct), "")
	if preview["has_file"] != true {
		t.Fatalf("preview: %v", preview)
	}
}
