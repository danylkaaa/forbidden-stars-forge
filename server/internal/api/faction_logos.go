package api

import (
	"bytes"
	"cardforge/internal/store"
	"errors"
	"fmt"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

type LogosHandler struct {
	Store    *store.LogosStore
	Factions *store.FactionsStore
	DataDir  string
}

type logoJSON struct {
	FactionID int64  `json:"faction_id"`
	URL       string `json:"url"`
}

func logoResponse(factionID int64, path string) logoJSON {
	return logoJSON{FactionID: factionID, URL: fmt.Sprintf("/api/factions/%d/logo?v=%s", factionID, filepath.Base(path))}
}

func (h *LogosHandler) factionID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	if _, err := h.Factions.Get(id); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "faction not found")
		return 0, false
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return 0, false
	}
	return id, true
}

func (h *LogosHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := []logoJSON{}
	for _, l := range list {
		out = append(out, logoResponse(l.FactionID, l.Path))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *LogosHandler) Upload(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 11<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "logo upload exceeds 10 MiB or is invalid")
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, _, err := r.FormFile("logo")
	if err != nil {
		writeError(w, http.StatusBadRequest, "logo file is required")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (10<<20)+1))
	if err != nil || len(data) > 10<<20 {
		writeError(w, http.StatusBadRequest, "logo must be under 10 MiB")
		return
	}
	_, kind, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (kind != "png" && kind != "jpeg") {
		writeError(w, http.StatusBadRequest, "logo must be a PNG or JPEG image")
		return
	}
	ext := map[string]string{"png": ".png", "jpeg": ".jpg"}[kind]
	rel := filepath.Join("faction-logos", uuid.NewString()+ext)
	if err := os.MkdirAll(filepath.Join(h.DataDir, "faction-logos"), 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := os.WriteFile(filepath.Join(h.DataDir, rel), data, 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	old, err := h.Store.Set(id, rel)
	if err != nil {
		_ = os.Remove(filepath.Join(h.DataDir, rel))
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if old != "" {
		_ = os.Remove(filepath.Join(h.DataDir, old))
	}
	writeJSON(w, http.StatusOK, logoResponse(id, rel))
}

func (h *LogosHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r)
	if !ok {
		return
	}
	path, err := h.Store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "faction has no logo")
		return
	}
	http.ServeFile(w, r, filepath.Join(h.DataDir, path))
}

func (h *LogosHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r)
	if !ok {
		return
	}
	path, err := h.Store.Delete(id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "faction has no logo")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = os.Remove(filepath.Join(h.DataDir, path))
	w.WriteHeader(http.StatusNoContent)
}
