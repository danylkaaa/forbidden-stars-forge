package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func createFaction(t *testing.T, h http.Handler, name string) map[string]any {
	t.Helper()
	body := fmt.Sprintf(`{"name":%q,"description":"desc","dlc":"Galaxy in Flames","source":"manual"}`, name)
	rec, out := doJSON(t, h, http.MethodPost, "/api/factions", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %v", rec.Code, out)
	}
	return out
}

func TestFactionCRUD(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau Empire")
	id := int64(f["id"].(float64))

	rec, _ := doJSON(t, h, http.MethodGet, "/api/factions", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != 200 || len(list) != 1 {
		t.Fatalf("list: %d len=%d", rec.Code, len(list))
	}

	rec, out := doJSON(t, h, http.MethodPut, fmt.Sprintf("/api/factions/%d", id),
		`{"name":"Tau Empire","description":"new desc","dlc":"Galaxy in Flames","source":"claude"}`)
	if rec.Code != 200 || out["description"] != "new desc" {
		t.Fatalf("update: %d %v", rec.Code, out)
	}

	rec, _ = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/factions/%d", id), "")
	if rec.Code != http.StatusNoContent || rec.Body.Len() != 0 {
		t.Fatalf("delete: %d body=%q", rec.Code, rec.Body.String())
	}
	rec, _ = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/factions/%d", id), "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("double delete: %d", rec.Code)
	}
}

func TestFactionValidation(t *testing.T) {
	h := newTestRouter(t)
	cases := []struct {
		body string
		want int
	}{
		{`{"name":"  ","description":"","dlc":"Galaxy in Flames","source":"manual"}`, 400},
		{`{"name":"X","description":"","dlc":"Not A DLC","source":"manual"}`, 400},
		{`{"name":"X","description":"","dlc":"Galaxy in Flames","source":"rollback"}`, 400},
		{`not json`, 400},
	}
	for _, c := range cases {
		rec, _ := doJSON(t, h, http.MethodPost, "/api/factions", c.body)
		if rec.Code != c.want {
			t.Fatalf("body %s: %d, want %d", c.body, rec.Code, c.want)
		}
	}
	createFaction(t, h, "Dup")
	rec, _ := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Dup","description":"","dlc":"Galaxy in Flames","source":"manual"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate: %d, want 409", rec.Code)
	}
}

func TestRevisionsAndRestoreEndpoints(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Eldar")
	id := int64(f["id"].(float64))
	doJSON(t, h, http.MethodPut, fmt.Sprintf("/api/factions/%d", id),
		`{"name":"Eldar","description":"v2","dlc":"Galaxy in Flames","source":"manual"}`)

	rec, _ := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/factions/%d/revisions", id), "")
	var revs []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &revs)
	if rec.Code != 200 || len(revs) != 2 || revs[0]["description"] != "v2" {
		t.Fatalf("revisions: %d %v", rec.Code, revs)
	}

	oldest := int64(revs[1]["id"].(float64))
	rec, out := doJSON(t, h, http.MethodPost,
		fmt.Sprintf("/api/factions/%d/revisions/%d/restore", id, oldest), "")
	if rec.Code != 200 || out["description"] != "desc" {
		t.Fatalf("restore: %d %v", rec.Code, out)
	}

	rec, _ = doJSON(t, h, http.MethodPost,
		fmt.Sprintf("/api/factions/%d/revisions/99999/restore", id), "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("restore missing rev: %d", rec.Code)
	}
}

func TestFactionColorAndTextureSavedRevisionedAndRestored(t *testing.T) {
	h := newTestRouter(t)
	rec, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Sisters","dlc":"Symphony of War","primary_color":" deep black ","texture":"polished ceramite","description":"gothic","source":"manual"}`)
	if rec.Code != http.StatusCreated || f["primary_color"] != "deep black" || f["texture"] != "polished ceramite" {
		t.Fatalf("create: %d %v", rec.Code, f)
	}
	id := int64(f["id"].(float64))
	_, f = doJSON(t, h, http.MethodPut, fmt.Sprintf("/api/factions/%d", id),
		`{"name":"Sisters","dlc":"Symphony of War","primary_color":"crimson","texture":"polished ceramite","description":"gothic","source":"manual"}`)
	if f["primary_color"] != "crimson" {
		t.Fatalf("update: %v", f)
	}
	rec, _ = doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/factions/%d/revisions", id), "")
	var revs []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &revs)
	if len(revs) != 2 || revs[1]["primary_color"] != "deep black" {
		t.Fatalf("revisions: %v", revs)
	}
	rec, f = doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/factions/%d/revisions/%d/restore", id, int64(revs[1]["id"].(float64))), "")
	if rec.Code != 200 || f["primary_color"] != "deep black" || f["texture"] != "polished ceramite" {
		t.Fatalf("restore: %d %v", rec.Code, f)
	}
}
