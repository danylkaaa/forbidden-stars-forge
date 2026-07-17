package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"cardforge/internal/openai"
	"cardforge/internal/store"
)

// openAIBaseURL is package-level so tests can point it at a fake server.
var openAIBaseURL = "https://api.openai.com"

const maxTemplateBytes = 20 << 20 // 20 MB

type CardTypesHandler struct {
	Store    *store.CardTypesStore
	Settings *store.SettingsStore
	DataDir  string
}

// resolveOpenAIKey: OPENAI_API_KEY env overrides the stored setting (PRD §6).
func resolveOpenAIKey(all map[string]string) string {
	if env := os.Getenv("OPENAI_API_KEY"); env != "" {
		return env
	}
	return all["openai_api_key"]
}

func (h *CardTypesHandler) client() (*openai.Client, error) {
	all, err := h.Settings.GetAll()
	if err != nil {
		return nil, err
	}
	c := openai.New(resolveOpenAIKey(all))
	c.BaseURL = openAIBaseURL
	return c, nil
}

var imageExts = map[string]string{".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}

// saveTemplate validates and writes the uploaded template, returning the
// path relative to DataDir.
func (h *CardTypesHandler) saveTemplate(r *http.Request) (string, error) {
	f, hdr, err := r.FormFile("template")
	if err != nil {
		return "", nil // no file part — not an error
	}
	defer f.Close()
	ext := strings.ToLower(filepath.Ext(hdr.Filename))
	if _, ok := imageExts[ext]; !ok {
		return "", errors.New("template must be a PNG or JPEG file")
	}
	if hdr.Size > maxTemplateBytes {
		return "", fmt.Errorf("template exceeds %d MB limit", maxTemplateBytes>>20)
	}
	dir := filepath.Join(h.DataDir, "templates")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	rel := filepath.Join("templates", fmt.Sprintf("template-%d%s", time.Now().UnixNano(), ext))
	dst, err := os.Create(filepath.Join(h.DataDir, rel))
	if err != nil {
		return "", err
	}
	defer dst.Close()
	if _, err := io.Copy(dst, io.LimitReader(f, maxTemplateBytes+1)); err != nil {
		return "", err
	}
	return rel, nil
}

func (h *CardTypesHandler) removeTemplateFile(relPath string) {
	if relPath == "" {
		return
	}
	_ = os.Remove(filepath.Join(h.DataDir, relPath)) // best-effort
}

type cardTypeFields struct {
	Name        string
	Description string
	Constraints string
}

func parseCardTypeForm(w http.ResponseWriter, r *http.Request) (cardTypeFields, string) {
	r.Body = http.MaxBytesReader(w, r.Body, maxTemplateBytes+(1<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			return cardTypeFields{}, fmt.Sprintf("template exceeds %d MB limit", maxTemplateBytes>>20)
		}
		return cardTypeFields{}, "invalid multipart form: " + err.Error()
	}
	f := cardTypeFields{
		Name:        strings.TrimSpace(r.FormValue("name")),
		Description: r.FormValue("description"),
		Constraints: r.FormValue("constraints"),
	}
	if f.Name == "" {
		return f, "name is required"
	}
	return f, ""
}

func (h *CardTypesHandler) cardTypeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "card type not found")
	case errors.Is(err, store.ErrDuplicateName):
		writeError(w, http.StatusConflict, "a card type with this name already exists")
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

func (h *CardTypesHandler) List(w http.ResponseWriter, _ *http.Request) {
	all, err := h.Store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, all)
}

func (h *CardTypesHandler) Create(w http.ResponseWriter, r *http.Request) {
	fields, msg := parseCardTypeForm(w, r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	templatePath, err := h.saveTemplate(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	ct, err := h.Store.Create(fields.Name, fields.Description, fields.Constraints, templatePath)
	if err != nil {
		h.removeTemplateFile(templatePath)
		h.cardTypeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, ct)
}

func (h *CardTypesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	fields, msg := parseCardTypeForm(w, r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	prev, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	templatePath, err := h.saveTemplate(r)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	var newPath *string
	if templatePath != "" {
		newPath = &templatePath
	}
	ct, err := h.Store.Update(id, fields.Name, fields.Description, fields.Constraints, newPath)
	if err != nil {
		h.removeTemplateFile(templatePath)
		h.cardTypeErr(w, err)
		return
	}
	if newPath != nil && prev.TemplatePath != "" {
		h.removeTemplateFile(prev.TemplatePath)
	}
	writeJSON(w, http.StatusOK, ct)
}

func (h *CardTypesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ct, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	if err := h.Store.Delete(id); err != nil {
		h.cardTypeErr(w, err)
		return
	}
	h.removeTemplateFile(ct.TemplatePath)
	w.WriteHeader(http.StatusNoContent)
}

func (h *CardTypesHandler) ServeTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ct, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	if ct.TemplatePath == "" {
		writeError(w, http.StatusNotFound, "no template uploaded")
		return
	}
	if mime, ok := imageExts[strings.ToLower(filepath.Ext(ct.TemplatePath))]; ok {
		w.Header().Set("Content-Type", mime)
	}
	http.ServeFile(w, r, filepath.Join(h.DataDir, ct.TemplatePath))
}

func (h *CardTypesHandler) UploadToOpenAI(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ct, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	if ct.TemplatePath == "" {
		writeError(w, http.StatusConflict, "no template uploaded")
		return
	}
	f, err := os.Open(filepath.Join(h.DataDir, ct.TemplatePath))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "template file missing: "+err.Error())
		return
	}
	defer f.Close()

	client, err := h.client()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	fileID, err := client.UploadFile(ctx, filepath.Base(ct.TemplatePath), "vision", f)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if err := h.Store.SetFileID(id, fileID); err != nil {
		h.cardTypeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"openai_file_id": fileID})
}
