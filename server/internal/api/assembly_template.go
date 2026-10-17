package api

import (
	"cardforge/internal/store"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/go-chi/chi/v5"
)

func (h *CardsHandler) AssemblyTemplates(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.AssemblyTemplates()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	for i := range list {
		list[i].LogoURL = backLogoURL(list[i])
	}
	writeJSON(w, 200, list)
}
func (h *CardsHandler) SaveAssemblyTemplate(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var in store.AssemblyTemplate
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, 400, "invalid template JSON")
		return
	}
	if _, err := h.Factions.Get(in.FactionID); errors.Is(err, store.ErrNotFound) {
		writeError(w, 400, "faction not found")
		return
	} else if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	var oldLogo string
	if in.ImageKey == "" && in.Side == "back" {
		oldLogo, _ = h.Store.BackLogo(in.FactionID, in.Category)
	}
	if err := h.Store.SaveAssemblyTemplate(in); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	if oldLogo != "" {
		_ = os.Remove(filepath.Join(h.DataDir, oldLogo))
	}
	writeJSON(w, 200, in)
}

// SaveTemplateAdjust sets (or with a null body, clears) the tone and colour correction of a chosen template image.
func (h *CardsHandler) SaveTemplateAdjust(w http.ResponseWriter, r *http.Request) {
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
	err := h.Store.SetTemplateAdjust(id, chi.URLParam(r, "category"), chi.URLParam(r, "side"), in)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, 404, "choose an image first")
		return
	} else if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	writeJSON(w, 200, in)
}
