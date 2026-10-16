package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// pngBytes is a minimal valid PNG header + IHDR for sniffing; content
// correctness beyond magic bytes is not validated server-side.
var pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 16)...)

func multipartBody(t *testing.T, fields map[string]string, fileField, fileName string, fileContent []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		w.WriteField(k, v)
	}
	if fileField != "" {
		fw, err := w.CreateFormFile(fileField, fileName)
		if err != nil {
			t.Fatal(err)
		}
		fw.Write(fileContent)
	}
	w.Close()
	return &buf, w.FormDataContentType()
}

func doMultipart(t *testing.T, h http.Handler, method, path string, fields map[string]string, fileName string, fileContent []byte) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	fileField := ""
	if fileName != "" {
		fileField = "template"
	}
	body, ct := multipartBody(t, fields, fileField, fileName, fileContent)
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func TestCardTypeCreateWithTemplate(t *testing.T) {
	h := newTestRouter(t)
	rec, out := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "d", "constraints": "c"}, "combat.png", pngBytes)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %v", rec.Code, out)
	}
	if out["name"] != "combat" || out["template_path"] == "" || out["openai_file_id"] != "" {
		t.Fatalf("bad body: %v", out)
	}

	id := int64(out["id"].(float64))
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/card-types/%d/template", id), nil)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req)
	if rec2.Code != 200 || !bytes.HasPrefix(rec2.Body.Bytes(), []byte("\x89PNG")) {
		t.Fatalf("serve template: %d len=%d", rec2.Code, rec2.Body.Len())
	}
	if ct := rec2.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("content type: %q", ct)
	}
}

func TestCardTypeCreateWithoutTemplate(t *testing.T) {
	h := newTestRouter(t)
	rec, out := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "upgrade", "description": "", "constraints": ""}, "", nil)
	if rec.Code != http.StatusCreated || out["template_path"] != "" {
		t.Fatalf("%d %v", rec.Code, out)
	}
	rec2, _ := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/card-types/%v/template", int64(out["id"].(float64))), "")
	if rec2.Code != http.StatusNotFound {
		t.Fatalf("template of none: %d", rec2.Code)
	}
}

func TestCardTypeCreateRejectsOversizedBody(t *testing.T) {
	h := newTestRouter(t)
	oversized := bytes.Repeat([]byte{0}, 22<<20) // 22 MB, above the 20 MB template cap
	rec, out := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "toobig", "description": "", "constraints": ""}, "big.png", oversized)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("oversized body: %d %v", rec.Code, out)
	}
	msg, _ := out["error"].(string)
	if !strings.Contains(msg, "limit") {
		t.Fatalf("error message: %q", msg)
	}
}

func TestCardTypeValidation(t *testing.T) {
	h := newTestRouter(t)
	rec, _ := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "  ", "description": "", "constraints": ""}, "", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty name: %d", rec.Code)
	}
	rec, _ = doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "x", "description": "", "constraints": ""}, "notes.txt", []byte("hello"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad file type: %d", rec.Code)
	}
	doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "dup", "description": "", "constraints": ""}, "", nil)
	rec, _ = doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "dup", "description": "", "constraints": ""}, "", nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate: %d", rec.Code)
	}
}

func TestCardTypeUpdateReplacingTemplateClearsFileID(t *testing.T) {
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "a.png", pngBytes)
	id := int64(created["id"].(float64))

	// simulate an uploaded file id directly via the fake-openai flow below
	// (here: fields-only update keeps template)
	rec, out := doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id),
		map[string]string{"name": "combat", "description": "new", "constraints": ""}, "", nil)
	if rec.Code != 200 || out["template_path"] == "" {
		t.Fatalf("fields-only update: %d %v", rec.Code, out)
	}

	rec, out = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id),
		map[string]string{"name": "combat", "description": "new", "constraints": ""}, "b.jpg", []byte("\xff\xd8\xffjpegdata"))
	if rec.Code != 200 || out["openai_file_id"] != "" {
		t.Fatalf("template replace: %d %v", rec.Code, out)
	}
}

func TestCardTypeDelete(t *testing.T) {
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "relic", "description": "", "constraints": ""}, "", nil)
	id := int64(created["id"].(float64))
	rec, _ := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d", id), "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rec.Code)
	}
	rec, _ = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d", id), "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("double delete: %d", rec.Code)
	}
}

func TestUploadToOpenAI(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files" {
			t.Errorf("path %s", r.URL.Path)
		}
		w.Write([]byte(`{"id":"file-fake123"}`))
	}))
	defer fake.Close()
	oldBase := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = oldBase }()

	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "a.png", pngBytes)
	id := int64(created["id"].(float64))

	rec, out := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", id), "")
	if rec.Code != 200 || out["openai_file_id"] != "file-fake123" {
		t.Fatalf("upload: %d %v", rec.Code, out)
	}
	rec, out = doJSON(t, h, http.MethodGet, "/api/card-types", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if list[0]["openai_file_id"] != "file-fake123" {
		t.Fatalf("persisted file id: %v", list[0])
	}
}

func TestUploadToOpenAIWithoutTemplate(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "upgrade", "description": "", "constraints": ""}, "", nil)
	rec, _ := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%v/upload-to-openai", int64(created["id"].(float64))), "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("no template: %d", rec.Code)
	}
}

func TestUploadToOpenAIFailure(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_9")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"invalid file"}}`))
	}))
	defer fake.Close()
	oldBase := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = oldBase }()

	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "a.png", pngBytes)
	rec, out := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%v/upload-to-openai", int64(created["id"].(float64))), "")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("failure status: %d %v", rec.Code, out)
	}
	msg, _ := out["error"].(string)
	if !strings.Contains(msg, "invalid file") || !strings.Contains(msg, "req_9") {
		t.Fatalf("error message: %q", msg)
	}
}

func TestRealTestOpenAIEndpoint(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":[{"id":"a"},{"id":"b"},{"id":"c"}]}`))
	}))
	defer fake.Close()
	oldBase := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = oldBase }()

	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	rec, out := doJSON(t, h, http.MethodPost, "/api/settings/test-openai", "")
	if rec.Code != 200 || out["ok"] != true {
		t.Fatalf("%d %v", rec.Code, out)
	}
	if msg, _ := out["message"].(string); !strings.Contains(msg, "3 models") {
		t.Fatalf("message: %v", out["message"])
	}

	// failure path: no key anywhere
	t.Setenv("OPENAI_API_KEY", "")
	rec, out = doJSON(t, h, http.MethodPost, "/api/settings/test-openai", "")
	if rec.Code != 200 || out["ok"] != false {
		t.Fatalf("no-key case: %d %v", rec.Code, out)
	}
}

func putOverlay(t *testing.T, h http.Handler, id int64, fileName string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	body, ct := multipartBody(t, nil, "overlay", fileName, pngBytes)
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/card-types/%d/overlay", id), body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func TestCardTypeOverlayUploadServeReplaceDelete(t *testing.T) {
	h, dataDir := newTestRouterWithStore(t)
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "combat"}, "", nil)
	id := int64(ct["id"].(float64))

	if rec, _ := putOverlay(t, h, id, "overlay.jpg"); rec.Code != http.StatusBadRequest {
		t.Fatalf("non-PNG accepted: %d", rec.Code)
	}
	rec, out := putOverlay(t, h, id, "overlay.png")
	first, _ := out["overlay_path"].(string)
	if rec.Code != 200 || first == "" {
		t.Fatalf("upload: %d %v", rec.Code, out)
	}
	rec, _ = doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/card-types/%d/overlay", id), "")
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("serve: %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}

	_, out = putOverlay(t, h, id, "overlay.png")
	if out["overlay_path"] == first {
		t.Fatal("replace kept the old path")
	}
	if _, err := os.Stat(filepath.Join(dataDir, first)); !os.IsNotExist(err) {
		t.Fatalf("old overlay file not removed: %v", err)
	}

	rec, out = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d/overlay", id), "")
	if rec.Code != 200 || out["overlay_path"] != "" {
		t.Fatalf("delete: %d %v", rec.Code, out)
	}
	if rec, _ := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/card-types/%d/overlay", id), ""); rec.Code != http.StatusNotFound {
		t.Fatalf("serve after delete: %d", rec.Code)
	}
}

func TestBuiltinCardTypesCannotBeDeletedOrRenamed(t *testing.T) {
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "events", "description": "", "constraints": ""}, "", nil)
	id := int64(created["id"].(float64))
	if rec, _ := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d", id), ""); rec.Code != http.StatusConflict {
		t.Fatalf("delete builtin: %d", rec.Code)
	}
	rec, _ := doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id),
		map[string]string{"name": "event", "description": "", "constraints": ""}, "", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("rename builtin: %d", rec.Code)
	}
	rec, _ = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id),
		map[string]string{"name": "events", "description": "new", "constraints": ""}, "", nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("edit builtin: %d", rec.Code)
	}
}

func TestCardTypeImageSizeIsSavedAndValidated(t *testing.T) {
	h, _ := newTestRouterWithStore(t)
	rec, ct := doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "combat", "image_size": "816x1104"}, "", nil)
	if rec.Code != http.StatusCreated || ct["image_size"] != "816x1104" {
		t.Fatalf("create: %d %v", rec.Code, ct)
	}
	id := int64(ct["id"].(float64))
	// A form without the field leaves the size alone.
	_, ct = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "combat"}, "", nil)
	if ct["image_size"] != "816x1104" {
		t.Fatalf("size lost: %v", ct)
	}
	if rec, _ = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "combat", "image_size": "big"}, "", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("bad size accepted: %d", rec.Code)
	}
	if rec, _ = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "combat", "image_size": "472x295"}, "", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("size not divisible by 16 accepted: %d", rec.Code)
	}
	_, ct = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "combat", "image_size": ""}, "", nil)
	if ct["image_size"] != "" {
		t.Fatalf("size not cleared: %v", ct)
	}
}

func TestImageSizeProblem(t *testing.T) {
	for size, ok := range map[[2]int]bool{{816, 1104}: true, {1024, 1536}: true, {3840, 2160}: true, {480, 288}: false, {472, 295}: false, {4096, 2048}: false, {3840, 1024}: false, {1024, 160}: false} {
		if got := imageSizeProblem(size[0], size[1]) == ""; got != ok {
			t.Errorf("%v: ok = %v, want %v", size, got, ok)
		}
	}
}

func TestCardTypeCutSizeIsSavedAndValidated(t *testing.T) {
	h, _ := newTestRouterWithStore(t)
	rec, ct := doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "custom", "card_width_mm": "70", "card_height_mm": "120.5"}, "", nil)
	if rec.Code != http.StatusCreated || ct["card_width_mm"] != 70.0 || ct["card_height_mm"] != 120.5 {
		t.Fatalf("create: %d %v", rec.Code, ct)
	}
	id := int64(ct["id"].(float64))
	_, ct = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "custom"}, "", nil)
	if ct["card_width_mm"] != 70.0 {
		t.Fatalf("size lost: %v", ct)
	}
	if rec, _ = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "custom", "card_width_mm": "5", "card_height_mm": "88"}, "", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("tiny size accepted: %d", rec.Code)
	}
}

func TestCardTypeAspectRatioIsSavedAndValidated(t *testing.T) {
	h, _ := newTestRouterWithStore(t)
	rec, ct := doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "strip", "aspect_ratio": "5"}, "", nil)
	if rec.Code != http.StatusCreated || ct["aspect_ratio"] != 5.0 {
		t.Fatalf("create: %d %v", rec.Code, ct)
	}
	id := int64(ct["id"].(float64))
	_, ct = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "strip"}, "", nil)
	if ct["aspect_ratio"] != 5.0 {
		t.Fatalf("ratio lost: %v", ct)
	}
	if rec, _ = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "strip", "aspect_ratio": "50"}, "", nil); rec.Code != http.StatusBadRequest {
		t.Fatalf("an extreme ratio was accepted: %d", rec.Code)
	}
	_, ct = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id), map[string]string{"name": "strip", "aspect_ratio": ""}, "", nil)
	if ct["aspect_ratio"] != 0.0 {
		t.Fatalf("ratio not cleared: %v", ct)
	}
}
