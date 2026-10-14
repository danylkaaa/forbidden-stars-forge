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
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

type referenceJSON struct {
	ID       int64  `json:"id"`
	Category string `json:"category"`
	Side     string `json:"side"`
	Name     string `json:"name"`
	URL      string `json:"url"`
}

func referenceResponse(r store.ReferenceCard) referenceJSON {
	return referenceJSON{ID: r.ID, Category: r.Category, Side: r.Side, Name: r.Name, URL: fmt.Sprintf("/api/reference-cards/%d/image?v=%s", r.ID, filepath.Base(r.Path))}
}

func (h *CardsHandler) ReferenceCards(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.ReferenceCards()
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	out := []referenceJSON{}
	for _, c := range list {
		out = append(out, referenceResponse(c))
	}
	writeJSON(w, 200, out)
}

func (h *CardsHandler) UploadReferenceCard(w http.ResponseWriter, r *http.Request) {
	category := chi.URLParam(r, "category")
	if category != "combat" && category != "schema" && category != "upgrade" && category != "faction" {
		writeError(w, 400, "category must be combat, schema, upgrade or faction")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 21<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, 400, "upload exceeds 20 MiB or is invalid")
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, header, err := r.FormFile("image")
	if err != nil {
		writeError(w, 400, "image file is required")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (20<<20)+1))
	if err != nil || len(data) > 20<<20 {
		writeError(w, 400, "image must be under 20 MiB")
		return
	}
	_, kind, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (kind != "png" && kind != "jpeg") {
		writeError(w, 400, "image must be a PNG or JPEG")
		return
	}
	if side := r.FormValue("side"); side != "" && side != "front" && side != "back" {
		writeError(w, 400, "side must be front or back")
		return
	}
	name := strings.TrimSpace(r.FormValue("name"))
	if name == "" {
		name = strings.TrimSuffix(header.Filename, filepath.Ext(header.Filename))
	}
	rel := filepath.Join("reference-cards", uuid.NewString()+map[string]string{"png": ".png", "jpeg": ".jpg"}[kind])
	if err := os.MkdirAll(filepath.Join(h.DataDir, "reference-cards"), 0o755); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if err := os.WriteFile(filepath.Join(h.DataDir, rel), data, 0o644); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	side := r.FormValue("side")
	if side == "" {
		side = "front"
	}
	card, err := h.Store.AddReferenceCard(category, side, name, rel)
	if err != nil {
		_ = os.Remove(filepath.Join(h.DataDir, rel))
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, referenceResponse(card))
}

func (h *CardsHandler) GetReferenceCard(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, 400, "invalid id")
		return
	}
	card, err := h.Store.ReferenceCard(id)
	if err != nil {
		writeError(w, 404, "reference card not found")
		return
	}
	http.ServeFile(w, r, filepath.Join(h.DataDir, card.Path))
}

func (h *CardsHandler) DeleteReferenceCard(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, 400, "invalid id")
		return
	}
	path, err := h.Store.DeleteReferenceCard(id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, 404, "reference card not found")
		return
	} else if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	_ = os.Remove(filepath.Join(h.DataDir, path))
	w.WriteHeader(http.StatusNoContent)
}
