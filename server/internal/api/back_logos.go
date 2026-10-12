package api

import (
	"bytes"
	"fmt"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"cardforge/internal/store"
	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

func backLogoURL(t store.AssemblyTemplate) string {
	if t.LogoPath == "" {
		return ""
	}
	return fmt.Sprintf("/api/assembly-templates/%d/%s/logo?v=%s", t.FactionID, t.Category, filepath.Base(t.LogoPath))
}

func (h *CardsHandler) UploadBackLogo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, 400, "invalid faction id")
		return
	}
	category := chi.URLParam(r, "category")
	old, err := h.Store.BackLogo(id, category)
	if err != nil {
		writeError(w, 400, "choose a card back before uploading a logo")
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
	rel := filepath.Join("back-logos", uuid.NewString()+ext)
	if err := os.MkdirAll(filepath.Join(h.DataDir, "back-logos"), 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := os.WriteFile(filepath.Join(h.DataDir, rel), data, 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	err = h.Store.SetBackLogo(id, category, rel)
	if err != nil {
		_ = os.Remove(filepath.Join(h.DataDir, rel))
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if old != "" {
		_ = os.Remove(filepath.Join(h.DataDir, old))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *CardsHandler) GetBackLogo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, 400, "invalid faction id")
		return
	}
	path, err := h.Store.BackLogo(id, chi.URLParam(r, "category"))
	if err != nil || path == "" {
		writeError(w, 404, "card back has no logo")
		return
	}
	http.ServeFile(w, r, filepath.Join(h.DataDir, path))
}

func (h *CardsHandler) DeleteBackLogo(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, 400, "invalid faction id")
		return
	}
	category := chi.URLParam(r, "category")
	path, err := h.Store.BackLogo(id, category)
	if err != nil {
		writeError(w, 404, "card back not found")
		return
	}
	if err := h.Store.SetBackLogo(id, category, ""); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if path != "" {
		_ = os.Remove(filepath.Join(h.DataDir, path))
	}
	w.WriteHeader(http.StatusNoContent)
}
