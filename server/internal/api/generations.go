package api

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"cardforge/internal/openai"
	"cardforge/internal/pricing"
	"cardforge/internal/prompt"
	"cardforge/internal/store"
)

type GenerationsHandler struct {
	Gens      *store.GenerationsStore
	Factions  *store.FactionsStore
	CardTypes *store.CardTypesStore
	Settings  *store.SettingsStore
	Batches   *store.BatchesStore // for editing batch item images
	Usage     *store.UsageStore
	DataDir   string
}

type generateRequest struct {
	FactionID      int64        `json:"faction_id"`
	CardTypeID     int64        `json:"card_type_id"`
	Mode           string       `json:"mode"`
	PromptOverride string       `json:"prompt_override"`
	Model          string       `json:"model"` // empty = Settings default
	FrontImage     *imageSource `json:"front_image"`
}

// loadPair fetches the faction and card type, mapping ErrNotFound to 404.
func (h *GenerationsHandler) loadPair(w http.ResponseWriter, factionID, cardTypeID int64) (store.Faction, store.CardType, bool) {
	f, err := h.Factions.Get(factionID)
	if err != nil {
		writeError(w, http.StatusNotFound, "faction not found")
		return store.Faction{}, store.CardType{}, false
	}
	ct, err := h.CardTypes.Get(cardTypeID)
	if err != nil {
		writeError(w, http.StatusNotFound, "card type not found")
		return store.Faction{}, store.CardType{}, false
	}
	return f, ct, true
}

func (h *GenerationsHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var req generateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if !oneOf(req.Mode, "draft", "final") {
		writeError(w, http.StatusBadRequest, "mode must be draft or final")
		return
	}
	f, ct, ok := h.loadPair(w, req.FactionID, req.CardTypeID)
	if !ok {
		return
	}
	if ct.OpenAIFileID == "" {
		writeError(w, http.StatusConflict, "card type has no OpenAI file — upload it first")
		return
	}

	p := req.PromptOverride
	if p == "" {
		p = prompt.ImageEdit(ct.Description, ct.Constraints, factionStyle(f))
	}
	var frontURL string
	if req.FrontImage != nil {
		if !strings.HasSuffix(ct.Name, " back") {
			writeError(w, http.StatusBadRequest, "front image is only supported for back card types")
			return
		}
		front, status, err := h.loadEditParent(imageEditRequest{Parent: *req.FrontImage})
		if err != nil {
			writeError(w, status, err.Error())
			return
		}
		frontType, err := h.CardTypes.Get(front.cardTypeID)
		if err != nil || front.factionID != f.ID || frontType.Name != strings.TrimSuffix(ct.Name, " back") {
			writeError(w, http.StatusBadRequest, "front image must match the faction and front card type")
			return
		}
		data, err := os.ReadFile(filepath.Join(h.DataDir, front.imagePath))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "read front image: "+err.Error())
			return
		}
		frontURL = "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
		p = prompt.WithFrontReference(p)
	}
	model, err := h.resolveModel(req.Model)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	all, err := h.Settings.GetAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	// Quality is fixed now so the image name and the request agree.
	quality := modeQuality(req.Mode, all)
	g, err := h.Gens.Create(req.FactionID, req.CardTypeID, req.Mode, model, quality,
		store.ImageNameSuffix(f.Name, ct.Name, quality), p)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	go h.run(g.ID, openai.ImageEditRequest{Model: model, FileID: ct.OpenAIFileID, ReferenceImageURL: frontURL, Prompt: p, Quality: quality}, nil)
	writeJSON(w, http.StatusCreated, g)
}

// modeQuality is the Settings quality for a draft/final run.
func modeQuality(mode string, all map[string]string) string {
	if mode == "final" {
		return all["final_quality"]
	}
	return all["draft_quality"]
}

// SetFavorite stars or unstars a generation.
func (h *GenerationsHandler) SetFavorite(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req struct {
		Favorite bool `json:"favorite"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if err := h.Gens.SetFavorite(id, req.Favorite); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "generation not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"favorite": req.Favorite})
}

// factionStyle maps a stored faction to the image prompt's faction part.
func factionStyle(f store.Faction) prompt.FactionStyle {
	return prompt.FactionStyle{Name: f.Name, PrimaryColor: f.PrimaryColor, Texture: f.Texture, Description: f.Description}
}

// resolveModel returns the per-request model, falling back to the Settings
// default.
func (h *GenerationsHandler) resolveModel(override string) (string, error) {
	if m := strings.TrimSpace(override); m != "" {
		return m, nil
	}
	all, err := h.Settings.GetAll()
	if err != nil {
		return "", err
	}
	return all["openai_model"], nil
}

// run performs the OpenAI call in the background and persists the outcome.
// req carries model, input image (FileID or ImageURL), optional mask,
// prompt and quality; size/fidelity/background come from Settings.
// postProcess, if set, transforms the PNG before it's saved (area edits).
// All artifacts are written before status flips to done (PRD §7.3).
func (h *GenerationsHandler) run(id int64, req openai.ImageEditRequest, postProcess func([]byte) ([]byte, error)) {
	fail := func(msg string) { _ = h.Gens.MarkFailed(id, msg) }

	all, err := h.Settings.GetAll()
	if err != nil {
		fail("read settings: " + err.Error())
		return
	}
	client := openai.New(resolveOpenAIKey(all))
	client.BaseURL = openAIBaseURL

	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	start := time.Now()
	req.Size, req.InputFidelity, req.Background = all["image_size"], all["input_fidelity"], all["background"]
	res, err := client.EditImage(ctx, req)
	duration := time.Since(start).Milliseconds()
	if err != nil {
		fail(err.Error())
		return
	}
	if postProcess != nil {
		if res.PNG, err = postProcess(res.PNG); err != nil {
			fail("post-process: " + err.Error())
			return
		}
	}
	model := req.Model

	dir := filepath.Join(h.DataDir, "generated")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		fail("save image: " + err.Error())
		return
	}
	rel := filepath.Join("generated", fmt.Sprintf("gen-%d.png", id))
	if err := os.WriteFile(filepath.Join(h.DataDir, rel), res.PNG, 0o644); err != nil {
		fail("save image: " + err.Error())
		return
	}

	cost := 0.0
	if pt, err := pricing.Parse(all["price_table"]); err == nil {
		cost = pt.Cost(model, pricing.Usage{
			InputTokens: res.InputTokens, TextInputTokens: res.TextInputTokens, OutputTokens: res.OutputTokens,
		})
	}
	if err := h.Gens.MarkDone(id, rel, res.InputTokens, res.OutputTokens, cost, duration); err != nil {
		fail("persist result: " + err.Error())
	}
}

func (h *GenerationsHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	g, err := h.Gens.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "generation not found")
		return
	}
	writeJSON(w, http.StatusOK, g)
}

func (h *GenerationsHandler) List(w http.ResponseWriter, _ *http.Request) {
	all, err := h.Gens.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, all)
}

func (h *GenerationsHandler) ServeImage(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	g, err := h.Gens.Get(id)
	if err != nil || g.Status != "done" || g.ImagePath == "" {
		writeError(w, http.StatusNotFound, "no image for this generation")
		return
	}
	w.Header().Set("Content-Type", "image/png")
	http.ServeFile(w, r, filepath.Join(h.DataDir, g.ImagePath))
}

// Assemble builds the image prompt from *unsaved* faction fields and,
// optionally, unsaved card type description/constraints (Faction Lab), so
// the user can see and send it before saving anything.
func (h *GenerationsHandler) Assemble(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CardTypeID   int64  `json:"card_type_id"`
		Name         string `json:"name"`
		PrimaryColor string `json:"primary_color"`
		Texture      string `json:"texture"`
		Description  string `json:"description"`
		// nil = use the saved card type text
		CardTypeDescription *string `json:"card_type_description"`
		CardTypeConstraints *string `json:"card_type_constraints"`
		HasFrontImage       bool    `json:"has_front_image"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	ct, err := h.CardTypes.Get(req.CardTypeID)
	if err != nil {
		writeError(w, http.StatusNotFound, "card type not found")
		return
	}
	if req.CardTypeDescription != nil {
		ct.Description = *req.CardTypeDescription
	}
	if req.CardTypeConstraints != nil {
		ct.Constraints = *req.CardTypeConstraints
	}
	p := prompt.ImageEdit(ct.Description, ct.Constraints, prompt.FactionStyle{
		Name: strings.TrimSpace(req.Name), PrimaryColor: strings.TrimSpace(req.PrimaryColor),
		Texture: strings.TrimSpace(req.Texture), Description: req.Description,
	})
	if req.HasFrontImage && strings.HasSuffix(ct.Name, " back") {
		p = prompt.WithFrontReference(p)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"prompt":   p,
		"has_file": ct.OpenAIFileID != "",
	})
}

func (h *GenerationsHandler) Preview(w http.ResponseWriter, r *http.Request) {
	factionID, err1 := strconv.ParseInt(r.URL.Query().Get("faction_id"), 10, 64)
	cardTypeID, err2 := strconv.ParseInt(r.URL.Query().Get("card_type_id"), 10, 64)
	if err1 != nil || err2 != nil {
		writeError(w, http.StatusBadRequest, "faction_id and card_type_id are required")
		return
	}
	f, ct, ok := h.loadPair(w, factionID, cardTypeID)
	if !ok {
		return
	}
	all, err := h.Settings.GetAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	model := strings.TrimSpace(r.URL.Query().Get("model"))
	if model == "" {
		model = all["openai_model"]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"prompt":        prompt.ImageEdit(ct.Description, ct.Constraints, factionStyle(f)),
		"has_file":      ct.OpenAIFileID != "",
		"est_draft_usd": estimatePerImage(h.Usage, all, model, "draft"),
		"est_final_usd": estimatePerImage(h.Usage, all, model, "final"),
	})
}
