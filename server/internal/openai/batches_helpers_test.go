package openai

import (
	"encoding/json"
	"net/http"
	"testing"
)

func decodeJSONBody(t *testing.T, r *http.Request, out any) {
	t.Helper()
	if err := json.NewDecoder(r.Body).Decode(out); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}
