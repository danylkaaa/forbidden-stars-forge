package api

import (
	"bytes"
	"cardforge/internal/store"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
)

func uploadBody(t *testing.T, fields map[string]string, file []byte) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	mw := multipart.NewWriter(&body)
	for k, v := range fields {
		_ = mw.WriteField(k, v)
	}
	if file != nil {
		part, _ := mw.CreateFormFile("image", "My Back.png")
		part.Write(file)
	}
	mw.Close()
	return &body, mw.FormDataContentType()
}

func TestUploadedImageBecomesATemplateSource(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := NewRouter(db, nil, dir)
	f := createFaction(t, h, "Tau")
	fid := int64(f["id"].(float64))
	ct, err := store.NewCardTypesStore(db).Create("card back", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	post := func(fields map[string]string, file []byte) *httptest.ResponseRecorder {
		body, ctype := uploadBody(t, fields, file)
		req := httptest.NewRequest(http.MethodPost, "/api/generations/upload", body)
		req.Header.Set("Content-Type", ctype)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	fields := map[string]string{"faction_id": strconv.FormatInt(fid, 10), "card_type_id": strconv.FormatInt(ct.ID, 10)}
	if rec := post(fields, []byte("not an image")); rec.Code != 400 {
		t.Fatalf("a non-image upload = %d, want 400", rec.Code)
	}
	if rec := post(map[string]string{"faction_id": "999", "card_type_id": fields["card_type_id"]}, artworkPNG(t)); rec.Code != 404 {
		t.Fatalf("an unknown faction = %d, want 404", rec.Code)
	}
	rec := post(fields, artworkPNG(t))
	if rec.Code != 201 {
		t.Fatalf("upload = %d %s", rec.Code, rec.Body)
	}
	var g struct {
		ID     int64  `json:"id"`
		Status string `json:"status"`
		Name   string `json:"name"`
		Prompt string `json:"prompt"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &g); err != nil || g.Status != "done" || g.Prompt != UploadedPrompt {
		t.Fatalf("unexpected %+v %v", g, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "generated", "gen-"+strconv.FormatInt(g.ID, 10)+".png")); err != nil {
		t.Fatal("the image file was not saved")
	}
	if _, err := store.NewCardsStore(db).AssemblySource("test-" + strconv.FormatInt(g.ID, 10)); err != nil {
		t.Fatalf("an uploaded image must be usable as a template: %v", err)
	}
	img := httptest.NewRecorder()
	h.ServeHTTP(img, httptest.NewRequest(http.MethodGet, "/api/generations/"+strconv.FormatInt(g.ID, 10)+"/image", nil))
	if img.Code != 200 {
		t.Fatalf("serving the uploaded image = %d", img.Code)
	}
}

func TestCardBackAcceptsCombatAndEventFrontsOnly(t *testing.T) {
	for back, fronts := range map[string]map[string]bool{"card back": {"combat": true, "events": true, "upgrade": false}, "combat back": {"combat": true, "events": false}} {
		for front, want := range fronts {
			if got := backMatchesFront(back, front); got != want {
				t.Errorf("backMatchesFront(%q, %q) = %v, want %v", back, front, got, want)
			}
		}
	}
}
