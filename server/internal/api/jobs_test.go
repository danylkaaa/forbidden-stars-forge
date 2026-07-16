package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// installFakeClaude writes a fake claude binary and points the settings
// key claude_binary at it via the API.
func installFakeClaude(t *testing.T, h http.Handler, script string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "fake-claude")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"openai_api_key":"","openai_model":"m","image_size":"816x1104","draft_quality":"low","final_quality":"high","input_fidelity":"high","claude_binary":%q,"price_table":"{}"}`, path)
	rec, _ := doJSON(t, h, http.MethodPut, "/api/settings", body)
	if rec.Code != 200 {
		t.Fatalf("settings put: %d", rec.Code)
	}
}

func pollJob(t *testing.T, h http.Handler, jobID string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		rec, out := doJSON(t, h, http.MethodGet, "/api/jobs/"+jobID, "")
		if rec.Code != 200 {
			t.Fatalf("get job: %d", rec.Code)
		}
		if out["status"] != "pending" {
			return out
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("job never finished")
	return nil
}

func TestGenerateDescriptionJob(t *testing.T) {
	h := newTestRouter(t)
	installFakeClaude(t, h, `echo "A vivid aesthetic."`)

	rec, out := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"Tau Empire","dlc":"Galaxy in Flames"}`)
	if rec.Code != http.StatusAccepted || out["status"] != "pending" {
		t.Fatalf("start: %d %v", rec.Code, out)
	}
	job := pollJob(t, h, out["job_id"].(string))
	if job["status"] != "done" || job["result"] != "A vivid aesthetic." {
		t.Fatalf("job: %v", job)
	}
}

func TestGenerateDescriptionFailure(t *testing.T) {
	h := newTestRouter(t)
	installFakeClaude(t, h, `echo "quota exceeded" >&2; exit 1`)

	_, out := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"X","dlc":"Darkest Dawn"}`)
	job := pollJob(t, h, out["job_id"].(string))
	if job["status"] != "failed" {
		t.Fatalf("job: %v", job)
	}
	if errStr, _ := job["error"].(string); errStr == "" {
		t.Fatalf("job error empty: %v", job)
	}
}

func TestGenerateDescriptionValidation(t *testing.T) {
	h := newTestRouter(t)
	rec, _ := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"","dlc":"Galaxy in Flames"}`)
	if rec.Code != 400 {
		t.Fatalf("empty name: %d", rec.Code)
	}
	rec, _ = doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"X","dlc":"Bad"}`)
	if rec.Code != 400 {
		t.Fatalf("bad dlc: %d", rec.Code)
	}
}

func TestJobNotFoundAndCancel(t *testing.T) {
	h := newTestRouter(t)
	rec, _ := doJSON(t, h, http.MethodGet, "/api/jobs/job-999", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown job: %d", rec.Code)
	}
	rec, _ = doJSON(t, h, http.MethodPost, "/api/jobs/job-999/cancel", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cancel unknown: %d", rec.Code)
	}

	installFakeClaude(t, h, `sleep 30`)
	_, out := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"X","dlc":"Darkest Dawn"}`)
	jobID := out["job_id"].(string)
	rec, _ = doJSON(t, h, http.MethodPost, "/api/jobs/"+jobID+"/cancel", "")
	if rec.Code != 200 {
		t.Fatalf("cancel: %d", rec.Code)
	}
	job := pollJob(t, h, jobID)
	if job["status"] != "failed" {
		t.Fatalf("cancelled job: %v", job)
	}
}

func TestRealTestClaudeEndpoint(t *testing.T) {
	h := newTestRouter(t)
	installFakeClaude(t, h, `echo "OK"`)
	rec, out := doJSON(t, h, http.MethodPost, "/api/settings/test-claude", "")
	if rec.Code != 200 || out["ok"] != true || out["message"] != "OK" {
		t.Fatalf("test-claude ok case: %d %v", rec.Code, out)
	}

	installFakeClaude(t, h, `echo "broken install" >&2; exit 1`)
	rec, out = doJSON(t, h, http.MethodPost, "/api/settings/test-claude", "")
	if rec.Code != 200 || out["ok"] != false {
		t.Fatalf("test-claude failure case: %d %v", rec.Code, out)
	}
}
