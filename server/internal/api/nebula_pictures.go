package api

import (
	"bytes"
	"fmt"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// One nebula picture per card type, shared by every faction (each recolours it).
var nebulaPictureCategories = map[string]bool{"combat": true, "schema": true, "upgrade": true}

func (h *CardsHandler) nebulaPictureFile(category string) string {
	for _, ext := range []string{".png", ".jpg"} {
		path := filepath.Join(h.DataDir, "nebula-pictures", category+ext)
		if _, err := os.Stat(path); err == nil {
			return path
		}
	}
	return ""
}

func (h *CardsHandler) removeNebulaPicture(category string) {
	for _, ext := range []string{".png", ".jpg"} {
		_ = os.Remove(filepath.Join(h.DataDir, "nebula-pictures", category+ext))
	}
}

func (h *CardsHandler) NebulaPictures(w http.ResponseWriter, r *http.Request) {
	type picture struct {
		Category string `json:"category"`
		URL      string `json:"url"`
	}
	out := []picture{}
	for _, category := range []string{"combat", "schema", "upgrade"} {
		if path := h.nebulaPictureFile(category); path != "" {
			version := ""
			if info, err := os.Stat(path); err == nil {
				version = strconv.FormatInt(info.ModTime().UnixNano(), 36)
			}
			out = append(out, picture{category, fmt.Sprintf("/api/nebula-pictures/%s?v=%s", category, version)})
		}
	}
	writeJSON(w, 200, out)
}

func (h *CardsHandler) GetNebulaPicture(w http.ResponseWriter, r *http.Request) {
	path := h.nebulaPictureFile(chi.URLParam(r, "category"))
	if path == "" {
		writeError(w, 404, "no nebula picture")
		return
	}
	http.ServeFile(w, r, path)
}

func (h *CardsHandler) UploadNebulaPicture(w http.ResponseWriter, r *http.Request) {
	category := chi.URLParam(r, "category")
	if !nebulaPictureCategories[category] {
		writeError(w, 400, "category must be combat or schema")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 21<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, 400, "nebula picture exceeds 20 MiB or is invalid")
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, _, err := r.FormFile("image")
	if err != nil {
		writeError(w, 400, "image file is required")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (20<<20)+1))
	if err != nil || len(data) > 20<<20 {
		writeError(w, 400, "nebula picture must be under 20 MiB")
		return
	}
	_, kind, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (kind != "png" && kind != "jpeg") {
		writeError(w, 400, "nebula picture must be a PNG or JPEG image")
		return
	}
	ext := map[string]string{"png": ".png", "jpeg": ".jpg"}[kind]
	dir := filepath.Join(h.DataDir, "nebula-pictures")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	h.removeNebulaPicture(category)
	if err := os.WriteFile(filepath.Join(dir, category+ext), data, 0o644); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *CardsHandler) DeleteNebulaPicture(w http.ResponseWriter, r *http.Request) {
	category := chi.URLParam(r, "category")
	if !nebulaPictureCategories[category] {
		writeError(w, 400, "category must be combat or schema")
		return
	}
	h.removeNebulaPicture(category)
	w.WriteHeader(http.StatusNoContent)
}
