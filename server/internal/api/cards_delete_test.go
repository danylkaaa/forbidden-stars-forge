package api

import (
	"fmt"
	"testing"
)

func TestDeleteManyCardsIsAllOrNothing(t *testing.T) {
	h := newTestRouter(t)
	f := int64(createFaction(t, h, "Tau")["id"].(float64))
	ids := []int64{}
	for i := 0; i < 3; i++ {
		_, c := doJSON(t, h, "POST", "/api/cards", combatJSON(f))
		ids = append(ids, int64(c["id"].(float64)))
	}
	if rec, _ := doJSON(t, h, "POST", "/api/cards/delete", fmt.Sprintf(`{"ids":[%d,999]}`, ids[0])); rec.Code != 404 {
		t.Fatalf("unknown id: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "GET", fmt.Sprintf("/api/cards/%d", ids[0]), ""); rec.Code != 200 {
		t.Fatalf("rolled back card missing: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "POST", "/api/cards/delete", `{"ids":[]}`); rec.Code != 400 {
		t.Fatalf("empty: %d", rec.Code)
	}
	if rec, _ := doJSON(t, h, "POST", "/api/cards/delete", fmt.Sprintf(`{"ids":[%d,%d]}`, ids[0], ids[1])); rec.Code != 200 {
		t.Fatalf("delete: %d", rec.Code)
	}
	for i, want := range []int{404, 404, 200} {
		if rec, _ := doJSON(t, h, "GET", fmt.Sprintf("/api/cards/%d", ids[i]), ""); rec.Code != want {
			t.Fatalf("card %d: %d", i, rec.Code)
		}
	}
}
