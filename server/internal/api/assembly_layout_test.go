package api

import (
	"fmt"
	"testing"
)

func TestSharedAssemblyLayoutAPI(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	url := fmt.Sprintf("/api/assembly-layout?template_key=test-5&faction_id=%.0f&card_type_id=3", f["id"])
	rec, _ := doJSON(t, h, "PUT", url, `{"layout":{"upper_text":{"y":73}}}`)
	if rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	rec, a := doJSON(t, h, "GET", url, "")
	if rec.Code != 200 || a["layout"].(map[string]any)["upper_text"].(map[string]any)["y"] != float64(73) {
		t.Fatal(rec.Body.String())
	}
	for _, bad := range []string{"/api/assembly-layout", "/api/assembly-layout?template_key=x&faction_id=-1&card_type_id=3"} {
		rec, _ = doJSON(t, h, "GET", bad, "")
		if rec.Code != 400 {
			t.Fatal(rec.Code)
		}
	}
	rec, _ = doJSON(t, h, "PUT", url, `{"layout":[]}`)
	if rec.Code != 400 {
		t.Fatal(rec.Code)
	}
}
