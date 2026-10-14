package api

import (
	"cardforge/internal/store"
	"encoding/binary"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

// A one-triangle binary STL.
func stlBytes() []byte {
	data := make([]byte, 84+50)
	binary.LittleEndian.PutUint32(data[80:], 1)
	return data
}

func TestFactionCardSaveAndAssets(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := NewRouter(db, nil, dir)
	f := createFaction(t, h, "Inquisition")
	fid := int64(f["id"].(float64))
	base := fmt.Sprintf("/api/faction-cards/%d", fid)

	if rec, _ := doJSON(t, h, "GET", "/api/faction-cards", ""); rec.Body.String() != "[]\n" {
		t.Fatalf("no card saved yet: %q", rec.Body.String())
	}
	rec, c := doJSON(t, h, "GET", base, "")
	if rec.Code != 200 || c["unit_color"] != "#8e3a8a" || c["front_image_key"] != "" {
		t.Fatalf("defaults: %d %v", rec.Code, c)
	}
	if rec, _ = doJSON(t, h, "GET", "/api/faction-cards/999", ""); rec.Code != 404 {
		t.Fatal("unknown faction accepted")
	}
	save := func(body string) int { r, _ := doJSON(t, h, "PUT", base, body); return r.Code }
	if save(`{"data":[],"front_image_key":"","back_image_key":"","unit_color":"#112233"}`) != 400 {
		t.Fatal("accepted non-object data")
	}
	if save(`{"data":{},"front_image_key":"","back_image_key":"","unit_color":"red"}`) != 400 {
		t.Fatal("accepted bad colour")
	}
	if save(`{"data":{"title":"INQUISITION"},"front_image_key":"test-5","back_image_key":"","unit_color":"#112233"}`) != 200 {
		t.Fatal("save failed")
	}
	if _, c = doJSON(t, h, "GET", base, ""); c["front_image_key"] != "test-5" || c["unit_color"] != "#112233" || c["data"].(map[string]any)["title"] != "INQUISITION" {
		t.Fatalf("round trip: %v", c)
	}

	if rec, _ := doJSON(t, h, "GET", "/api/faction-cards", ""); rec.Body.String() != fmt.Sprintf("[%d]\n", fid) {
		t.Fatalf("saved list: %q", rec.Body.String())
	}
	upload := func(path, field string, data []byte) int {
		body, kind := multipartBody(t, nil, field, "f.bin", data)
		req := httptest.NewRequest("PUT", path, body)
		req.Header.Set("Content-Type", kind)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if upload(base+"/assets/stl-trooper", "file", []byte("nonsense")) != 400 {
		t.Fatal("accepted a bad model")
	}
	if upload(base+"/assets/stl-trooper", "file", stlBytes()) != 200 || upload(base+"/assets/stl-trooper", "file", stlBytes()) != 200 {
		t.Fatal("model upload or replacement failed")
	}
	if upload(base+"/assets/objective-1", "file", []byte("nope")) != 400 {
		t.Fatal("accepted a bad image")
	}
	if upload(base+"/assets/objective-1", "file", artworkPNG(t)) != 200 {
		t.Fatal("image upload failed")
	}
	if upload(base+"/assets/Bad_Key", "file", artworkPNG(t)) != 400 {
		t.Fatal("accepted an invalid key")
	}
	files, _ := os.ReadDir(filepath.Join(dir, "faction-card-assets"))
	if len(files) != 2 {
		t.Fatalf("expected 2 files after replacement, got %d", len(files))
	}
	_, c = doJSON(t, h, "GET", base, "")
	if len(c["assets"].([]any)) != 2 {
		t.Fatalf("assets: %v", c["assets"])
	}
	if rec, _ = doJSON(t, h, "GET", base+"/assets/stl-trooper", ""); rec.Code != 200 || rec.Body.Len() != 134 {
		t.Fatal("model not served")
	}

	// Shared default icons use faction 0.
	if upload("/api/faction-cards/0/assets/gear", "file", artworkPNG(t)) != 200 {
		t.Fatal("default icon upload failed")
	}
	if rec, _ = doJSON(t, h, "GET", "/api/faction-card-defaults", ""); rec.Code != 200 || rec.Body.Len() < 20 {
		t.Fatal(rec.Body.String())
	}
	if rec, _ = doJSON(t, h, "DELETE", base+"/assets/stl-trooper", ""); rec.Code != 204 {
		t.Fatal("delete failed")
	}
	if rec, _ = doJSON(t, h, "DELETE", base+"/assets/stl-trooper", ""); rec.Code != 404 {
		t.Fatal("deleted twice")
	}
}

func TestFactionCardLayoutRoundTrip(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := NewRouter(db, nil, dir)
	if _, out := doJSON(t, h, "GET", "/api/faction-card-layout", ""); len(out["layout"].(map[string]any)) != 0 {
		t.Fatalf("expected an empty layout: %v", out)
	}
	if rec, _ := doJSON(t, h, "PUT", "/api/faction-card-layout", `{"layout":[]}`); rec.Code != 400 {
		t.Fatal("accepted a non-object layout")
	}
	if rec, _ := doJSON(t, h, "PUT", "/api/faction-card-layout", `{"layout":{"title":{"x":42}}}`); rec.Code != 200 {
		t.Fatal("save failed")
	}
	if _, out := doJSON(t, h, "GET", "/api/faction-card-layout", ""); out["layout"].(map[string]any)["title"].(map[string]any)["x"] != float64(42) {
		t.Fatalf("round trip: %v", out)
	}
}
