package api

import (
	"bytes"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNebulaPicturesAPI(t *testing.T) {
	h := newTestRouter(t)
	var img bytes.Buffer
	_ = png.Encode(&img, image.NewRGBA(image.Rect(0, 0, 2, 2)))
	upload := func(category string, data []byte) int {
		var body bytes.Buffer
		mw := multipart.NewWriter(&body)
		part, _ := mw.CreateFormFile("image", "n.png")
		part.Write(data)
		mw.Close()
		req := httptest.NewRequest("PUT", "/api/nebula-pictures/"+category, &body)
		req.Header.Set("Content-Type", mw.FormDataContentType())
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		return rec.Code
	}
	if code := upload("base", img.Bytes()); code != 400 {
		t.Fatalf("base upload = %d, want 400", code)
	}
	if code := upload("combat", []byte("not an image")); code != 400 {
		t.Fatalf("bad image = %d, want 400", code)
	}
	if code := upload("combat", img.Bytes()); code != http.StatusNoContent {
		t.Fatalf("upload = %d, want 204", code)
	}
	rec, _ := doJSON(t, h, "GET", "/api/nebula-pictures", "")
	if rec.Code != 200 || !bytes.Contains(rec.Body.Bytes(), []byte(`"combat"`)) || bytes.Contains(rec.Body.Bytes(), []byte(`"schema"`)) {
		t.Fatalf("list = %d %s", rec.Code, rec.Body.String())
	}
	if rec, _ := doJSON(t, h, "GET", "/api/nebula-pictures/combat", ""); rec.Code != 200 {
		t.Fatalf("get = %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "DELETE", "/api/nebula-pictures/combat", ""); rec.Code != http.StatusNoContent {
		t.Fatalf("delete = %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "GET", "/api/nebula-pictures/combat", ""); rec.Code != 404 {
		t.Fatalf("get after delete = %d", rec.Code)
	}
}
