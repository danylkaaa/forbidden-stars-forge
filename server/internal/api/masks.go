package api

import (
	"bytes"
	"errors"
	"image/png"
	"io"
	"net/http"

	"cardforge/internal/store"
)

const maxHideMaskBytes = 16 << 20

// MasksHandler keeps the hiding masks of generated images (see store.ImageMasksStore).
type MasksHandler struct {
	Masks *store.ImageMasksStore
	Gens  *store.GenerationsStore
}

func (h *MasksHandler) List(w http.ResponseWriter, _ *http.Request) {
	list, err := h.Masks.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (h *MasksHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	data, _, err := h.Masks.Get(id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "no mask for this image")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "no-cache")
	_, _ = w.Write(data)
}

func (h *MasksHandler) Put(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if _, err := h.Gens.Get(id); err != nil {
		writeError(w, http.StatusNotFound, "image not found")
		return
	}
	data, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxHideMaskBytes))
	if err != nil {
		writeError(w, http.StatusRequestEntityTooLarge, "mask is too large")
		return
	}
	if cfg, err := png.DecodeConfig(bytes.NewReader(data)); err != nil || cfg.Width == 0 || cfg.Height == 0 {
		writeError(w, http.StatusBadRequest, "the mask must be a PNG image")
		return
	}
	if err := h.Masks.Put(id, data); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"generation_id": id})
}

func (h *MasksHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.Masks.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
