package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"cardforge/internal/store"
	"github.com/go-chi/chi/v5"
)

func (h *CardsHandler) OverlayAdjustments(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.OverlayAdjustments()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, list)
}

// SaveOverlayAdjustment sets (or with a null body, removes) a faction's correction of one overlay.
func (h *CardsHandler) SaveOverlayAdjustment(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, 400, "invalid faction id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var in *store.ArtworkAdjust
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "invalid adjustment JSON")
		return
	}
	if _, err := h.Factions.Get(id); errors.Is(err, store.ErrNotFound) {
		writeError(w, 400, "faction not found")
		return
	} else if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if err := h.Store.SaveOverlayAdjustment(id, chi.URLParam(r, "overlay"), in); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, in)
}
