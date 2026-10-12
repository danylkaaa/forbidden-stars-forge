package api

import "testing"

func TestCardTypeLayoutsAPI(t *testing.T) {
	h := newTestRouter(t)
	if rec, _ := doJSON(t, h, "PUT", "/api/card-type-layouts/combat", `{"layout":{"upper_text":{"x":12}}}`); rec.Code != 200 {
		t.Fatalf("save: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "PUT", "/api/card-type-layouts/event", `{"layout":{}}`); rec.Code != 400 {
		t.Fatalf("bad category: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "PUT", "/api/card-type-layouts/combat", `{"layout":[]}`); rec.Code != 400 {
		t.Fatalf("bad layout: %d", rec.Code)
	}
	rec, _ := doJSON(t, h, "GET", "/api/card-type-layouts", "")
	if rec.Code != 200 || rec.Body.String() != `[{"category":"combat","layout":{"upper_text":{"x":12}}}]`+"\n" {
		t.Fatalf("list: %d %s", rec.Code, rec.Body.String())
	}
}
