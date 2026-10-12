package api

import (
	"cardforge/internal/store"
	"encoding/json"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (h *CardsHandler) CardTypeLayouts(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.CardTypeLayouts()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, list)
}

func (h *CardsHandler) SaveCardTypeLayout(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	var in struct {
		Layout json.RawMessage `json:"layout"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "invalid layout JSON")
		return
	}
	l := store.CardTypeLayout{Category: chi.URLParam(r, "category"), Layout: in.Layout}
	if err := h.Store.SaveCardTypeLayout(l); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, l)
}
