package api

import (
	"fmt"
	"testing"
)

func TestAssemblyTemplatesAPI(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau")
	rec, _ := doJSON(t, h, "PUT", "/api/assembly-templates", fmt.Sprintf(`{"faction_id":%.0f,"category":"combat","image_key":""}`, f["id"]))
	if rec.Code != 200 {
		t.Fatal(rec.Body.String())
	}
	for _, bad := range []string{
		fmt.Sprintf(`{"faction_id":%.0f,"category":"combat","image_key":"test-404"}`, f["id"]),
		`{"faction_id":999,"category":"combat","image_key":""}`,
		`{"faction_id":1,"category":"combat","extra":1}`,
	} {
		if rec, _ := doJSON(t, h, "PUT", "/api/assembly-templates", bad); rec.Code != 400 {
			t.Fatalf("%s: %d", bad, rec.Code)
		}
	}
	rec, _ = doJSON(t, h, "GET", "/api/assembly-templates", "")
	if rec.Code != 200 || rec.Body.String() != "[]\n" {
		t.Fatalf("%d %q", rec.Code, rec.Body.String())
	}
}
