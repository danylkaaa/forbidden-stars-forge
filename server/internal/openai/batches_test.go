package openai

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestCreateBatch(t *testing.T) {
	var gotBody map[string]any
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/batches" || r.Method != http.MethodPost {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		decodeJSONBody(t, r, &gotBody)
		w.Write([]byte(`{"id":"batch_abc"}`))
	})
	id, err := c.CreateBatch(context.Background(), "file-123")
	if err != nil || id != "batch_abc" {
		t.Fatalf("id=%q err=%v", id, err)
	}
	if gotBody["input_file_id"] != "file-123" || gotBody["endpoint"] != "/v1/images/edits" || gotBody["completion_window"] != "24h" {
		t.Fatalf("body: %+v", gotBody)
	}
}

func TestCreateBatchMissingIDIsAnError(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{}`))
	})
	_, err := c.CreateBatch(context.Background(), "file-123")
	if err == nil || strings.Contains(err.Error(), "<nil>") {
		t.Fatalf("err = %v", err)
	}
	if !strings.Contains(err.Error(), "missing id") {
		t.Fatalf("err = %v", err)
	}
}

func TestGetBatch(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/batches/batch_abc" || r.Method != http.MethodGet {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{"status":"completed","request_counts":{"completed":3,"failed":1,"total":4},"output_file_id":"file-out","error_file_id":"file-err"}`))
	})
	status, err := c.GetBatch(context.Background(), "batch_abc")
	if err != nil {
		t.Fatal(err)
	}
	if status.Status != "completed" || status.RequestCounts.Completed != 3 || status.RequestCounts.Failed != 1 ||
		status.RequestCounts.Total != 4 || status.OutputFileID != "file-out" || status.ErrorFileID != "file-err" {
		t.Fatalf("status: %+v", status)
	}
}

func TestCancelBatch(t *testing.T) {
	called := false
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/v1/batches/batch_abc/cancel" || r.Method != http.MethodPost {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{}`))
	})
	if err := c.CancelBatch(context.Background(), "batch_abc"); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("cancel endpoint not called")
	}
}

func TestFileContentReturnsRawBytes(t *testing.T) {
	raw := "{\"custom_id\":\"a\"}\n{\"custom_id\":\"b\"}\n"
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files/file-out/content" {
			t.Errorf("path %s", r.URL.Path)
		}
		w.Write([]byte(raw))
	})
	data, err := c.FileContent(context.Background(), "file-out")
	if err != nil || string(data) != raw {
		t.Fatalf("data=%q err=%v", data, err)
	}
}
