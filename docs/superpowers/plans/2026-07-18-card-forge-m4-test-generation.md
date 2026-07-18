# Card Forge — Milestone 4: Test Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Single test generations end-to-end: assemble the §8.2 image-edit prompt, call OpenAI `POST /v1/images/edits` async (pending → poll → done/failed), persist PNG + usage + cost + duration, and ship the Test Generation UI with expandable history and session cost total.

**Architecture:** Backend adds migration 0004 (generations), a `GenerationsStore`, `prompt.ImageEdit` (§8.2), a `pricing` package (price-table JSON → USD, per-image quality estimates), `openai.EditImage` (JSON body with `file_id` reference, b64 PNG decode), and a generations API following the M2 async pattern (POST returns `pending`, goroutine does the work, UI polls every 2 s). Prompt preview comes from a backend endpoint so the template has one source. Frontend adds the test-generation data layer (poll hook mirrors M2's `useJob`) and the page (setup panel + history).

**Tech Stack:** Existing stack. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-15-card-forge-design.md` (§4, §6 Test Generation). PRD: `docs/prd/PRD-1.md` (§5 schema, §7.3, §8.2, §9, §10).

## Global Constraints

- All API JSON snake_case. Async pattern (PRD §4.1): POST returns the record with `status:"pending"` immediately; goroutine does the OpenAI call; UI polls every 2 s until `done`/`failed`. Never flip to `done` with partial data — image saved, usage extracted, cost computed, duration recorded FIRST (PRD §7.3).
- `generations` schema exactly PRD §5. Mode ∈ {draft, final}. Draft and final use the SAME `size` (settings `image_size`); only `quality` differs (`draft_quality` / `final_quality` settings).
- §8.2 prompt template verbatim (one Go constant). Prompt preview served by the backend — the template never exists client-side.
- Images/edits request body: `{"model", "image":[{"file_id":"<card_type.openai_file_id>"}], "prompt", "size", "quality", "input_fidelity", "output_format":"png", "n":1}`. Response: `data[0].b64_json` + `usage.input_tokens/output_tokens`. PNGs saved under `<dataDir>/generated/gen-<id>.png`.
- Retry: the openai client's existing 429/5xx ×3 applies; `image_generation_user_error` arrives as 400 → never retried (PRD §10). OpenAI call timeout 180 s (generation can take ~2 min).
- Cost: `pricing.Parse` tolerates the seeded price_table's non-model keys (`"note"`); `Cost(model, inTok, outTok)` = tokens/1M × per-1M price, 0 for unknown model. Per-image estimates (hardcoded, labeled estimates): low $0.01, medium $0.06, high $0.19.
- Every rendered image captioned with cost; test generations also show duration ("$0.012 · 43s") — PRD §12.
- Card type without `openai_file_id`: inline warning + link to Card Types; Generate disabled (PRD §7.3).
- M1–M3 lessons: labeled inputs (Field/htmlFor); every user-flow await try/catch + role=alert; poll hooks handle `isError` (clear active id + alert — M2 GenerateButton lesson); no `%w` wrap of nil errors (M3 lesson — use `errors.New`/`fmt.Errorf` without `%w` for constructed errors); blob/object URLs not used here (images served by backend URL).
- Frontend component files ≤~150 lines (hard cap 200). Commit after every task.

---

### Task 1: Migration 0004 + GenerationsStore

**Files:**
- Create: `server/internal/store/migrations/0004_generations.up.sql`, `server/internal/store/migrations/0004_generations.down.sql`, `server/internal/store/generations.go`
- Test: `server/internal/store/generations_test.go`

**Interfaces:**
- Consumes: `store.Open`, `ErrNotFound` (existing).
- Produces (Task 4 consumes): `store.Generation{ID, FactionID, CardTypeID int64; Mode, Prompt, Status, ImagePath string; InputTokens, OutputTokens int64; CostUSD float64; DurationMS int64; Error, CreatedAt string}` (json `id,faction_id,card_type_id,mode,prompt,status,image_path,input_tokens,output_tokens,cost_usd,duration_ms,error,created_at`); `store.NewGenerationsStore(db) *GenerationsStore`; `Create(factionID, cardTypeID int64, mode, prompt string) (Generation, error)` (status pending); `MarkDone(id int64, imagePath string, inTok, outTok int64, costUSD float64, durationMS int64) error`; `MarkFailed(id int64, errMsg string) error`; `Get(id int64) (Generation, error)`; `List() ([]Generation, error)` (id DESC).

- [ ] **Step 1: Write migration files**

`server/internal/store/migrations/0004_generations.up.sql`:

```sql
CREATE TABLE generations (
  id             INTEGER PRIMARY KEY,
  faction_id     INTEGER NOT NULL REFERENCES factions(id),
  card_type_id   INTEGER NOT NULL REFERENCES card_types(id),
  mode           TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft','final')),
  prompt         TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pending','done','failed')),
  image_path     TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cost_usd       REAL,
  duration_ms    INTEGER,
  error          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`server/internal/store/migrations/0004_generations.down.sql`:

```sql
DROP TABLE generations;
```

- [ ] **Step 2: Write failing tests**

`server/internal/store/generations_test.go`:

```go
package store

import (
	"errors"
	"path/filepath"
	"testing"
)

// genFixtures creates a faction and a card type to satisfy the FKs.
func genFixtures(t *testing.T) (*GenerationsStore, int64, int64) {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	f, err := NewFactionsStore(db).Create("Tau", "desc", "Galaxy in Flames", "manual")
	if err != nil {
		t.Fatal(err)
	}
	ct, err := NewCardTypesStore(db).Create("combat", "", "", "")
	if err != nil {
		t.Fatal(err)
	}
	return NewGenerationsStore(db), f.ID, ct.ID
}

func TestGenerationCreatePending(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	g, err := s.Create(fid, ctid, "draft", "the prompt")
	if err != nil {
		t.Fatal(err)
	}
	if g.Status != "pending" || g.Mode != "draft" || g.Prompt != "the prompt" || g.ImagePath != "" || g.CostUSD != 0 {
		t.Fatalf("bad generation: %+v", g)
	}
}

func TestGenerationMarkDone(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	g, _ := s.Create(fid, ctid, "final", "p")
	if err := s.MarkDone(g.ID, "generated/gen-1.png", 1200, 4800, 0.19, 43000); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(g.ID)
	if got.Status != "done" || got.ImagePath != "generated/gen-1.png" ||
		got.InputTokens != 1200 || got.OutputTokens != 4800 ||
		got.CostUSD != 0.19 || got.DurationMS != 43000 || got.Error != "" {
		t.Fatalf("after done: %+v", got)
	}
}

func TestGenerationMarkFailed(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	g, _ := s.Create(fid, ctid, "draft", "p")
	if err := s.MarkFailed(g.ID, "openai: boom (request id r1)"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(g.ID)
	if got.Status != "failed" || got.Error != "openai: boom (request id r1)" || got.ImagePath != "" {
		t.Fatalf("after failed: %+v", got)
	}
}

func TestGenerationListNewestFirst(t *testing.T) {
	s, fid, ctid := genFixtures(t)
	a, _ := s.Create(fid, ctid, "draft", "p1")
	b, _ := s.Create(fid, ctid, "draft", "p2")
	all, err := s.List()
	if err != nil || len(all) != 2 {
		t.Fatalf("list: %v len=%d", err, len(all))
	}
	if all[0].ID != b.ID || all[1].ID != a.ID {
		t.Fatalf("order: %d, %d", all[0].ID, all[1].ID)
	}
}

func TestGenerationNotFound(t *testing.T) {
	s, _, _ := genFixtures(t)
	if _, err := s.Get(999); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get: %v", err)
	}
	if err := s.MarkDone(999, "x", 0, 0, 0, 0); !errors.Is(err, ErrNotFound) {
		t.Fatalf("done: %v", err)
	}
	if err := s.MarkFailed(999, "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("failed: %v", err)
	}
}
```

- [ ] **Step 3: Run to verify failure**

Run: `cd server && go test ./internal/store/`
Expected: FAIL — `undefined: NewGenerationsStore`

- [ ] **Step 4: Implement**

`server/internal/store/generations.go`:

```go
package store

import "database/sql"

type Generation struct {
	ID           int64   `json:"id"`
	FactionID    int64   `json:"faction_id"`
	CardTypeID   int64   `json:"card_type_id"`
	Mode         string  `json:"mode"`
	Prompt       string  `json:"prompt"`
	Status       string  `json:"status"`
	ImagePath    string  `json:"image_path"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
	DurationMS   int64   `json:"duration_ms"`
	Error        string  `json:"error"`
	CreatedAt    string  `json:"created_at"`
}

type GenerationsStore struct {
	db *sql.DB
}

func NewGenerationsStore(db *sql.DB) *GenerationsStore {
	return &GenerationsStore{db: db}
}

const generationCols = `id, faction_id, card_type_id, mode, prompt, status,
	COALESCE(image_path,''), COALESCE(input_tokens,0), COALESCE(output_tokens,0),
	COALESCE(cost_usd,0), COALESCE(duration_ms,0), COALESCE(error,''), created_at`

func scanGeneration(row interface{ Scan(...any) error }) (Generation, error) {
	var g Generation
	err := row.Scan(&g.ID, &g.FactionID, &g.CardTypeID, &g.Mode, &g.Prompt, &g.Status,
		&g.ImagePath, &g.InputTokens, &g.OutputTokens, &g.CostUSD, &g.DurationMS, &g.Error, &g.CreatedAt)
	if err == sql.ErrNoRows {
		return g, ErrNotFound
	}
	return g, err
}

func (s *GenerationsStore) Create(factionID, cardTypeID int64, mode, prompt string) (Generation, error) {
	res, err := s.db.Exec(
		`INSERT INTO generations (faction_id, card_type_id, mode, prompt, status) VALUES (?, ?, ?, ?, 'pending')`,
		factionID, cardTypeID, mode, prompt)
	if err != nil {
		return Generation{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Generation{}, err
	}
	return s.Get(id)
}

func (s *GenerationsStore) Get(id int64) (Generation, error) {
	return scanGeneration(s.db.QueryRow("SELECT "+generationCols+" FROM generations WHERE id = ?", id))
}

func (s *GenerationsStore) List() ([]Generation, error) {
	rows, err := s.db.Query("SELECT " + generationCols + " FROM generations ORDER BY id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Generation, 0)
	for rows.Next() {
		g, err := scanGeneration(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// MarkDone persists every completion artifact in one statement so status
// never reads 'done' with partial data (PRD §7.3).
func (s *GenerationsStore) MarkDone(id int64, imagePath string, inTok, outTok int64, costUSD float64, durationMS int64) error {
	res, err := s.db.Exec(
		`UPDATE generations SET status = 'done', image_path = ?, input_tokens = ?, output_tokens = ?,
		 cost_usd = ?, duration_ms = ? WHERE id = ?`,
		imagePath, inTok, outTok, costUSD, durationMS, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *GenerationsStore) MarkFailed(id int64, errMsg string) error {
	res, err := s.db.Exec(`UPDATE generations SET status = 'failed', error = ? WHERE id = ?`, errMsg, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/internal/store/
git commit -m "feat: generations store with atomic done/failed transitions"
```

---

### Task 2: §8.2 image-edit prompt + pricing package

**Files:**
- Modify: `server/internal/prompt/prompt.go` (add ImageEdit)
- Create: `server/internal/pricing/pricing.go`
- Test: `server/internal/prompt/prompt_test.go` (append), `server/internal/pricing/pricing_test.go`

**Interfaces:**
- Consumes: nothing new.
- Produces (Task 4 consumes): `prompt.ImageEdit(cardTypeName, cardTypeDescription, constraints, factionDescription string) string` (§8.2 verbatim); `pricing.ModelPrice{InputPer1MUSD, OutputPer1MUSD float64}` (json `input_per_1m_usd,output_per_1m_usd`); `pricing.Parse(jsonStr string) (PriceTable, error)` (`PriceTable = map[string]ModelPrice`; non-object values like the seeded `"note"` are skipped, not errors); `(PriceTable) Cost(model string, inTok, outTok int64) float64` (0 for unknown model); `pricing.EstimatePerImage(quality string) float64` (low 0.01, medium 0.06, high 0.19; unknown → 0).

- [ ] **Step 1: Append/write failing tests**

Append to `server/internal/prompt/prompt_test.go`:

```go
func TestImageEditInterpolates(t *testing.T) {
	p := ImageEdit("combat", "frontline warriors", "fill the crimson zone; keep banner", "blue-grey plating")
	for _, want := range []string{
		"Edit this card template image. fill the crimson zone; keep banner",
		"Card type: combat — frontline warriors",
		"Faction aesthetic: blue-grey plating",
		"Photorealistic style",
		"at least 6 mm",
		"Do not add any text or lettering.",
	} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt missing %q:\n%s", want, p)
		}
	}
}
```

`server/internal/pricing/pricing_test.go`:

```go
package pricing

import "testing"

const seeded = `{"note":"estimates - edit to match current OpenAI pricing","gpt-image-2":{"input_per_1m_usd":10.0,"output_per_1m_usd":40.0}}`

func TestParseSkipsNonModelKeys(t *testing.T) {
	pt, err := Parse(seeded)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := pt["note"]; ok {
		t.Fatal("note should be skipped")
	}
	if pt["gpt-image-2"].InputPer1MUSD != 10.0 {
		t.Fatalf("prices: %+v", pt["gpt-image-2"])
	}
}

func TestParseInvalidJSON(t *testing.T) {
	if _, err := Parse("not json"); err == nil {
		t.Fatal("expected error")
	}
}

func TestCost(t *testing.T) {
	pt, _ := Parse(seeded)
	// 1200 input + 4800 output tokens: 1200/1M*10 + 4800/1M*40 = 0.012 + 0.192
	got := pt.Cost("gpt-image-2", 1200, 4800)
	if got < 0.2039 || got > 0.2041 {
		t.Fatalf("cost = %v", got)
	}
	if pt.Cost("unknown-model", 1000, 1000) != 0 {
		t.Fatal("unknown model should cost 0")
	}
}

func TestEstimatePerImage(t *testing.T) {
	cases := map[string]float64{"low": 0.01, "medium": 0.06, "high": 0.19, "bogus": 0}
	for q, want := range cases {
		if got := EstimatePerImage(q); got != want {
			t.Fatalf("%s = %v, want %v", q, got, want)
		}
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/prompt/ ./internal/pricing/`
Expected: FAIL — `undefined: ImageEdit`; pricing package missing

- [ ] **Step 3: Implement**

Append to `server/internal/prompt/prompt.go`:

```go
const imageEditTemplate = `Edit this card template image. %s

Card type: %s — %s

Faction aesthetic: %s

Photorealistic style. Keep all important elements at least 6 mm from the
image edges; background artwork must extend to the full bleed edge.
Do not add any text or lettering.`

// ImageEdit assembles the per-card prompt (PRD §8.2).
func ImageEdit(cardTypeName, cardTypeDescription, constraints, factionDescription string) string {
	return fmt.Sprintf(imageEditTemplate, constraints, cardTypeName, cardTypeDescription, factionDescription)
}
```

`server/internal/pricing/pricing.go`:

```go
// Package pricing converts OpenAI token usage to USD via the editable
// price_table setting, and provides labeled per-image estimates.
package pricing

import "encoding/json"

type ModelPrice struct {
	InputPer1MUSD  float64 `json:"input_per_1m_usd"`
	OutputPer1MUSD float64 `json:"output_per_1m_usd"`
}

type PriceTable map[string]ModelPrice

// Parse reads the price_table JSON. Non-object values (e.g. the seeded
// "note" string) are skipped rather than treated as errors.
func Parse(jsonStr string) (PriceTable, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal([]byte(jsonStr), &raw); err != nil {
		return nil, err
	}
	out := make(PriceTable)
	for k, v := range raw {
		var mp ModelPrice
		if err := json.Unmarshal(v, &mp); err == nil {
			var probe map[string]any
			if json.Unmarshal(v, &probe) == nil {
				out[k] = mp
			}
		}
	}
	return out, nil
}

func (t PriceTable) Cost(model string, inTok, outTok int64) float64 {
	mp, ok := t[model]
	if !ok {
		return 0
	}
	return float64(inTok)/1e6*mp.InputPer1MUSD + float64(outTok)/1e6*mp.OutputPer1MUSD
}

// EstimatePerImage is the rough pre-call lookup (PRD §7.3/§7.4 —
// hardcoded, clearly labeled "estimate" wherever shown).
func EstimatePerImage(quality string) float64 {
	switch quality {
	case "low":
		return 0.01
	case "medium":
		return 0.06
	case "high":
		return 0.19
	}
	return 0
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./internal/prompt/ ./internal/pricing/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/internal/prompt/ server/internal/pricing/
git commit -m "feat: image-edit prompt template and pricing package"
```

---

### Task 3: openai.EditImage

**Files:**
- Modify: `server/internal/openai/client.go`
- Test: `server/internal/openai/client_test.go` (append)

**Interfaces:**
- Consumes: existing `do()` helper (generic method/path/contentType/makeBody, 429/5xx retry).
- Produces (Task 4 consumes): `openai.ImageEditRequest{Model, FileID, Prompt, Size, Quality, InputFidelity string}`; `openai.ImageEditResult{PNG []byte; InputTokens, OutputTokens int64}`; `(c *Client) EditImage(ctx, req ImageEditRequest) (ImageEditResult, error)` — JSON POST `/v1/images/edits` with body `{"model","image":[{"file_id":...}],"prompt","size","quality","input_fidelity","output_format":"png","n":1}`; decodes `data[0].b64_json`; empty data → error "openai: empty images response" (plain errors.New — no %w-nil, M3 lesson).

- [ ] **Step 1: Append failing tests**

Append to `server/internal/openai/client_test.go`:

```go
func TestEditImage(t *testing.T) {
	png := []byte("\x89PNG fake image bytes")
	b64 := base64.StdEncoding.EncodeToString(png)
	var gotBody map[string]any
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/edits" || r.Method != http.MethodPost {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("content type: %q", ct)
		}
		json.NewDecoder(r.Body).Decode(&gotBody)
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1200,"output_tokens":4800}}`, b64)
	})
	res, err := c.EditImage(context.Background(), ImageEditRequest{
		Model: "gpt-image-2", FileID: "file-abc", Prompt: "p", Size: "816x1104", Quality: "low", InputFidelity: "high",
	})
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(res.PNG, png) || res.InputTokens != 1200 || res.OutputTokens != 4800 {
		t.Fatalf("result: tokens=%d/%d pngLen=%d", res.InputTokens, res.OutputTokens, len(res.PNG))
	}
	img := gotBody["image"].([]any)[0].(map[string]any)
	if img["file_id"] != "file-abc" || gotBody["output_format"] != "png" || gotBody["n"] != float64(1) ||
		gotBody["quality"] != "low" || gotBody["size"] != "816x1104" || gotBody["input_fidelity"] != "high" {
		t.Fatalf("body: %v", gotBody)
	}
}

func TestEditImageEmptyData(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":[],"usage":{"input_tokens":0,"output_tokens":0}}`))
	})
	_, err := c.EditImage(context.Background(), ImageEditRequest{Model: "m", FileID: "f", Prompt: "p", Size: "s", Quality: "low", InputFidelity: "high"})
	if err == nil || !strings.Contains(err.Error(), "empty images response") {
		t.Fatalf("err = %v", err)
	}
}

func TestEditImageAPIError(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_77")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"image_generation_user_error: reference image rejected"}}`))
	})
	_, err := c.EditImage(context.Background(), ImageEditRequest{Model: "m", FileID: "f", Prompt: "p", Size: "s", Quality: "low", InputFidelity: "high"})
	if err == nil || !strings.Contains(err.Error(), "image_generation_user_error") || !strings.Contains(err.Error(), "req_77") {
		t.Fatalf("err = %v", err)
	}
}
```

Add imports `"base64" → "encoding/base64"`, `"bytes"`, `"encoding/json"`, `"fmt"` to the test file as needed.

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/openai/`
Expected: FAIL — `undefined: ImageEditRequest`

- [ ] **Step 3: Implement**

Append to `server/internal/openai/client.go`:

```go
type ImageEditRequest struct {
	Model         string
	FileID        string
	Prompt        string
	Size          string
	Quality       string
	InputFidelity string
}

type ImageEditResult struct {
	PNG          []byte
	InputTokens  int64
	OutputTokens int64
}

// EditImage calls POST /v1/images/edits referencing an uploaded template
// by file_id (PRD §7.3/§8.3 body shape) and decodes the b64 PNG.
func (c *Client) EditImage(ctx context.Context, req ImageEditRequest) (ImageEditResult, error) {
	body := map[string]any{
		"model":          req.Model,
		"image":          []map[string]string{{"file_id": req.FileID}},
		"prompt":         req.Prompt,
		"size":           req.Size,
		"quality":        req.Quality,
		"input_fidelity": req.InputFidelity,
		"output_format":  "png",
		"n":              1,
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return ImageEditResult{}, err
	}
	data, err := c.do(ctx, http.MethodPost, "/v1/images/edits", "application/json",
		func() (io.Reader, error) { return bytes.NewReader(payload), nil })
	if err != nil {
		return ImageEditResult{}, err
	}
	var out struct {
		Data []struct {
			B64JSON string `json:"b64_json"`
		} `json:"data"`
		Usage struct {
			InputTokens  int64 `json:"input_tokens"`
			OutputTokens int64 `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return ImageEditResult{}, fmt.Errorf("openai: bad images response: %w", err)
	}
	if len(out.Data) == 0 || out.Data[0].B64JSON == "" {
		return ImageEditResult{}, errors.New("openai: empty images response")
	}
	png, err := base64.StdEncoding.DecodeString(out.Data[0].B64JSON)
	if err != nil {
		return ImageEditResult{}, fmt.Errorf("openai: bad image base64: %w", err)
	}
	return ImageEditResult{PNG: png, InputTokens: out.Usage.InputTokens, OutputTokens: out.Usage.OutputTokens}, nil
}
```

Add `"encoding/base64"` to client.go imports.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./internal/openai/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/internal/openai/
git commit -m "feat: openai images/edits call with file_id reference"
```

---

### Task 4: Generations API — async generate, poll, preview, image serving

**Files:**
- Create: `server/internal/api/generations.go`
- Modify: `server/internal/api/router.go` (routes)
- Test: `server/internal/api/generations_test.go`

**Interfaces:**
- Consumes: `store.NewGenerationsStore` (T1), `store.FactionsStore.Get`, `store.CardTypesStore.Get`, `store.SettingsStore.GetAll`, `prompt.ImageEdit` + `pricing` (T2), `openai.EditImage` (T3), `resolveOpenAIKey`/`openAIBaseURL` (M3), `writeJSON`/`writeError`/`idParam`.
- Produces (Task 5 consumes):
  - `POST /api/generate` `{faction_id, card_type_id, mode, prompt_override?}` → 201 Generation (pending); 400 bad mode/JSON; 404 faction or card type missing; 409 `{"error":"card type has no OpenAI file — upload it first"}`.
  - `GET /api/generations/{id}` → 200 Generation (poll target); 404.
  - `GET /api/generations` → 200 `[]Generation` (newest first).
  - `GET /api/generations/{id}/image` → 200 image/png; 404 while not done.
  - `GET /api/generate/preview?faction_id=&card_type_id=` → 200 `{prompt, has_file, est_draft_usd, est_final_usd}`; 404 either missing. Estimates use `pricing.EstimatePerImage(draft_quality setting)` / `(final_quality setting)`.
- Goroutine: 180 s timeout, settings read once, model/size/fidelity from settings, quality by mode; on success writes PNG to `<dataDir>/generated/gen-<id>.png` then `MarkDone` with pricing cost + wall-clock duration; on error `MarkFailed(err.Error())`.

- [ ] **Step 1: Write failing tests**

`server/internal/api/generations_test.go`:

```go
package api

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// setupGenFixtures creates a faction and a card type WITH an openai file id
// via the API, returning their ids.
func setupGenFixtures(t *testing.T, h http.Handler) (int64, int64) {
	t.Helper()
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau","description":"blue-grey plating","dlc":"Galaxy in Flames","source":"manual"}`)
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "warriors", "constraints": "fill crimson zone"}, "a.png", pngBytes)
	ctID := int64(ct["id"].(float64))

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"id":"file-gen-test"}`))
	}))
	t.Cleanup(fake.Close)
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	t.Cleanup(func() { openAIBaseURL = old })
	rec, _ := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", ctID), "")
	if rec.Code != 200 {
		t.Fatalf("fixture upload: %d", rec.Code)
	}
	return int64(f["id"].(float64)), ctID
}

func pollGeneration(t *testing.T, h http.Handler, id int64) map[string]any {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		rec, out := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/generations/%d", id), "")
		if rec.Code != 200 {
			t.Fatalf("poll: %d", rec.Code)
		}
		if out["status"] != "pending" {
			return out
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("generation never finished")
	return nil
}

func TestGenerateHappyPath(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)

	png := []byte("\x89PNG generated image")
	b64 := base64.StdEncoding.EncodeToString(png)
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/images/edits" {
			t.Errorf("path: %s", r.URL.Path)
		}
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if body["quality"] != "low" { // draft mode → draft_quality default 'low'
			t.Errorf("quality: %v", body["quality"])
		}
		img := body["image"].([]any)[0].(map[string]any)
		if img["file_id"] != "file-gen-test" {
			t.Errorf("file_id: %v", img["file_id"])
		}
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1200,"output_tokens":4800}}`, b64)
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	rec, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ctid))
	if rec.Code != http.StatusCreated || out["status"] != "pending" {
		t.Fatalf("start: %d %v", rec.Code, out)
	}
	if p, _ := out["prompt"].(string); !strings.Contains(p, "fill crimson zone") || !strings.Contains(p, "blue-grey plating") {
		t.Fatalf("assembled prompt: %q", p)
	}

	id := int64(out["id"].(float64))
	done := pollGeneration(t, h, id)
	if done["status"] != "done" {
		t.Fatalf("final: %v", done)
	}
	// cost: 1200/1M*10 + 4800/1M*40 = 0.204 (seeded price table)
	if c := done["cost_usd"].(float64); c < 0.2039 || c > 0.2041 {
		t.Fatalf("cost: %v", c)
	}
	if done["duration_ms"].(float64) < 0 || done["image_path"] == "" {
		t.Fatalf("meta: %v", done)
	}

	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/generations/%d/image", id), nil))
	if rec2.Code != 200 || !strings.HasPrefix(rec2.Body.String(), "\x89PNG") {
		t.Fatalf("image: %d", rec2.Code)
	}
}

func TestGeneratePromptOverride(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)
	var sentPrompt string
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		sentPrompt, _ = body["prompt"].(string)
		b64 := base64.StdEncoding.EncodeToString([]byte("png"))
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1,"output_tokens":1}}`, b64)
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	_, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"final","prompt_override":"my custom prompt"}`, fid, ctid))
	if out["prompt"] != "my custom prompt" {
		t.Fatalf("stored prompt: %v", out["prompt"])
	}
	pollGeneration(t, h, int64(out["id"].(float64)))
	if sentPrompt != "my custom prompt" {
		t.Fatalf("sent prompt: %q", sentPrompt)
	}
}

func TestGenerateFailurePath(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_f")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"image_generation_user_error"}}`))
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	_, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ctid))
	id := int64(out["id"].(float64))
	failed := pollGeneration(t, h, id)
	if failed["status"] != "failed" || !strings.Contains(failed["error"].(string), "image_generation_user_error") {
		t.Fatalf("failed: %v", failed)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/generations/%d/image", id), nil))
	if rec.Code != http.StatusNotFound {
		t.Fatalf("image of failed: %d", rec.Code)
	}
}

func TestGenerateValidation(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)

	rec, _ := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"turbo"}`, fid, ctid))
	if rec.Code != 400 {
		t.Fatalf("bad mode: %d", rec.Code)
	}
	rec, _ = doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":999,"card_type_id":%d,"mode":"draft"}`, ctid))
	if rec.Code != 404 {
		t.Fatalf("missing faction: %d", rec.Code)
	}

	// card type without file id → 409
	_, ct2 := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "nofile", "description": "", "constraints": ""}, "", nil)
	rec, out := doJSON(t, h, http.MethodPost, "/api/generate",
		fmt.Sprintf(`{"faction_id":%d,"card_type_id":%v,"mode":"draft"}`, fid, int64(ct2["id"].(float64))))
	if rec.Code != http.StatusConflict || !strings.Contains(out["error"].(string), "no OpenAI file") {
		t.Fatalf("no file: %d %v", rec.Code, out)
	}
}

func TestGeneratePreview(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)

	rec, out := doJSON(t, h, http.MethodGet,
		fmt.Sprintf("/api/generate/preview?faction_id=%d&card_type_id=%d", fid, ctid), "")
	if rec.Code != 200 {
		t.Fatalf("preview: %d %v", rec.Code, out)
	}
	if p, _ := out["prompt"].(string); !strings.Contains(p, "fill crimson zone") {
		t.Fatalf("prompt: %v", out["prompt"])
	}
	if out["has_file"] != true || out["est_draft_usd"].(float64) != 0.01 || out["est_final_usd"].(float64) != 0.19 {
		t.Fatalf("preview meta: %v", out)
	}

	rec, _ = doJSON(t, h, http.MethodGet, "/api/generate/preview?faction_id=999&card_type_id=1", "")
	if rec.Code != 404 {
		t.Fatalf("missing faction preview: %d", rec.Code)
	}
}

func TestGenerationsList(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	fid, ctid := setupGenFixtures(t, h)
	b64 := base64.StdEncoding.EncodeToString([]byte("png"))
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprintf(w, `{"data":[{"b64_json":%q}],"usage":{"input_tokens":1,"output_tokens":1}}`, b64)
	}))
	defer fake.Close()
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = old }()

	_, g1 := doJSON(t, h, http.MethodPost, "/api/generate", fmt.Sprintf(`{"faction_id":%d,"card_type_id":%d,"mode":"draft"}`, fid, ctid))
	pollGeneration(t, h, int64(g1["id"].(float64)))
	rec, _ := doJSON(t, h, http.MethodGet, "/api/generations", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != 200 || len(list) != 1 || list[0]["status"] != "done" {
		t.Fatalf("list: %d %v", rec.Code, list)
	}
	// saved file exists under dataDir (indirect check: image endpoint 200)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, httptest.NewRequest(http.MethodGet,
		fmt.Sprintf("/api/generations/%v/image", int64(g1["id"].(float64))), nil))
	if rec2.Code != 200 {
		t.Fatalf("image after list: %d", rec2.Code)
	}
	_ = os.PathSeparator
	_ = filepath.Join
}
```

(Delete the trailing `_ =` lines if the imports end up used elsewhere; keep imports tidy.)

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/api/`
Expected: FAIL — 404s on new routes

- [ ] **Step 3: Implement**

`server/internal/api/generations.go`:

```go
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
```

In `server/internal/api/router.go`, append inside the `db != nil` block:

```go
			gens := &GenerationsHandler{
				Gens:      store.NewGenerationsStore(db),
				Factions:  store.NewFactionsStore(db),
				CardTypes: store.NewCardTypesStore(db),
				Settings:  store.NewSettingsStore(db),
				DataDir:   dataDir,
			}
			r.Post("/generate", gens.Generate)
			r.Get("/generate/preview", gens.Preview)
			r.Get("/generations", gens.List)
			r.Get("/generations/{id}", gens.Get)
			r.Get("/generations/{id}/image", gens.ServeImage)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat: async generation API with polling, preview, and image serving"
```

---

### Task 5: Test-generation data layer

**Files:**
- Create: `web/src/pages/test-generation/api.ts`, `web/src/pages/test-generation/store.ts`
- Test: `web/src/pages/test-generation/api.test.tsx`

**Interfaces:**
- Consumes: `apiGet`/`apiSend` (existing), backend endpoints (Task 4), `useFactions` (M2 factions api), `useCardTypes` (M3 card-types api) — reused for select options and history name lookup.
- Produces (Task 6 consumes):
  - `api.ts`: `Generation {id:number; faction_id:number; card_type_id:number; mode:'draft'|'final'; prompt:string; status:'pending'|'done'|'failed'; image_path:string; input_tokens:number; output_tokens:number; cost_usd:number; duration_ms:number; error:string; created_at:string}`; `Preview {prompt:string; has_file:boolean; est_draft_usd:number; est_final_usd:number}`; `useGenerations()` (key `['generations']`); `useGeneration(id: number | null, intervalMs = 2000)` — polls while status pending, stops at terminal, disabled when null (mirror of M2 `useJob`); `usePreview(factionId: number | null, cardTypeId: number | null)` (key `['generate-preview', factionId, cardTypeId]`, enabled when both non-null); `startGeneration(body: {faction_id:number; card_type_id:number; mode:'draft'|'final'; prompt_override?:string}): Promise<Generation>`; `generationImageUrl(g: Generation): string | null` (null unless done; `/api/generations/${id}/image`); `formatCost(usd:number): string` ("$0.012" — 3 decimals under $0.10, else 2); `formatDuration(ms:number): string` ("43s" / "2m 14s").
  - `store.ts`: `useTestGenUi` zustand store `{factionId:number|null; cardTypeId:number|null; mode:'draft'|'final'; editingPrompt:boolean; promptOverride:string; activeGenerationId:number|null; expandedId:number|null}` + `set(partial)`. Plain memory (no persistence).

- [ ] **Step 1: Write failing tests**

`web/src/pages/test-generation/api.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../test/msw'
import { useGeneration, generationImageUrl, formatCost, formatDuration, type Generation } from './api'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const base: Generation = {
  id: 7, faction_id: 1, card_type_id: 2, mode: 'draft', prompt: 'p', status: 'done',
  image_path: 'generated/gen-7.png', input_tokens: 100, output_tokens: 400,
  cost_usd: 0.012, duration_ms: 43000, error: '', created_at: '2026-07-18',
}

test('useGeneration polls until terminal', async () => {
  let calls = 0
  server.use(
    http.get('/api/generations/7', () => {
      calls++
      return HttpResponse.json(calls < 3 ? { ...base, status: 'pending', image_path: '' } : base)
    }),
  )
  const { result } = renderHook(() => useGeneration(7, 50), { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe('done'))
  expect(calls).toBeGreaterThanOrEqual(3)
})

test('useGeneration disabled when null', () => {
  const { result } = renderHook(() => useGeneration(null), { wrapper })
  expect(result.current.fetchStatus).toBe('idle')
})

test('generationImageUrl only for done', () => {
  expect(generationImageUrl(base)).toBe('/api/generations/7/image')
  expect(generationImageUrl({ ...base, status: 'pending' })).toBeNull()
  expect(generationImageUrl({ ...base, status: 'failed' })).toBeNull()
})

test('formatCost and formatDuration', () => {
  expect(formatCost(0.012)).toBe('$0.012')
  expect(formatCost(0.19)).toBe('$0.19')
  expect(formatCost(1.5)).toBe('$1.50')
  expect(formatDuration(43000)).toBe('43s')
  expect(formatDuration(134000)).toBe('2m 14s')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/test-generation/`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/pages/test-generation/api.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'

export type Generation = {
  id: number
  faction_id: number
  card_type_id: number
  mode: 'draft' | 'final'
  prompt: string
  status: 'pending' | 'done' | 'failed'
  image_path: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number
  error: string
  created_at: string
}

export type Preview = {
  prompt: string
  has_file: boolean
  est_draft_usd: number
  est_final_usd: number
}

export function useGenerations() {
  return useQuery({ queryKey: ['generations'], queryFn: () => apiGet<Generation[]>('/api/generations') })
}

export function useGeneration(id: number | null, intervalMs = 2000) {
  return useQuery({
    queryKey: ['generations', id],
    queryFn: () => apiGet<Generation>(`/api/generations/${id}`),
    enabled: id !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'done' || s === 'failed' ? false : intervalMs
    },
  })
}

export function usePreview(factionId: number | null, cardTypeId: number | null) {
  return useQuery({
    queryKey: ['generate-preview', factionId, cardTypeId],
    queryFn: () => apiGet<Preview>(`/api/generate/preview?faction_id=${factionId}&card_type_id=${cardTypeId}`),
    enabled: factionId !== null && cardTypeId !== null,
  })
}

export function startGeneration(body: {
  faction_id: number
  card_type_id: number
  mode: 'draft' | 'final'
  prompt_override?: string
}): Promise<Generation> {
  return apiSend<Generation>('POST', '/api/generate', body)
}

export function generationImageUrl(g: Generation): string | null {
  if (g.status !== 'done') return null
  return `/api/generations/${g.id}/image`
}

export function formatCost(usd: number): string {
  return usd < 0.1 ? `$${usd.toFixed(3)}` : `$${usd.toFixed(2)}`
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`
}
```

`web/src/pages/test-generation/store.ts`:

```ts
import { create } from 'zustand'

type TestGenUiState = {
  factionId: number | null
  cardTypeId: number | null
  mode: 'draft' | 'final'
  editingPrompt: boolean
  promptOverride: string
  activeGenerationId: number | null
  expandedId: number | null
  set: (partial: Partial<Omit<TestGenUiState, 'set'>>) => void
}

export const useTestGenUi = create<TestGenUiState>()((set) => ({
  factionId: null,
  cardTypeId: null,
  mode: 'draft',
  editingPrompt: false,
  promptOverride: '',
  activeGenerationId: null,
  expandedId: null,
  set: (partial) => set(partial),
}))
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/test-generation/
git commit -m "feat: test-generation data layer with generation polling"
```

---

### Task 6: Test Generation page — setup panel + history

**Files:**
- Create: `web/src/pages/test-generation/TestGenerationPage.tsx`, `web/src/pages/test-generation/GenerationSetup.tsx`, `web/src/pages/test-generation/HistoryRow.tsx`
- Modify: `web/src/App.tsx` (route `/test-generation` → `<TestGenerationPage />`), `web/src/components/Sidebar.test.tsx` (add `/api/generations` etc. MSW handlers if route render needs them)
- Test: `web/src/pages/test-generation/TestGenerationPage.test.tsx`

**Interfaces:**
- Consumes: everything from Task 5; `useFactions` from `../factions/api`, `useCardTypes` from `../card-types/api`; `Button`/`Field`/`selectClass` (M1 Field.tsx exports `selectClass`), `Tag` (M2); react-router `Link`.
- Produces: working Test Generation section.
  - `GenerationSetup`: faction select + card-type select (labeled via Field; card types without file id get label suffix " (no file uploaded)"); inline warning banner with `<Link to="/card-types">` when the selected card type lacks a file; Draft/Final segmented control + "est. {cost} per image (estimate)" from preview; prompt preview (read-only mono pre-wrap) with "Edit prompt" toggle → textarea bound to `promptOverride` (toggling ON seeds override with current preview prompt; toggling OFF discards); Generate button — disabled when selection incomplete, `!preview?.has_file`, or a generation is pending; on click `startGeneration` (with `prompt_override` only when `editingPrompt`), sets `activeGenerationId`; polls via `useGeneration`; on done → invalidate `['generations']`, clear active id; on failed → role=alert with the generation's error, clear active id; poll `isError` → role=alert + clear active id (M2 lesson).
  - `HistoryRow`: collapsed — 42px thumbnail (img when done), "{faction} × {cardType}" names, mode Tag (draft=neutral, final=solid-accent), "{created_at} · {formatDuration} · {formatCost}" caption, failed rows show error text; expanded (click toggles via `expandedId`) — large image (max ~300px), prompt in mono block, Download PNG link (`<a href={imageUrl} download>`).
  - `TestGenerationPage`: heading, `<GenerationSetup />`, History section listing `useGenerations` rows with a session total line "Total: {formatCost(sum of done rows' cost_usd)}".

- [ ] **Step 1: Write failing tests**

`web/src/pages/test-generation/TestGenerationPage.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/msw'
import { useTestGenUi } from './store'
import type { Generation } from './api'
import TestGenerationPage from './TestGenerationPage'

const factions = [
  { id: 1, name: 'Tau Empire', description: 'blue-grey', dlc: 'Galaxy in Flames', created_at: 'a', updated_at: 'b' },
]
const cardTypes = [
  { id: 1, name: 'combat', description: 'warriors', constraints: 'crimson', template_path: 't.png', openai_file_id: 'file-1', created_at: 'a', updated_at: 'b' },
  { id: 2, name: 'upgrade', description: '', constraints: '', template_path: '', openai_file_id: '', created_at: 'a', updated_at: 'b' },
]
const doneGen: Generation = {
  id: 9, faction_id: 1, card_type_id: 1, mode: 'final', prompt: 'stored prompt', status: 'done',
  image_path: 'generated/gen-9.png', input_tokens: 100, output_tokens: 400,
  cost_usd: 0.19, duration_ms: 78000, error: '', created_at: 'Jul 18',
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TestGenerationPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useTestGenUi.setState({ factionId: null, cardTypeId: null, mode: 'draft', editingPrompt: false, promptOverride: '', activeGenerationId: null, expandedId: null })
  server.use(
    http.get('/api/factions', () => HttpResponse.json(factions)),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
    http.get('/api/generations', () => HttpResponse.json([doneGen])),
    http.get('/api/generate/preview', ({ request }) => {
      const url = new URL(request.url)
      const hasFile = url.searchParams.get('card_type_id') === '1'
      return HttpResponse.json({ prompt: 'assembled prompt text', has_file: hasFile, est_draft_usd: 0.01, est_final_usd: 0.19 })
    }),
  )
})

async function selectPair(cardType = 'combat') {
  await userEvent.selectOptions(await screen.findByLabelText('Faction'), '1')
  const ctSelect = screen.getByLabelText('Card Type')
  const option = within(ctSelect).getByRole('option', { name: new RegExp(cardType) })
  await userEvent.selectOptions(ctSelect, (option as HTMLOptionElement).value)
}

test('history renders with cost, duration, mode badge, and session total', async () => {
  renderPage()
  expect(await screen.findByText(/Tau Empire/)).toBeInTheDocument()
  expect(screen.getByText(/\$0\.19/)).toBeInTheDocument()
  expect(screen.getByText(/1m 18s/)).toBeInTheDocument()
  expect(screen.getByText('final')).toBeInTheDocument()
  expect(screen.getByText(/Total: \$0\.19/)).toBeInTheDocument()
})

test('prompt preview loads for a valid pair; generate enabled', async () => {
  renderPage()
  await selectPair()
  expect(await screen.findByText('assembled prompt text')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled()
  expect(screen.getByText(/est\. \$0\.01 per image/)).toBeInTheDocument()
})

test('card type without file shows warning and disables generate', async () => {
  renderPage()
  await selectPair('upgrade')
  expect(await screen.findByText(/no OpenAI file/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Card Types/ })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled()
})

test('generate posts, polls to done, and clears pending state', async () => {
  let posted: Record<string, unknown> | null = null
  let polls = 0
  server.use(
    http.post('/api/generate', async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...doneGen, id: 10, status: 'pending', image_path: '' }, { status: 201 })
    }),
    http.get('/api/generations/10', () => {
      polls++
      return HttpResponse.json(polls < 2 ? { ...doneGen, id: 10, status: 'pending', image_path: '' } : { ...doneGen, id: 10 })
    }),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByText(/Generating/)).toBeInTheDocument()
  await screen.findByRole('button', { name: 'Generate' }, { timeout: 5000 })
  expect(posted).toMatchObject({ faction_id: 1, card_type_id: 1, mode: 'draft' })
  expect(posted).not.toHaveProperty('prompt_override')
})

test('edit prompt override is sent when toggled', async () => {
  let posted: Record<string, unknown> | null = null
  server.use(
    http.post('/api/generate', async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...doneGen, id: 11 }, { status: 201 })
    }),
    http.get('/api/generations/11', () => HttpResponse.json({ ...doneGen, id: 11 })),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  await userEvent.click(screen.getByRole('button', { name: 'Edit prompt' }))
  const ta = screen.getByLabelText('Prompt override')
  await userEvent.clear(ta)
  await userEvent.type(ta, 'my custom')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  const sent = posted as Record<string, unknown> | null
  expect(sent?.prompt_override).toBe('my custom')
})

test('failed generation shows alert', async () => {
  server.use(
    http.post('/api/generate', () => HttpResponse.json({ ...doneGen, id: 12, status: 'pending', image_path: '' }, { status: 201 })),
    http.get('/api/generations/12', () => HttpResponse.json({ ...doneGen, id: 12, status: 'failed', image_path: '', error: 'openai: boom (request id r)' })),
  )
  renderPage()
  await selectPair()
  await screen.findByText('assembled prompt text')
  await userEvent.click(screen.getByRole('button', { name: 'Generate' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/boom/)
})

test('expanding a history row shows prompt and download link', async () => {
  renderPage()
  await screen.findByText(/Tau Empire/)
  await userEvent.click(screen.getByText(/Tau Empire/))
  expect(await screen.findByText('stored prompt')).toBeInTheDocument()
  const dl = screen.getByRole('link', { name: /Download PNG/ })
  expect(dl).toHaveAttribute('href', '/api/generations/9/image')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/test-generation/TestGenerationPage.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/pages/test-generation/GenerationSetup.tsx` (target ≤150 lines):

```tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field, selectClass, inputClass } from '../../components/Field'
import { useFactions } from '../factions/api'
import { useCardTypes } from '../card-types/api'
import { formatCost, startGeneration, useGeneration, usePreview } from './api'
import { useTestGenUi } from './store'

export function GenerationSetup({ intervalMs = 2000 }: { intervalMs?: number }) {
  const ui = useTestGenUi()
  const { data: factions } = useFactions()
  const { data: cardTypes } = useCardTypes()
  const preview = usePreview(ui.factionId, ui.cardTypeId)
  const gen = useGeneration(ui.activeGenerationId, intervalMs)
  const [genError, setGenError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const queryClient = useQueryClient()

  const pending = ui.activeGenerationId !== null && (gen.data === undefined || gen.data.status === 'pending')

  useEffect(() => {
    const g = gen.data
    if (!g || g.status === 'pending') return
    if (useTestGenUi.getState().activeGenerationId !== g.id) return
    queryClient.invalidateQueries({ queryKey: ['generations'] })
    useTestGenUi.getState().set({ activeGenerationId: null })
    if (g.status === 'failed') setGenError(g.error || 'generation failed')
  }, [gen.data, queryClient])

  useEffect(() => {
    if (!ui.activeGenerationId || !gen.isError) return
    useTestGenUi.getState().set({ activeGenerationId: null })
    setGenError(`failed to check generation status: ${gen.error instanceof Error ? gen.error.message : 'unknown'}`)
  }, [gen.isError, gen.error, ui.activeGenerationId])

  async function onGenerate() {
    if (starting || ui.factionId === null || ui.cardTypeId === null) return
    setStarting(true)
    setGenError(null)
    try {
      const body: Parameters<typeof startGeneration>[0] = {
        faction_id: ui.factionId, card_type_id: ui.cardTypeId, mode: ui.mode,
      }
      if (ui.editingPrompt && ui.promptOverride.trim()) body.prompt_override = ui.promptOverride
      const g = await startGeneration(body)
      ui.set({ activeGenerationId: g.id })
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'failed to start generation')
    } finally {
      setStarting(false)
    }
  }

  const estimate = preview.data ? (ui.mode === 'draft' ? preview.data.est_draft_usd : preview.data.est_final_usd) : null
  const canGenerate = ui.factionId !== null && ui.cardTypeId !== null && preview.data?.has_file === true && !pending && !starting

  return (
    <div className="flex flex-col gap-3.5 rounded-md bg-surface p-4 shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Faction">
          {(id) => (
            <select id={id} className={selectClass} value={ui.factionId ?? ''}
              onChange={(e) => ui.set({ factionId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Select…</option>
              {factions?.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Card Type">
          {(id) => (
            <select id={id} className={selectClass} value={ui.cardTypeId ?? ''}
              onChange={(e) => ui.set({ cardTypeId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Select…</option>
              {cardTypes?.map((c) => (
                <option key={c.id} value={c.id}>{c.openai_file_id ? c.name : `${c.name} (no file uploaded)`}</option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {preview.data && !preview.data.has_file && (
        <p className="m-0 flex items-center justify-between gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
          <span>This card type has no OpenAI file uploaded yet.</span>
          <Link to="/card-types" className="whitespace-nowrap text-warn underline underline-offset-2">Go to Card Types →</Link>
        </p>
      )}

      <div>
        <span className="mb-1 block text-xs text-ink/70">Mode</span>
        <div className="flex items-center gap-3">
          <div className="inline-flex overflow-hidden rounded-md border border-divider" role="group" aria-label="Mode">
            {(['draft', 'final'] as const).map((m, i) => (
              <button key={m} type="button" onClick={() => ui.set({ mode: m })}
                className={`px-3.5 py-1.5 text-[13px] capitalize cursor-pointer bg-transparent border-0 ${i > 0 ? 'border-l border-divider' : ''} ${ui.mode === m ? 'text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-ink'}`}>
                {m}
              </button>
            ))}
          </div>
          {estimate !== null && <span className="text-xs text-ink/50">est. {formatCost(estimate)} per image (estimate)</span>}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <label htmlFor="tg-prompt" className="text-xs text-ink/70">{ui.editingPrompt ? 'Prompt override' : 'Prompt preview'}</label>
          <button type="button"
            onClick={() => ui.set(ui.editingPrompt ? { editingPrompt: false, promptOverride: '' } : { editingPrompt: true, promptOverride: preview.data?.prompt ?? '' })}
            className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent">
            {ui.editingPrompt ? 'Use assembled prompt' : 'Edit prompt'}
          </button>
        </div>
        {ui.editingPrompt ? (
          <textarea id="tg-prompt" aria-label="Prompt override" value={ui.promptOverride}
            onChange={(e) => ui.set({ promptOverride: e.target.value })}
            className={`${inputClass} min-h-36 resize-y font-mono text-[12.5px] leading-normal`} />
        ) : (
          <div id="tg-prompt" className="min-h-36 whitespace-pre-wrap rounded-md border border-divider bg-bg px-2.5 py-2 font-mono text-[12.5px] leading-normal text-ink/75">
            {preview.data?.prompt ?? (ui.factionId && ui.cardTypeId ? 'Loading…' : 'Select a faction and card type')}
          </div>
        )}
      </div>

      {genError && <p role="alert" className="m-0 text-sm text-danger">{genError}</p>}

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!canGenerate} onClick={onGenerate}>
          {pending || starting ? 'Generating…' : 'Generate'}
        </Button>
        <span className="text-xs text-ink/45">
          {pending ? 'can take up to ~2 minutes' : `${ui.mode === 'draft' ? 'Draft' : 'Final'} quality · same size both modes`}
        </span>
      </div>
    </div>
  )
}
```

`web/src/pages/test-generation/HistoryRow.tsx`:

```tsx
import { Tag } from '../../components/Tag'
import { formatCost, formatDuration, generationImageUrl, type Generation } from './api'
import { useTestGenUi } from './store'

export function HistoryRow({ gen, factionName, cardTypeName }: { gen: Generation; factionName: string; cardTypeName: string }) {
  const expanded = useTestGenUi((s) => s.expandedId === gen.id)
  const imageUrl = generationImageUrl(gen)

  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <button type="button"
        onClick={() => useTestGenUi.getState().set({ expandedId: expanded ? null : gen.id })}
        className="flex w-full cursor-pointer items-center gap-3.5 border-0 bg-transparent px-3.5 py-3 text-left text-ink">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-14 w-10 flex-none rounded object-cover" />
        ) : (
          <div className="h-14 w-10 flex-none rounded bg-neutral-800" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{factionName} <span className="font-normal text-ink/40">×</span> {cardTypeName}</span>
            <Tag variant={gen.mode === 'final' ? 'solid-accent' : 'neutral'}>{gen.mode}</Tag>
          </div>
          <div className="mt-0.5 text-xs text-ink/50">
            {gen.created_at} · {formatDuration(gen.duration_ms)} · {formatCost(gen.cost_usd)}
          </div>
          {gen.status === 'failed' && <div className="mt-0.5 text-xs text-danger">{gen.error}</div>}
        </div>
      </button>
      {expanded && (
        <div className="flex gap-4 px-3.5 pb-4">
          {imageUrl && <img src={imageUrl} alt="Generated card" className="max-h-72 rounded" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-ink/10 bg-bg p-2.5 font-mono text-xs leading-normal text-ink/70">
              {gen.prompt}
            </div>
            {imageUrl && (
              <a href={imageUrl} download={`gen-${gen.id}.png`}
                className="self-start rounded-md border border-divider px-3 py-1.5 text-[13px] font-medium text-ink no-underline hover:bg-ink/5">
                Download PNG
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

`web/src/pages/test-generation/TestGenerationPage.tsx`:

```tsx
import { useCardTypes } from '../card-types/api'
import { useFactions } from '../factions/api'
import { formatCost, useGenerations } from './api'
import { GenerationSetup } from './GenerationSetup'
import { HistoryRow } from './HistoryRow'

export default function TestGenerationPage() {
  const { data: gens, isLoading, error } = useGenerations()
  const { data: factions } = useFactions()
  const { data: cardTypes } = useCardTypes()

  const total = (gens ?? []).filter((g) => g.status === 'done').reduce((sum, g) => sum + g.cost_usd, 0)
  const factionName = (id: number) => factions?.find((f) => f.id === id)?.name ?? '—'
  const cardTypeName = (id: number) => cardTypes?.find((c) => c.id === id)?.name ?? '—'

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <div>
        <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Test Generation</h1>
        <p className="m-0 text-sm text-ink/60">Generate one card interactively before committing to a batch</p>
      </div>

      <GenerationSetup />

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="m-0 text-xl font-medium">History</h2>
          <span className="text-sm text-ink/60">Total: {formatCost(total)}</span>
        </div>
        {isLoading && <p className="text-ink/60">Loading…</p>}
        {error && <p role="alert" className="text-danger">Failed to load history: {error instanceof Error ? error.message : 'unknown'}</p>}
        <div className="flex flex-col gap-2">
          {gens?.map((g) => (
            <HistoryRow key={g.id} gen={g} factionName={factionName(g.faction_id)} cardTypeName={cardTypeName(g.card_type_id)} />
          ))}
          {gens && gens.length === 0 && <p className="m-0 text-sm text-ink/50">No generations yet.</p>}
        </div>
      </div>
    </div>
  )
}
```

In `web/src/App.tsx`: import and swap `{ path: '/test-generation', element: <TestGenerationPage /> }`. If Sidebar.test hits unhandled requests after the swap, add `http.get('/api/generations', () => HttpResponse.json([]))` (+ preview/factions/card-types handlers as needed — same M2/M3 precedent).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run && npm run build`
Expected: PASS + clean build

- [ ] **Step 5: Commit**

```bash
git add web/src/
git commit -m "feat: test generation page with setup panel, polling, and history"
```

---

### Task 7: End-to-end verification (Playwright)

**Files:**
- None created (verification only; fix anything broken found)

- [ ] **Step 1: Full suites**

Run: `make test`
Expected: all green.

- [ ] **Step 2: Live Playwright verification**

Fresh DB/data (`rm -rf /tmp/cardforge-m4.db* /tmp/cardforge-m4-data`), backend (`CARDFORGE_DB=/tmp/cardforge-m4.db CARDFORGE_DATA=/tmp/cardforge-m4-data go run .`) + Vite in background. Seed via UI: create a faction (type a description manually — skip Claude), create a card type with a template PNG. Via Playwright at `/test-generation`:

1. Selects populate; picking the no-file card type (create one without upload-to-openai) shows the warning + link, Generate disabled.
2. With `OPENAI_API_KEY` unset: pick the valid pair — preview prompt renders (assembled from real faction/card-type text), est. cost shows; Generate → poll → failed → role=alert with the key-not-set message. Record it.
   (If a valid key IS present: draft-mode Generate → Generating… → image appears in history with cost + duration caption; verify Download PNG.)
3. Edit prompt toggle: seeds textarea with assembled prompt; "Use assembled prompt" reverts.
4. History: failed row shows error; expandable row shows prompt block; session Total renders.
5. Mode toggle switches estimate (draft vs final values).
6. Screenshot → `.superpowers/sdd/task-7-testgen.png`; console errors check (the intentional failed generation 4xx/alert is expected).

Kill servers; clean temp.

- [ ] **Step 3: Commit (only if fixes were needed)**

Fix + test + commit individually (`fix: …`); otherwise nothing.

---

## Self-review notes

- **Spec coverage (M4, spec §9 milestone 4):** migration 0004 ✔ (T1); prompt §8.2 ✔ (T2); pricing (table parse, cost, labeled estimates) ✔ (T2); images/edits client ✔ (T3); async generate + poll + image endpoints + preview ✔ (T4); polling UI + setup panel + history + session total ✔ (T5-T6); e2e ✔ (T7).
- **PRD §7.3 details:** file-id-less card type warning + link ✔; draft/final same size diff quality ✔ (settings-resolved server-side); per-image est next to toggle ✔; read-only preview + edit toggle one-off override ✔; poll 2 s ✔; done → image+usage+cost+duration before status flip ✔ (single UPDATE); caption "$0.012 · 43s" ✔ (formatCost/formatDuration); history thumbnails/badge/prompt-on-expand/running total ✔.
- **Known deferrals:** batch pricing (50%) → M5; org-verification dedicated message → M6 (PRD §10, noted in M3 review too); generations not linked from faction delete guard (M5 adds batch_items guard).
- **Lessons applied:** poll isError handling (M2); no %w-nil (M3 — checked T3/T4 error paths); labeled inputs; try/catch+alert everywhere; MaxBytesReader N/A (JSON bodies only).
- **Type consistency:** `Generation` json fields match Go tags (T1↔T5); `useGeneration(id, intervalMs)` mirrors M2 signature; `ImageEditRequest/Result` T3↔T4; preview endpoint shape T4↔T5 (`est_draft_usd`/`est_final_usd`/`has_file`); `formatCost` thresholds consistent with test expectations; `selectClass` exists in Field.tsx (M1) ✔.
