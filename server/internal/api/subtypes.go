package api

import (
	"cardforge/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type SubtypesHandler struct {
	Store   *store.SubtypesStore
	DataDir string
}

type subtypeOverlayJSON struct {
	ID  int64  `json:"id"`
	URL string `json:"url"`
}
type subtypeJSON struct {
	ID       int64                `json:"id"`
	Category string               `json:"category"`
	Name     string               `json:"name"`
	Layout   json.RawMessage      `json:"layout"`
	Overlays []subtypeOverlayJSON `json:"overlays"`
}

func subtypeResponse(st store.CardSubtype) subtypeJSON {
	out := subtypeJSON{ID: st.ID, Category: st.Category, Name: st.Name, Layout: st.Layout, Overlays: []subtypeOverlayJSON{}}
	for _, o := range st.Overlays {
		out.Overlays = append(out.Overlays, subtypeOverlayJSON{ID: o.ID, URL: fmt.Sprintf("/api/subtypes/%d/overlays/%d?v=%s", st.ID, o.ID, filepath.Base(o.Path))})
	}
	return out
}

func (h *SubtypesHandler) err(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "subtype or overlay not found")
	case errors.Is(err, store.ErrDuplicateName):
		writeError(w, http.StatusConflict, "a subtype with this name already exists for this card type")
	case errors.Is(err, store.ErrBuiltinSubtype):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, store.ErrInvalidSubtype):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

func decodeStrict(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, 16*1024)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(v) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return false
	}
	return true
}

func (h *SubtypesHandler) List(w http.ResponseWriter, r *http.Request) {
	list, err := h.Store.List()
	if err != nil {
		h.err(w, err)
		return
	}
	out := []subtypeJSON{}
	for _, st := range list {
		out = append(out, subtypeResponse(st))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *SubtypesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Category string `json:"category"`
		Name     string `json:"name"`
	}
	if !decodeStrict(w, r, &in) {
		return
	}
	st, err := h.Store.Create(in.Category, in.Name)
	if err != nil {
		h.err(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, subtypeResponse(st))
}

func (h *SubtypesHandler) Rename(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var in struct {
		Name string `json:"name"`
	}
	if !decodeStrict(w, r, &in) {
		return
	}
	st, err := h.Store.Rename(id, in.Name)
	if err != nil {
		h.err(w, err)
		return
	}
	writeJSON(w, http.StatusOK, subtypeResponse(st))
}

func (h *SubtypesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	paths, err := h.Store.Delete(id)
	if err != nil {
		h.err(w, err)
		return
	}
	for _, p := range paths {
		_ = os.Remove(filepath.Join(h.DataDir, p))
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *SubtypesHandler) AddOverlay(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxTemplateBytes+(1<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("overlay must be a PNG under %d MB", maxTemplateBytes>>20))
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, hdr, err := r.FormFile("overlay")
	if err != nil {
		writeError(w, http.StatusBadRequest, "overlay file is required")
		return
	}
	defer f.Close()
	if strings.ToLower(filepath.Ext(hdr.Filename)) != ".png" {
		writeError(w, http.StatusBadRequest, "overlay must be a PNG (it needs transparency)")
		return
	}
	if err := os.MkdirAll(filepath.Join(h.DataDir, "subtype-overlays"), 0o755); err != nil {
		h.err(w, err)
		return
	}
	rel := filepath.Join("subtype-overlays", fmt.Sprintf("overlay-%d.png", time.Now().UnixNano()))
	dst, err := os.Create(filepath.Join(h.DataDir, rel))
	if err != nil {
		h.err(w, err)
		return
	}
	_, err = io.Copy(dst, f)
	dst.Close()
	if err != nil {
		_ = os.Remove(filepath.Join(h.DataDir, rel))
		h.err(w, err)
		return
	}
	st, err := h.Store.AddOverlay(id, rel)
	if err != nil {
		_ = os.Remove(filepath.Join(h.DataDir, rel))
		h.err(w, err)
		return
	}
	writeJSON(w, http.StatusOK, subtypeResponse(st))
}

func (h *SubtypesHandler) overlayIDs(w http.ResponseWriter, r *http.Request) (int64, int64, bool) {
	id, ok := idParam(r, "id")
	oid, ok2 := idParam(r, "overlayID")
	if !ok || !ok2 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, 0, false
	}
	return id, oid, true
}

func (h *SubtypesHandler) Overlay(w http.ResponseWriter, r *http.Request) {
	id, oid, ok := h.overlayIDs(w, r)
	if !ok {
		return
	}
	o, err := h.Store.Overlay(id, oid)
	if err != nil {
		h.err(w, err)
		return
	}
	http.ServeFile(w, r, filepath.Join(h.DataDir, o.Path))
}

func (h *SubtypesHandler) DeleteOverlay(w http.ResponseWriter, r *http.Request) {
	id, oid, ok := h.overlayIDs(w, r)
	if !ok {
		return
	}
	path, err := h.Store.DeleteOverlay(id, oid)
	if err != nil {
		h.err(w, err)
		return
	}
	_ = os.Remove(filepath.Join(h.DataDir, path))
	st, err := h.Store.Get(id)
	if err != nil {
		h.err(w, err)
		return
	}
	writeJSON(w, http.StatusOK, subtypeResponse(st))
}

func (h *SubtypesHandler) Reorder(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var in struct {
		IDs []int64 `json:"ids"`
	}
	if !decodeStrict(w, r, &in) {
		return
	}
	st, err := h.Store.ReorderOverlays(id, in.IDs)
	if errors.Is(err, store.ErrNotFound) {
		h.err(w, err)
		return
	} else if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, subtypeResponse(st))
}

func (h *SubtypesHandler) SetLayout(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 128*1024)
	var in struct {
		Layout json.RawMessage `json:"layout"`
	}
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if dec.Decode(&in) != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid layout JSON")
		return
	}
	st, err := h.Store.SetLayout(id, in.Layout)
	if errors.Is(err, store.ErrNotFound) {
		h.err(w, err)
		return
	} else if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, subtypeResponse(st))
}
