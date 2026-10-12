package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// setupGenFixtures creates a faction and a card type WITH an openai file id
// via the API, returning their ids.
func setupGenFixtures(t *testing.T, h http.Handler) (int64, int64) {
	t.Helper()
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau","description":"blue-grey plating","dlc":"Galaxy in Flames","source":"manual"}`)
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "warriors", "constraints": "fill crimson zone"}, "a.png", pngBytes)
	ctID := int64(ct["id"].(float64))

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"id":"file-gen-test"}`))
	}))
	t.Cleanup(fake.Close)
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	t.Cleanup(func() { openAIBaseURL = old })
	rec, _ := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", ctID), "")
	if rec.Code != 200 {
		t.Fatalf("fixture upload: %d", rec.Code)
	}
	return int64(f["id"].(float64)), ctID
}

func pollGeneration(t *testing.T, h http.Handler, id int64) map[string]any {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		rec, out := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/generations/%d", id), "")
		if rec.Code != 200 {
			t.Fatalf("poll: %d", rec.Code)
		}
		if out["status"] != "pending" {
			return out
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("generation never finished")
	return nil
}

func TestGenerateHappyPath(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)

	png := []byte("\x89PNG generated image")
	b64 := base64.StdEncoding.EncodeToString(png)
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/edits" {
			t.Errorf("path: %s", r.URL.Path)
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if body["quality"] != "low" { // draft mode → draft_quality default 'low'
			t.Errorf("quality: %v", body["quality"])
		}
		img := body["images"].([]any)[0].(map[string]any)
		if img["file_id"] != "file-gen-test" {
			t.Errorf("file_id: %v", img["file_id"])
		}
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1200,"output_tokens":4800}}`, b64)
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	rec, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ctid))
	if rec.Code != http.StatusCreated || out["status"] != "pending" {
		t.Fatalf("start: %d %v", rec.Code, out)
	}
	if p, _ := out["prompt"].(string); !strings.Contains(p, "fill crimson zone") || !strings.Contains(p, "blue-grey plating") {
		t.Fatalf("assembled prompt: %q", p)
	}

	id := int64(out["id"].(float64))
	done := pollGeneration(t, h, id)
	if done["status"] != "done" {
		t.Fatalf("final: %v", done)
	}
	// cost: 1200/1M*8 + 4800/1M*30 = 0.1536 (seeded gpt-image-2 rates)
	if c := done["cost_usd"].(float64); c < 0.1535 || c > 0.1537 {
		t.Fatalf("cost: %v", c)
	}
	if done["duration_ms"].(float64) < 0 || done["image_path"] == "" {
		t.Fatalf("meta: %v", done)
	}

	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/generations/%d/image", id), nil))
	if rec2.Code != 200 || !strings.HasPrefix(rec2.Body.String(), "\x89PNG") {
		t.Fatalf("image: %d", rec2.Code)
	}
}

func TestGeneratePromptOverride(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)
	var sentPrompt string
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		sentPrompt, _ = body["prompt"].(string)
		b64 := base64.StdEncoding.EncodeToString([]byte("png"))
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1,"output_tokens":1}}`, b64)
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	_, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"final","prompt_override":"my custom prompt"}`, fid, ctid))
	if out["prompt"] != "my custom prompt" {
		t.Fatalf("stored prompt: %v", out["prompt"])
	}
	pollGeneration(t, h, int64(out["id"].(float64)))
	if sentPrompt != "my custom prompt" {
		t.Fatalf("sent prompt: %q", sentPrompt)
	}
}

func TestGenerateFailurePath(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_f")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"image_generation_user_error"}}`))
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	_, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ctid))
	id := int64(out["id"].(float64))
	failed := pollGeneration(t, h, id)
	if failed["status"] != "failed" || !strings.Contains(failed["error"].(string), "image_generation_user_error") {
		t.Fatalf("failed: %v", failed)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/generations/%d/image", id), nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("image of failed: %d", rec.Code)
	}
}

func TestGenerateValidation(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)

	rec, _ := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"turbo"}`, fid, ctid))
	if rec.Code != 400 {
		t.Fatalf("bad mode: %d", rec.Code)
	}
	rec, _ = doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":999,"card_type_id":%d,"mode":"draft"}`, ctid))
	if rec.Code != 404 {
		t.Fatalf("missing faction: %d", rec.Code)
	}

	// card type without file id → 409
	_, ct2 := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "nofile", "description": "", "constraints": ""}, "", nil)
	rec, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%v,"mode":"draft"}`, fid, int64(ct2["id"].(float64))))
	if rec.Code != http.StatusConflict || !strings.Contains(out["error"].(string), "no OpenAI file") {
		t.Fatalf("no file: %d %v", rec.Code, out)
	}
}

func TestGeneratePreview(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)

	rec, out := doJSON(t, h, http.MethodGet,
		fmt.Sprintf("/api/generate/preview?faction_id=%d&card_type_id=%d", fid, ctid), "")
	if rec.Code != 200 {
		t.Fatalf("preview: %d %v", rec.Code, out)
	}
	if p, _ := out["prompt"].(string); !strings.Contains(p, "fill crimson zone") {
		t.Fatalf("prompt: %v", out["prompt"])
	}
	// No history yet: default input mix + measured output tokens at the
	// seeded gpt-image-2 rates (draft=low ≈ $0.0154, final=high ≈ $0.0478).
	draft, final := out["est_draft_usd"].(float64), out["est_final_usd"].(float64)
	if out["has_file"] != true || draft < 0.014 || draft > 0.017 || final < 0.045 || final > 0.051 {
		t.Fatalf("preview meta: %v", out)
	}
	// A per-run model override is priced as that model.
	_, unpriced := doJSON(t, h, http.MethodGet,
		fmt.Sprintf("/api/generate/preview?faction_id=%d&card_type_id=%d&model=not-a-priced-model", fid, ctid), "")
	if unpriced["est_draft_usd"].(float64) != 0 {
		t.Fatalf("unpriced model estimate: %v", unpriced)
	}

	rec, _ = doJSON(t, h, http.MethodGet, "/api/generate/preview?faction_id=999&card_type_id=1", "")
	if rec.Code != 404 {
		t.Fatalf("missing faction preview: %d", rec.Code)
	}
}

func TestGenerationsList(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)
	b64 := base64.StdEncoding.EncodeToString([]byte("png"))
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1,"output_tokens":1}}`, b64)
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	_, g1 := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ctid))
	pollGeneration(t, h, int64(g1["id"].(float64)))
	rec, _ := doJSON(t, h, http.MethodGet, "/api/generations", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != 200 || len(list) != 1 || list[0]["status"] != "done" {
		t.Fatalf("list: %d %v", rec.Code, list)
	}
	// saved file exists under dataDir (indirect check: image endpoint 200)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/generations/%v/image", int64(g1["id"].(float64))), nil))
	if rec2.Code != 200 {
		t.Fatalf("image after list: %d", rec2.Code)
	}
	_ = os.PathSeparator
	_ = filepath.Join
}

func TestGenerateUsesModelOverride(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)

	b64 := base64.StdEncoding.EncodeToString([]byte("\x89PNG"))
	var gotModel any
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		gotModel = body["model"]
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1,"output_tokens":1}}`, b64)
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	rec, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft","model":"gpt-image-2.5-flare"}`, fid, ctid))
	if rec.Code != http.StatusCreated || out["model"] != "gpt-image-2.5-flare" {
		t.Fatalf("start: %d %v", rec.Code, out)
	}
	if done := pollGeneration(t, h, int64(out["id"].(float64))); done["status"] != "done" {
		t.Fatalf("final: %v", done)
	}
	if gotModel != "gpt-image-2.5-flare" {
		t.Fatalf("openai got model %v", gotModel)
	}
}

func TestAssembleUsesUnsavedFactionFields(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	_, ctid := setupGenFixtures(t, h)
	rec, out := doJSON(t, h, http.MethodPost, "/api/generate/assemble",
		fmt.Sprintf(`{"card_type_id":%d,"name":"Tau","primary_color":" ochre ","texture":"ceramic","description":"draft style"}`, ctid))
	if rec.Code != 200 || out["has_file"] != true {
		t.Fatalf("assemble: %d %v", rec.Code, out)
	}
	p, _ := out["prompt"].(string)
	for _, want := range []string{"## Constraints\nfill crimson zone", "## Primary color\nochre", "## Texture\nceramic", "## Faction style\ndraft style"} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt missing %q:\n%s", want, p)
		}
	}
	if rec, _ := doJSON(t, h, http.MethodPost, "/api/generate/assemble", `{"card_type_id":999}`); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown card type: %d", rec.Code)
	}
}

func TestFavoriteEndpoints(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)
	_, g := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ctid))
	if g["name"] != "1-tau-combat-low" || g["quality"] != "low" {
		t.Fatalf("generation: %v", g)
	}
	id := int64(g["id"].(float64))
	if rec, out := doJSON(t, h, http.MethodPut, fmt.Sprintf("/api/generations/%d/favorite", id), `{"favorite":true}`); rec.Code != 200 || out["favorite"] != true {
		t.Fatalf("favorite: %d %v", rec.Code, out)
	}
	if _, got := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/generations/%d", id), ""); got["favorite"] != true {
		t.Fatalf("not saved: %v", got)
	}
	if rec, _ := doJSON(t, h, http.MethodPut, "/api/generations/999/favorite", `{"favorite":true}`); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, http.MethodPut, "/api/batches/1/items/1/favorite", `{"favorite":true}`); rec.Code != http.StatusNotFound {
		t.Fatalf("unknown item: %d", rec.Code)
	}
}

func TestAssembleUsesUnsavedCardTypeText(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-test")
	h := newTestRouter(t)
	_, ctid := setupGenFixtures(t, h)
	_, out := doJSON(t, h, http.MethodPost, "/api/generate/assemble",
		fmt.Sprintf(`{"card_type_id":%d,"name":"Tau","card_type_constraints":"draft constraints"}`, ctid))
	p, _ := out["prompt"].(string)
	if !strings.Contains(p, "## Constraints\ndraft constraints") || !strings.Contains(p, "## Description\nwarriors") {
		t.Fatalf("prompt:\n%s", p)
	}
}
