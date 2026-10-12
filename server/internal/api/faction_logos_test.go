package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func putLogo(t *testing.T, h http.Handler, id float64, name string, content []byte) *httptest.ResponseRecorder {
	t.Helper()
	body, ct := multipartBody(t, nil, "logo", name, content)
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/api/factions/%.0f/logo", id), body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestFactionLogoUploadReplaceServeDelete(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	if rec := putLogo(t, h, f["id"].(float64), "x.png", []byte("not an image")); rec.Code != 400 {
		t.Fatalf("garbage accepted: %d", rec.Code)
	}
	if rec := putLogo(t, h, 999, "x.png", artworkPNG(t)); rec.Code != 404 {
		t.Fatalf("unknown faction: %d", rec.Code)
	}
	logo := artworkPNG(t)
	putLogo(t, h, f["id"].(float64), "a.png", logo)
	if rec := putLogo(t, h, f["id"].(float64), "b.png", logo); rec.Code != 200 {
		t.Fatalf("replace: %d %s", rec.Code, rec.Body.String())
	}
	rec, _ := doJSON(t, h, "GET", "/api/faction-logos", "")
	var list []logoJSON
	json.Unmarshal(rec.Body.Bytes(), &list)
	if len(list) != 1 || list[0].FactionID != int64(f["id"].(float64)) {
		t.Fatalf("list: %s", rec.Body.String())
	}
	got := httptest.NewRecorder()
	h.ServeHTTP(got, httptest.NewRequest("GET", list[0].URL, nil))
	if got.Code != 200 || got.Body.Len() != len(logo) {
		t.Fatalf("serve: %d", got.Code)
	}
	if rec, _ := doJSON(t, h, "DELETE", fmt.Sprintf("/api/factions/%.0f/logo", f["id"]), ""); rec.Code != 204 {
		t.Fatalf("delete: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "DELETE", fmt.Sprintf("/api/factions/%.0f/logo", f["id"]), ""); rec.Code != 404 {
		t.Fatalf("double delete: %d", rec.Code)
	}
}
