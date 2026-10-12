package api

import (
	"archive/zip"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"cardforge/internal/batchpoller"
	"cardforge/internal/jsonl"
	"cardforge/internal/openai"
	"cardforge/internal/pricing"
	"cardforge/internal/prompt"
	"cardforge/internal/store"
)

type BatchesHandler struct {
	Store     *store.BatchesStore
	Factions  *store.FactionsStore
	CardTypes *store.CardTypesStore
	Settings  *store.SettingsStore
	Usage     *store.UsageStore
	Poller    *batchpoller.Poller
	DataDir   string
}

type batchOut struct {
	store.Batch
	Counts     batchpoller.Counts `json:"counts"`
	EstCostUSD float64            `json:"est_cost_usd"`
}

func (h *BatchesHandler) client() (*openai.Client, error) {
	all, err := h.Settings.GetAll()
	if err != nil {
		return nil, err
	}
	c := openai.New(resolveOpenAIKey(all))
	c.BaseURL = openAIBaseURL
	return c, nil
}

// counts always derives Total from persisted items (fixed at creation, so
// it's correct immediately — no need to wait for the poller's first tick).
// Completed/Failed come from the poller's live in-memory cache while a
// batch is active, since that reflects OpenAI's real-time progress; once
// the batch leaves submitted/in_progress (or the poller has no cache entry
// yet, e.g. right after a server restart), they're derived from persisted
// items instead, which is always correct for anything terminal.
func (h *BatchesHandler) counts(b store.Batch) batchpoller.Counts {
	items, err := h.Store.Items(b.ID)
	if err != nil {
		return batchpoller.Counts{}
	}
	c := batchpoller.Counts{Total: len(items)}
	if b.Status == "submitted" || b.Status == "in_progress" {
		if live, ok := h.Poller.Counts(b.ID); ok {
			c.Completed, c.Failed = live.Completed, live.Failed
			return c
		}
	}
	for _, it := range items {
		switch it.Status {
		case "done":
			c.Completed++
		case "failed":
			c.Failed++
		}
	}
	return c
}

// out merges the poller's live counts and a same-quality estimate (§7.4
// "actual vs estimate") into the stored batch row. The estimate is
// recomputed from the batch's own item count and mode rather than
// persisted, so it stays consistent even if price_table settings change
// after the batch was submitted.
func (h *BatchesHandler) out(b store.Batch) batchOut {
	c := h.counts(b)
	all := h.settingsOrEmpty()
	model := b.Model
	if model == "" { // batches created before per-batch models
		model = all["openai_model"]
	}
	est := estimatePerImage(h.Usage, all, model, b.Mode) * pricing.BatchDiscount
	return batchOut{Batch: b, Counts: c, EstCostUSD: float64(c.Total) * est}
}

// settingsOrEmpty returns an empty map on error so a settings read failure
// degrades the estimate to zero instead of failing the whole response.
func (h *BatchesHandler) settingsOrEmpty() map[string]string {
	all, err := h.Settings.GetAll()
	if err != nil {
		return map[string]string{}
	}
	return all
}

type batchScopeRequest struct {
	FactionIDs  []int64 `json:"faction_ids"`
	CardTypeIDs []int64 `json:"card_type_ids"`
	Mode        string  `json:"mode"`
	Model       string  `json:"model"` // empty = Settings default
}

// batchModel is the request's model override or the Settings default.
func batchModel(req batchScopeRequest, all map[string]string) string {
	if m := strings.TrimSpace(req.Model); m != "" {
		return m
	}
	return all["openai_model"]
}

func (h *BatchesHandler) resolveQuality(mode string, all map[string]string) string {
	if mode == "final" {
		return all["final_quality"]
	}
	return all["draft_quality"]
}

// buildLines loads every referenced faction/card type, validates the
// scope, and assembles the §8.3 JSONL lines. Nothing is persisted yet.
func (h *BatchesHandler) buildLines(req batchScopeRequest) (string, []jsonl.Line, map[string]string, error) {
	if !oneOf(req.Mode, "draft", "final") {
		return "", nil, nil, fmt.Errorf("mode must be draft or final")
	}
	if len(req.FactionIDs) == 0 || len(req.CardTypeIDs) == 0 {
		return "", nil, nil, fmt.Errorf("select at least one faction and one card type")
	}
	all, err := h.Settings.GetAll()
	if err != nil {
		return "", nil, nil, err
	}
	quality := h.resolveQuality(req.Mode, all)
	model := batchModel(req, all)
	items := make([]jsonl.Item, 0, len(req.FactionIDs)*len(req.CardTypeIDs))
	for _, fid := range req.FactionIDs {
		f, err := h.Factions.Get(fid)
		if err != nil {
			return "", nil, nil, fmt.Errorf("faction %d not found", fid)
		}
		for _, ctid := range req.CardTypeIDs {
			ct, err := h.CardTypes.Get(ctid)
			if err != nil {
				return "", nil, nil, fmt.Errorf("card type %d not found", ctid)
			}
			if ct.OpenAIFileID == "" {
				return "", nil, nil, fmt.Errorf("card type %q has no OpenAI file — upload it first", ct.Name)
			}
			items = append(items, jsonl.Item{
				FactionID: f.ID, FactionName: f.Name,
				CardTypeID: ct.ID, CardTypeName: ct.Name,
				FileID: ct.OpenAIFileID,
				Prompt: prompt.ImageEdit(ct.Description, ct.Constraints, factionStyle(f)),
			})
		}
	}
	text, lines, err := jsonl.Build(items, openai.ImageEditRequest{
		Model: model, Size: all["image_size"], Quality: quality,
		InputFidelity: all["input_fidelity"], Background: all["background"],
	})
	if err != nil {
		return "", nil, nil, err
	}
	return text, lines, all, nil
}

func (h *BatchesHandler) Preview(w http.ResponseWriter, r *http.Request) {
	var req batchScopeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	text, lines, all, err := h.buildLines(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	// The batch discount (PRD §5) applies to actual usage-based cost; the
	// pre-call estimate mirrors that so the preview isn't misleadingly high.
	est := estimatePerImage(h.Usage, all, batchModel(req, all), req.Mode) * pricing.BatchDiscount
	writeJSON(w, http.StatusOK, map[string]any{
		"jsonl":    text,
		"count":    len(lines),
		"est_cost": float64(len(lines)) * est,
	})
}

func (h *BatchesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req batchScopeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	text, lines, all, err := h.buildLines(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	quality := h.resolveQuality(req.Mode, all)
	items := make([]store.BatchItemInput, len(lines))
	for i, l := range lines {
		// buildLines already validated both exist.
		f, _ := h.Factions.Get(l.FactionID)
		ct, _ := h.CardTypes.Get(l.CardTypeID)
		items[i] = store.BatchItemInput{
			FactionID: l.FactionID, CardTypeID: l.CardTypeID, CustomID: l.CustomID,
			Quality: quality, NameSuffix: store.ImageNameSuffix(f.Name, ct.Name, quality),
		}
	}
	// Directory name is a nanosecond timestamp, not the (not-yet-known) DB
	// id — the DB row and the on-disk directory are both unique identifiers,
	// they just don't have to be the same one.
	relDir := filepath.Join("batches", strconv.FormatInt(time.Now().UnixNano(), 10))
	if err := os.MkdirAll(filepath.Join(h.DataDir, relDir), 0o755); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	relPath := filepath.Join(relDir, "requests.jsonl")
	if err := os.WriteFile(filepath.Join(h.DataDir, relPath), []byte(text), 0o644); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	b, err := h.Store.Create(req.Mode, batchModel(req, all), relPath, items)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	client, err := h.client()
	if err != nil {
		h.cleanupFailedSubmit(b.ID, relPath)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	f, err := os.Open(filepath.Join(h.DataDir, relPath))
	if err != nil {
		h.cleanupFailedSubmit(b.ID, relPath)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fileID, err := client.UploadFile(ctx, "requests.jsonl", "batch", f)
	f.Close()
	if err != nil {
		h.cleanupFailedSubmit(b.ID, relPath)
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	openaiBatchID, err := client.CreateBatch(ctx, fileID)
	if err != nil {
		h.cleanupFailedSubmit(b.ID, relPath)
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if err := h.Store.MarkSubmitted(b.ID, openaiBatchID); err != nil {
		// OpenAI has already accepted this batch (openaiBatchID is real) —
		// cleanupFailedSubmit would be wrong here since the batch isn't
		// actually abandoned, just locally out of sync. Log the id so it's
		// recoverable by hand rather than silently discarding it.
		log.Printf("batchpoller: batch %d: submitted to openai as %s but failed to record it: %v", b.ID, openaiBatchID, err)
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	got, err := h.Store.Get(b.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, h.out(got))
}

// cleanupFailedSubmit removes a batch that was persisted locally but
// never reached OpenAI, so it doesn't linger as an orphaned row that
// permanently blocks the delete guards on its referenced faction/card
// types with no way to remove it (best-effort — a failure here is logged
// implicitly via the caller's own error response, not escalated further).
func (h *BatchesHandler) cleanupFailedSubmit(batchID int64, jsonlRelPath string) {
	_ = h.Store.Delete(batchID)
	_ = os.RemoveAll(filepath.Join(h.DataDir, filepath.Dir(jsonlRelPath)))
}

func (h *BatchesHandler) List(w http.ResponseWriter, _ *http.Request) {
	all, err := h.Store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	out := make([]batchOut, len(all))
	for i, b := range all {
		out[i] = h.out(b)
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *BatchesHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	b, err := h.Store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "batch not found")
		return
	}
	items, err := h.Store.Items(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"batch": h.out(b), "items": items})
}

func (h *BatchesHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	b, err := h.Store.Get(id)
	if err != nil {
		writeError(w, http.StatusNotFound, "batch not found")
		return
	}
	if b.OpenAIBatchID == "" {
		writeError(w, http.StatusConflict, "batch was never submitted")
		return
	}
	client, err := h.client()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()
	if err := client.CancelBatch(ctx, b.OpenAIBatchID); err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if err := h.Store.SetStatus(id, "cancelled"); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	got, err := h.Store.Get(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, h.out(got))
}

func (h *BatchesHandler) ItemImage(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	itemID, ok2 := idParam(r, "itemID")
	if !ok || !ok2 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	items, err := h.Store.Items(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, it := range items {
		if it.ID != itemID {
			continue
		}
		if it.Status != "done" || it.ImagePath == "" {
			writeError(w, http.StatusNotFound, "no image for this item")
			return
		}
		w.Header().Set("Content-Type", "image/png")
		http.ServeFile(w, r, filepath.Join(h.DataDir, it.ImagePath))
		return
	}
	writeError(w, http.StatusNotFound, "item not found")
}

func (h *BatchesHandler) Download(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	items, err := h.Store.Items(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="batch-%d.zip"`, id))
	zw := zip.NewWriter(w)
	defer zw.Close()
	for _, it := range items {
		if it.Status != "done" || it.ImagePath == "" {
			continue
		}
		data, err := os.ReadFile(filepath.Join(h.DataDir, it.ImagePath))
		if err != nil {
			continue // best-effort — skip an unreadable item rather than failing the whole export
		}
		fw, err := zw.Create(it.CustomID + ".png")
		if err != nil {
			continue
		}
		fw.Write(data)
	}
}

// DoneItems lists every finished batch image for the Generations page.
func (h *BatchesHandler) DoneItems(w http.ResponseWriter, _ *http.Request) {
	items, err := h.Store.DoneItems()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, items)
}

// SetItemFavorite stars or unstars a batch item.
func (h *BatchesHandler) SetItemFavorite(w http.ResponseWriter, r *http.Request) {
	batchID, ok1 := idParam(r, "id")
	itemID, ok2 := idParam(r, "itemID")
	if !ok1 || !ok2 {
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
	if err := h.Store.SetItemFavorite(batchID, itemID, req.Favorite); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "batch item not found")
		} else {
			writeError(w, http.StatusInternalServerError, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"favorite": req.Favorite})
}
