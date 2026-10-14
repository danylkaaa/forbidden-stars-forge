package api

import (
	"cardforge/internal/store"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestReferenceCardsAreUploadedServedAndDeleted(t *testing.T) {
	dir := t.TempDir()
	db, err := store.Open(filepath.Join(dir, "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	h := NewRouter(db, nil, dir)
	post := func(category string, file []byte) *httptest.ResponseRecorder {
		body, ctype := uploadBody(t, map[string]string{"name": "Sample"}, file)
		req := httptest.NewRequest(http.MethodPost, "/api/reference-cards/"+category, body)
		req.Header.Set("Content-Type", ctype)
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec
	}
	if rec := post("base", artworkPNG(t)); rec.Code != 400 {
		t.Fatalf("unknown category = %d, want 400", rec.Code)
	}
	if rec := post("combat", []byte("nope")); rec.Code != 400 {
		t.Fatalf("a non-image = %d, want 400", rec.Code)
	}
	badSide, ctype := uploadBody(t, map[string]string{"side": "top"}, artworkPNG(t))
	req := httptest.NewRequest(http.MethodPost, "/api/reference-cards/combat", badSide)
	req.Header.Set("Content-Type", ctype)
	bad := httptest.NewRecorder()
	h.ServeHTTP(bad, req)
	if bad.Code != 400 {
		t.Fatalf("unknown side = %d, want 400", bad.Code)
	}
	if rec := post("faction", artworkPNG(t)); rec.Code != 201 {
		t.Fatalf("faction card reference = %d", rec.Code)
	}
	h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodDelete, "/api/reference-cards/1", nil))
	rec := post("combat", artworkPNG(t))
	if rec.Code != 201 {
		t.Fatalf("upload = %d %s", rec.Code, rec.Body)
	}
	var card struct {
		ID   int64  `json:"id"`
		Name string `json:"name"`
		URL  string `json:"url"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &card); err != nil || card.Name != "Sample" || card.URL == "" {
		t.Fatalf("unexpected %+v %v", card, err)
	}
	list := httptest.NewRecorder()
	h.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/api/reference-cards", nil))
	var cards []map[string]any
	if json.Unmarshal(list.Body.Bytes(), &cards); len(cards) != 1 || cards[0]["category"] != "combat" {
		t.Fatalf("unexpected list %s", list.Body)
	}
	img := httptest.NewRecorder()
	h.ServeHTTP(img, httptest.NewRequest(http.MethodGet, "/api/reference-cards/1/image", nil))
	if img.Code != 200 {
		t.Fatalf("serving = %d", img.Code)
	}
	files, _ := os.ReadDir(filepath.Join(dir, "reference-cards"))
	if len(files) != 1 {
		t.Fatalf("expected one stored file, got %d", len(files))
	}
	del := httptest.NewRecorder()
	h.ServeHTTP(del, httptest.NewRequest(http.MethodDelete, "/api/reference-cards/1", nil))
	if del.Code != 204 {
		t.Fatalf("delete = %d", del.Code)
	}
	if files, _ := os.ReadDir(filepath.Join(dir, "reference-cards")); len(files) != 0 {
		t.Fatal("the file should be removed with the card")
	}
	again := httptest.NewRecorder()
	h.ServeHTTP(again, httptest.NewRequest(http.MethodDelete, "/api/reference-cards/1", nil))
	if again.Code != 404 {
		t.Fatalf("second delete = %d, want 404", again.Code)
	}
}
