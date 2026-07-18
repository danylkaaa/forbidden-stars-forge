package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
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
	DataDir   string
}

type generateRequest struct {
	FactionID      int64  `json:"faction_id"`
	CardTypeID     int64  `json:"card_type_id"`
	Mode           string `json:"mode"`
	PromptOverride string `json:"prompt_override"`
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
		p = prompt.ImageEdit(ct.Name, ct.Description, ct.Constraints, f.Description)
	}
	g, err := h.Gens.Create(req.FactionID, req.CardTypeID, req.Mode, p)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	go h.run(g.ID, req.Mode, p, ct.OpenAIFileID)
	writeJSON(w, http.StatusCreated, g)
}

// run performs the OpenAI call in the background and persists the outcome.
// All artifacts are written before status flips to done (PRD §7.3).
func (h *GenerationsHandler) run(id int64, mode, promptText, fileID string) {
	fail := func(msg string) { _ = h.Gens.MarkFailed(id, msg) }

	all, err := h.Settings.GetAll()
	if err != nil {
		fail("read settings: " + err.Error())
		return
	}
	quality := all["draft_quality"]
	if mode == "final" {
		quality = all["final_quality"]
	}
	client := openai.New(resolveOpenAIKey(all))
	client.BaseURL = openAIBaseURL

	ctx, cancel := context.WithTimeout(context.Background(), 180*time.Second)
	defer cancel()
	start := time.Now()
	res, err := client.EditImage(ctx, openai.ImageEditRequest{
		Model: all["openai_model"], FileID: fileID, Prompt: promptText,
		Size: all["image_size"], Quality: quality, InputFidelity: all["input_fidelity"],
	})
	duration := time.Since(start).Milliseconds()
	if err != nil {
		fail(err.Error())
		return
	}

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
		cost = pt.Cost(all["openai_model"], res.InputTokens, res.OutputTokens)
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
	writeJSON(w, http.StatusOK, map[string]any{
		"prompt":        prompt.ImageEdit(ct.Name, ct.Description, ct.Constraints, f.Description),
		"has_file":      ct.OpenAIFileID != "",
		"est_draft_usd": pricing.EstimatePerImage(all["draft_quality"]),
		"est_final_usd": pricing.EstimatePerImage(all["final_quality"]),
	})
}
