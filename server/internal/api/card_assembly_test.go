package api

import (
	"bytes"
	"cardforge/internal/store"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func artworkPNG(t *testing.T) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, 20, 30))
	img.Set(2, 2, color.RGBA{255, 0, 0, 255})
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}
func TestUploadArtworkAndSaveTransform(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	_, c := doJSON(t, h, "POST", "/api/cards", combatJSON(int64(f["id"].(float64))))
	base := fmt.Sprintf("/api/cards/%.0f", c["id"])
	rec, a := doJSON(t, h, "GET", base+"/assembly", "")
	if rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	if a["transform"].(map[string]any)["scale"] != float64(1) {
		t.Fatal(a)
	}
	data := artworkPNG(t)
	body, kind := multipartBody(t, nil, "image", "art.png", data)
	req := httptest.NewRequest("POST", base+"/artwork", body)
	req.Header.Set("Content-Type", kind)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	json.Unmarshal(rec.Body.Bytes(), &a)
	if a["image_key"] != "upload" || a["image_url"] == "" {
		t.Fatal(a)
	}
	url := a["image_url"].(string)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", url, nil))
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), data) {
		t.Fatal("uploaded bytes differ")
	}
	cfg := `{"image_key":"upload","overlay_id":"none","transform":{"scale":2,"x":15,"y":-10},"layout":{"name":{"x":30}}}`
	rec, a = doJSON(t, h, "PUT", base+"/assembly", cfg)
	if rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	rec, a = doJSON(t, h, "GET", base+"/assembly", "")
	if a["transform"].(map[string]any)["x"] != float64(15) {
		t.Fatal(a)
	}
	for _, bad := range []string{`{"image_key":"test-999","overlay_id":"none","transform":{"scale":1,"x":0,"y":0},"layout":{}}`, `{"image_key":"upload","overlay_id":"none","transform":{"scale":9,"x":0,"y":0},"layout":{}}`} {
		rec, _ = doJSON(t, h, "PUT", base+"/assembly", bad)
		if rec.Code != 400 {
			t.Fatal(rec.Code)
		}
	}
	body, kind = multipartBody(t, nil, "image", "fake.png", []byte("not an image"))
	req = httptest.NewRequest("POST", base+"/artwork", body)
	req.Header.Set("Content-Type", kind)
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != 400 {
		t.Fatal("accepted invalid image")
	}
}
func TestGeneratedArtworkSavedAsOwnedCopy(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "db.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := NewRouter(db, nil, dir)
	f := createFaction(t, h, "Tau")
	fid := int64(f["id"].(float64))
	_, c := doJSON(t, h, "POST", "/api/cards", combatJSON(fid))
	ct, err := store.NewCardTypesStore(db).Create("Battle", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	gens := store.NewGenerationsStore(db)
	g, err := gens.Create(fid, ct.ID, "draft", "gpt-image-1", "low", "-qa", "QA")
	if err != nil {
		t.Fatal(err)
	}
	data := artworkPNG(t)
	os.WriteFile(filepath.Join(dir, "original.png"), data, 0600)
	if err = gens.MarkDone(g.ID, "original.png", 0, 0, 0, 0); err != nil {
		t.Fatal(err)
	}
	base := fmt.Sprintf("/api/cards/%.0f", c["id"])
	cfg := fmt.Sprintf(`{"image_key":"test-%d","overlay_id":"none","transform":{"scale":1.2,"x":5,"y":6},"layout":{}}`, g.ID)
	rec, a := doJSON(t, h, "PUT", base+"/assembly", cfg)
	if rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	os.Remove(filepath.Join(dir, "original.png"))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", a["image_url"].(string), nil))
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), data) {
		t.Fatal("card artwork depended on original generation file")
	}
}

func TestCardLogoScalePersistsAndIsPreservedByLegacyClients(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	_, c := doJSON(t, h, "POST", "/api/cards", combatJSON(int64(f["id"].(float64))))
	base := fmt.Sprintf("/api/cards/%.0f/assembly", c["id"])
	config := `{"image_key":"","overlay_id":"auto","transform":{"scale":1,"x":0,"y":0},"layout":{},"logo_scale":1.75}`
	rec, a := doJSON(t, h, "PUT", base, config)
	if rec.Code != 200 || a["logo_scale"] != 1.75 {
		t.Fatalf("save: %s", rec.Body.String())
	}
	rec, a = doJSON(t, h, "GET", base, "")
	if rec.Code != 200 || a["logo_scale"] != 1.75 {
		t.Fatalf("get: %s", rec.Body.String())
	}
	legacy := `{"image_key":"","overlay_id":"auto","transform":{"scale":1,"x":0,"y":0},"layout":{}}`
	rec, a = doJSON(t, h, "PUT", base, legacy)
	if rec.Code != 200 || a["logo_scale"] != 1.75 {
		t.Fatalf("legacy: %s", rec.Body.String())
	}
	for _, scale := range []float64{0, .09, 3.01} {
		rec, _ = doJSON(t, h, "PUT", base, fmt.Sprintf(`{"image_key":"","overlay_id":"auto","transform":{"scale":1,"x":0,"y":0},"layout":{},"logo_scale":%g}`, scale))
		if rec.Code != 400 {
			t.Fatalf("accepted logo scale %g: %s", scale, rec.Body.String())
		}
	}
}
