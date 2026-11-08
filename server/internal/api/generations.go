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
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"cardforge/internal/imaging"
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
	Usage     *store.UsageStore
	Masks     *store.ImageMasksStore
	DataDir   string
}

type generateRequest struct {
	FactionID      int64        `json:"faction_id"`
	CardTypeID     int64        `json:"card_type_id"`
	Mode           string       `json:"mode"`
	// Quality chosen for this run (low, medium, high, xhigh, max); empty = the mode's Settings quality. A low or
	// medium run counts as a draft, the rest as finals.
	Quality string `json:"quality"`
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
	if req.Quality != "" {
		if !oneOf(req.Quality, "low", "medium", "high", "xhigh", "max") {
			writeError(w, http.StatusBadRequest, "quality must be low, medium, high, xhigh or max")
			return
		}
		req.Mode = "final"
		if oneOf(req.Quality, "low", "medium") {
			req.Mode = "draft"
		}
	}
	if !oneOf(req.Mode, "draft", "final") {
		writeError(w, http.StatusBadRequest, "mode must be draft or final")
		return
	}
	f, ct, ok := h.loadPair(w, req.FactionID, req.CardTypeID)
	if !ok {
		return
	}
	// A type with no template is generated from its prompt alone.
	if ct.OpenAIFileID == "" && !ct.NoTemplate {
		writeError(w, http.StatusConflict, "card type has no OpenAI file — upload it first")
		return
	}

	p := req.PromptOverride
	if p == "" {
		p = promptFor(ct, factionStyle(f))
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
		if err != nil || front.factionID != f.ID || !backMatchesFront(ct.Name, frontType.Name) {
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
	quality := qualityFor(req.Mode, all, ct, model)
	if req.Quality != "" {
		quality = modelQuality(req.Quality, model)
	}
	g, err := h.Gens.Create(req.FactionID, req.CardTypeID, req.Mode, model, quality,
		store.ImageNameSuffix(f.Name, ct.Name, quality), p)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	h.start(g.ID, openai.ImageEditRequest{Model: model, FileID: ct.OpenAIFileID, ReferenceImageURL: frontURL, Prompt: p, Quality: quality, Size: ct.ImageSize, Background: backgroundFor(ct)}, cropTo(ct))
	writeJSON(w, http.StatusCreated, g)
}

// isFactionCard reports whether a card type is the faction card (front or back): it may be generated at a better
// quality than other finals, and is always transparent.
func isFactionCard(ct store.CardType) bool {
	return ct.Name == "faction card" || ct.Name == "faction card back"
}

// backgroundFor is a card type's own background: the faction card's pictures (the front's plate, the back) are
// drawn over a background of their own, so they come transparent. Empty = the Settings background.
func backgroundFor(ct store.CardType) string {
	if isFactionCard(ct) {
		return "transparent"
	}
	return ""
}

// qualityFor is the quality of a run: the faction card's own final quality when one is set (Settings), else the
// mode's. xhigh and max exist only on some models; others get high.
func qualityFor(mode string, all map[string]string, ct store.CardType, model string) string {
	q := all["faction_card_quality"]
	if mode != "final" || !isFactionCard(ct) || q == "" {
		return modeQuality(mode, all)
	}
	return modelQuality(q, model)
}

// modelQuality is a quality the model takes: xhigh and max exist only on some models; others get high.
func modelQuality(q, model string) string {
	if (q == "xhigh" || q == "max") && !supportsExtraQuality(model) {
		return "high"
	}
	return q
}

// supportsExtraQuality reports whether a model takes the xhigh and max qualities (gpt-image-2.5 sunburst and flare,
// with their snapshots).
func supportsExtraQuality(model string) bool {
	return strings.HasPrefix(model, "gpt-image-2.5-sunburst") || strings.HasPrefix(model, "gpt-image-2.5-flare")
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

// runs counts the OpenAI calls in progress, so a stopping server can let them finish (their pictures cannot be
// fetched again once the connection is gone).
var runs sync.WaitGroup

// WaitForRuns waits up to timeout for the OpenAI calls in progress; it reports whether they all finished.
func WaitForRuns(timeout time.Duration) bool {
	done := make(chan struct{})
	go func() { runs.Wait(); close(done) }()
	select {
	case <-done:
		return true
	case <-time.After(timeout):
		return false
	}
}

// start runs an OpenAI call in the background, counted in runs.
func (h *GenerationsHandler) start(id int64, req openai.ImageEditRequest, postProcess func([]byte) ([]byte, error)) {
	runs.Add(1)
	go func() {
		defer runs.Done()
		h.run(id, req, postProcess)
	}()
}

// run performs the OpenAI call in the background and persists the outcome.
// req carries model, input image (FileID or ImageURL), optional mask,
// prompt and quality; size/fidelity/background come from Settings.
// cropTo is the post-processing of a card type whose images have a shape beyond the model's limit: the picture is cropped
// to the type's aspect ratio. Nil for an ordinary type.
func cropTo(ct store.CardType) func([]byte) ([]byte, error) {
	if ct.AspectRatio <= 0 {
		return nil
	}
	return func(png []byte) ([]byte, error) { return imaging.CropToRatio(png, ct.AspectRatio) }
}

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
	// A request's own background (the faction card's) wins over the Settings one.
	req.InputFidelity = all["input_fidelity"]
	if req.Background == "" {
		req.Background = all["background"]
	}
	if req.NoInput() {
		req.Size = newImageSize(req.Size)
	}
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
	// With ?mask the image is served with its hiding mask applied (the part a card is assembled from).
	if r.URL.Query().Has("mask") && h.Masks != nil {
		if mask, _, err := h.Masks.Get(id); err == nil {
			raw, err := os.ReadFile(filepath.Join(h.DataDir, g.ImagePath))
			if err == nil {
				if out, err := imaging.HideMasked(raw, mask); err == nil {
					w.Header().Set("Content-Type", "image/png")
					_, _ = w.Write(out)
					return
				}
			}
		}
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
		CardTypeRendering   *string `json:"card_type_rendering_style"`
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
	if req.CardTypeRendering != nil {
		ct.RenderingStyle = *req.CardTypeRendering
	}
	p := promptFor(ct, prompt.FactionStyle{
		Name: strings.TrimSpace(req.Name), PrimaryColor: strings.TrimSpace(req.PrimaryColor),
		Texture: strings.TrimSpace(req.Texture), Description: req.Description,
	})
	if req.HasFrontImage && strings.HasSuffix(ct.Name, " back") {
		p = prompt.WithFrontReference(p)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"prompt":   p,
		"has_file": ct.OpenAIFileID != "" || ct.NoTemplate,
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
	draft, final := qualityFor("draft", all, ct, model), qualityFor("final", all, ct, model)
	// Per quality the slider offers: what it costs and takes with this model (xhigh and max fall back to high).
	estimates := map[string]map[string]any{}
	for _, q := range []string{"low", "high", "xhigh", "max"} {
		mq := modelQuality(q, model)
		estimates[q] = map[string]any{"quality": mq, "usd": estimatePerImage(h.Usage, all, model, mq, ct.ImageSize), "seconds": estimateSeconds(h.Usage, model, mq, ct.ID)}
	}
	p := promptFor(ct, factionStyle(f))
	writeJSON(w, http.StatusOK, map[string]any{
		"prompt":            p,
		"has_file":          ct.OpenAIFileID != "" || ct.NoTemplate,
		"est_draft_usd":     estimatePerImage(h.Usage, all, model, draft, ct.ImageSize),
		"est_final_usd":     estimatePerImage(h.Usage, all, model, final, ct.ImageSize),
		"est_draft_seconds": estimateSeconds(h.Usage, model, draft, ct.ID),
		"est_final_seconds": estimateSeconds(h.Usage, model, final, ct.ID),
		"final_quality":     final,
		"estimates":         estimates,
	})
}

// backMatchesFront reports whether a front card type may be the reference for a
// back: the card back serves both combat and event cards.
func backMatchesFront(back, front string) bool {
	if back == "card back" {
		return front == "combat" || front == "events"
	}
	return front == strings.TrimSuffix(back, " back")
}

// promptFor is the image prompt of a card type: it edits the template, or, with no template, paints from the text.
func promptFor(ct store.CardType, f prompt.FactionStyle) string {
	if ct.NoTemplate {
		return prompt.ImageNew(ct.Description, ct.Constraints, f, ct.RenderingStyle)
	}
	return prompt.ImageEdit(ct.Description, ct.Constraints, f, ct.RenderingStyle)
}

// newImageSize is the size of a picture made without a template: the card type's size when it is a fixed one
// (the edit endpoint infers its size from the template, so the setting may be empty), else portrait.
func newImageSize(configured string) string {
	if sizePattern.MatchString(configured) {
		return configured
	}
	return "1024x1536"
}

var sizePattern = regexp.MustCompile(`^\d{3,4}x\d{3,4}$`)
