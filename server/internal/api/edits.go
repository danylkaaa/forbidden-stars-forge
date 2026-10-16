package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"cardforge/internal/imaging"
	"cardforge/internal/openai"
	"cardforge/internal/prompt"
	"cardforge/internal/store"
)

const maxMaskBytes = 20 << 20

type imageSource struct {
	Kind string `json:"kind"`
	ID   int64  `json:"id"`
}

type imageEditRequest struct {
	// The image to edit: a generation.
	Parent      imageSource `json:"parent"`
	Mask        string      `json:"mask"` // PNG data URL; transparent pixels = edit here; empty edits the whole image
	Instruction string      `json:"instruction"`
	Protect     bool        `json:"protect"` // paste original pixels back outside the mask
}

// editParent is everything an area edit needs from the image it edits.
type editParent struct {
	origin     store.EditOrigin
	factionID  int64
	cardTypeID int64
	mode       string
	model      string
	quality    string
	prompt     string
	imagePath  string
}

// Edit starts an area edit: the parent image + painted mask + instruction
// go to OpenAI's images/edits, and the result becomes a new generation
// linked to its parent. The parent is never modified.
func (h *GenerationsHandler) Edit(w http.ResponseWriter, r *http.Request) {
	var req imageEditRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxMaskBytes+(1<<20))).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	req.Instruction = strings.TrimSpace(req.Instruction)
	if req.Instruction == "" {
		writeError(w, http.StatusBadRequest, "instruction is required")
		return
	}
	// With nothing painted the whole image is edited, with no mask.
	var maskPNG []byte
	if strings.TrimSpace(req.Mask) != "" {
		var err error
		if maskPNG, err = decodePNGDataURL(req.Mask); err != nil {
			writeError(w, http.StatusBadRequest, "mask: "+err.Error())
			return
		}
	}
	parent, status, err := h.loadEditParent(req)
	if err != nil {
		writeError(w, status, err.Error())
		return
	}
	original, err := os.ReadFile(filepath.Join(h.DataDir, parent.imagePath))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read image: "+err.Error())
		return
	}
	ow, oh, err := imaging.Size(original)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "read image: "+err.Error())
		return
	}
	if maskPNG != nil {
		if mw, mh, err := imaging.Size(maskPNG); err != nil || mw != ow || mh != oh {
			writeError(w, http.StatusBadRequest, fmt.Sprintf("mask must be a %dx%d PNG", ow, oh))
			return
		}
	}

	f, ct, ok := h.loadPair(w, parent.factionID, parent.cardTypeID)
	if !ok {
		return
	}
	all, err := h.Settings.GetAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	model, quality := parent.model, parent.quality
	if model == "" {
		model = all["openai_model"]
	}
	if quality == "" {
		quality = modeQuality(parent.mode, all)
	}
	p := prompt.WholeEdit(parent.prompt, req.Instruction)
	if maskPNG != nil {
		p = prompt.AreaEdit(parent.prompt, req.Instruction)
	}
	g, err := h.Gens.Create(parent.factionID, parent.cardTypeID, parent.mode, model, quality,
		store.ImageNameSuffix(f.Name, ct.Name, quality), p)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	parent.origin.Instruction = req.Instruction
	if g, err = h.Gens.SetEditOrigin(g.ID, parent.origin); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	var post func([]byte) ([]byte, error)
	if req.Protect && maskPNG != nil {
		post = func(edited []byte) ([]byte, error) {
			return imaging.ProtectUnmasked(original, edited, maskPNG, 4)
		}
	}
	edit := openai.ImageEditRequest{
		Model: model, Prompt: p, Quality: quality, Size: ct.ImageSize,
		ImageURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(original),
	}
	if maskPNG != nil {
		edit.MaskURL = "data:image/png;base64," + base64.StdEncoding.EncodeToString(maskPNG)
	}
	go h.run(g.ID, edit, post)
	writeJSON(w, http.StatusCreated, g)
}

func (h *GenerationsHandler) loadEditParent(req imageEditRequest) (editParent, int, error) {
	switch req.Parent.Kind {
	case "generation":
		g, err := h.Gens.Get(req.Parent.ID)
		if err != nil {
			return editParent{}, http.StatusNotFound, fmt.Errorf("generation not found")
		}
		if g.Status != "done" || g.ImagePath == "" {
			return editParent{}, http.StatusConflict, fmt.Errorf("generation has no finished image")
		}
		return editParent{
			origin:    store.EditOrigin{Kind: "generation", ID: g.ID, Name: g.Name},
			factionID: g.FactionID, cardTypeID: g.CardTypeID, mode: g.Mode, model: g.Model,
			quality: g.Quality, prompt: g.Prompt, imagePath: g.ImagePath,
		}, 0, nil
	}
	return editParent{}, http.StatusBadRequest, fmt.Errorf(`parent.kind must be "generation"`)
}

// decodePNGDataURL accepts "data:image/png;base64,…" (or bare base64).
func decodePNGDataURL(s string) ([]byte, error) {
	if i := strings.Index(s, ","); strings.HasPrefix(s, "data:") && i > 0 {
		if !strings.HasPrefix(s, "data:image/png") {
			return nil, fmt.Errorf("must be a PNG")
		}
		s = s[i+1:]
	}
	if s == "" {
		return nil, fmt.Errorf("required")
	}
	data, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return nil, fmt.Errorf("bad base64: %w", err)
	}
	if len(data) > maxMaskBytes {
		return nil, fmt.Errorf("too large")
	}
	return data, nil
}
