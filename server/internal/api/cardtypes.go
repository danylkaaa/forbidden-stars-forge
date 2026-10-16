package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
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
	ImageSize   *string     // nil when the form does not carry it
	CardSizeMM  *[2]float64 // width, height; nil when the form does not carry it
	AspectRatio *float64    // nil when the form does not carry it; 0 clears it
}

var imageSizeRe = regexp.MustCompile(`^\d{2,5}x\d{2,5}$`)

// imageSizeProblem is why OpenAI would reject a flexible gpt-image-2 size ("" when it is fine).
func imageSizeProblem(w, h int) string {
	long, short := max(w, h), min(w, h)
	switch {
	case w <= 0 || h <= 0 || w%16 != 0 || h%16 != 0:
		return "width and height must both be divisible by 16"
	case w*h < 655_360:
		return "below the minimum of 655,360 pixels"
	case w*h > 3840*2160 || long > 3840:
		return "above the maximum of 3840x2160"
	case long > 3*short:
		return "aspect ratio must be between 1:3 and 3:1"
	}
	return ""
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
	if _, ok := r.MultipartForm.Value["image_size"]; ok {
		size := strings.TrimSpace(r.FormValue("image_size"))
		if size != "" && !imageSizeRe.MatchString(size) {
			return f, "image_size must be <width>x<height> in pixels"
		}
		if size != "" {
			var w, h int
			fmt.Sscanf(size, "%dx%d", &w, &h)
			if msg := imageSizeProblem(w, h); msg != "" {
				return f, "image_size: " + msg
			}
		}
		f.ImageSize = &size
	}
	if _, ok := r.MultipartForm.Value["aspect_ratio"]; ok {
		text := strings.TrimSpace(r.FormValue("aspect_ratio"))
		ratio := 0.0
		if text != "" {
			var err error
			if ratio, err = strconv.ParseFloat(text, 64); err != nil || (ratio != 0 && (ratio < 1.0/20 || ratio > 20)) {
				return f, "aspect_ratio must be between 1:20 and 20:1"
			}
		}
		f.AspectRatio = &ratio
	}
	_, hasW := r.MultipartForm.Value["card_width_mm"]
	_, hasH := r.MultipartForm.Value["card_height_mm"]
	if hasW || hasH {
		w, errW := strconv.ParseFloat(strings.TrimSpace(r.FormValue("card_width_mm")), 64)
		h, errH := strconv.ParseFloat(strings.TrimSpace(r.FormValue("card_height_mm")), 64)
		if errW != nil || errH != nil || w < 10 || h < 10 || w > 1000 || h > 1000 {
			return f, "card size must be between 10 and 1000 mm on both sides"
		}
		f.CardSizeMM = &[2]float64{w, h}
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
	if fields.ImageSize != nil {
		if ct, err = h.Store.SetImageSize(ct.ID, *fields.ImageSize); err != nil {
			h.cardTypeErr(w, err)
			return
		}
	}
	if fields.AspectRatio != nil {
		if ct, err = h.Store.SetAspectRatio(ct.ID, *fields.AspectRatio); err != nil {
			h.cardTypeErr(w, err)
			return
		}
	}
	if fields.CardSizeMM != nil {
		if ct, err = h.Store.SetCardSize(ct.ID, fields.CardSizeMM[0], fields.CardSizeMM[1]); err != nil {
			h.cardTypeErr(w, err)
			return
		}
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
	if store.IsBuiltinCardType(prev.Name) && fields.Name != prev.Name {
		writeError(w, http.StatusBadRequest, "built-in card types cannot be renamed")
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
	if fields.ImageSize != nil {
		if ct, err = h.Store.SetImageSize(ct.ID, *fields.ImageSize); err != nil {
			h.cardTypeErr(w, err)
			return
		}
	}
	if fields.AspectRatio != nil {
		if ct, err = h.Store.SetAspectRatio(ct.ID, *fields.AspectRatio); err != nil {
			h.cardTypeErr(w, err)
			return
		}
	}
	if fields.CardSizeMM != nil {
		if ct, err = h.Store.SetCardSize(ct.ID, fields.CardSizeMM[0], fields.CardSizeMM[1]); err != nil {
			h.cardTypeErr(w, err)
			return
		}
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
	if store.IsBuiltinCardType(ct.Name) {
		writeError(w, http.StatusConflict, "built-in card type — cannot delete")
		return
	}
	if err := h.Store.Delete(id); err != nil {
		h.cardTypeErr(w, err)
		return
	}
	h.removeTemplateFile(ct.TemplatePath)
	h.removeTemplateFile(ct.OverlayPath)
	w.WriteHeader(http.StatusNoContent)
}

// PutOverlay stores a preview-only overlay PNG for the card type (saved
// immediately, independent of the edit form). It stays local: nothing in
// the generation path reads overlay_path.
func (h *CardTypesHandler) PutOverlay(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	prev, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxTemplateBytes+(1<<20))
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("overlay must be a PNG up to %d MB", maxTemplateBytes>>20))
		return
	}
	f, hdr, err := r.FormFile("overlay")
	if err != nil {
		writeError(w, http.StatusBadRequest, "overlay file is required")
		return
	}
	defer f.Close()
	if strings.ToLower(filepath.Ext(hdr.Filename)) != ".png" {
		writeError(w, http.StatusBadRequest, "overlay must be a PNG (with transparency)")
		return
	}
	dir := filepath.Join(h.DataDir, "overlays")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	rel := filepath.Join("overlays", fmt.Sprintf("overlay-%d.png", time.Now().UnixNano()))
	dst, err := os.Create(filepath.Join(h.DataDir, rel))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	_, err = io.Copy(dst, f)
	dst.Close()
	if err != nil {
		h.removeTemplateFile(rel)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if err := h.Store.SetOverlay(id, rel); err != nil {
		h.removeTemplateFile(rel)
		h.cardTypeErr(w, err)
		return
	}
	h.removeTemplateFile(prev.OverlayPath)
	ct, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ct)
}

func (h *CardTypesHandler) DeleteOverlay(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	prev, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	if err := h.Store.SetOverlay(id, ""); err != nil {
		h.cardTypeErr(w, err)
		return
	}
	h.removeTemplateFile(prev.OverlayPath)
	ct, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ct)
}

func (h *CardTypesHandler) ServeOverlay(w http.ResponseWriter, r *http.Request) {
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
	if ct.OverlayPath == "" {
		writeError(w, http.StatusNotFound, "no overlay uploaded")
		return
	}
	w.Header().Set("Content-Type", "image/png")
	http.ServeFile(w, r, filepath.Join(h.DataDir, ct.OverlayPath))
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

// DropTemplate removes a card type's template: its pictures are then made from the prompt alone.
func (h *CardTypesHandler) DropTemplate(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	path, err := h.Store.DropTemplate(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	h.removeTemplateFile(path)
	ct, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, ct)
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
