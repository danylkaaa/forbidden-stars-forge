package openai

import (
	"context"
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
