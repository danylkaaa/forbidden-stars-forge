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

func (h *CardsHandler) FactionBanners(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.FactionBanners()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, list)
}

func (h *CardsHandler) SaveFactionBanner(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeError(w, 400, "invalid faction id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 1024)
	var in store.FactionBanner
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "invalid banner JSON")
		return
	}
	in.FactionID = id
	if _, err := h.Factions.Get(id); errors.Is(err, store.ErrNotFound) {
		writeError(w, 400, "faction not found")
		return
	} else if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if err := h.Store.SaveFactionBanner(in); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, in)
}
