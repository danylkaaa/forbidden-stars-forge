// Package batchpoller polls OpenAI Batches API for every non-terminal
// batch every 60s (PRD §7.4/§10), downloads completed output/error files,
// saves per-item PNGs, and records usage-based cost at the 50% batch
// discount. Restarting the process re-enters polling automatically: the
// first Poll() call after Start() queries the DB for any batch still
// submitted/in_progress from before the restart.
package batchpoller

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"cardforge/internal/openai"
	"cardforge/internal/pricing"
	"cardforge/internal/store"
)

type Counts struct {
	Completed int `json:"completed"`
	Failed    int `json:"failed"`
	Total     int `json:"total"`
}

type Poller struct {
	Store    *store.BatchesStore
	Settings *store.SettingsStore
	DataDir  string
	Client   func() (*openai.Client, error)

	mu     sync.Mutex
	counts map[int64]Counts
}

func New(batches *store.BatchesStore, settings *store.SettingsStore, dataDir string, client func() (*openai.Client, error)) *Poller {
	return &Poller{Store: batches, Settings: settings, DataDir: dataDir, Client: client, counts: make(map[int64]Counts)}
}

func (p *Poller) Start(ctx context.Context) {
	p.Poll(ctx)
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.Poll(ctx)
		}
	}
}

func (p *Poller) Counts(batchID int64) (Counts, bool) {
	p.mu.Lock()
	defer p.mu.Unlock()
	c, ok := p.counts[batchID]
	return c, ok
}

func (p *Poller) setCounts(batchID int64, c Counts) {
	p.mu.Lock()
	p.counts[batchID] = c
	p.mu.Unlock()
}

func (p *Poller) Poll(ctx context.Context) {
	batches, err := p.Store.NonTerminal()
	if err != nil {
		log.Printf("batchpoller: list non-terminal: %v", err)
		return
	}
	for _, b := range batches {
		p.pollOne(ctx, b)
	}
}

func mapStatus(openaiStatus string) string {
	switch openaiStatus {
	case "validating", "in_progress", "finalizing":
		return "in_progress"
	case "completed":
		return "completed"
	case "failed", "expired":
		return "failed"
	case "cancelling", "cancelled":
		return "cancelled"
	default:
		return "in_progress"
	}
}

func (p *Poller) pollOne(ctx context.Context, b store.Batch) {
	client, err := p.Client()
	if err != nil {
		log.Printf("batchpoller: batch %d: client: %v", b.ID, err)
		return
	}
	reqCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	status, err := client.GetBatch(reqCtx, b.OpenAIBatchID)
	cancel()
	if err != nil {
		log.Printf("batchpoller: batch %d: get: %v", b.ID, err)
		return
	}
	p.setCounts(b.ID, Counts{Completed: status.RequestCounts.Completed, Failed: status.RequestCounts.Failed, Total: status.RequestCounts.Total})

	mapped := mapStatus(status.Status)
	if mapped == "completed" {
		p.complete(ctx, b, status)
		return
	}
	if err := p.Store.SetStatus(b.ID, mapped); err != nil {
		log.Printf("batchpoller: batch %d: set status: %v", b.ID, err)
	}
}

type outputLine struct {
	CustomID string `json:"custom_id"`
	Response struct {
		Body struct {
			Data []struct {
				B64JSON string `json:"b64_json"`
			} `json:"data"`
			Usage struct {
				InputTokens        int64 `json:"input_tokens"`
				OutputTokens       int64 `json:"output_tokens"`
				InputTokensDetails struct {
					TextTokens int64 `json:"text_tokens"`
				} `json:"input_tokens_details"`
			} `json:"usage"`
		} `json:"body"`
	} `json:"response"`
}

type errorLine struct {
	CustomID string `json:"custom_id"`
	Error    struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (p *Poller) complete(ctx context.Context, b store.Batch, status openai.BatchStatus) {
	client, err := p.Client()
	if err != nil {
		log.Printf("batchpoller: batch %d: client: %v", b.ID, err)
		return
	}
	all, err := p.Settings.GetAll()
	if err != nil {
		log.Printf("batchpoller: batch %d: settings: %v", b.ID, err)
		return
	}
	pt, _ := pricing.Parse(all["price_table"])
	dir := filepath.Join("batches", fmt.Sprintf("%d", b.ID))
	if err := os.MkdirAll(filepath.Join(p.DataDir, dir), 0o755); err != nil {
		log.Printf("batchpoller: batch %d: mkdir: %v", b.ID, err)
		return
	}

	var outputPath string
	total := 0.0
	ok := true
	if status.OutputFileID != "" {
		reqCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		data, err := client.FileContent(reqCtx, status.OutputFileID)
		cancel()
		if err != nil {
			log.Printf("batchpoller: batch %d: output content: %v", b.ID, err)
			return
		}
		outputPath = filepath.Join(dir, "output.jsonl")
		if err := os.WriteFile(filepath.Join(p.DataDir, outputPath), data, 0o644); err != nil {
			log.Printf("batchpoller: batch %d: save output: %v", b.ID, err)
			return
		}
		model := b.Model
		if model == "" { // batches created before per-batch models
			model = all["openai_model"]
		}
		total, ok = p.processOutputLines(b.ID, dir, data, pt, model)
	}
	if status.ErrorFileID != "" {
		reqCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		data, err := client.FileContent(reqCtx, status.ErrorFileID)
		cancel()
		if err != nil {
			log.Printf("batchpoller: batch %d: error content: %v", b.ID, err)
			ok = false
		} else if !p.processErrorLines(b.ID, data) {
			ok = false
		}
	}
	// A failure marking or persisting any single item leaves the batch
	// non-terminal so the next tick retries — never flip to completed
	// with an item still stuck at pending (PRD §10).
	if !ok {
		return
	}
	if err := p.Store.Complete(b.ID, outputPath, total); err != nil {
		log.Printf("batchpoller: batch %d: complete: %v", b.ID, err)
	}
}

func (p *Poller) processOutputLines(batchID int64, dir string, data []byte, pt pricing.PriceTable, model string) (float64, bool) {
	total := 0.0
	ok := true
	for _, raw := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
		if raw == "" {
			continue
		}
		var line outputLine
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			log.Printf("batchpoller: batch %d: bad output line: %v", batchID, err)
			ok = false
			continue
		}
		if len(line.Response.Body.Data) == 0 || line.Response.Body.Data[0].B64JSON == "" {
			if err := p.Store.MarkItemFailed(batchID, line.CustomID, "empty image in batch output"); err != nil {
				log.Printf("batchpoller: batch %d: mark failed %s: %v", batchID, line.CustomID, err)
				ok = false
			}
			continue
		}
		png, err := base64.StdEncoding.DecodeString(line.Response.Body.Data[0].B64JSON)
		if err != nil {
			if err := p.Store.MarkItemFailed(batchID, line.CustomID, "bad image data: "+err.Error()); err != nil {
				log.Printf("batchpoller: batch %d: mark failed %s: %v", batchID, line.CustomID, err)
				ok = false
			}
			continue
		}
		rel := filepath.Join(dir, line.CustomID+".png")
		if err := os.WriteFile(filepath.Join(p.DataDir, rel), png, 0o644); err != nil {
			log.Printf("batchpoller: batch %d: save %s: %v", batchID, line.CustomID, err)
			ok = false
			continue
		}
		usage := line.Response.Body.Usage
		cost := pt.Cost(model, pricing.Usage{
			InputTokens: usage.InputTokens, TextInputTokens: usage.InputTokensDetails.TextTokens, OutputTokens: usage.OutputTokens,
		}) * pricing.BatchDiscount // batch pricing is 50% of the standard rate
		total += cost
		if err := p.Store.MarkItemDone(batchID, line.CustomID, rel, usage.InputTokens, usage.OutputTokens, cost); err != nil {
			log.Printf("batchpoller: batch %d: mark done %s: %v", batchID, line.CustomID, err)
			ok = false
		}
	}
	return total, ok
}

func (p *Poller) processErrorLines(batchID int64, data []byte) bool {
	ok := true
	for _, raw := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
		if raw == "" {
			continue
		}
		var line errorLine
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			log.Printf("batchpoller: batch %d: bad error line: %v", batchID, err)
			ok = false
			continue
		}
		msg := line.Error.Message
		if msg == "" {
			msg = "batch item failed"
		}
		if err := p.Store.MarkItemFailed(batchID, line.CustomID, msg); err != nil {
			log.Printf("batchpoller: batch %d: mark failed %s: %v", batchID, line.CustomID, err)
			ok = false
		}
	}
	return ok
}
