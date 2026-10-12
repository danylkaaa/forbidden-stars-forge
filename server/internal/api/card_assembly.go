package api

import (
	"bytes"
	"cardforge/internal/store"
	"encoding/json"
	"github.com/google/uuid"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
)

func (h *CardsHandler) assemblyID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, ok := idParam(r, "id")
	if !ok || id <= 0 {
		writeError(w, 400, "invalid card id")
		return 0, false
	}
	if _, err := h.Store.Get(id); err != nil {
		h.storeError(w, err)
		return 0, false
	}
	return id, true
}
func assemblyResponse(a store.CardAssembly) store.CardAssembly {
	if a.ArtworkPath != "" {
		a.ImageURL = "/api/cards/" + strconv.FormatInt(a.CardID, 10) + "/artwork?v=" + filepath.Base(a.ArtworkPath)
	}
	return a
}
func (h *CardsHandler) GetAssembly(w http.ResponseWriter, r *http.Request) {
	id, ok := h.assemblyID(w, r)
	if !ok {
		return
	}
	a, err := h.Store.Assembly(id)
	if err != nil {
		h.storeError(w, err)
		return
	}
	writeJSON(w, 200, assemblyResponse(a))
}
func (h *CardsHandler) SaveAssembly(w http.ResponseWriter, r *http.Request) {
	id, ok := h.assemblyID(w, r)
	if !ok {
		return
	}
	var a store.CardAssembly
	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	// Decode only mutable configuration; clients cannot provide filesystem paths.
	var in struct {
		ImageKey  string                 `json:"image_key"`
		OverlayID string                 `json:"overlay_id"`
		Transform store.ArtworkTransform `json:"transform"`
		Layout    json.RawMessage        `json:"layout"`
	}
	if err := dec.Decode(&in); err != nil {
		writeError(w, 400, "invalid assembly JSON")
		return
	}
	var extra any
	if dec.Decode(&extra) != io.EOF {
		writeError(w, 400, "expected one JSON value")
		return
	}
	a = store.CardAssembly{CardID: id, ImageKey: in.ImageKey, OverlayID: in.OverlayID, Transform: in.Transform, Layout: in.Layout}
	if err := store.ValidateAssembly(a); err != nil {
		writeError(w, 400, err.Error())
		return
	}
	old, err := h.Store.Assembly(id)
	if err != nil {
		h.storeError(w, err)
		return
	}
	created := ""
	if a.ImageKey == old.ImageKey && old.ArtworkPath != "" {
		a.ArtworkPath = old.ArtworkPath
	} else if a.ImageKey != "" {
		source, err := h.Store.AssemblySource(a.ImageKey)
		if err != nil {
			writeError(w, 400, "selected artwork does not exist")
			return
		}
		data, err := os.ReadFile(filepath.Join(h.DataDir, source))
		if err != nil {
			writeError(w, 400, "selected artwork file is missing")
			return
		}
		a.ArtworkPath, err = h.writeArtwork(data)
		if err != nil {
			writeError(w, 500, err.Error())
			return
		}
		created = a.ArtworkPath
	}
	saved, err := h.Store.SaveAssembly(a)
	if err != nil {
		if created != "" {
			os.Remove(filepath.Join(h.DataDir, created))
		}
		h.storeError(w, err)
		return
	}
	writeJSON(w, 200, assemblyResponse(saved))
}
func (h *CardsHandler) writeArtwork(data []byte) (string, error) {
	config, kind, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (kind != "png" && kind != "jpeg") || config.Width <= 0 || config.Height <= 0 || int64(config.Width)*int64(config.Height) > 50000000 {
		return "", &artworkError{}
	}
	ext := ".png"
	if kind == "jpeg" {
		ext = ".jpg"
	}
	name := filepath.Join("card-artwork", uuid.NewString()+ext)
	if err = os.MkdirAll(filepath.Join(h.DataDir, "card-artwork"), 0755); err != nil {
		return "", err
	}
	return name, os.WriteFile(filepath.Join(h.DataDir, name), data, 0644)
}

type artworkError struct{}

func (*artworkError) Error() string {
	return "artwork must be a valid PNG or JPEG image under 50 megapixels"
}
func (h *CardsHandler) UploadArtwork(w http.ResponseWriter, r *http.Request) {
	id, ok := h.assemblyID(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 21<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, 400, "artwork upload exceeds 20 MiB or is invalid")
		return
	}
	defer r.MultipartForm.RemoveAll()
	file, _, err := r.FormFile("image")
	if err != nil {
		writeError(w, 400, "image file is required")
		return
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, (20<<20)+1))
	if err != nil || len(data) > 20<<20 {
		writeError(w, 400, "artwork must be under 20 MiB")
		return
	}
	path, err := h.writeArtwork(data)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	a, err := h.Store.Assembly(id)
	if err != nil {
		os.Remove(filepath.Join(h.DataDir, path))
		h.storeError(w, err)
		return
	}
	a.ArtworkPath = path
	a.ImageKey = "upload"
	a.Transform = store.ArtworkTransform{Scale: 1}
	saved, err := h.Store.SaveAssembly(a)
	if err != nil {
		os.Remove(filepath.Join(h.DataDir, path))
		h.storeError(w, err)
		return
	}
	writeJSON(w, 200, assemblyResponse(saved))
}
func (h *CardsHandler) Artwork(w http.ResponseWriter, r *http.Request) {
	id, ok := h.assemblyID(w, r)
	if !ok {
		return
	}
	a, err := h.Store.Assembly(id)
	if err != nil {
		h.storeError(w, err)
		return
	}
	if a.ArtworkPath == "" {
		writeError(w, 404, "card has no artwork")
		return
	}
	http.ServeFile(w, r, filepath.Join(h.DataDir, a.ArtworkPath))
}
