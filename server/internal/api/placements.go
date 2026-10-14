package api

import (
	"cardforge/internal/store"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func (h *CardsHandler) NebulaPlacements(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.NebulaPlacements()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, list)
}

func (h *CardsHandler) SaveNebulaPlacement(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, 400, "invalid faction id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 512)
	var in store.NebulaPlacement
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "invalid placement JSON")
		return
	}
	in.FactionID, in.Category = id, chi.URLParam(r, "category")
	if _, err := h.Factions.Get(id); errors.Is(err, store.ErrNotFound) {
		writeError(w, 400, "faction not found")
		return
	} else if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if err := h.Store.SaveNebulaPlacement(in); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, in)
}
