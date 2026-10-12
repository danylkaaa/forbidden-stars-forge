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

type imageEditRequest struct {
	// The image to edit: a generation, or a batch item (BatchID + ID).
	Parent struct {
		Kind    string `json:"kind"` // "generation" | "batch-item"
		ID      int64  `json:"id"`
		BatchID int64  `json:"batch_id"`
	} `json:"parent"`
	Mask        string `json:"mask"` // PNG data URL; transparent pixels = edit here
	Instruction string `json:"instruction"`
	Protect     bool   `json:"protect"` // paste original pixels back outside the mask
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
	maskPNG, err := decodePNGDataURL(req.Mask)
	if err != nil {
		writeError(w, http.StatusBadRequest, "mask: "+err.Error())
		return
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
	if mw, mh, err := imaging.Size(maskPNG); err != nil || mw != ow || mh != oh {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("mask must be a %dx%d PNG", ow, oh))
		return
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
	p := prompt.AreaEdit(parent.prompt, req.Instruction)
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
	if req.Protect {
		post = func(edited []byte) ([]byte, error) {
			return imaging.ProtectUnmasked(original, edited, maskPNG, 4)
		}
	}
	go h.run(g.ID, openai.ImageEditRequest{
		Model: model, Prompt: p, Quality: quality,
		ImageURL: "data:image/png;base64," + base64.StdEncoding.EncodeToString(original),
		MaskURL:  "data:image/png;base64," + base64.StdEncoding.EncodeToString(maskPNG),
	}, post)
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
	case "batch-item":
		b, err := h.Batches.Get(req.Parent.BatchID)
		if err != nil {
			return editParent{}, http.StatusNotFound, fmt.Errorf("batch not found")
		}
		items, err := h.Batches.Items(b.ID)
		if err != nil {
			return editParent{}, http.StatusInternalServerError, err
		}
		for _, it := range items {
			if it.ID != req.Parent.ID {
				continue
			}
			if it.Status != "done" || it.ImagePath == "" {
				return editParent{}, http.StatusConflict, fmt.Errorf("batch item has no finished image")
			}
			// Batch items don't store their prompt; rebuild it from the
			// current faction/card type.
			f, err1 := h.Factions.Get(it.FactionID)
			ct, err2 := h.CardTypes.Get(it.CardTypeID)
			if err1 != nil || err2 != nil {
				return editParent{}, http.StatusNotFound, fmt.Errorf("faction or card type not found")
			}
			return editParent{
				origin:    store.EditOrigin{Kind: "batch-item", ID: it.ID, BatchID: b.ID, Name: it.Name},
				factionID: it.FactionID, cardTypeID: it.CardTypeID, mode: b.Mode, model: b.Model,
				quality: it.Quality, prompt: prompt.ImageEdit(ct.Description, ct.Constraints, factionStyle(f)),
				imagePath: it.ImagePath,
			}, 0, nil
		}
		return editParent{}, http.StatusNotFound, fmt.Errorf("batch item not found")
	}
	return editParent{}, http.StatusBadRequest, fmt.Errorf(`parent.kind must be "generation" or "batch-item"`)
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
