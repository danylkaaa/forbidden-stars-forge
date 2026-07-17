package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"cardforge/internal/store"
)

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewRouter(db, nil, t.TempDir())
}

func doJSON(t *testing.T, h http.Handler, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func TestMaskKey(t *testing.T) {
	cases := []struct {
		name string
		key  string
		want string
	}{
		{"empty", "", ""},
		{"short_abcd", "abcd", "sk-…****"},
		{"short_sk", "sk", "sk-…****"},
		{"normal", "sk-proj-9f0a12de34bc", "sk-…34bc"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := maskKey(c.key); got != c.want {
				t.Fatalf("maskKey(%q) = %q, want %q", c.key, got, c.want)
			}
		})
	}
}

func TestGetSettingsDefaults(t *testing.T) {
	rec, out := doJSON(t, newTestRouter(t), http.MethodGet, "/api/settings", "")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	if out["openai_model"] != "gpt-image-2" || out["openai_api_key_masked"] != "" {
		t.Fatalf("unexpected: %v", out)
	}
	if out["openai_api_key_from_env"] != false {
		t.Fatal("from_env should be false")
	}
}

func TestPutSetsAndMasksKey(t *testing.T) {
	r := newTestRouter(t)
	body := `{"openai_api_key":"sk-proj-9f0a12de34bc","openai_model":"gpt-image-2","image_size":"816x1104","draft_quality":"medium","final_quality":"high","input_fidelity":"high","claude_binary":"claude","price_table":"{}"}`
	rec, out := doJSON(t, r, http.MethodPut, "/api/settings", body)
	if rec.Code != 200 {
		t.Fatalf("status %d: %v", rec.Code, out)
	}
	if out["openai_api_key_masked"] != "sk-…34bc" {
		t.Fatalf("masked = %v", out["openai_api_key_masked"])
	}
	if out["draft_quality"] != "medium" {
		t.Fatalf("draft_quality = %v", out["draft_quality"])
	}

	// empty key on next PUT leaves the stored key unchanged
	body2 := strings.Replace(body, `"sk-proj-9f0a12de34bc"`, `""`, 1)
	_, out2 := doJSON(t, r, http.MethodPut, "/api/settings", body2)
	if out2["openai_api_key_masked"] != "sk-…34bc" {
		t.Fatalf("key was clobbered: %v", out2["openai_api_key_masked"])
	}
}

func TestPutRejectsInvalidQuality(t *testing.T) {
	body := `{"openai_api_key":"","openai_model":"m","image_size":"816x1104","draft_quality":"ultra","final_quality":"high","input_fidelity":"high","claude_binary":"claude","price_table":"{}"}`
	rec, _ := doJSON(t, newTestRouter(t), http.MethodPut, "/api/settings", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", rec.Code)
	}
}

func TestEnvVarOverridesKey(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env-key-ffff")
	_, out := doJSON(t, newTestRouter(t), http.MethodGet, "/api/settings", "")
	if out["openai_api_key_masked"] != "sk-…ffff" {
		t.Fatalf("masked = %v", out["openai_api_key_masked"])
	}
	if out["openai_api_key_from_env"] != true {
		t.Fatal("from_env should be true")
	}
}
