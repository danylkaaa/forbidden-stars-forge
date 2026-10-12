package api

import (
	"cardforge/internal/store"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
)

func layoutScope(w http.ResponseWriter, r *http.Request) (store.LayoutScope, bool) {
	q := r.URL.Query()
	f, fe := strconv.ParseInt(q.Get("faction_id"), 10, 64)
	c, ce := strconv.ParseInt(q.Get("card_type_id"), 10, 64)
	key := q.Get("template_key")
	if fe != nil || ce != nil || f <= 0 || c < 0 || strings.TrimSpace(key) == "" || len(key) > 256 {
		writeError(w, 400, "template, faction and card type are required")
		return store.LayoutScope{}, false
	}
	return store.LayoutScope{TemplateKey: key, FactionID: f, CardTypeID: c}, true
}
func (h *CardsHandler) GetAssemblyLayout(w http.ResponseWriter, r *http.Request) {
	scope, ok := layoutScope(w, r)
	if !ok {
		return
	}
	layout, err := h.Store.AssemblyLayout(scope)
	if err != nil {
		h.storeError(w, err)
		return
	}
	writeJSON(w, 200, map[string]any{"layout": layout})
}
func (h *CardsHandler) SaveAssemblyLayout(w http.ResponseWriter, r *http.Request) {
	scope, ok := layoutScope(w, r)
	if !ok {
		return
	}
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
	if err := store.ValidateAssembly(store.CardAssembly{OverlayID: "none", Transform: store.ArtworkTransform{Scale: 1}, Layout: in.Layout}); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if err := h.Store.SaveAssemblyLayout(scope, in.Layout); err != nil {
		h.storeError(w, err)
		return
	}
	writeJSON(w, 200, in)
}
