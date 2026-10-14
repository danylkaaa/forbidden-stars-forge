package api

import (
	"bytes"
	"cardforge/internal/store"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
)

const (
	maxFactionImage = 20 << 20
	maxFactionModel = 80 << 20
)

type FactionCardsHandler struct {
	Store    *store.FactionCardsStore
	Factions *store.FactionsStore
	DataDir  string
}

type factionCardJSON struct {
	store.FactionCard
	Assets []factionAssetJSON `json:"assets"`
}
type factionAssetJSON struct {
	Key string `json:"key"`
	URL string `json:"url"`
}

func assetURL(factionID int64, a store.FactionCardAsset) factionAssetJSON {
	return factionAssetJSON{Key: a.Key, URL: fmt.Sprintf("/api/faction-cards/%d/assets/%s?v=%s", factionID, a.Key, filepath.Base(a.Path))}
}

// factionID reads {id}; 0 addresses the default icons shared by all factions.
func (h *FactionCardsHandler) factionID(w http.ResponseWriter, r *http.Request, allowShared bool) (int64, bool) {
	id, ok := idParam(r, "id")
	if !ok || (id == 0 && !allowShared) {
		writeError(w, http.StatusBadRequest, "invalid id")
		return 0, false
	}
	if id > 0 {
		if _, err := h.Factions.Get(id); errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "faction not found")
			return 0, false
		} else if err != nil {
			writeError(w, http.StatusInternalServerError, err.Error())
			return 0, false
		}
	}
	return id, true
}

func (h *FactionCardsHandler) response(id int64) (factionCardJSON, error) {
	c, err := h.Store.Get(id)
	if err != nil {
		return factionCardJSON{}, err
	}
	assets, err := h.Store.Assets(id)
	if err != nil {
		return factionCardJSON{}, err
	}
	out := factionCardJSON{FactionCard: c, Assets: []factionAssetJSON{}}
	for _, a := range assets {
		out.Assets = append(out.Assets, assetURL(id, a))
	}
	return out, nil
}

func (h *FactionCardsHandler) GetLayout(w http.ResponseWriter, r *http.Request) {
	layout, err := h.Store.Layout()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]json.RawMessage{"layout": layout})
}

func (h *FactionCardsHandler) SaveLayout(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 70*1024)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var in struct {
		Layout json.RawMessage `json:"layout"`
	}
	if err := dec.Decode(&in); err != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid layout JSON")
		return
	}
	if err := h.Store.SaveLayout(in.Layout); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]json.RawMessage{"layout": in.Layout})
}

// List returns the ids of the factions that have a saved card.
func (h *FactionCardsHandler) List(w http.ResponseWriter, r *http.Request) {
	ids, err := h.Store.Saved()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, ids)
}

func (h *FactionCardsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r, false)
	if !ok {
		return
	}
	out, err := h.response(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// Defaults lists the icons shared by every faction's card.
func (h *FactionCardsHandler) Defaults(w http.ResponseWriter, r *http.Request) {
	assets, err := h.Store.Assets(0)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := []factionAssetJSON{}
	for _, a := range assets {
		out = append(out, assetURL(0, a))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *FactionCardsHandler) Save(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r, false)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 300*1024)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	var in struct {
		Data          json.RawMessage `json:"data"`
		FrontImageKey string          `json:"front_image_key"`
		BackImageKey  string          `json:"back_image_key"`
		UnitColor     string          `json:"unit_color"`
	}
	if err := dec.Decode(&in); err != nil || dec.Decode(new(any)) != io.EOF {
		writeError(w, http.StatusBadRequest, "invalid faction card JSON")
		return
	}
	if _, err := h.Store.Save(store.FactionCard{FactionID: id, Data: in.Data, FrontImageKey: in.FrontImageKey, BackImageKey: in.BackImageKey, UnitColor: in.UnitColor}); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	out, err := h.response(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// validSTL accepts binary STL (size matches its triangle count) and ASCII STL.
func validSTL(data []byte) bool {
	if len(data) >= 84 {
		n := binary.LittleEndian.Uint32(data[80:84])
		if n > 0 && int64(len(data)) == 84+50*int64(n) {
			return true
		}
	}
	head := strings.TrimSpace(string(data[:min(len(data), 512)]))
	return strings.HasPrefix(head, "solid") && bytes.Contains(data, []byte("facet")) && bytes.Contains(data, []byte("vertex"))
}

func (h *FactionCardsHandler) UploadAsset(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r, true)
	if !ok {
		return
	}
	key := chi.URLParam(r, "key")
	if !store.ValidAssetKey(key) {
		writeError(w, http.StatusBadRequest, "invalid asset key")
		return
	}
	model := strings.HasPrefix(key, "stl-")
	limit := int64(maxFactionImage)
	if model {
		limit = maxFactionModel
	}
	r.Body = http.MaxBytesReader(w, r.Body, limit+(1<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "upload is too large or invalid")
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "file is required")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil || int64(len(data)) > limit {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("file must be under %d MiB", limit>>20))
		return
	}
	ext := ".stl"
	if model {
		if !validSTL(data) {
			writeError(w, http.StatusBadRequest, "model must be a binary or ASCII STL file")
			return
		}
	} else {
		cfg, kind, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || (kind != "png" && kind != "jpeg") || int64(cfg.Width)*int64(cfg.Height) > 50000000 {
			writeError(w, http.StatusBadRequest, "image must be a PNG or JPEG under 50 megapixels")
			return
		}
		ext = map[string]string{"png": ".png", "jpeg": ".jpg"}[kind]
	}
	rel := filepath.Join("faction-card-assets", uuid.NewString()+ext)
	if err := os.MkdirAll(filepath.Join(h.DataDir, "faction-card-assets"), 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := os.WriteFile(filepath.Join(h.DataDir, rel), data, 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	old, err := h.Store.SetAsset(id, key, rel)
	if err != nil {
		_ = os.Remove(filepath.Join(h.DataDir, rel))
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if old != "" {
		_ = os.Remove(filepath.Join(h.DataDir, old))
	}
	writeJSON(w, http.StatusOK, assetURL(id, store.FactionCardAsset{Key: key, Path: rel}))
}

func (h *FactionCardsHandler) Asset(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r, true)
	if !ok {
		return
	}
	path, err := h.Store.Asset(id, chi.URLParam(r, "key"))
	if err != nil {
		writeError(w, http.StatusNotFound, "asset not found")
		return
	}
	http.ServeFile(w, r, filepath.Join(h.DataDir, path))
}

func (h *FactionCardsHandler) DeleteAsset(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r, true)
	if !ok {
		return
	}
	path, err := h.Store.DeleteAsset(id, chi.URLParam(r, "key"))
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "asset not found")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = os.Remove(filepath.Join(h.DataDir, path))
	w.WriteHeader(http.StatusNoContent)
}
