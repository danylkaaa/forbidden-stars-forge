package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
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

func TestGenerateDescriptionChatSendsHistoryToClaude(t *testing.T) {
	h := newTestRouter(t)
	// The fake echoes its prompt (-p <prompt>) back so we can inspect it.
	installFakeClaude(t, h, `printf '%s' "$2"`)

	rec, out := doJSON(t, h, http.MethodPost, "/api/factions/generate-description", `{
		"name":"Sisters","dlc":"Symphony of War","current_description":"Black and crimson.",
		"messages":[
			{"role":"user","content":"Add candles."},
			{"role":"assistant","content":"Black, crimson, candles."},
			{"role":"user","content":"More gold."}
		]}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: %d %v", rec.Code, out)
	}
	job := pollJob(t, h, out["job_id"].(string))
	got, _ := job["result"].(string)
	for _, want := range []string{"Black and crimson.", "Add candles.", "Black, crimson, candles.", "More gold."} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt missing %q:\n%s", want, got)
		}
	}
}

func TestGenerateDescriptionChatValidation(t *testing.T) {
	h := newTestRouter(t)
	for name, msgs := range map[string]string{
		"ends with assistant": `[{"role":"user","content":"a"},{"role":"assistant","content":"b"}]`,
		"bad role order":      `[{"role":"assistant","content":"a"}]`,
	} {
		rec, _ := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
			`{"name":"X","dlc":"Darkest Dawn","messages":`+msgs+`}`)
		if rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d", name, rec.Code)
		}
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

func TestCardTypeAssistSendsFieldsAndHistory(t *testing.T) {
	h := newTestRouter(t)
	installFakeClaude(t, h, `printf '%s' "$2"`)

	rec, out := doJSON(t, h, http.MethodPost, "/api/card-types/assist", `{
		"field":"constraints","name":"combat","description":"Frame.","constraints":"Keep window clear.",
		"messages":[{"role":"user","content":"Use green as mask."}]}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: %d %v", rec.Code, out)
	}
	got, _ := pollJob(t, h, out["job_id"].(string))["result"].(string)
	for _, want := range []string{"editing the card type's constraints", "Keep window clear.", "Use green as mask."} {
		if !strings.Contains(got, want) {
			t.Fatalf("prompt missing %q:\n%s", want, got)
		}
	}

	for name, body := range map[string]string{
		"bad field":   `{"field":"name","messages":[{"role":"user","content":"x"}]}`,
		"no messages": `{"field":"description","messages":[]}`,
	} {
		if rec, _ := doJSON(t, h, http.MethodPost, "/api/card-types/assist", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status %d", name, rec.Code)
		}
	}
}

func TestImagePromptAssist(t *testing.T) {
	h := newTestRouter(t)
	installFakeClaude(t, h, `printf '%s' "$2"`)

	rec, out := doJSON(t, h, http.MethodPost, "/api/generate/prompt-assist",
		`{"current_prompt":"## Faction\nTau","messages":[{"role":"user","content":"Add fog."}]}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("start: %d %v", rec.Code, out)
	}
	got, _ := pollJob(t, h, out["job_id"].(string))["result"].(string)
	if !strings.Contains(got, "## Faction\nTau") || !strings.Contains(got, "Add fog.") {
		t.Fatalf("prompt:\n%s", got)
	}
	if rec, _ := doJSON(t, h, http.MethodPost, "/api/generate/prompt-assist",
		`{"current_prompt":"","messages":[{"role":"user","content":"x"}]}`); rec.Code != http.StatusBadRequest {
		t.Fatalf("empty prompt: %d", rec.Code)
	}
}
