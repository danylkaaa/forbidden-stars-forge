package openai

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := New("sk-test")
	c.BaseURL = srv.URL
	c.RetryBase = time.Millisecond
	return c
}

func TestListModels(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" || r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Errorf("bad request: %s %s auth=%q", r.Method, r.URL.Path, r.Header.Get("Authorization"))
		}
		w.Write([]byte(`{"data":[{"id":"gpt-image-2"},{"id":"gpt-4.1"}]}`))
	})
	n, err := c.ListModels(context.Background())
	if err != nil || n != 2 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}

func TestMissingKey(t *testing.T) {
	c := New("")
	_, err := c.ListModels(context.Background())
	if err == nil || !strings.Contains(err.Error(), "OpenAI API key not set") {
		t.Fatalf("err = %v", err)
	}
}

func TestAPIErrorSurfacesMessageAndRequestID(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_123")
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":{"message":"Incorrect API key provided"}}`))
	})
	_, err := c.ListModels(context.Background())
	if err == nil || !strings.Contains(err.Error(), "Incorrect API key provided") || !strings.Contains(err.Error(), "req_123") {
		t.Fatalf("err = %v", err)
	}
}

func TestRetriesOn5xxThenSucceeds(t *testing.T) {
	attempts := 0
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"error":{"message":"server error"}}`))
			return
		}
		w.Write([]byte(`{"data":[{"id":"m"}]}`))
	})
	n, err := c.ListModels(context.Background())
	if err != nil || n != 1 || attempts != 3 {
		t.Fatalf("n=%d attempts=%d err=%v", n, attempts, err)
	}
}

func TestGivesUpAfterThreeAttempts(t *testing.T) {
	attempts := 0
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":{"message":"rate limited"}}`))
	})
	_, err := c.ListModels(context.Background())
	if err == nil || attempts != 3 {
		t.Fatalf("attempts=%d err=%v", attempts, err)
	}
}

func TestNoRetryOn4xx(t *testing.T) {
	attempts := 0
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"bad request"}}`))
	})
	_, err := c.ListModels(context.Background())
	if err == nil || attempts != 1 {
		t.Fatalf("attempts=%d err=%v", attempts, err)
	}
}

func TestUploadFile(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files" || r.Method != http.MethodPost {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse multipart: %v", err)
		}
		if got := r.FormValue("purpose"); got != "vision" {
			t.Errorf("purpose = %q", got)
		}
		f, hdr, err := r.FormFile("file")
		if err != nil {
			t.Errorf("form file: %v", err)
		} else {
			defer f.Close()
			b, _ := io.ReadAll(f)
			if string(b) != "png-bytes" || hdr.Filename != "combat.png" {
				t.Errorf("file content=%q name=%q", b, hdr.Filename)
			}
		}
		w.Write([]byte(`{"id":"file-8a2f91cd"}`))
	})
	id, err := c.UploadFile(context.Background(), "combat.png", "vision", strings.NewReader("png-bytes"))
	if err != nil || id != "file-8a2f91cd" {
		t.Fatalf("id=%q err=%v", id, err)
	}
}

func TestEditImage(t *testing.T) {
	png := []byte("\x89PNG fake image bytes")
	b64 := base64.StdEncoding.EncodeToString(png)
	var gotBody map[string]any
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/edits" || r.Method != http.MethodPost {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("content type: %q", ct)
		}
		json.NewDecoder(r.Body).Decode(&gotBody)
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1200,"output_tokens":4800}}`, b64)
	})
	res, err := c.EditImage(context.Background(), ImageEditRequest{
		Model: "gpt-image-2", FileID: "file-abc", Prompt: "p", Size: "816x1104", Quality: "low", InputFidelity: "high",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(res.PNG, png) || res.InputTokens != 1200 || res.OutputTokens != 4800 {
		t.Fatalf("result: tokens=%d/%d pngLen=%d", res.InputTokens, res.OutputTokens, len(res.PNG))
	}
	img := gotBody["image"].([]any)[0].(map[string]any)
	if img["file_id"] != "file-abc" || gotBody["output_format"] != "png" || gotBody["n"] != float64(1) ||
		gotBody["quality"] != "low" || gotBody["size"] != "816x1104" || gotBody["input_fidelity"] != "high" {
		t.Fatalf("body: %v", gotBody)
	}
}

func TestEditImageEmptyData(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":[],"usage":{"input_tokens":0,"output_tokens":0}}`))
	})
	_, err := c.EditImage(context.Background(), ImageEditRequest{Model: "m", FileID: "f", Prompt: "p", Size: "s", Quality: "low", InputFidelity: "high"})
	if err == nil || !strings.Contains(err.Error(), "empty images response") {
		t.Fatalf("err = %v", err)
	}
}

func TestEditImageAPIError(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_77")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"image_generation_user_error: reference image rejected"}}`))
	})
	_, err := c.EditImage(context.Background(), ImageEditRequest{Model: "m", FileID: "f", Prompt: "p", Size: "s", Quality: "low", InputFidelity: "high"})
	if err == nil || !strings.Contains(err.Error(), "image_generation_user_error") || !strings.Contains(err.Error(), "req_77") {
		t.Fatalf("err = %v", err)
	}
}
