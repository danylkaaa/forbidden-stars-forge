package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
)

func uploadSubtypeOverlay(t *testing.T, h http.Handler, id int64, name string) map[string]any {
	t.Helper()
	body, ct := multipartBody(t, nil, "overlay", name, pngBytes)
	req := httptest.NewRequest(http.MethodPost, fmt.Sprintf("/api/subtypes/%d/overlays", id), body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	if rec.Code != 200 && name != "bad.jpg" {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body.String())
	}
	out["_code"] = float64(rec.Code)
	return out
}

func overlayIDs(st map[string]any) []int64 {
	ids := []int64{}
	for _, o := range st["overlays"].([]any) {
		ids = append(ids, int64(o.(map[string]any)["id"].(float64)))
	}
	return ids
}

func TestSubtypesOverlaysCRUDAndOrder(t *testing.T) {
	h := newTestRouter(t)
	rec, st := doJSON(t, h, "POST", "/api/subtypes", `{"category":"combat","name":"Elite"}`)
	if rec.Code != 201 {
		t.Fatal(rec.Body.String())
	}
	id := int64(st["id"].(float64))
	if rec, _ := doJSON(t, h, "POST", "/api/subtypes", `{"category":"combat","name":"Elite"}`); rec.Code != 409 {
		t.Fatalf("duplicate: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "POST", "/api/subtypes", `{"category":"schema","name":"Elite"}`); rec.Code != 201 {
		t.Fatalf("same name other category: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "POST", "/api/subtypes", `{"category":"event","name":"X"}`); rec.Code != 400 {
		t.Fatalf("bad category: %d", rec.Code)
	}
	if out := uploadSubtypeOverlay(t, h, id, "bad.jpg"); out["_code"] != float64(400) {
		t.Fatalf("jpeg accepted: %v", out)
	}
	uploadSubtypeOverlay(t, h, id, "a.png")
	ids := overlayIDs(uploadSubtypeOverlay(t, h, id, "b.png"))
	if len(ids) != 2 {
		t.Fatalf("ids %v", ids)
	}
	rec, out := doJSON(t, h, "PUT", fmt.Sprintf("/api/subtypes/%d/overlays/order", id), fmt.Sprintf(`{"ids":[%d,%d]}`, ids[1], ids[0]))
	if rec.Code != 200 || overlayIDs(out)[0] != ids[1] {
		t.Fatalf("reorder: %d %v", rec.Code, out)
	}
	if rec, _ := doJSON(t, h, "PUT", fmt.Sprintf("/api/subtypes/%d/overlays/order", id), fmt.Sprintf(`{"ids":[%d]}`, ids[0])); rec.Code != 400 {
		t.Fatalf("partial order: %d", rec.Code)
	}
	req := httptest.NewRequest("GET", out["overlays"].([]any)[0].(map[string]any)["url"].(string), nil)
	got := httptest.NewRecorder()
	h.ServeHTTP(got, req)
	if got.Code != 200 || got.Body.Len() != len(pngBytes) {
		t.Fatalf("serve overlay: %d", got.Code)
	}
	rec, out = doJSON(t, h, "DELETE", fmt.Sprintf("/api/subtypes/%d/overlays/%d", id, ids[1]), "")
	if rec.Code != 200 || len(overlayIDs(out)) != 1 {
		t.Fatalf("delete overlay: %d %v", rec.Code, out)
	}
	rec, out = doJSON(t, h, "PUT", fmt.Sprintf("/api/subtypes/%d/layout", id), `{"layout":{"guns":{"x":12}}}`)
	if rec.Code != 200 || out["layout"].(map[string]any)["guns"].(map[string]any)["x"] != float64(12) {
		t.Fatalf("layout: %d %v", rec.Code, out)
	}
	if rec, _ := doJSON(t, h, "PUT", fmt.Sprintf("/api/subtypes/%d/layout", id), `{"layout":[1]}`); rec.Code != 400 {
		t.Fatalf("bad layout: %d", rec.Code)
	}
	if rec, out := doJSON(t, h, "PUT", fmt.Sprintf("/api/subtypes/%d", id), `{"name":"Veteran"}`); rec.Code != 200 || out["name"] != "Veteran" {
		t.Fatalf("rename: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "DELETE", fmt.Sprintf("/api/subtypes/%d", id), ""); rec.Code != 204 {
		t.Fatalf("delete: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "DELETE", fmt.Sprintf("/api/subtypes/%d", id), ""); rec.Code != 404 {
		t.Fatalf("double delete: %d", rec.Code)
	}
}
