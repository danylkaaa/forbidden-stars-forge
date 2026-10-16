package api

import (
	"bytes"
	"cardforge/internal/store"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
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

func TestExtendArtworkPaintsMoreAroundItAndReplacesIt(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	_, c := doJSON(t, h, "POST", "/api/cards", combatJSON(int64(f["id"].(float64))))
	base := fmt.Sprintf("/api/cards/%.0f", c["id"])
	extend := func(body string) *httptest.ResponseRecorder {
		rec, _ := doJSON(t, h, "POST", base+"/artwork/extend", body)
		return rec
	}
	if rec := extend(`{"ratio":1}`); rec.Code != 400 {
		t.Fatalf("a card with no artwork = %d, want 400", rec.Code)
	}
	body, kind := multipartBody(t, nil, "image", "art.png", artworkPNG(t)) // 20 x 30
	req := httptest.NewRequest("POST", base+"/artwork", body)
	req.Header.Set("Content-Type", kind)
	h.ServeHTTP(httptest.NewRecorder(), req)
	var asked map[string]any
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(&asked)
		var sw, sh int
		fmt.Sscanf(asked["size"].(string), "%dx%d", &sw, &sh)
		img := image.NewNRGBA(image.Rect(0, 0, sw, sh))
		for i := range img.Pix {
			img.Pix[i] = 200
		}
		var pngBuf bytes.Buffer
		_ = png.Encode(&pngBuf, img)
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":100,"output_tokens":400}}`, base64.StdEncoding.EncodeToString(pngBuf.Bytes()))
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()
	rec := extend(`{"ratio":1}`)
	if rec.Code != 200 {
		t.Fatalf("extend = %d %s", rec.Code, rec.Body)
	}
	if asked["size"] != "1536x1536" || asked["quality"] != "high" || asked["mask"] != nil || !strings.Contains(fmt.Sprint(asked["prompt"]), "all directions") || !strings.Contains(fmt.Sprint(asked["prompt"]), "Fill every pixel") || asked["background"] != "opaque" {
		t.Fatalf("request: %v", asked)
	}
	var a map[string]any
	json.Unmarshal(rec.Body.Bytes(), &a)
	if a["image_key"] != "upload" || a["cost_usd"] == nil || a["transform"].(map[string]any)["scale"] != float64(1) {
		t.Fatalf("response: %v", a)
	}
	img := httptest.NewRecorder()
	h.ServeHTTP(img, httptest.NewRequest("GET", a["image_url"].(string), nil))
	cfg, _, err := image.DecodeConfig(img.Body)
	if err != nil || cfg.Width != 1536 || cfg.Height != 1536 {
		t.Fatalf("the artwork is now %dx%d (%v), want 1536x1536", cfg.Width, cfg.Height, err)
	}
}
