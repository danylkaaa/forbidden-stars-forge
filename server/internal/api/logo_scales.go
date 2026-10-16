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

func (h *CardsHandler) CardLogoScales(w http.ResponseWriter, _ *http.Request) {
	list, err := h.Store.CardLogoScales()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, list)
}

// SaveCardLogoScale sets the logo size shared by every card of a faction and category.
func (h *CardsHandler) SaveCardLogoScale(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, 400, "invalid faction id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 256)
	var in struct {
		Scale float64 `json:"scale"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "invalid scale JSON")
		return
	}
	if _, err := h.Factions.Get(id); errors.Is(err, store.ErrNotFound) {
		writeError(w, 400, "faction not found")
		return
	} else if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	row := store.CardLogoScale{FactionID: id, Category: chi.URLParam(r, "category"), Scale: in.Scale}
	if err := h.Store.SaveCardLogoScale(row); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, row)
}
