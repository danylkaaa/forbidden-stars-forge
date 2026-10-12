package api

import (
	"cardforge/internal/store"
	"errors"
	"net/http"
	"os"
	"path/filepath"
)

func finishImageDelete(w http.ResponseWriter, dataDir, path string, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, 404, "image not found")
	case errors.Is(err, store.ErrImageInUse), errors.Is(err, store.ErrImagePending):
		writeError(w, 409, err.Error())
	case err != nil:
		writeError(w, 500, err.Error())
	default:
		if path != "" {
			_ = os.Remove(filepath.Join(dataDir, path))
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func (h *GenerationsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, 400, "invalid image id")
		return
	}
	path, err := h.Gens.Delete(id)
	finishImageDelete(w, h.DataDir, path, err)
}

func (h *BatchesHandler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	batchID, ok := idParam(r, "id")
	if !ok {
		writeError(w, 400, "invalid batch id")
		return
	}
	itemID, ok := idParam(r, "itemID")
	if !ok {
		writeError(w, 400, "invalid image id")
		return
	}
	path, err := h.Store.DeleteItem(batchID, itemID)
	finishImageDelete(w, h.DataDir, path, err)
}
