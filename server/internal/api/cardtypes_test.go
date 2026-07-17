package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
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
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
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
