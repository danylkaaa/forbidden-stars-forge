package api

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cardforge/internal/store"
)

func newTestRouterWithStore(t *testing.T) (http.Handler, *store.BatchesStore, string) {
	t.Helper()
	dataDir := t.TempDir()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewRouter(db, nil, dataDir), store.NewBatchesStore(db), dataDir
}

func withFakeOpenAI(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	fake := httptest.NewServer(handler)
	t.Cleanup(fake.Close)
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	t.Cleanup(func() { openAIBaseURL = old })
	t.Setenv("OPENAI_API_KEY", "sk-env")
}

func createFactionAndUploadedCardType(t *testing.T, h http.Handler) (int64, int64) {
	t.Helper()
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"blue and gold","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "d", "constraints": "c"}, "a.png", pngBytes)
	ctid := int64(ct["id"].(float64))
	rec, out := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", ctid), "")
	if rec.Code != 200 {
		t.Fatalf("upload-to-openai: %d %v", rec.Code, out)
	}
	return fid, ctid
}

func TestBatchesPreview(t *testing.T) {
	h := newTestRouter(t)
	withFakeOpenAI(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"id":"file-abc"}`)) })
	fid, ctid := createFactionAndUploadedCardType(t, h)

	rec, out := doJSON(t, h, http.MethodPost, "/api/batches/preview",
		fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft"}`, fid, ctid))
	if rec.Code != 200 {
		t.Fatalf("preview: %d %v", rec.Code, out)
	}
	if out["count"].(float64) != 1 {
		t.Fatalf("count: %v", out["count"])
	}
	jsonlText, _ := out["jsonl"].(string)
	if !strings.Contains(jsonlText, "tau_empire__combat") {
		t.Fatalf("jsonl: %s", jsonlText)
	}
	if out["est_cost"].(float64) <= 0 {
		t.Fatalf("est_cost: %v", out["est_cost"])
	}
}

func TestBatchesPreviewMissingFileID(t *testing.T) {
	h := newTestRouter(t)
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	ctid := int64(ct["id"].(float64))

	rec, out := doJSON(t, h, http.MethodPost, "/api/batches/preview",
		fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft"}`, fid, ctid))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("preview: %d %v", rec.Code, out)
	}
}

func TestBatchesSubmitListGetCancel(t *testing.T) {
	h := newTestRouter(t)
	withFakeOpenAI(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v1/files":
			w.Write([]byte(`{"id":"file-abc"}`))
		case r.URL.Path == "/v1/batches" && r.Method == http.MethodPost:
			w.Write([]byte(`{"id":"batch_openai_1"}`))
		case strings.HasSuffix(r.URL.Path, "/cancel"):
			w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	})
	fid, ctid := createFactionAndUploadedCardType(t, h)

	rec, out := doJSON(t, h, http.MethodPost, "/api/batches",
		fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft"}`, fid, ctid))
	if rec.Code != http.StatusCreated {
		t.Fatalf("submit: %d %v", rec.Code, out)
	}
	if out["status"] != "submitted" || out["openai_batch_id"] != "batch_openai_1" {
		t.Fatalf("submitted batch: %v", out)
	}
	id := int64(out["id"].(float64))

	rec, _ = doJSON(t, h, http.MethodGet, "/api/batches", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != 200 || len(list) != 1 {
		t.Fatalf("list: %d len=%d", rec.Code, len(list))
	}

	rec, getOut := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/batches/%d", id), "")
	if rec.Code != 200 {
		t.Fatalf("get: %d %v", rec.Code, getOut)
	}
	items, _ := getOut["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("items: %v", getOut)
	}

	rec, cancelOut := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/batches/%d/cancel", id), "")
	if rec.Code != 200 || cancelOut["status"] != "cancelled" {
		t.Fatalf("cancel: %d %v", rec.Code, cancelOut)
	}
}

func TestCancelNeverSubmittedBatchConflicts(t *testing.T) {
	h, bs, _ := newTestRouterWithStore(t)
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	ctid := int64(ct["id"].(float64))
	b, err := bs.Create("draft", "gpt-image-2", "x", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	if err != nil {
		t.Fatal(err)
	}
	rec, out := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/batches/%d/cancel", b.ID), "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("cancel unsubmitted: %d %v", rec.Code, out)
	}
}

func TestDeleteGuardBlocksReferencedFactionAndCardType(t *testing.T) {
	h, bs, _ := newTestRouterWithStore(t)
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	ctid := int64(ct["id"].(float64))
	if _, err := bs.Create("draft", "gpt-image-2", "x", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}}); err != nil {
		t.Fatal(err)
	}

	rec, out := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/factions/%d", fid), "")
	if rec.Code != http.StatusConflict || out["error"] != "referenced by a batch — cannot delete" {
		t.Fatalf("faction delete guard: %d %v", rec.Code, out)
	}
	rec, out = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d", ctid), "")
	if rec.Code != http.StatusConflict || out["error"] != "referenced by a batch — cannot delete" {
		t.Fatalf("card type delete guard: %d %v", rec.Code, out)
	}
}

func TestBatchItemImageAndDownload(t *testing.T) {
	h, bs, dataDir := newTestRouterWithStore(t)
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	ctid := int64(ct["id"].(float64))
	b, err := bs.Create("draft", "gpt-image-2", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	if err != nil {
		t.Fatal(err)
	}
	imgDir := filepath.Join(dataDir, "batches", fmt.Sprintf("%d", b.ID))
	if err := os.MkdirAll(imgDir, 0o755); err != nil {
		t.Fatal(err)
	}
	relImg := filepath.Join("batches", fmt.Sprintf("%d", b.ID), "tau_empire__combat.png")
	if err := os.WriteFile(filepath.Join(dataDir, relImg), pngBytes, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := bs.MarkItemDone(b.ID, "tau_empire__combat", relImg, 10, 20, 0.05); err != nil {
		t.Fatal(err)
	}
	items, _ := bs.Items(b.ID)
	itemID := items[0].ID

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/batches/%d/items/%d/image", b.ID, itemID), nil)
	h.ServeHTTP(rec, req)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("item image: %d", rec.Code)
	}

	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/batches/%d/download", b.ID), nil)
	h.ServeHTTP(rec2, req2)
	if rec2.Code != 200 || rec2.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("download: %d", rec2.Code)
	}
	zr, err := zip.NewReader(bytes.NewReader(rec2.Body.Bytes()), int64(rec2.Body.Len()))
	if err != nil || len(zr.File) != 1 || zr.File[0].Name != "tau_empire__combat.png" {
		t.Fatalf("zip: %v %+v", err, zr)
	}
}

func TestSubmittedBatchCountsTotalImmediately(t *testing.T) {
	h := newTestRouter(t)
	withFakeOpenAI(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v1/files":
			w.Write([]byte(`{"id":"file-abc"}`))
		case r.URL.Path == "/v1/batches" && r.Method == http.MethodPost:
			w.Write([]byte(`{"id":"batch_openai_1"}`))
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	})
	fid, ctid := createFactionAndUploadedCardType(t, h)

	rec, out := doJSON(t, h, http.MethodPost, "/api/batches",
		fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft"}`, fid, ctid))
	if rec.Code != http.StatusCreated {
		t.Fatalf("submit: %d %v", rec.Code, out)
	}
	counts, _ := out["counts"].(map[string]any)
	if counts["total"].(float64) != 1 {
		t.Fatalf("counts.total should be 1 immediately, not waiting for a poll tick: %v", out["counts"])
	}
	if out["est_cost_usd"].(float64) <= 0 {
		t.Fatalf("est_cost_usd should be nonzero immediately: %v", out["est_cost_usd"])
	}
}

func TestFailedSubmitDoesNotOrphanBatchOrBlockDelete(t *testing.T) {
	h, _, dataDir := newTestRouterWithStore(t)
	// The fixture (createFactionAndUploadedCardType) uploads the card type's
	// template with purpose=vision before the test even starts — only the
	// batch's own upload (purpose=batch) should fail here.
	withFakeOpenAI(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/v1/files" {
			_ = r.ParseMultipartForm(1 << 20)
			if r.FormValue("purpose") == "vision" {
				w.Write([]byte(`{"id":"file-abc"}`))
				return
			}
		}
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte(`{"error":{"message":"upload rejected"}}`))
	})
	fid, ctid := createFactionAndUploadedCardType(t, h)

	rec, out := doJSON(t, h, http.MethodPost, "/api/batches",
		fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft"}`, fid, ctid))
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 on upload failure: %d %v", rec.Code, out)
	}

	rec, _ = doJSON(t, h, http.MethodGet, "/api/batches", "")
	var batches []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &batches)
	if len(batches) != 0 {
		t.Fatalf("failed submit should not leave a batch row behind: %v", batches)
	}

	rec, out = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/factions/%d", fid), "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("faction delete should not be blocked by an orphaned batch: %d %v", rec.Code, out)
	}

	// cleanupFailedSubmit should also remove the batch's on-disk directory
	// (not just requests.jsonl inside it), so nothing empty is left behind
	// under batches/.
	entries, err := os.ReadDir(filepath.Join(dataDir, "batches"))
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("expected no leftover batch directories after cleanup, got: %v", entries)
	}
}

func TestBatchesPreviewUsesModelOverride(t *testing.T) {
	h := newTestRouter(t)
	withFakeOpenAI(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"id":"file-abc"}`)) })
	fid, ctid := createFactionAndUploadedCardType(t, h)

	for model, want := range map[string]string{"": "gpt-image-2", "gpt-image-2.5-flare": "gpt-image-2.5-flare"} {
		rec, out := doJSON(t, h, http.MethodPost, "/api/batches/preview",
			fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft","model":%q}`, fid, ctid, model))
		if rec.Code != 200 {
			t.Fatalf("preview: %d %v", rec.Code, out)
		}
		if text, _ := out["jsonl"].(string); !strings.Contains(text, `"model":"`+want+`"`) {
			t.Fatalf("model %q: jsonl = %s", model, text)
		}
	}
}
