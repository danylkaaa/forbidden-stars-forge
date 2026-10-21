package api

import (
	"bytes"
	"cardforge/internal/imaging"
	"cardforge/internal/openai"
	"cardforge/internal/store"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// CharactersHandler keeps each faction's character picture, the reference sent to OpenAI when the
// faction card is generated. An upload is synced to OpenAI (Files API) straight away; a failed sync
// is retried by the sync endpoint or by the next generation.
type CharactersHandler struct {
	Store    *store.CharactersStore
	Factions *store.FactionsStore
	Settings *store.SettingsStore
	DataDir  string
}

type characterJSON struct {
	FactionID int64                    `json:"faction_id"`
	URL       string                   `json:"url"`
	Synced    bool                     `json:"synced"`
	SyncError string                   `json:"sync_error,omitempty"`
	Placement store.CharacterPlacement `json:"placement"`
}

func characterResponse(c store.FactionCharacter) characterJSON {
	return characterJSON{FactionID: c.FactionID, URL: fmt.Sprintf("/api/factions/%d/character?v=%s", c.FactionID, filepath.Base(c.Path)), Synced: c.OpenAIFileID != "", Placement: c.Placement}
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
	h.syncAndRespond(w, r.Context(), id)
}

// Sync uploads the faction's character to OpenAI again (after a failed sync, or a changed API key).
func (h *CharactersHandler) Sync(w http.ResponseWriter, r *http.Request) {
	id, ok := h.factionID(w, r)
	if !ok {
		return
	}
	if err := h.Store.SetFileID(id, ""); errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "faction has no character")
		return
	}
	h.syncAndRespond(w, r.Context(), id)
}

// syncAndRespond syncs the character and answers with its state; a failed sync is reported, not an error,
// since the picture itself is saved.
func (h *CharactersHandler) syncAndRespond(w http.ResponseWriter, ctx context.Context, id int64) {
	_, syncErr := characterFileID(ctx, h.Store, h.Settings, h.DataDir, id)
	c, err := h.Store.Get(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := characterResponse(c)
	if syncErr != nil {
		out.SyncError = syncErr.Error()
	}
	writeJSON(w, http.StatusOK, out)
}

// SavePlacement stores where the character is pasted on the faction card template.
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
	if b := p.Box; b.W < 0.02 || b.H < 0.02 || b.X < 0 || b.Y < 0 || b.X+b.W > 1.0001 || b.Y+b.H > 1.0001 {
		writeError(w, http.StatusBadRequest, "placement: the box must lie on the template")
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

// characterFileID is the OpenAI file id of a faction's character, uploading the picture first when it
// is not synced yet. It returns store.ErrNotFound when the faction has no character.
func characterFileID(ctx context.Context, characters *store.CharactersStore, settings *store.SettingsStore, dataDir string, factionID int64) (string, error) {
	c, err := characters.Get(factionID)
	if err != nil || c.OpenAIFileID != "" {
		return c.OpenAIFileID, err
	}
	all, err := settings.GetAll()
	if err != nil {
		return "", err
	}
	f, err := os.Open(filepath.Join(dataDir, c.Path))
	if err != nil {
		return "", fmt.Errorf("character file missing: %w", err)
	}
	defer f.Close()
	client := openai.New(resolveOpenAIKey(all))
	client.BaseURL = openAIBaseURL
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	fileID, err := client.UploadFile(ctx, filepath.Base(c.Path), "vision", f)
	if err != nil {
		return "", fmt.Errorf("sync character to OpenAI: %w", err)
	}
	return fileID, characters.SetFileID(factionID, fileID)
}

// characterTemplateFileID is the OpenAI file of a card type's template with the faction's character pasted on it
// (where its placement says). It is made and uploaded only when the template, the picture or the placement changed
// since the last one. It returns store.ErrNotFound when the faction has no character.
func characterTemplateFileID(ctx context.Context, characters *store.CharactersStore, settings *store.SettingsStore, dataDir string, factionID int64, ct store.CardType) (string, error) {
	c, err := characters.Get(factionID)
	if err != nil {
		return "", err
	}
	p := c.Placement
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s|%s|%g|%g|%g|%+v", ct.TemplatePath, c.Path, p.X, p.Y, p.Scale, p.Box)))
	key := hex.EncodeToString(sum[:])
	if c.CompositeKey == key && c.CompositeFileID != "" {
		return c.CompositeFileID, nil
	}
	template, err := os.ReadFile(filepath.Join(dataDir, ct.TemplatePath))
	if err != nil {
		return "", fmt.Errorf("read template: %w", err)
	}
	picture, err := os.ReadFile(filepath.Join(dataDir, c.Path))
	if err != nil {
		return "", fmt.Errorf("read character: %w", err)
	}
	combined, err := imaging.PlaceOver(template, picture, p.X, p.Y, p.Scale, imaging.Frac{X: p.Box.X, Y: p.Box.Y, W: p.Box.W, H: p.Box.H})
	if err != nil {
		return "", fmt.Errorf("paste the character on the template: %w", err)
	}
	all, err := settings.GetAll()
	if err != nil {
		return "", err
	}
	client := openai.New(resolveOpenAIKey(all))
	client.BaseURL = openAIBaseURL
	ctx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()
	fileID, err := client.UploadFile(ctx, fmt.Sprintf("template-%d-character.png", factionID), "vision", bytes.NewReader(combined))
	if err != nil {
		return "", fmt.Errorf("upload the template with the character to OpenAI: %w", err)
	}
	return fileID, characters.SetComposite(factionID, key, fileID)
}
