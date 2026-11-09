package api

import (
	"bytes"
	"cardforge/internal/imaging"
	"cardforge/internal/store"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

// CharactersHandler keeps each faction's character picture, which "with character" card types are painted around.
type CharactersHandler struct {
	Store    *store.CharactersStore
	Factions *store.FactionsStore
	DataDir  string
}

type characterJSON struct {
	FactionID int64                    `json:"faction_id"`
	URL       string                   `json:"url"`
	Placement store.CharacterPlacement `json:"placement"`
}

func characterResponse(c store.FactionCharacter) characterJSON {
	return characterJSON{FactionID: c.FactionID, URL: fmt.Sprintf("/api/factions/%d/character?v=%s", c.FactionID, filepath.Base(c.Path)), Placement: c.Placement}
}

func (h *CharactersHandler) factionID(w http.ResponseWriter, r *http.Request) (int64, bool) {
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

func (h *CharactersHandler) List(w http.ResponseWriter, _ *http.Request) {
	list, err := h.Store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := []characterJSON{}
	for _, c := range list {
		out = append(out, characterResponse(c))
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *CharactersHandler) Upload(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r)
	if !ok {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 21<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, http.StatusBadRequest, "character upload exceeds 20 MiB or is invalid")
		return
	}
	defer r.MultipartForm.RemoveAll()
	f, _, err := r.FormFile("character")
	if err != nil {
		writeError(w, http.StatusBadRequest, "character file is required")
		return
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, (20<<20)+1))
	if err != nil || len(data) > 20<<20 {
		writeError(w, http.StatusBadRequest, "character must be under 20 MiB")
		return
	}
	_, kind, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || (kind != "png" && kind != "jpeg") {
		writeError(w, http.StatusBadRequest, "character must be a PNG or JPEG image")
		return
	}
	ext := map[string]string{"png": ".png", "jpeg": ".jpg"}[kind]
	rel := filepath.Join("faction-characters", uuid.NewString()+ext)
	if err := os.MkdirAll(filepath.Join(h.DataDir, "faction-characters"), 0o755); err != nil {
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
	c, err := h.Store.Get(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, characterResponse(c))
}

// SavePlacement stores where the character sits on "with character" images.
func (h *CharactersHandler) SavePlacement(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r)
	if !ok {
		return
	}
	var p store.CharacterPlacement
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if p.Scale < 0.05 || p.Scale > 4 || p.X < -1 || p.X > 2 || p.Y < -1 || p.Y > 2 {
		writeError(w, http.StatusBadRequest, "placement: x and y must be within -1..2, scale within 0.05..4")
		return
	}
	if err := h.Store.SetPlacement(id, p); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "faction has no character")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	c, err := h.Store.Get(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, characterResponse(c))
}

func (h *CharactersHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r)
	if !ok {
		return
	}
	c, err := h.Store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "faction has no character")
		return
	}
	http.ServeFile(w, r, filepath.Join(h.DataDir, c.Path))
}

func (h *CharactersHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r)
	if !ok {
		return
	}
	path, err := h.Store.Delete(id)
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "faction has no character")
		return
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_ = os.Remove(filepath.Join(h.DataDir, path))
	w.WriteHeader(http.StatusNoContent)
}

// characterCanvas is the faction's character placed on a blank canvas of the card type's size. It is sent as both
// the image and the mask (its empty part is painted) and pasted back over the result. The int is the HTTP status
// for the error.
func characterCanvas(chars *store.CharactersStore, dataDir string, factionID int64, size string) ([]byte, int, error) {
	c, err := chars.Get(factionID)
	if errors.Is(err, store.ErrNotFound) {
		return nil, http.StatusConflict, errors.New("upload a character for this faction first")
	} else if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	var w, h int
	if _, err := fmt.Sscanf(size, "%dx%d", &w, &h); err != nil || w <= 0 || h <= 0 {
		return nil, http.StatusConflict, errors.New("set an image size on this card type first")
	}
	data, err := os.ReadFile(filepath.Join(dataDir, c.Path))
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	if c.Placement.Flip {
		if data, err = imaging.FlipH(data); err != nil {
			return nil, http.StatusInternalServerError, err
		}
	}
	blank, err := imaging.Blank(w, h)
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	out, err := imaging.PlaceOver(blank, data, c.Placement.X, c.Placement.Y, c.Placement.Scale, imaging.Frac{W: 1, H: 1})
	if err != nil {
		return nil, http.StatusInternalServerError, err
	}
	return out, 0, nil
}
