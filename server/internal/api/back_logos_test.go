package api

import (
	"bytes"
	"cardforge/internal/store"
	"encoding/json"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestBackLogoUploadScaleReplaceAndClear(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := NewRouter(db, nil, dir)
	f := createFaction(t, h, "Tau")
	fid := int64(f["id"].(float64))
	ct, err := store.NewCardTypesStore(db).Create("combat back", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO generations(id,faction_id,card_type_id,prompt,status,image_path) VALUES(5,?,?,'p','done','generated/back.png')`, fid, ct.ID); err != nil {
		t.Fatal(err)
	}
	choice := fmt.Sprintf(`{"faction_id":%d,"category":"combat","side":"back","image_key":"test-5"}`, fid)
	base := fmt.Sprintf("/api/assembly-templates/%d/combat/logo", fid)
	upload := func(data []byte) int {
		body, kind := multipartBody(t, nil, "logo", "logo.png", data)
		req := httptest.NewRequest("PUT", base, body)
		req.Header.Set("Content-Type", kind)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	logo := artworkPNG(t)
	if upload(logo) != 400 {
		t.Fatal("accepted logo without a back")
	}
	if rec, _ := doJSON(t, h, "PUT", "/api/assembly-templates", choice); rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	if upload([]byte("invalid")) != 400 {
		t.Fatal("accepted invalid image")
	}
	if upload(logo) != 204 || upload(logo) != 204 {
		t.Fatal("upload or replacement failed")
	}
	files, _ := os.ReadDir(filepath.Join(dir, "back-logos"))
	if len(files) != 1 {
		t.Fatal("replacement leaked a file")
	}
	resized := fmt.Sprintf(`{"faction_id":%d,"category":"combat","side":"back","image_key":"test-5","logo_scale":0.75}`, fid)
	if rec, _ := doJSON(t, h, "PUT", "/api/assembly-templates", resized); rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	// Choosing another image must preserve the uploaded logo and saved scale.
	doJSON(t, h, "PUT", "/api/assembly-templates", choice)
	rec, _ := doJSON(t, h, "GET", "/api/assembly-templates", "")
	var templates []store.AssemblyTemplate
	if err := json.Unmarshal(rec.Body.Bytes(), &templates); err != nil {
		t.Fatal(err)
	}
	if len(templates) != 1 || templates[0].LogoScale != 0.75 || templates[0].LogoURL == "" {
		t.Fatalf("lost logo settings: %s", rec.Body.String())
	}
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest("GET", templates[0].LogoURL, nil))
	if rec.Code != 200 || !bytes.Equal(rec.Body.Bytes(), logo) {
		t.Fatal("logo bytes differ")
	}
	for _, scale := range []float64{-1, 0.01, 1.01} {
		bad := fmt.Sprintf(`{"faction_id":%d,"category":"combat","side":"back","image_key":"test-5","logo_scale":%g}`, fid, scale)
		if rec, _ := doJSON(t, h, "PUT", "/api/assembly-templates", bad); rec.Code != 400 {
			t.Fatalf("accepted scale %g", scale)
		}
	}
	if rec, _ := doJSON(t, h, "DELETE", base, ""); rec.Code != 204 {
		t.Fatal("delete failed")
	}
	if rec, _ := doJSON(t, h, "GET", base, ""); rec.Code != 404 {
		t.Fatal("deleted logo still served")
	}
	if upload(logo) != 204 {
		t.Fatal("re-upload failed")
	}
	clear := fmt.Sprintf(`{"faction_id":%d,"category":"combat","side":"back","image_key":""}`, fid)
	doJSON(t, h, "PUT", "/api/assembly-templates", clear)
	files, _ = os.ReadDir(filepath.Join(dir, "back-logos"))
	if len(files) != 0 {
		t.Fatal("clearing back leaked a file")
	}
}
