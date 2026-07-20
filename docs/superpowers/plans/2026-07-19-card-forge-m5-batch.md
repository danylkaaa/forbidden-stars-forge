# Card Forge — Milestone 5: Batch Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full batch pipeline: build/preview §8.3 JSONL for factions × card types, submit via OpenAI Files + Batches APIs, poll every 60 s with startup resume, download/decode results into per-item PNGs with 50 %-rate costs, and ship the batch UI (list, two-step wizard, detail grid with ZIP export).

**Architecture:** Backend adds migration 0006 (batches + batch_items), a `BatchesStore`, four openai client methods (CreateBatch/GetBatch/CancelBatch/FileContent), an `internal/jsonl` builder (slugify, 1000-line cap), a `batchpoller` package (60 s ticker, in-memory counts cache, completion processing at 50 % price-table rates, startup resume from DB), and the batches API (preview/submit/list/get/cancel/item-image/ZIP) plus delete-guards on factions/card-types (409 when referenced by batch items — the M2 deferral). Frontend uses nested routes `/batches`, `/batches/new`, `/batches/:id` with a wizard store.

**Tech Stack:** Existing stack + Go stdlib `archive/zip`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-15-card-forge-design.md` (§4 batchpoller, §6 Batch Processing). PRD: `docs/prd/PRD-1.md` (§5 schema, §7.4, §8.3, §9, §10, §12).

## Global Constraints

- All API JSON snake_case. Batch statuses exactly PRD §5: `created, submitted, in_progress, completed, failed, cancelled`; item statuses `pending, done, failed`.
- §8.3 JSONL line format verbatim: `{"custom_id": "<faction_slug>__<cardtype_slug>", "method": "POST", "url": "/v1/images/edits", "body": {"model": ..., "image": [{"file_id": ...}], "prompt": ..., "size": ..., "quality": <mode-resolved>, "input_fidelity": ..., "output_format": "png", "n": 1}}`. Slugify: lowercase, non-alphanumeric runs → `_`, trimmed. custom_id unique per batch; one model per batch; hard cap 1,000 lines (clear error above).
- Mode applies to the whole batch: `quality` = `draft_quality` setting for draft, `final_quality` for final; `size` never changes between modes.
- Submit flow (PRD §7.4): save JSONL to `<dataDir>/batches/<id>/requests.jsonl` → upload via Files API `purpose:"batch"` → `POST /v1/batches` `endpoint:"/v1/images/edits"`, `completion_window:"24h"` → store `openai_batch_id`, status `submitted`. Nothing reaches OpenAI before the explicit submit endpoint is called.
- Poller (spec §4): 60 s tick; polls all non-terminal batches; maps OpenAI statuses (`validating/in_progress/finalizing → in_progress`, `completed → completed`, `failed/expired → failed`, `cancelling/cancelled → cancelled`); caches `request_counts` in memory (accessor merged into GET responses); on completion downloads `output_file_id`, parses each line, decodes `b64_json`, saves `<dataDir>/batches/<id>/<custom_id>.png`, extracts per-line usage, computes per-item `cost_usd` at **50 % of price-table rates**, batch `total_cost_usd`, sets `completed_at`; also downloads `error_file_id` if present and marks matching items failed with their error message. Startup resume: any non-terminal batch in DB re-enters polling (PRD §10).
- Delete guards (PRD §7.1, deferred from M2): DELETE faction/card type referenced by any batch_item → 409 `{"error":"referenced by a batch — cannot delete"}`.
- Duration display: batch-level only (`submitted_at → completed_at`); per-item metadata is cost + tokens (PRD §7.4 step 5). Every thumbnail captioned with cost; batch summary shows total cost + duration + actual-vs-estimate.
- Wizard: scope step (factions multi-select grouped by DLC with group/all toggles; card types without `openai_file_id` disabled with warning; Draft/Final selector; live request count) → preview step (prominent mode banner: draft neutral "DRAFT batch — low quality, cheap iteration" / final amber "FINAL BATCH — high quality, real cost"; line count; est cost = count × `pricing.EstimatePerImage(quality)` labeled estimate; scrollable read-only JSONL; explicit "Submit batch to OpenAI" button).
- M1–M4 lessons: labeled inputs; every user-flow await try/catch + role=alert; poll hooks handle isError; no %w-on-nil; MaxBytesReader N/A (JSON only); errors surface message + request id; component files ≤~150 lines (hard cap 200) — SPLIT aggressively, this milestone has the most UI.
- Commit after every task.

---

### Task 1: Migration 0006 + BatchesStore

**Files:**
- Create: `server/internal/store/migrations/0006_batches.up.sql`, `server/internal/store/migrations/0006_batches.down.sql`, `server/internal/store/batches.go`
- Test: `server/internal/store/batches_test.go`

**Interfaces:**
- Consumes: `store.Open`, `ErrNotFound`; `NewFactionsStore`/`NewCardTypesStore` (test fixtures).
- Produces (Tasks 4–5 consume):
  - `store.Batch{ID int64; OpenAIBatchID, Mode, Status, JSONLPath, OutputPath string; TotalCostUSD float64; SubmittedAt, CompletedAt, CreatedAt, UpdatedAt string}` (json `id,openai_batch_id,mode,status,jsonl_path,output_path,total_cost_usd,submitted_at,completed_at,created_at,updated_at`; empty string = null).
  - `store.BatchItem{ID, BatchID, FactionID, CardTypeID int64; CustomID, Status, ImagePath string; InputTokens, OutputTokens int64; CostUSD float64; Error string}` (json `id,batch_id,faction_id,card_type_id,custom_id,status,image_path,input_tokens,output_tokens,cost_usd,error`).
  - `store.NewBatchesStore(db) *BatchesStore` with:
    - `Create(mode, jsonlPath string, items []BatchItemInput) (Batch, error)` where `BatchItemInput{FactionID, CardTypeID int64; CustomID string}` — inserts batch status `created` + all items status `pending` in one tx.
    - `MarkSubmitted(id int64, openaiBatchID string) error` — sets status `submitted`, `submitted_at = datetime('now')`.
    - `SetStatus(id int64, status string) error` (guards: no-op with nil error if current status already terminal `completed/failed/cancelled`).
    - `Complete(id int64, outputPath string, totalCost float64) error` — status `completed`, `output_path`, `total_cost_usd`, `completed_at`, one statement.
    - `Get(id int64) (Batch, error)`; `List() ([]Batch, error)` (id DESC); `Items(batchID int64) ([]BatchItem, error)` (custom_id ASC); `NonTerminal() ([]Batch, error)` (status IN submitted,in_progress — poller resume).
    - `MarkItemDone(batchID int64, customID, imagePath string, inTok, outTok int64, costUSD float64) error`; `MarkItemFailed(batchID int64, customID, errMsg string) error` (both ErrNotFound when no matching row).
    - `FactionReferenced(factionID int64) (bool, error)`; `CardTypeReferenced(cardTypeID int64) (bool, error)`.

- [ ] **Step 1: Write migration files**

`server/internal/store/migrations/0006_batches.up.sql`:

```sql
CREATE TABLE batches (
  id               INTEGER PRIMARY KEY,
  openai_batch_id  TEXT,
  mode             TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft','final')),
  status           TEXT NOT NULL CHECK (status IN ('created','submitted','in_progress','completed','failed','cancelled')),
  jsonl_path       TEXT NOT NULL,
  output_path      TEXT,
  total_cost_usd   REAL,
  submitted_at     TEXT,
  completed_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE batch_items (
  id             INTEGER PRIMARY KEY,
  batch_id       INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  faction_id     INTEGER NOT NULL REFERENCES factions(id),
  card_type_id   INTEGER NOT NULL REFERENCES card_types(id),
  custom_id      TEXT NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('pending','done','failed')),
  image_path     TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cost_usd       REAL,
  error          TEXT
);
```

`server/internal/store/migrations/0006_batches.down.sql`:

```sql
DROP TABLE batch_items;
DROP TABLE batches;
```

(Note: batch_items → factions/card_types FKs intentionally have NO cascade — they are the delete-block anchor per PRD §7.1. batch_items → batches cascades with the batch.)

- [ ] **Step 2: Write failing tests**

`server/internal/store/batches_test.go`:

```go
package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func batchFixtures(t *testing.T) (*BatchesStore, *FactionsStore, *CardTypesStore, int64, int64) {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	fs := NewFactionsStore(db)
	cs := NewCardTypesStore(db)
	f, _ := fs.Create("Tau", "d", "Galaxy in Flames", "manual")
	ct, _ := cs.Create("combat", "", "", "")
	return NewBatchesStore(db), fs, cs, f.ID, ct.ID
}

func mkBatch(t *testing.T, s *BatchesStore, fid, ctid int64) Batch {
	t.Helper()
	b, err := s.Create("draft", "batches/1/requests.jsonl", []BatchItemInput{
		{FactionID: fid, CardTypeID: ctid, CustomID: "tau__combat"},
	})
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestBatchCreateWithItems(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	b := mkBatch(t, s, fid, ctid)
	if b.Status != "created" || b.Mode != "draft" || b.JSONLPath != "batches/1/requests.jsonl" {
		t.Fatalf("batch: %+v", b)
	}
	items, err := s.Items(b.ID)
	if err != nil || len(items) != 1 || items[0].Status != "pending" || items[0].CustomID != "tau__combat" {
		t.Fatalf("items: %v %+v", err, items)
	}
}

func TestBatchSubmitAndStatusFlow(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	b := mkBatch(t, s, fid, ctid)
	if err := s.MarkSubmitted(b.ID, "batch_abc"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(b.ID)
	if got.Status != "submitted" || got.OpenAIBatchID != "batch_abc" || got.SubmittedAt == "" {
		t.Fatalf("after submit: %+v", got)
	}
	if err := s.SetStatus(b.ID, "in_progress"); err != nil {
		t.Fatal(err)
	}
	if err := s.Complete(b.ID, "batches/1/output.jsonl", 0.41); err != nil {
		t.Fatal(err)
	}
	got, _ = s.Get(b.ID)
	if got.Status != "completed" || got.TotalCostUSD != 0.41 || got.CompletedAt == "" || got.OutputPath == "" {
		t.Fatalf("after complete: %+v", got)
	}
	// terminal guard: SetStatus on completed batch is a silent no-op
	if err := s.SetStatus(b.ID, "in_progress"); err != nil {
		t.Fatal(err)
	}
	got, _ = s.Get(b.ID)
	if got.Status != "completed" {
		t.Fatalf("terminal overwritten: %+v", got)
	}
}

func TestBatchItemTransitions(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	b := mkBatch(t, s, fid, ctid)
	if err := s.MarkItemDone(b.ID, "tau__combat", "batches/1/tau__combat.png", 100, 400, 0.1); err != nil {
		t.Fatal(err)
	}
	items, _ := s.Items(b.ID)
	if items[0].Status != "done" || items[0].CostUSD != 0.1 || items[0].ImagePath == "" {
		t.Fatalf("done item: %+v", items[0])
	}
	if err := s.MarkItemFailed(b.ID, "missing__id", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("missing custom id: %v", err)
	}
}

func TestBatchNonTerminal(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	a := mkBatch(t, s, fid, ctid)
	s.MarkSubmitted(a.ID, "batch_1")
	done := mkBatch(t, s, fid, ctid)
	s.MarkSubmitted(done.ID, "batch_2")
	s.Complete(done.ID, "o", 0)
	nt, err := s.NonTerminal()
	if err != nil || len(nt) != 1 || nt[0].ID != a.ID {
		t.Fatalf("non-terminal: %v %+v", err, nt)
	}
}

func TestBatchList(t *testing.T) {
	s, _, _, fid, ctid := batchFixtures(t)
	a := mkBatch(t, s, fid, ctid)
	b := mkBatch(t, s, fid, ctid)
	all, err := s.List()
	if err != nil || len(all) != 2 || all[0].ID != b.ID || all[1].ID != a.ID {
		t.Fatalf("list: %v %+v", err, all)
	}
}

func TestReferencedGuards(t *testing.T) {
	s, fs, cs, fid, ctid := batchFixtures(t)
	ref, err := s.FactionReferenced(fid)
	if err != nil || ref {
		t.Fatalf("pre: %v %v", ref, err)
	}
	mkBatch(t, s, fid, ctid)
	if ref, _ = s.FactionReferenced(fid); !ref {
		t.Fatal("faction should be referenced")
	}
	if ref, _ = s.CardTypeReferenced(ctid); !ref {
		t.Fatal("card type should be referenced")
	}
	// FK (no cascade) blocks raw deletes at DB level too
	if err := fs.Delete(fid); err == nil {
		t.Fatal("faction delete should fail at FK level")
	}
	if err := cs.Delete(ctid); err == nil {
		t.Fatal("card type delete should fail at FK level")
	}
}
```

- [ ] **Step 3: Run to verify failure**

Run: `cd server && go test ./internal/store/`
Expected: FAIL — `undefined: NewBatchesStore`

- [ ] **Step 4: Implement**

`server/internal/store/batches.go`:

```go
package store

import "database/sql"

type Batch struct {
	ID            int64   `json:"id"`
	OpenAIBatchID string  `json:"openai_batch_id"`
	Mode          string  `json:"mode"`
	Status        string  `json:"status"`
	JSONLPath     string  `json:"jsonl_path"`
	OutputPath    string  `json:"output_path"`
	TotalCostUSD  float64 `json:"total_cost_usd"`
	SubmittedAt   string  `json:"submitted_at"`
	CompletedAt   string  `json:"completed_at"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

type BatchItem struct {
	ID           int64   `json:"id"`
	BatchID      int64   `json:"batch_id"`
	FactionID    int64   `json:"faction_id"`
	CardTypeID   int64   `json:"card_type_id"`
	CustomID     string  `json:"custom_id"`
	Status       string  `json:"status"`
	ImagePath    string  `json:"image_path"`
	InputTokens  int64   `json:"input_tokens"`
	OutputTokens int64   `json:"output_tokens"`
	CostUSD      float64 `json:"cost_usd"`
	Error        string  `json:"error"`
}

type BatchItemInput struct {
	FactionID  int64
	CardTypeID int64
	CustomID   string
}

type BatchesStore struct {
	db *sql.DB
}

func NewBatchesStore(db *sql.DB) *BatchesStore {
	return &BatchesStore{db: db}
}

const batchCols = `id, COALESCE(openai_batch_id,''), mode, status, jsonl_path,
	COALESCE(output_path,''), COALESCE(total_cost_usd,0),
	COALESCE(submitted_at,''), COALESCE(completed_at,''), created_at, updated_at`

func scanBatch(row interface{ Scan(...any) error }) (Batch, error) {
	var b Batch
	err := row.Scan(&b.ID, &b.OpenAIBatchID, &b.Mode, &b.Status, &b.JSONLPath,
		&b.OutputPath, &b.TotalCostUSD, &b.SubmittedAt, &b.CompletedAt, &b.CreatedAt, &b.UpdatedAt)
	if err == sql.ErrNoRows {
		return b, ErrNotFound
	}
	return b, err
}

func (s *BatchesStore) Create(mode, jsonlPath string, items []BatchItemInput) (Batch, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Batch{}, err
	}
	defer tx.Rollback()
	res, err := tx.Exec(`INSERT INTO batches (mode, status, jsonl_path) VALUES (?, 'created', ?)`, mode, jsonlPath)
	if err != nil {
		return Batch{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Batch{}, err
	}
	for _, it := range items {
		if _, err := tx.Exec(
			`INSERT INTO batch_items (batch_id, faction_id, card_type_id, custom_id, status) VALUES (?, ?, ?, ?, 'pending')`,
			id, it.FactionID, it.CardTypeID, it.CustomID); err != nil {
			return Batch{}, err
		}
	}
	b, err := scanBatch(tx.QueryRow("SELECT "+batchCols+" FROM batches WHERE id = ?", id))
	if err != nil {
		return Batch{}, err
	}
	return b, tx.Commit()
}

func (s *BatchesStore) Get(id int64) (Batch, error) {
	return scanBatch(s.db.QueryRow("SELECT "+batchCols+" FROM batches WHERE id = ?", id))
}

func (s *BatchesStore) List() ([]Batch, error) {
	return s.queryBatches("SELECT " + batchCols + " FROM batches ORDER BY id DESC")
}

func (s *BatchesStore) NonTerminal() ([]Batch, error) {
	return s.queryBatches("SELECT " + batchCols + " FROM batches WHERE status IN ('submitted','in_progress') ORDER BY id ASC")
}

func (s *BatchesStore) queryBatches(q string) ([]Batch, error) {
	rows, err := s.db.Query(q)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Batch, 0)
	for rows.Next() {
		b, err := scanBatch(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *BatchesStore) MarkSubmitted(id int64, openaiBatchID string) error {
	return s.execOne(
		`UPDATE batches SET status = 'submitted', openai_batch_id = ?, submitted_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
		openaiBatchID, id)
}

// SetStatus updates a non-terminal batch's status. Terminal batches are
// left untouched (silent no-op) so a stale poll can never regress them.
func (s *BatchesStore) SetStatus(id int64, status string) error {
	_, err := s.db.Exec(
		`UPDATE batches SET status = ?, updated_at = datetime('now')
		 WHERE id = ? AND status NOT IN ('completed','failed','cancelled')`, status, id)
	return err
}

func (s *BatchesStore) Complete(id int64, outputPath string, totalCost float64) error {
	return s.execOne(
		`UPDATE batches SET status = 'completed', output_path = ?, total_cost_usd = ?,
		 completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`,
		outputPath, totalCost, id)
}

func (s *BatchesStore) execOne(q string, args ...any) error {
	res, err := s.db.Exec(q, args...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

const batchItemCols = `id, batch_id, faction_id, card_type_id, custom_id, status,
	COALESCE(image_path,''), COALESCE(input_tokens,0), COALESCE(output_tokens,0),
	COALESCE(cost_usd,0), COALESCE(error,'')`

func (s *BatchesStore) Items(batchID int64) ([]BatchItem, error) {
	rows, err := s.db.Query("SELECT "+batchItemCols+" FROM batch_items WHERE batch_id = ? ORDER BY custom_id ASC", batchID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]BatchItem, 0)
	for rows.Next() {
		var it BatchItem
		if err := rows.Scan(&it.ID, &it.BatchID, &it.FactionID, &it.CardTypeID, &it.CustomID, &it.Status,
			&it.ImagePath, &it.InputTokens, &it.OutputTokens, &it.CostUSD, &it.Error); err != nil {
			return nil, err
		}
		out = append(out, it)
	}
	return out, rows.Err()
}

func (s *BatchesStore) MarkItemDone(batchID int64, customID, imagePath string, inTok, outTok int64, costUSD float64) error {
	return s.execOne(
		`UPDATE batch_items SET status = 'done', image_path = ?, input_tokens = ?, output_tokens = ?, cost_usd = ?
		 WHERE batch_id = ? AND custom_id = ?`,
		imagePath, inTok, outTok, costUSD, batchID, customID)
}

func (s *BatchesStore) MarkItemFailed(batchID int64, customID, errMsg string) error {
	return s.execOne(
		`UPDATE batch_items SET status = 'failed', error = ? WHERE batch_id = ? AND custom_id = ?`,
		errMsg, batchID, customID)
}

func (s *BatchesStore) FactionReferenced(factionID int64) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM batch_items WHERE faction_id = ?`, factionID).Scan(&n)
	return n > 0, err
}

func (s *BatchesStore) CardTypeReferenced(cardTypeID int64) (bool, error) {
	var n int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM batch_items WHERE card_type_id = ?`, cardTypeID).Scan(&n)
	return n > 0, err
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/internal/store/
git commit -m "feat: batches store with items, terminal-status guard, and reference checks"
```

### Task 2: OpenAI Batch API methods

**Files:**
- Create: `server/internal/openai/batches.go`, `server/internal/openai/batches_test.go`

**Interfaces:**
- Consumes: `Client.do`, `testClient(t, handler)` (already defined in `client_test.go`, same package).
- Produces (Tasks 4–5 consume):
  - `openai.BatchStatus{Status string; RequestCounts struct{Completed, Failed, Total int}; OutputFileID, ErrorFileID string}` (json `status`, `request_counts.{completed,failed,total}`, `output_file_id`, `error_file_id`).
  - `(c *Client) CreateBatch(ctx, fileID string) (string, error)` — returns the OpenAI batch id.
  - `(c *Client) GetBatch(ctx, id string) (BatchStatus, error)`.
  - `(c *Client) CancelBatch(ctx, id string) error`.
  - `(c *Client) FileContent(ctx, fileID string) ([]byte, error)` — raw bytes, not JSON-parsed (output/error files are JSONL, not the standard envelope).

- [ ] **Step 1: Write failing tests**

`server/internal/openai/batches_test.go`:

```go
package openai

import (
	"context"
	"net/http"
	"strings"
	"testing"
)

func TestCreateBatch(t *testing.T) {
	var gotBody map[string]any
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/batches" || r.Method != http.MethodPost {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		decodeJSONBody(t, r, &gotBody)
		w.Write([]byte(`{"id":"batch_abc"}`))
	})
	id, err := c.CreateBatch(context.Background(), "file-123")
	if err != nil || id != "batch_abc" {
		t.Fatalf("id=%q err=%v", id, err)
	}
	if gotBody["input_file_id"] != "file-123" || gotBody["endpoint"] != "/v1/images/edits" || gotBody["completion_window"] != "24h" {
		t.Fatalf("body: %+v", gotBody)
	}
}

func TestCreateBatchMissingIDIsAnError(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{}`))
	})
	_, err := c.CreateBatch(context.Background(), "file-123")
	if err == nil || strings.Contains(err.Error(), "<nil>") {
		t.Fatalf("err = %v", err)
	}
	if !strings.Contains(err.Error(), "missing id") {
		t.Fatalf("err = %v", err)
	}
}

func TestGetBatch(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/batches/batch_abc" || r.Method != http.MethodGet {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{"status":"completed","request_counts":{"completed":3,"failed":1,"total":4},"output_file_id":"file-out","error_file_id":"file-err"}`))
	})
	status, err := c.GetBatch(context.Background(), "batch_abc")
	if err != nil {
		t.Fatal(err)
	}
	if status.Status != "completed" || status.RequestCounts.Completed != 3 || status.RequestCounts.Failed != 1 ||
		status.RequestCounts.Total != 4 || status.OutputFileID != "file-out" || status.ErrorFileID != "file-err" {
		t.Fatalf("status: %+v", status)
	}
}

func TestCancelBatch(t *testing.T) {
	called := false
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		called = true
		if r.URL.Path != "/v1/batches/batch_abc/cancel" || r.Method != http.MethodPost {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		w.Write([]byte(`{}`))
	})
	if err := c.CancelBatch(context.Background(), "batch_abc"); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("cancel endpoint not called")
	}
}

func TestFileContentReturnsRawBytes(t *testing.T) {
	raw := "{\"custom_id\":\"a\"}\n{\"custom_id\":\"b\"}\n"
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files/file-out/content" {
			t.Errorf("path %s", r.URL.Path)
		}
		w.Write([]byte(raw))
	})
	data, err := c.FileContent(context.Background(), "file-out")
	if err != nil || string(data) != raw {
		t.Fatalf("data=%q err=%v", data, err)
	}
}
```

`server/internal/openai/batches_helpers_test.go` (small JSON-body decode helper shared by the new tests):

```go
package openai

import (
	"encoding/json"
	"net/http"
	"testing"
)

func decodeJSONBody(t *testing.T, r *http.Request, out any) {
	t.Helper()
	if err := json.NewDecoder(r.Body).Decode(out); err != nil {
		t.Fatalf("decode body: %v", err)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/openai/`
Expected: FAIL — `undefined: CreateBatch`

- [ ] **Step 3: Implement**

`server/internal/openai/batches.go`:

```go
// Batch API methods (PRD §7.4): submit a purpose:"batch" JSONL file,
// poll its status, cancel it, and download its output/error files.
package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
)

type BatchStatus struct {
	Status        string `json:"status"`
	RequestCounts struct {
		Completed int `json:"completed"`
		Failed    int `json:"failed"`
		Total     int `json:"total"`
	} `json:"request_counts"`
	OutputFileID string `json:"output_file_id"`
	ErrorFileID  string `json:"error_file_id"`
}

// CreateBatch submits a previously uploaded (purpose:"batch") JSONL file
// against the images/edits endpoint with a 24h completion window.
func (c *Client) CreateBatch(ctx context.Context, fileID string) (string, error) {
	body := map[string]string{
		"input_file_id":     fileID,
		"endpoint":          "/v1/images/edits",
		"completion_window": "24h",
	}
	payload, err := json.Marshal(body)
	if err != nil {
		return "", err
	}
	data, err := c.do(ctx, http.MethodPost, "/v1/batches", "application/json",
		func() (io.Reader, error) { return bytes.NewReader(payload), nil })
	if err != nil {
		return "", err
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return "", fmt.Errorf("openai: bad batch create response: %w", err)
	}
	if out.ID == "" {
		return "", errors.New("openai: batch create response missing id")
	}
	return out.ID, nil
}

func (c *Client) GetBatch(ctx context.Context, id string) (BatchStatus, error) {
	data, err := c.do(ctx, http.MethodGet, "/v1/batches/"+id, "", func() (io.Reader, error) { return nil, nil })
	if err != nil {
		return BatchStatus{}, err
	}
	var out BatchStatus
	if err := json.Unmarshal(data, &out); err != nil {
		return BatchStatus{}, fmt.Errorf("openai: bad batch status response: %w", err)
	}
	return out, nil
}

func (c *Client) CancelBatch(ctx context.Context, id string) error {
	_, err := c.do(ctx, http.MethodPost, "/v1/batches/"+id+"/cancel", "", func() (io.Reader, error) { return nil, nil })
	return err
}

// FileContent downloads a file's raw bytes. Batch output/error files are
// JSONL, not the standard {"data": ...} envelope, so this returns bytes
// rather than decoding JSON.
func (c *Client) FileContent(ctx context.Context, fileID string) ([]byte, error) {
	return c.do(ctx, http.MethodGet, "/v1/files/"+fileID+"/content", "", func() (io.Reader, error) { return nil, nil })
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/internal/openai/
git commit -m "feat: openai batch API methods (create, get, cancel, file content)"
```

### Task 3: JSONL builder (`internal/jsonl`)

**Files:**
- Create: `server/internal/jsonl/jsonl.go`, `server/internal/jsonl/jsonl_test.go`

**Interfaces:**
- Consumes: nothing (pure package).
- Produces (Task 4 consumes):
  - `jsonl.MaxLines = 1000`.
  - `jsonl.Slugify(s string) string` — lowercase, non-alphanumeric runs → `_`, trimmed of leading/trailing `_`.
  - `jsonl.Item{FactionID, CardTypeID int64; FactionName, CardTypeName, FileID, Prompt string}`.
  - `jsonl.Line{CustomID string; FactionID, CardTypeID int64}`.
  - `jsonl.Build(items []Item, model, size, quality, inputFidelity string) (text string, lines []Line, err error)` — one JSON object per line (§8.3 shape), `custom_id` = `slug(faction)__slug(cardtype)`, deduped with a `-N` suffix on collision. Errors: no items, or more than `MaxLines`.

- [ ] **Step 1: Write failing tests**

`server/internal/jsonl/jsonl_test.go`:

```go
package jsonl

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSlugify(t *testing.T) {
	cases := map[string]string{
		"Tau Empire":       "tau_empire",
		"  Space  Wolves ": "space_wolves",
		"Iron-Hands!!":      "iron_hands",
		"___leading":       "leading",
	}
	for in, want := range cases {
		if got := Slugify(in); got != want {
			t.Errorf("Slugify(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestBuildProducesValidLinesPerItem(t *testing.T) {
	items := []Item{
		{FactionID: 1, FactionName: "Tau Empire", CardTypeID: 10, CardTypeName: "combat", FileID: "file-1", Prompt: "p1"},
		{FactionID: 2, FactionName: "Iron Hands", CardTypeID: 10, CardTypeName: "combat", FileID: "file-1", Prompt: "p2"},
	}
	text, lines, err := Build(items, "gpt-image-2", "816x1104", "low", "high")
	if err != nil {
		t.Fatal(err)
	}
	if len(lines) != 2 || lines[0].CustomID != "tau_empire__combat" || lines[1].CustomID != "iron_hands__combat" {
		t.Fatalf("lines: %+v", lines)
	}
	raws := strings.Split(strings.TrimRight(text, "\n"), "\n")
	if len(raws) != 2 {
		t.Fatalf("raw lines: %d", len(raws))
	}
	var parsed struct {
		CustomID string `json:"custom_id"`
		Method   string `json:"method"`
		URL      string `json:"url"`
		Body     struct {
			Model         string              `json:"model"`
			Image         []map[string]string `json:"image"`
			Prompt        string              `json:"prompt"`
			Size          string              `json:"size"`
			Quality       string              `json:"quality"`
			InputFidelity string              `json:"input_fidelity"`
			OutputFormat  string              `json:"output_format"`
			N             int                 `json:"n"`
		} `json:"body"`
	}
	if err := json.Unmarshal([]byte(raws[0]), &parsed); err != nil {
		t.Fatal(err)
	}
	if parsed.CustomID != "tau_empire__combat" || parsed.Method != "POST" || parsed.URL != "/v1/images/edits" ||
		parsed.Body.Model != "gpt-image-2" || parsed.Body.Image[0]["file_id"] != "file-1" || parsed.Body.Prompt != "p1" ||
		parsed.Body.Size != "816x1104" || parsed.Body.Quality != "low" || parsed.Body.InputFidelity != "high" ||
		parsed.Body.OutputFormat != "png" || parsed.Body.N != 1 {
		t.Fatalf("parsed: %+v", parsed)
	}
}

func TestBuildDedupesCollidingCustomIDs(t *testing.T) {
	items := []Item{
		{FactionID: 1, FactionName: "Tau!!", CardTypeID: 10, CardTypeName: "combat", FileID: "f", Prompt: "p"},
		{FactionID: 2, FactionName: "Tau??", CardTypeID: 10, CardTypeName: "combat", FileID: "f", Prompt: "p"},
	}
	_, lines, err := Build(items, "m", "s", "q", "f")
	if err != nil {
		t.Fatal(err)
	}
	if lines[0].CustomID == lines[1].CustomID {
		t.Fatalf("custom_ids collided: %+v", lines)
	}
	if lines[0].CustomID != "tau__combat" || lines[1].CustomID != "tau__combat-1" {
		t.Fatalf("dedup suffix: %+v", lines)
	}
}

func TestBuildRejectsEmpty(t *testing.T) {
	if _, _, err := Build(nil, "m", "s", "q", "f"); err == nil {
		t.Fatal("expected error for empty items")
	}
}

func TestBuildRejectsOverCap(t *testing.T) {
	items := make([]Item, MaxLines+1)
	for i := range items {
		items[i] = Item{FactionID: int64(i), FactionName: "f", CardTypeID: int64(i), CardTypeName: "c", FileID: "x", Prompt: "p"}
	}
	_, _, err := Build(items, "m", "s", "q", "f")
	if err == nil || !strings.Contains(err.Error(), "1001") {
		t.Fatalf("err = %v", err)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/jsonl/`
Expected: FAIL — `undefined: Build`

- [ ] **Step 3: Implement**

`server/internal/jsonl/jsonl.go`:

```go
// Package jsonl builds the §8.3 batch request file: one JSON object per
// line, one line per faction × card-type pair.
package jsonl

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
)

// MaxLines is the hard cap on a single batch (PRD §8.3).
const MaxLines = 1000

var nonAlnum = regexp.MustCompile(`[^a-z0-9]+`)

// Slugify lowercases, collapses non-alphanumeric runs to a single
// underscore, and trims leading/trailing underscores.
func Slugify(s string) string {
	return strings.Trim(nonAlnum.ReplaceAllString(strings.ToLower(s), "_"), "_")
}

type Item struct {
	FactionID    int64
	FactionName  string
	CardTypeID   int64
	CardTypeName string
	FileID       string
	Prompt       string
}

type Line struct {
	CustomID   string
	FactionID  int64
	CardTypeID int64
}

// Build assembles the JSONL text and the per-line metadata batches.Store
// needs to create matching batch_items rows. custom_id is normally
// slug(faction)__slug(cardtype); if two pairs slugify identically, later
// ones get a "-N" suffix so custom_id stays unique per batch.
func Build(items []Item, model, size, quality, inputFidelity string) (string, []Line, error) {
	if len(items) == 0 {
		return "", nil, fmt.Errorf("no items to batch")
	}
	if len(items) > MaxLines {
		return "", nil, fmt.Errorf("batch would have %d lines — max is %d", len(items), MaxLines)
	}
	seen := make(map[string]int)
	lines := make([]Line, 0, len(items))
	var sb strings.Builder
	for _, it := range items {
		base := Slugify(it.FactionName) + "__" + Slugify(it.CardTypeName)
		customID := base
		if n, ok := seen[base]; ok {
			n++
			seen[base] = n
			customID = fmt.Sprintf("%s-%d", base, n)
		} else {
			seen[base] = 0
		}
		raw, err := json.Marshal(map[string]any{
			"custom_id": customID,
			"method":    "POST",
			"url":       "/v1/images/edits",
			"body": map[string]any{
				"model":          model,
				"image":          []map[string]string{{"file_id": it.FileID}},
				"prompt":         it.Prompt,
				"size":           size,
				"quality":        quality,
				"input_fidelity": inputFidelity,
				"output_format":  "png",
				"n":              1,
			},
		})
		if err != nil {
			return "", nil, err
		}
		sb.Write(raw)
		sb.WriteByte('\n')
		lines = append(lines, Line{CustomID: customID, FactionID: it.FactionID, CardTypeID: it.CardTypeID})
	}
	return sb.String(), lines, nil
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/internal/jsonl/
git commit -m "feat: jsonl builder for §8.3 batch request files"
```

### Task 4: Batches API + delete guards

**Files:**
- Create: `server/internal/api/batches.go`, `server/internal/api/batches_test.go`
- Modify: `server/internal/api/router.go`, `server/internal/api/factions.go`, `server/internal/api/cardtypes.go`

**Interfaces:**
- Consumes: `store.NewBatchesStore`, `store.BatchesStore.{Create,Get,List,Items,MarkSubmitted,SetStatus,FactionReferenced,CardTypeReferenced}` (Task 1); `openai.Client.{UploadFile,CreateBatch,CancelBatch}` (Task 2); `jsonl.{Item,Line,Build}` (Task 3); `prompt.ImageEdit`, `pricing.EstimatePerImage`; `resolveOpenAIKey`, `openAIBaseURL`, `writeJSON`, `writeError`, `idParam`, `oneOf` (existing helpers in this package). `batchpoller.Poller` and `batchpoller.Counts` (Task 5 — this task only needs the field `Poller *batchpoller.Poller` with method `Counts(batchID int64) (batchpoller.Counts, bool)`; write Task 5 first, or stub `Counts` returning `(Counts{}, false)` while implementing this task, then wire the real package once Task 5 lands).
- Produces (Tasks 6–8 consume), exact wire contract:
  - `POST /api/batches/preview` body `{"faction_ids":[...],"card_type_ids":[...],"mode":"draft"|"final"}` → 200 `{"jsonl":"...","count":N,"est_cost":0.05}`, 400 on bad mode/empty scope/missing-file card type.
  - `POST /api/batches` — same body — → 201 flat batch object: `{"id":1,"openai_batch_id":"batch_x","mode":"draft","status":"submitted","jsonl_path":"...","output_path":"","total_cost_usd":0,"submitted_at":"...","completed_at":"","created_at":"...","updated_at":"...","counts":{"completed":0,"failed":0,"total":N},"est_cost_usd":0.05}` — `est_cost_usd` is recomputed from the batch's own item count and mode on every response (same formula as the preview estimate), so Task 8's actual-vs-estimate comparison works from any entry point, not just right after submission.
  - `GET /api/batches` → 200 array of the same flat shape.
  - `GET /api/batches/{id}` → 200 `{"batch": <flat shape>, "items": [BatchItem, ...]}` (BatchItem fields per Task 1: `id,batch_id,faction_id,card_type_id,custom_id,status,image_path,input_tokens,output_tokens,cost_usd,error`).
  - `POST /api/batches/{id}/cancel` → 200 flat shape (status `cancelled`); 409 if the batch was never submitted.
  - `GET /api/batches/{id}/items/{itemID}/image` → PNG bytes or 404.
  - `GET /api/batches/{id}/download` → `application/zip`, one `<custom_id>.png` entry per `done` item.
  - `DELETE /api/factions/{id}` and `DELETE /api/card-types/{id}` now also return 409 `{"error":"referenced by a batch — cannot delete"}` when any batch_item references them.

- [ ] **Step 1: Write failing tests**

`server/internal/api/batches_test.go`:

```go
package api

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"cardforge/internal/store"
)

func newTestRouterWithStore(t *testing.T) (http.Handler, *store.BatchesStore, string) {
	t.Helper()
	dataDir := t.TempDir()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewRouter(db, nil, dataDir), store.NewBatchesStore(db), dataDir
}

func withFakeOpenAI(t *testing.T, handler http.HandlerFunc) {
	t.Helper()
	fake := httptest.NewServer(handler)
	t.Cleanup(fake.Close)
	old := openAIBaseURL
	openAIBaseURL = fake.URL
	t.Cleanup(func() { openAIBaseURL = old })
	t.Setenv("OPENAI_API_KEY", "sk-env")
}

func createFactionAndUploadedCardType(t *testing.T, h http.Handler) (int64, int64) {
	t.Helper()
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"blue and gold","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "d", "constraints": "c"}, "a.png", pngBytes)
	ctid := int64(ct["id"].(float64))
	rec, out := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", ctid), "")
	if rec.Code != 200 {
		t.Fatalf("upload-to-openai: %d %v", rec.Code, out)
	}
	return fid, ctid
}

func TestBatchesPreview(t *testing.T) {
	h := newTestRouter(t)
	withFakeOpenAI(t, func(w http.ResponseWriter, r *http.Request) { w.Write([]byte(`{"id":"file-abc"}`)) })
	fid, ctid := createFactionAndUploadedCardType(t, h)

	rec, out := doJSON(t, h, http.MethodPost, "/api/batches/preview",
		fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft"}`, fid, ctid))
	if rec.Code != 200 {
		t.Fatalf("preview: %d %v", rec.Code, out)
	}
	if out["count"].(float64) != 1 {
		t.Fatalf("count: %v", out["count"])
	}
	jsonlText, _ := out["jsonl"].(string)
	if !strings.Contains(jsonlText, "tau_empire__combat") {
		t.Fatalf("jsonl: %s", jsonlText)
	}
	if out["est_cost"].(float64) <= 0 {
		t.Fatalf("est_cost: %v", out["est_cost"])
	}
}

func TestBatchesPreviewMissingFileID(t *testing.T) {
	h := newTestRouter(t)
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	ctid := int64(ct["id"].(float64))

	rec, out := doJSON(t, h, http.MethodPost, "/api/batches/preview",
		fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft"}`, fid, ctid))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("preview: %d %v", rec.Code, out)
	}
}

func TestBatchesSubmitListGetCancel(t *testing.T) {
	h := newTestRouter(t)
	withFakeOpenAI(t, func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/v1/files":
			w.Write([]byte(`{"id":"file-abc"}`))
		case r.URL.Path == "/v1/batches" && r.Method == http.MethodPost:
			w.Write([]byte(`{"id":"batch_openai_1"}`))
		case strings.HasSuffix(r.URL.Path, "/cancel"):
			w.Write([]byte(`{}`))
		default:
			t.Errorf("unexpected request %s %s", r.Method, r.URL.Path)
		}
	})
	fid, ctid := createFactionAndUploadedCardType(t, h)

	rec, out := doJSON(t, h, http.MethodPost, "/api/batches",
		fmt.Sprintf(`{"faction_ids":[%d],"card_type_ids":[%d],"mode":"draft"}`, fid, ctid))
	if rec.Code != http.StatusCreated {
		t.Fatalf("submit: %d %v", rec.Code, out)
	}
	if out["status"] != "submitted" || out["openai_batch_id"] != "batch_openai_1" {
		t.Fatalf("submitted batch: %v", out)
	}
	id := int64(out["id"].(float64))

	rec, _ = doJSON(t, h, http.MethodGet, "/api/batches", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != 200 || len(list) != 1 {
		t.Fatalf("list: %d len=%d", rec.Code, len(list))
	}

	rec, getOut := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/batches/%d", id), "")
	if rec.Code != 200 {
		t.Fatalf("get: %d %v", rec.Code, getOut)
	}
	items, _ := getOut["items"].([]any)
	if len(items) != 1 {
		t.Fatalf("items: %v", getOut)
	}

	rec, cancelOut := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/batches/%d/cancel", id), "")
	if rec.Code != 200 || cancelOut["status"] != "cancelled" {
		t.Fatalf("cancel: %d %v", rec.Code, cancelOut)
	}
}

func TestCancelNeverSubmittedBatchConflicts(t *testing.T) {
	h, bs, _ := newTestRouterWithStore(t)
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	ctid := int64(ct["id"].(float64))
	b, err := bs.Create("draft", "x", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	if err != nil {
		t.Fatal(err)
	}
	rec, out := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/batches/%d/cancel", b.ID), "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("cancel unsubmitted: %d %v", rec.Code, out)
	}
}

func TestDeleteGuardBlocksReferencedFactionAndCardType(t *testing.T) {
	h, bs, _ := newTestRouterWithStore(t)
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	ctid := int64(ct["id"].(float64))
	if _, err := bs.Create("draft", "x", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}}); err != nil {
		t.Fatal(err)
	}

	rec, out := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/factions/%d", fid), "")
	if rec.Code != http.StatusConflict || out["error"] != "referenced by a batch — cannot delete" {
		t.Fatalf("faction delete guard: %d %v", rec.Code, out)
	}
	rec, out = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d", ctid), "")
	if rec.Code != http.StatusConflict || out["error"] != "referenced by a batch — cannot delete" {
		t.Fatalf("card type delete guard: %d %v", rec.Code, out)
	}
}

func TestBatchItemImageAndDownload(t *testing.T) {
	h, bs, dataDir := newTestRouterWithStore(t)
	_, f := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Tau Empire","description":"d","dlc":"Galaxy in Flames","source":"manual"}`)
	fid := int64(f["id"].(float64))
	_, ct := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	ctid := int64(ct["id"].(float64))
	b, err := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	if err != nil {
		t.Fatal(err)
	}
	imgDir := filepath.Join(dataDir, "batches", fmt.Sprintf("%d", b.ID))
	if err := os.MkdirAll(imgDir, 0o755); err != nil {
		t.Fatal(err)
	}
	relImg := filepath.Join("batches", fmt.Sprintf("%d", b.ID), "tau_empire__combat.png")
	if err := os.WriteFile(filepath.Join(dataDir, relImg), pngBytes, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := bs.MarkItemDone(b.ID, "tau_empire__combat", relImg, 10, 20, 0.05); err != nil {
		t.Fatal(err)
	}
	items, _ := bs.Items(b.ID)
	itemID := items[0].ID

	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/batches/%d/items/%d/image", b.ID, itemID), nil)
	h.ServeHTTP(rec, req)
	if rec.Code != 200 || rec.Header().Get("Content-Type") != "image/png" {
		t.Fatalf("item image: %d", rec.Code)
	}

	rec2 := httptest.NewRecorder()
	req2 := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/batches/%d/download", b.ID), nil)
	h.ServeHTTP(rec2, req2)
	if rec2.Code != 200 || rec2.Header().Get("Content-Type") != "application/zip" {
		t.Fatalf("download: %d", rec2.Code)
	}
	zr, err := zip.NewReader(bytes.NewReader(rec2.Body.Bytes()), int64(rec2.Body.Len()))
	if err != nil || len(zr.File) != 1 || zr.File[0].Name != "tau_empire__combat.png" {
		t.Fatalf("zip: %v %+v", err, zr)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/api/`
Expected: FAIL — `undefined: BatchesHandler` (and factions/cardtypes delete-guard field errors)

- [ ] **Step 3: Implement `batches.go`**

`server/internal/api/batches.go`:

```go
package api

import (
	"archive/zip"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
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

// counts merges in-flight counts from the poller's in-memory cache for
// active batches, and derives them from persisted items for everything
// else (created batches have no counts yet; terminal batches keep them
// even after a restart empties the poller's cache).
func (h *BatchesHandler) counts(b store.Batch) batchpoller.Counts {
	if b.Status == "submitted" || b.Status == "in_progress" {
		if c, ok := h.Poller.Counts(b.ID); ok {
			return c
		}
		return batchpoller.Counts{}
	}
	items, err := h.Store.Items(b.ID)
	if err != nil {
		return batchpoller.Counts{}
	}
	c := batchpoller.Counts{Total: len(items)}
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
	quality := h.resolveQuality(b.Mode, h.settingsOrEmpty())
	return batchOut{Batch: b, Counts: c, EstCostUSD: float64(c.Total) * pricing.EstimatePerImage(quality) * 0.5}
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
				Prompt: prompt.ImageEdit(ct.Name, ct.Description, ct.Constraints, f.Description),
			})
		}
	}
	text, lines, err := jsonl.Build(items, all["openai_model"], all["image_size"], quality, all["input_fidelity"])
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
	quality := h.resolveQuality(req.Mode, all)
	// The batch discount (PRD §5) applies to actual usage-based cost; the
	// pre-call estimate mirrors that so the preview isn't misleadingly high.
	writeJSON(w, http.StatusOK, map[string]any{
		"jsonl":    text,
		"count":    len(lines),
		"est_cost": float64(len(lines)) * pricing.EstimatePerImage(quality) * 0.5,
	})
}

func (h *BatchesHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req batchScopeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	text, lines, _, err := h.buildLines(req)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	items := make([]store.BatchItemInput, len(lines))
	for i, l := range lines {
		items[i] = store.BatchItemInput{FactionID: l.FactionID, CardTypeID: l.CardTypeID, CustomID: l.CustomID}
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

	b, err := h.Store.Create(req.Mode, relPath, items)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	client, err := h.client()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()
	f, err := os.Open(filepath.Join(h.DataDir, relPath))
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	fileID, err := client.UploadFile(ctx, "requests.jsonl", "batch", f)
	f.Close()
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	openaiBatchID, err := client.CreateBatch(ctx, fileID)
	if err != nil {
		writeError(w, http.StatusBadGateway, err.Error())
		return
	}
	if err := h.Store.MarkSubmitted(b.ID, openaiBatchID); err != nil {
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
```

- [ ] **Step 4: Wire delete guards into `factions.go` and `cardtypes.go`**

In `server/internal/api/factions.go`, add a field and guard the delete:

```go
type FactionsHandler struct {
	Store   *store.FactionsStore
	Batches *store.BatchesStore
}
```

```go
func (h *FactionsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ref, err := h.Batches.FactionReferenced(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ref {
		writeError(w, http.StatusConflict, "referenced by a batch — cannot delete")
		return
	}
	if err := h.Store.Delete(id); err != nil {
		h.storeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

In `server/internal/api/cardtypes.go`, add the same field and guard:

```go
type CardTypesHandler struct {
	Store    *store.CardTypesStore
	Settings *store.SettingsStore
	Batches  *store.BatchesStore
	DataDir  string
}
```

```go
func (h *CardTypesHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ref, err := h.Batches.CardTypeReferenced(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ref {
		writeError(w, http.StatusConflict, "referenced by a batch — cannot delete")
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
```

- [ ] **Step 5: Wire everything into `router.go`**

Replace the body of `NewRouter`'s `if db != nil` block in `server/internal/api/router.go` with (imports gain `"context"`, `"cardforge/internal/batchpoller"`, `"cardforge/internal/openai"`):

```go
if db != nil {
	settingsStore := store.NewSettingsStore(db)
	factionsStore := store.NewFactionsStore(db)
	cardTypesStore := store.NewCardTypesStore(db)
	batchesStore := store.NewBatchesStore(db)

	settings := &SettingsHandler{Store: settingsStore}
	r.Get("/settings", settings.Get)
	r.Put("/settings", settings.Put)
	r.Post("/settings/test-openai", settings.TestOpenAI)
	r.Post("/settings/test-claude", settings.TestClaude)

	factions := &FactionsHandler{Store: factionsStore, Batches: batchesStore}
	r.Get("/factions", factions.List)
	r.Post("/factions", factions.Create)
	r.Put("/factions/{id}", factions.Update)
	r.Delete("/factions/{id}", factions.Delete)
	r.Get("/factions/{id}/revisions", factions.Revisions)
	r.Post("/factions/{id}/revisions/{revID}/restore", factions.Restore)

	jobsH := &JobsHandler{Registry: jobs.New(60 * time.Second), Settings: settingsStore}
	r.Post("/factions/generate-description", jobsH.GenerateDescription)
	r.Get("/jobs/{id}", jobsH.Get)
	r.Post("/jobs/{id}/cancel", jobsH.Cancel)

	cardTypes := &CardTypesHandler{
		Store:    cardTypesStore,
		Settings: settingsStore,
		Batches:  batchesStore,
		DataDir:  dataDir,
	}
	r.Get("/card-types", cardTypes.List)
	r.Post("/card-types", cardTypes.Create)
	r.Put("/card-types/{id}", cardTypes.Update)
	r.Delete("/card-types/{id}", cardTypes.Delete)
	r.Get("/card-types/{id}/template", cardTypes.ServeTemplate)
	r.Post("/card-types/{id}/upload-to-openai", cardTypes.UploadToOpenAI)

	gens := &GenerationsHandler{
		Gens:      store.NewGenerationsStore(db),
		Factions:  factionsStore,
		CardTypes: cardTypesStore,
		Settings:  settingsStore,
		DataDir:   dataDir,
	}
	r.Post("/generate", gens.Generate)
	r.Get("/generate/preview", gens.Preview)
	r.Get("/generations", gens.List)
	r.Get("/generations/{id}", gens.Get)
	r.Get("/generations/{id}/image", gens.ServeImage)

	// The poller's own client factory reads openAIBaseURL/resolveOpenAIKey
	// fresh on every call, so tests that swap openAIBaseURL for a fake
	// server also cover any request the poller makes.
	poller := batchpoller.New(batchesStore, settingsStore, dataDir, func() (*openai.Client, error) {
		all, err := settingsStore.GetAll()
		if err != nil {
			return nil, err
		}
		c := openai.New(resolveOpenAIKey(all))
		c.BaseURL = openAIBaseURL
		return c, nil
	})
	go poller.Start(context.Background())

	batches := &BatchesHandler{
		Store:     batchesStore,
		Factions:  factionsStore,
		CardTypes: cardTypesStore,
		Settings:  settingsStore,
		Poller:    poller,
		DataDir:   dataDir,
	}
	r.Post("/batches/preview", batches.Preview)
	r.Post("/batches", batches.Create)
	r.Get("/batches", batches.List)
	r.Get("/batches/{id}", batches.Get)
	r.Post("/batches/{id}/cancel", batches.Cancel)
	r.Get("/batches/{id}/items/{itemID}/image", batches.ItemImage)
	r.Get("/batches/{id}/download", batches.Download)
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add server/internal/api/ server/internal/batchpoller/
git commit -m "feat: batches API (preview, submit, list, get, cancel, image, zip) with delete guards"
```

(`server/internal/batchpoller/` may not exist yet if Task 5 hasn't run — if so, drop it from the `git add` and commit only `server/internal/api/`; Task 5's commit will pick up the poller package.)

### Task 5: `batchpoller` — 60s polling, completion processing, startup resume

**Files:**
- Create: `server/internal/batchpoller/batchpoller.go`, `server/internal/batchpoller/batchpoller_test.go`

**Interfaces:**
- Consumes: `store.BatchesStore.{NonTerminal,SetStatus,Complete,MarkItemDone,MarkItemFailed}` (Task 1); `openai.Client.{GetBatch,FileContent}` + `openai.BatchStatus` (Task 2); `pricing.Parse`, `pricing.PriceTable.Cost` (existing).
- Produces (Task 4 consumes — written against this contract already):
  - `batchpoller.Counts{Completed, Failed, Total int}` (json `completed,failed,total`).
  - `batchpoller.New(batches *store.BatchesStore, settings *store.SettingsStore, dataDir string, client func() (*openai.Client, error)) *Poller`.
  - `(*Poller).Start(ctx context.Context)` — polls immediately, then every 60s until `ctx` is cancelled.
  - `(*Poller).Poll(ctx context.Context)` — single pass over every non-terminal batch (this is also the startup-resume path: `NonTerminal()` already returns any batch left `submitted`/`in_progress` from a previous run, so the very first `Poll` call after process start picks them back up — no separate resume code needed).
  - `(*Poller).Counts(batchID int64) (Counts, bool)`.

- [ ] **Step 1: Write failing tests**

`server/internal/batchpoller/batchpoller_test.go`:

```go
package batchpoller

import (
	"context"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"cardforge/internal/openai"
	"cardforge/internal/store"
)

func pollerFixtures(t *testing.T) (*Poller, *store.BatchesStore, string, int64, int64) {
	t.Helper()
	dataDir := t.TempDir()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	fs := store.NewFactionsStore(db)
	cs := store.NewCardTypesStore(db)
	f, _ := fs.Create("Tau Empire", "d", "Galaxy in Flames", "manual")
	ct, _ := cs.Create("combat", "", "", "")
	bs := store.NewBatchesStore(db)
	settings := store.NewSettingsStore(db)
	return New(bs, settings, dataDir, nil), bs, dataDir, f.ID, ct.ID
}

func withFakeClient(p *Poller, baseURL string) {
	p.Client = func() (*openai.Client, error) {
		c := openai.New("sk-test")
		c.BaseURL = baseURL
		return c, nil
	}
}

func TestMapStatus(t *testing.T) {
	cases := map[string]string{
		"validating": "in_progress", "in_progress": "in_progress", "finalizing": "in_progress",
		"completed": "completed", "failed": "failed", "expired": "failed",
		"cancelling": "cancelled", "cancelled": "cancelled",
	}
	for in, want := range cases {
		if got := mapStatus(in); got != want {
			t.Errorf("mapStatus(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPollUpdatesInProgressStatusAndCounts(t *testing.T) {
	p, bs, _, fid, ctid := pollerFixtures(t)
	b, _ := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	bs.MarkSubmitted(b.ID, "batch_openai_1")

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"status":"validating","request_counts":{"completed":0,"failed":0,"total":1}}`))
	}))
	defer fake.Close()
	withFakeClient(p, fake.URL)

	p.Poll(context.Background())

	got, _ := bs.Get(b.ID)
	if got.Status != "in_progress" {
		t.Fatalf("status: %s", got.Status)
	}
	counts, ok := p.Counts(b.ID)
	if !ok || counts.Total != 1 {
		t.Fatalf("counts: %+v ok=%v", counts, ok)
	}
}

func TestPollCompletesDownloadsAndMarksItemsDone(t *testing.T) {
	p, bs, dataDir, fid, ctid := pollerFixtures(t)
	b, _ := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	bs.MarkSubmitted(b.ID, "batch_openai_1")

	png := base64.StdEncoding.EncodeToString([]byte("PNGDATA"))
	outputLine := `{"custom_id":"tau_empire__combat","response":{"body":{"data":[{"b64_json":"` + png + `"}],"usage":{"input_tokens":100,"output_tokens":400}}}}` + "\n"

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/batches/batch_openai_1":
			w.Write([]byte(`{"status":"completed","request_counts":{"completed":1,"failed":0,"total":1},"output_file_id":"file-out"}`))
		case "/v1/files/file-out/content":
			w.Write([]byte(outputLine))
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	defer fake.Close()
	withFakeClient(p, fake.URL)

	p.Poll(context.Background())

	got, _ := bs.Get(b.ID)
	if got.Status != "completed" || got.CompletedAt == "" || got.OutputPath == "" {
		t.Fatalf("batch: %+v", got)
	}
	wantCost := (100.0/1e6*10.0 + 400.0/1e6*40.0) * 0.5 // gpt-image-2 seed price × 50% batch discount
	if diff := got.TotalCostUSD - wantCost; diff > 1e-9 || diff < -1e-9 {
		t.Fatalf("total cost: got %v want %v", got.TotalCostUSD, wantCost)
	}
	items, _ := bs.Items(b.ID)
	if items[0].Status != "done" || items[0].ImagePath == "" || items[0].CostUSD <= 0 {
		t.Fatalf("item: %+v", items[0])
	}
	saved, err := os.ReadFile(filepath.Join(dataDir, items[0].ImagePath))
	if err != nil || string(saved) != "PNGDATA" {
		t.Fatalf("saved image: %v %q", err, saved)
	}
}

func TestPollHandlesErrorFile(t *testing.T) {
	p, bs, _, fid, ctid := pollerFixtures(t)
	b, _ := bs.Create("draft", "batches/1/requests.jsonl", []store.BatchItemInput{{FactionID: fid, CardTypeID: ctid, CustomID: "tau_empire__combat"}})
	bs.MarkSubmitted(b.ID, "batch_openai_1")

	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/v1/batches/batch_openai_1":
			w.Write([]byte(`{"status":"completed","request_counts":{"completed":0,"failed":1,"total":1},"error_file_id":"file-err"}`))
		case "/v1/files/file-err/content":
			w.Write([]byte(`{"custom_id":"tau_empire__combat","error":{"message":"content policy violation"}}` + "\n"))
		default:
			t.Errorf("unexpected request %s", r.URL.Path)
		}
	}))
	defer fake.Close()
	withFakeClient(p, fake.URL)

	p.Poll(context.Background())

	got, _ := bs.Get(b.ID)
	if got.Status != "completed" || got.TotalCostUSD != 0 {
		t.Fatalf("batch: %+v", got)
	}
	items, _ := bs.Items(b.ID)
	if items[0].Status != "failed" || items[0].Error != "content policy violation" {
		t.Fatalf("item: %+v", items[0])
	}
}

func TestCountsUnknownBatchReturnsFalse(t *testing.T) {
	p, _, _, _, _ := pollerFixtures(t)
	if _, ok := p.Counts(999); ok {
		t.Fatal("expected ok=false for unknown batch")
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/batchpoller/`
Expected: FAIL — `undefined: New` (package doesn't exist yet)

- [ ] **Step 3: Implement**

`server/internal/batchpoller/batchpoller.go`:

```go
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
				InputTokens  int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
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
		total = p.processOutputLines(b.ID, dir, data, pt, all["openai_model"])
	}
	if status.ErrorFileID != "" {
		reqCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		data, err := client.FileContent(reqCtx, status.ErrorFileID)
		cancel()
		if err != nil {
			log.Printf("batchpoller: batch %d: error content: %v", b.ID, err)
		} else {
			p.processErrorLines(b.ID, data)
		}
	}
	if err := p.Store.Complete(b.ID, outputPath, total); err != nil {
		log.Printf("batchpoller: batch %d: complete: %v", b.ID, err)
	}
}

func (p *Poller) processOutputLines(batchID int64, dir string, data []byte, pt pricing.PriceTable, model string) float64 {
	total := 0.0
	for _, raw := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
		if raw == "" {
			continue
		}
		var line outputLine
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			log.Printf("batchpoller: batch %d: bad output line: %v", batchID, err)
			continue
		}
		if len(line.Response.Body.Data) == 0 || line.Response.Body.Data[0].B64JSON == "" {
			_ = p.Store.MarkItemFailed(batchID, line.CustomID, "empty image in batch output")
			continue
		}
		png, err := base64.StdEncoding.DecodeString(line.Response.Body.Data[0].B64JSON)
		if err != nil {
			_ = p.Store.MarkItemFailed(batchID, line.CustomID, "bad image data: "+err.Error())
			continue
		}
		rel := filepath.Join(dir, line.CustomID+".png")
		if err := os.WriteFile(filepath.Join(p.DataDir, rel), png, 0o644); err != nil {
			log.Printf("batchpoller: batch %d: save %s: %v", batchID, line.CustomID, err)
			continue
		}
		usage := line.Response.Body.Usage
		cost := pt.Cost(model, usage.InputTokens, usage.OutputTokens) * 0.5 // batch pricing is 50% of the standard rate
		total += cost
		if err := p.Store.MarkItemDone(batchID, line.CustomID, rel, usage.InputTokens, usage.OutputTokens, cost); err != nil {
			log.Printf("batchpoller: batch %d: mark done %s: %v", batchID, line.CustomID, err)
		}
	}
	return total
}

func (p *Poller) processErrorLines(batchID int64, data []byte) {
	for _, raw := range strings.Split(strings.TrimRight(string(data), "\n"), "\n") {
		if raw == "" {
			continue
		}
		var line errorLine
		if err := json.Unmarshal([]byte(raw), &line); err != nil {
			continue
		}
		msg := line.Error.Message
		if msg == "" {
			msg = "batch item failed"
		}
		_ = p.Store.MarkItemFailed(batchID, line.CustomID, msg)
	}
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS (this also brings `internal/api` back to green if Task 4 ran first — `batches.go` imports the real `batchpoller` package)

- [ ] **Step 5: Commit**

```bash
git add server/internal/batchpoller/
git commit -m "feat: batchpoller — 60s polling, completion processing, startup resume"
```

### Task 6: Frontend data layer (`lib/format.ts`, `pages/batches/api.ts`, `pages/batches/store.ts`)

**Files:**
- Create: `web/src/lib/format.ts`, `web/src/lib/format.test.ts`, `web/src/pages/batches/api.ts`, `web/src/pages/batches/api.test.tsx`, `web/src/pages/batches/store.ts`, `web/src/pages/batches/store.test.ts`
- Modify: `web/src/pages/test-generation/api.ts`

**Interfaces:**
- Consumes: `apiGet`/`apiSend` (`web/src/lib/api.ts`).
- Produces (Tasks 7–8 consume):
  - `lib/format.ts`: `formatCost(usd: number): string`, `formatDuration(ms: number): string` (moved verbatim from `test-generation/api.ts`, which now re-exports them so `HistoryRow.tsx`'s existing `import { formatCost } from './api'` keeps working unchanged).
  - `pages/batches/api.ts`: types `BatchStatus`, `BatchMode`, `BatchCounts`, `Batch`, `BatchItem`, `BatchDetail`, `BatchPreview`, `BatchScope`; `useBatches()`, `useBatch(id: number | null, intervalMs = 60000)` (polls only while `batch.status` is `created`/`submitted`/`in_progress`), `previewBatch(scope): Promise<BatchPreview>`, `submitBatch(scope): Promise<Batch>`, `cancelBatch(id): Promise<Batch>`, `batchItemImageUrl(batchId, item): string | null`, `batchDownloadUrl(batchId): string`.
  - `pages/batches/store.ts`: `useBatchWizard` (zustand) — `step: 'scope'|'preview'`, `factionIds: number[]`, `cardTypeIds: number[]`, `mode: BatchMode`, `toggleFaction(id)`, `toggleCardType(id)`, `setAllFactions(ids, on)`, `setAllCardTypes(ids, on)`, `reset()`, `set(partial)`.

- [ ] **Step 1: Write failing tests**

`web/src/lib/format.test.ts`:

```ts
import { formatCost, formatDuration } from './format'

test('formatCost trims trailing zero under 10 cents', () => {
  expect(formatCost(0.01)).toBe('$0.01')
  expect(formatCost(0.19)).toBe('$0.19')
})

test('formatCost keeps two decimals at or above 10 cents', () => {
  expect(formatCost(0.4)).toBe('$0.40')
  expect(formatCost(1.5)).toBe('$1.50')
})

test('formatDuration renders seconds under a minute', () => {
  expect(formatDuration(45000)).toBe('45s')
})

test('formatDuration renders minutes and seconds at/above a minute', () => {
  expect(formatDuration(78000)).toBe('1m 18s')
})
```

`web/src/pages/batches/store.test.ts`:

```ts
import { useBatchWizard } from './store'

beforeEach(() => {
  useBatchWizard.getState().reset()
})

test('toggleFaction adds then removes an id', () => {
  useBatchWizard.getState().toggleFaction(1)
  expect(useBatchWizard.getState().factionIds).toEqual([1])
  useBatchWizard.getState().toggleFaction(1)
  expect(useBatchWizard.getState().factionIds).toEqual([])
})

test('setAllCardTypes(ids, true) adds without duplicating', () => {
  useBatchWizard.getState().toggleCardType(2)
  useBatchWizard.getState().setAllCardTypes([1, 2, 3], true)
  expect(useBatchWizard.getState().cardTypeIds.sort()).toEqual([1, 2, 3])
})

test('setAllFactions(ids, false) removes only the given ids', () => {
  useBatchWizard.setState({ factionIds: [1, 2, 3] })
  useBatchWizard.getState().setAllFactions([2], false)
  expect(useBatchWizard.getState().factionIds.sort()).toEqual([1, 3])
})

test('reset clears selection and step back to scope', () => {
  useBatchWizard.setState({ step: 'preview', factionIds: [1], cardTypeIds: [2], mode: 'final' })
  useBatchWizard.getState().reset()
  const s = useBatchWizard.getState()
  expect(s.step).toBe('scope')
  expect(s.factionIds).toEqual([])
  expect(s.cardTypeIds).toEqual([])
  expect(s.mode).toBe('draft')
})
```

`web/src/pages/batches/api.test.tsx`:

```tsx
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../test/msw'
import { useBatch, batchItemImageUrl, batchDownloadUrl, type Batch, type BatchItem } from './api'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

const inProgress: Batch = {
  id: 1, openai_batch_id: 'b1', mode: 'draft', status: 'in_progress', jsonl_path: 'x', output_path: '',
  total_cost_usd: 0, submitted_at: 'a', completed_at: '', created_at: 'a', updated_at: 'a',
  counts: { completed: 0, failed: 0, total: 2 }, est_cost_usd: 0.02,
}

test('useBatch polls while status is in_progress and stops once completed', async () => {
  let calls = 0
  server.use(
    http.get('/api/batches/1', () => {
      calls++
      const status = calls < 2 ? 'in_progress' : 'completed'
      return HttpResponse.json({ batch: { ...inProgress, status }, items: [] })
    }),
  )
  const { result } = renderHook(() => useBatch(1, 10), { wrapper })
  await waitFor(() => expect(result.current.data?.batch.status).toBe('completed'))
  expect(calls).toBeGreaterThanOrEqual(2)
})

test('useBatch disabled when id is null', () => {
  const { result } = renderHook(() => useBatch(null), { wrapper })
  expect(result.current.fetchStatus).toBe('idle')
})

test('batchItemImageUrl is null unless the item is done with an image', () => {
  const pending: BatchItem = { id: 1, batch_id: 1, faction_id: 1, card_type_id: 1, custom_id: 'a__b', status: 'pending', image_path: '', input_tokens: 0, output_tokens: 0, cost_usd: 0, error: '' }
  const done: BatchItem = { ...pending, status: 'done', image_path: 'batches/1/a__b.png' }
  expect(batchItemImageUrl(1, pending)).toBeNull()
  expect(batchItemImageUrl(1, done)).toBe('/api/batches/1/items/1/image')
})

test('batchDownloadUrl builds the zip endpoint', () => {
  expect(batchDownloadUrl(7)).toBe('/api/batches/7/download')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/format.test.ts src/pages/batches/`
Expected: FAIL — modules don't exist

- [ ] **Step 3: Implement**

`web/src/lib/format.ts`:

```ts
export function formatCost(usd: number): string {
  if (usd < 0.1) {
    const s = usd.toFixed(3)
    return `$${s.endsWith('0') ? s.slice(0, -1) : s}`
  }
  return `$${usd.toFixed(2)}`
}

export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  return `${Math.floor(totalSec / 60)}m ${totalSec % 60}s`
}
```

In `web/src/pages/test-generation/api.ts`, remove the local `formatCost`/`formatDuration` definitions (the two functions at the bottom of the file) and replace them with:

```ts
export { formatCost, formatDuration } from '../../lib/format'
```

`web/src/pages/batches/api.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'

export type BatchStatus = 'created' | 'submitted' | 'in_progress' | 'completed' | 'failed' | 'cancelled'
export type BatchMode = 'draft' | 'final'

export type BatchCounts = { completed: number; failed: number; total: number }

export type Batch = {
  id: number
  openai_batch_id: string
  mode: BatchMode
  status: BatchStatus
  jsonl_path: string
  output_path: string
  total_cost_usd: number
  submitted_at: string
  completed_at: string
  created_at: string
  updated_at: string
  counts: BatchCounts
  est_cost_usd: number
}

export type BatchItem = {
  id: number
  batch_id: number
  faction_id: number
  card_type_id: number
  custom_id: string
  status: 'pending' | 'done' | 'failed'
  image_path: string
  input_tokens: number
  output_tokens: number
  cost_usd: number
  error: string
}

export type BatchDetail = { batch: Batch; items: BatchItem[] }
export type BatchPreview = { jsonl: string; count: number; est_cost: number }
export type BatchScope = { faction_ids: number[]; card_type_ids: number[]; mode: BatchMode }

const ACTIVE_STATUSES: BatchStatus[] = ['created', 'submitted', 'in_progress']

export function useBatches() {
  return useQuery({ queryKey: ['batches'], queryFn: () => apiGet<Batch[]>('/api/batches') })
}

export function useBatch(id: number | null, intervalMs = 60000) {
  return useQuery({
    queryKey: ['batches', id],
    queryFn: () => apiGet<BatchDetail>(`/api/batches/${id}`),
    enabled: id !== null,
    refetchInterval: (query) => {
      const status = query.state.data?.batch.status
      return status && ACTIVE_STATUSES.includes(status) ? intervalMs : false
    },
  })
}

export function previewBatch(scope: BatchScope): Promise<BatchPreview> {
  return apiSend<BatchPreview>('POST', '/api/batches/preview', scope)
}

export function submitBatch(scope: BatchScope): Promise<Batch> {
  return apiSend<Batch>('POST', '/api/batches', scope)
}

export function cancelBatch(id: number): Promise<Batch> {
  return apiSend<Batch>('POST', `/api/batches/${id}/cancel`, undefined)
}

export function batchItemImageUrl(batchId: number, item: BatchItem): string | null {
  if (item.status !== 'done' || !item.image_path) return null
  return `/api/batches/${batchId}/items/${item.id}/image`
}

export function batchDownloadUrl(batchId: number): string {
  return `/api/batches/${batchId}/download`
}
```

`web/src/pages/batches/store.ts`:

```ts
import { create } from 'zustand'
import type { BatchMode } from './api'

type BatchWizardState = {
  step: 'scope' | 'preview'
  factionIds: number[]
  cardTypeIds: number[]
  mode: BatchMode
  toggleFaction: (id: number) => void
  toggleCardType: (id: number) => void
  setAllFactions: (ids: number[], on: boolean) => void
  setAllCardTypes: (ids: number[], on: boolean) => void
  reset: () => void
  set: (partial: Partial<Pick<BatchWizardState, 'step' | 'mode'>>) => void
}

const initial = { step: 'scope' as const, factionIds: [] as number[], cardTypeIds: [] as number[], mode: 'draft' as BatchMode }

function toggle(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
}

function setAll(ids: number[], targets: number[], on: boolean): number[] {
  return on ? Array.from(new Set([...ids, ...targets])) : ids.filter((x) => !targets.includes(x))
}

export const useBatchWizard = create<BatchWizardState>()((set, get) => ({
  ...initial,
  toggleFaction: (id) => set({ factionIds: toggle(get().factionIds, id) }),
  toggleCardType: (id) => set({ cardTypeIds: toggle(get().cardTypeIds, id) }),
  setAllFactions: (ids, on) => set({ factionIds: setAll(get().factionIds, ids, on) }),
  setAllCardTypes: (ids, on) => set({ cardTypeIds: setAll(get().cardTypeIds, ids, on) }),
  reset: () => set(initial),
  set: (partial) => set(partial),
}))
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS (also re-verify `test-generation` tests still pass since its `api.ts` changed)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/format.ts web/src/lib/format.test.ts web/src/pages/batches/api.ts web/src/pages/batches/api.test.tsx web/src/pages/batches/store.ts web/src/pages/batches/store.test.ts web/src/pages/test-generation/api.ts
git commit -m "feat: batches data layer (api hooks, wizard store) and shared formatters"
```

### Task 7: Batches list + two-step wizard UI

**Files:**
- Create: `web/src/pages/batches/BatchesPage.tsx`, `web/src/pages/batches/BatchesPage.test.tsx`, `web/src/pages/batches/BatchRow.tsx`, `web/src/pages/batches/NewBatchPage.tsx`, `web/src/pages/batches/NewBatchPage.test.tsx`, `web/src/pages/batches/ScopeStep.tsx`, `web/src/pages/batches/PreviewStep.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `useBatches`, `previewBatch`, `submitBatch`, `BatchPreview`, `BatchMode` (Task 6 `pages/batches/api.ts`); `useBatchWizard` (Task 6 `pages/batches/store.ts`); `useFactions` (`pages/factions/api.ts`), `Faction` type, `DLC_VALUES` (`pages/factions/dlc.ts`); `useCardTypes`, `CardType` type (`pages/card-types/api.ts`); `formatCost` (`lib/format.ts`); `Tag` (`components/Tag.tsx`).
- Produces (Task 8 consumes): route `/batches` renders `BatchesPage`; route `/batches/new` renders `NewBatchPage`, which on successful submit calls `navigate(`/batches/${batch.id}`)` — Task 8 registers that destination route.

- [ ] **Step 1: Write failing tests**

`web/src/pages/batches/BatchesPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter } from 'react-router'
import { server } from '../../test/msw'
import BatchesPage from './BatchesPage'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <BatchesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

test('renders batch rows with status and progress', async () => {
  server.use(
    http.get('/api/batches', () => HttpResponse.json([
      {
        id: 3, openai_batch_id: 'b3', mode: 'final', status: 'completed', jsonl_path: 'x', output_path: 'y',
        total_cost_usd: 0.42, submitted_at: 'a', completed_at: 'b', created_at: 'a', updated_at: 'b',
        counts: { completed: 2, failed: 0, total: 2 }, est_cost_usd: 0.38,
      },
    ])),
  )
  renderPage()
  expect(await screen.findByText('Batch #3')).toBeInTheDocument()
  expect(screen.getByText('completed')).toBeInTheDocument()
  expect(screen.getByText(/2\/2 items/)).toBeInTheDocument()
  expect(screen.getByText(/\$0\.42/)).toBeInTheDocument()
})

test('empty state shown when no batches exist', async () => {
  server.use(http.get('/api/batches', () => HttpResponse.json([])))
  renderPage()
  expect(await screen.findByText('No batches yet.')).toBeInTheDocument()
})

test('load failure shows alert', async () => {
  server.use(http.get('/api/batches', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to load batches.*boom/)
})
```

`web/src/pages/batches/NewBatchPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { server } from '../../test/msw'
import { useBatchWizard } from './store'
import NewBatchPage from './NewBatchPage'

const factions = [
  { id: 1, name: 'Tau Empire', description: 'd', dlc: 'Galaxy in Flames', created_at: 'a', updated_at: 'b' },
]
const cardTypes = [
  { id: 1, name: 'combat', description: '', constraints: '', template_path: 't.png', openai_file_id: 'file-1', created_at: 'a', updated_at: 'b' },
  { id: 2, name: 'upgrade', description: '', constraints: '', template_path: '', openai_file_id: '', created_at: 'a', updated_at: 'b' },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/batches/new']}>
        <Routes>
          <Route path="/batches/new" element={<NewBatchPage />} />
          <Route path="/batches/:id" element={<div>batch detail page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useBatchWizard.getState().reset()
  server.use(
    http.get('/api/factions', () => HttpResponse.json(factions)),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
  )
})

test('card type without a file cannot be selected', async () => {
  renderPage()
  expect(await screen.findByLabelText(/upgrade/)).toBeDisabled()
})

test('scope -> preview -> submit navigates to the new batch', async () => {
  server.use(
    http.post('/api/batches/preview', () => HttpResponse.json({ jsonl: '{"custom_id":"tau_empire__combat"}\n', count: 1, est_cost: 0.005 })),
    http.post('/api/batches', () => HttpResponse.json({
      id: 42, openai_batch_id: 'b42', mode: 'draft', status: 'submitted', jsonl_path: 'x', output_path: '',
      total_cost_usd: 0, submitted_at: 'a', completed_at: '', created_at: 'a', updated_at: 'a',
      counts: { completed: 0, failed: 0, total: 1 }, est_cost_usd: 0.005,
    }, { status: 201 })),
  )
  renderPage()
  await userEvent.click(await screen.findByLabelText('Tau Empire'))
  await userEvent.click(screen.getByLabelText('combat'))
  await userEvent.click(screen.getByRole('button', { name: 'Next: Preview' }))
  expect(await screen.findByText(/1 request/)).toBeInTheDocument()
  expect(screen.getByText(/tau_empire__combat/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Submit batch to OpenAI' }))
  expect(await screen.findByText('batch detail page')).toBeInTheDocument()
})

test('preview failure shows an error and stays on the scope step', async () => {
  server.use(http.post('/api/batches/preview', () => HttpResponse.json({ error: 'card type has no OpenAI file' }, { status: 400 })))
  renderPage()
  await userEvent.click(await screen.findByLabelText('Tau Empire'))
  await userEvent.click(screen.getByLabelText('combat'))
  await userEvent.click(screen.getByRole('button', { name: 'Next: Preview' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/no OpenAI file/)
  expect(screen.getByRole('button', { name: 'Next: Preview' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/batches/`
Expected: FAIL — modules don't exist

- [ ] **Step 3: Implement**

`web/src/pages/batches/BatchRow.tsx`:

```tsx
import { Link } from 'react-router'
import { Tag } from '../../components/Tag'
import { formatCost } from '../../lib/format'
import type { Batch } from './api'

const statusVariant: Record<Batch['status'], 'neutral' | 'solid-accent' | 'outline-accent' | 'warn'> = {
  created: 'neutral',
  submitted: 'outline-accent',
  in_progress: 'outline-accent',
  completed: 'solid-accent',
  failed: 'warn',
  cancelled: 'neutral',
}

export function BatchRow({ batch }: { batch: Batch }) {
  return (
    <Link to={`/batches/${batch.id}`}
      className="flex items-center gap-3.5 rounded-md bg-surface px-3.5 py-3 text-ink no-underline shadow-[0_0_0_1px_var(--color-neutral-800)] hover:bg-ink/5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Batch #{batch.id}</span>
          <Tag variant={batch.mode === 'final' ? 'solid-accent' : 'neutral'}>{batch.mode}</Tag>
          <Tag variant={statusVariant[batch.status]}>{batch.status.replace('_', ' ')}</Tag>
        </div>
        <div className="mt-0.5 text-xs text-ink/50">
          {batch.counts.completed + batch.counts.failed}/{batch.counts.total} items
          {batch.total_cost_usd > 0 && <> · {formatCost(batch.total_cost_usd)}</>}
        </div>
      </div>
    </Link>
  )
}
```

`web/src/pages/batches/BatchesPage.tsx`:

```tsx
import { Link } from 'react-router'
import { useBatches } from './api'
import { BatchRow } from './BatchRow'

export default function BatchesPage() {
  const { data, isLoading, error } = useBatches()

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Batch Processing</h1>
          <p className="m-0 text-sm text-ink/60">{data?.length ?? 0} batches</p>
        </div>
        <Link to="/batches/new"
          className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-accent bg-transparent px-3.5 py-2 text-sm font-medium text-accent no-underline hover:bg-accent/10">
          New Batch
        </Link>
      </div>

      {isLoading && <p className="text-ink/60">Loading…</p>}
      {error && <p role="alert" className="text-danger">Failed to load batches: {error instanceof Error ? error.message : 'unknown'}</p>}
      <div className="flex flex-col gap-2">
        {data?.map((b) => <BatchRow key={b.id} batch={b} />)}
        {data && data.length === 0 && <p className="m-0 text-sm text-ink/50">No batches yet.</p>}
      </div>
    </div>
  )
}
```

`web/src/pages/batches/ScopeStep.tsx`:

```tsx
import { Button } from '../../components/Button'
import type { Faction } from '../factions/api'
import { DLC_VALUES } from '../factions/dlc'
import type { CardType } from '../card-types/api'
import { useBatchWizard } from './store'

export function ScopeStep({
  factions, cardTypes, onNext, loading,
}: { factions: Faction[]; cardTypes: CardType[]; onNext: () => void; loading: boolean }) {
  const wizard = useBatchWizard()
  const uploadedCardTypes = cardTypes.filter((c) => c.openai_file_id)
  const requestCount = wizard.factionIds.length * wizard.cardTypeIds.length
  const canProceed = requestCount > 0 && !loading

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-ink/70">Factions</span>
          <button type="button"
            onClick={() => wizard.setAllFactions(factions.map((f) => f.id), wizard.factionIds.length < factions.length)}
            className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent">
            {wizard.factionIds.length < factions.length ? 'Select all' : 'Deselect all'}
          </button>
        </div>
        <div className="flex flex-col gap-3 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-neutral-800)]">
          {DLC_VALUES.map((dlc) => {
            const group = factions.filter((f) => f.dlc === dlc)
            if (group.length === 0) return null
            const groupIds = group.map((f) => f.id)
            const allSelected = groupIds.every((id) => wizard.factionIds.includes(id))
            return (
              <div key={dlc}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-ink/45">{dlc}</span>
                  <button type="button" onClick={() => wizard.setAllFactions(groupIds, !allSelected)}
                    className="cursor-pointer border-0 bg-transparent text-[11px] font-medium text-accent">
                    {allSelected ? 'Deselect group' : 'Select group'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.map((f) => (
                    <label key={f.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-md border border-divider px-2.5 py-1.5 text-[13px] has-[:checked]:border-accent has-[:checked]:text-accent">
                      <input type="checkbox" checked={wizard.factionIds.includes(f.id)} onChange={() => wizard.toggleFaction(f.id)} />
                      {f.name}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          {factions.length === 0 && <p className="m-0 text-sm text-ink/50">No factions yet.</p>}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-ink/70">Card Types</span>
          <button type="button"
            onClick={() => wizard.setAllCardTypes(uploadedCardTypes.map((c) => c.id), wizard.cardTypeIds.length < uploadedCardTypes.length)}
            className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent">
            {wizard.cardTypeIds.length < uploadedCardTypes.length ? 'Select all' : 'Deselect all'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-neutral-800)]">
          {cardTypes.map((c) => {
            const disabled = !c.openai_file_id
            return (
              <label key={c.id}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] ${disabled ? 'cursor-not-allowed border-divider/50 text-ink/35' : 'cursor-pointer border-divider has-[:checked]:border-accent has-[:checked]:text-accent'}`}>
                <input type="checkbox" disabled={disabled} checked={wizard.cardTypeIds.includes(c.id)} onChange={() => wizard.toggleCardType(c.id)} />
                {c.name}{disabled && ' (no file uploaded)'}
              </label>
            )
          })}
          {cardTypes.length === 0 && <p className="m-0 text-sm text-ink/50">No card types yet.</p>}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-xs text-ink/70">Mode</span>
        <div className="inline-flex overflow-hidden rounded-md border border-divider" role="group" aria-label="Mode">
          {(['draft', 'final'] as const).map((m, i) => (
            <button key={m} type="button" onClick={() => wizard.set({ mode: m })}
              className={`px-3.5 py-1.5 text-[13px] cursor-pointer bg-transparent border-0 ${i > 0 ? 'border-l border-divider' : ''} ${wizard.mode === m ? 'text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-ink'}`}>
              {m === 'draft' ? 'Draft' : 'Final'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!canProceed} onClick={onNext}>
          {loading ? 'Building preview…' : 'Next: Preview'}
        </Button>
        <span className="text-xs text-ink/45">{requestCount} request{requestCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}
```

`web/src/pages/batches/PreviewStep.tsx`:

```tsx
import { Button } from '../../components/Button'
import { formatCost } from '../../lib/format'
import type { BatchMode, BatchPreview } from './api'

export function PreviewStep({
  preview, mode, submitting, onBack, onSubmit,
}: { preview: BatchPreview; mode: BatchMode; submitting: boolean; onBack: () => void; onSubmit: () => void }) {
  return (
    <div className="flex flex-col gap-3.5">
      {mode === 'final' ? (
        <p className="m-0 rounded-md border border-warn/40 bg-warn/15 px-3 py-2 text-[13px] font-medium text-warn">
          FINAL BATCH — high quality, real cost
        </p>
      ) : (
        <p className="m-0 rounded-md border border-divider bg-surface px-3 py-2 text-[13px] text-ink/70">
          DRAFT batch — low quality, cheap iteration
        </p>
      )}

      <div className="flex items-center gap-4 text-sm text-ink/70">
        <span>{preview.count} request{preview.count === 1 ? '' : 's'}</span>
        <span>est. {formatCost(preview.est_cost)} total (estimate)</span>
      </div>

      <div>
        <span className="mb-1 block text-xs text-ink/70">Request file (requests.jsonl)</span>
        <pre className="m-0 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-md border border-divider bg-bg p-2.5 font-mono text-[11.5px] leading-normal text-ink/75">
          {preview.jsonl}
        </pre>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onBack} disabled={submitting}>Back</Button>
        <Button variant="primary" onClick={onSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit batch to OpenAI'}
        </Button>
      </div>
    </div>
  )
}
```

`web/src/pages/batches/NewBatchPage.tsx`:

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useFactions } from '../factions/api'
import { useCardTypes } from '../card-types/api'
import { previewBatch, submitBatch, type BatchPreview } from './api'
import { useBatchWizard } from './store'
import { ScopeStep } from './ScopeStep'
import { PreviewStep } from './PreviewStep'

export default function NewBatchPage() {
  const wizard = useBatchWizard()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: factions, error: factionsError } = useFactions()
  const { data: cardTypes, error: cardTypesError } = useCardTypes()
  const [preview, setPreview] = useState<BatchPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function goToPreview() {
    setError(null)
    setPreviewing(true)
    try {
      const p = await previewBatch({ faction_ids: wizard.factionIds, card_type_ids: wizard.cardTypeIds, mode: wizard.mode })
      setPreview(p)
      wizard.set({ step: 'preview' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to build preview')
    } finally {
      setPreviewing(false)
    }
  }

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const batch = await submitBatch({ faction_ids: wizard.factionIds, card_type_ids: wizard.cardTypeIds, mode: wizard.mode })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      wizard.reset()
      navigate(`/batches/${batch.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to submit batch')
    } finally {
      setSubmitting(false)
    }
  }

  if (factionsError || cardTypesError) {
    const err = factionsError ?? cardTypesError
    return (
      <div className="max-w-3xl">
        <p role="alert" className="m-0 text-sm text-danger">
          Failed to load {factionsError ? 'factions' : 'card types'}: {err instanceof Error ? err.message : 'unknown'}
        </p>
      </div>
    )
  }
  if (!factions || !cardTypes) {
    return <div className="max-w-3xl"><p className="text-ink/60">Loading…</p></div>
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">New Batch</h1>
      <p className="m-0 mb-5 text-sm text-ink/60">
        {wizard.step === 'scope' ? 'Choose factions, card types, and a mode' : 'Review the request file before it goes to OpenAI'}
      </p>

      {error && <p role="alert" className="m-0 mb-3.5 text-sm text-danger">{error}</p>}

      {wizard.step === 'scope' ? (
        <ScopeStep factions={factions} cardTypes={cardTypes} onNext={goToPreview} loading={previewing} />
      ) : (
        preview && (
          <PreviewStep preview={preview} mode={wizard.mode} submitting={submitting}
            onBack={() => wizard.set({ step: 'scope' })} onSubmit={submit} />
        )
      )}
    </div>
  )
}
```

In `web/src/App.tsx`, replace the `/batches` placeholder route and add `/batches/new`:

```tsx
import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import FactionsPage from './pages/factions/FactionsPage'
import CardTypesPage from './pages/card-types/CardTypesPage'
import TestGenerationPage from './pages/test-generation/TestGenerationPage'
import BatchesPage from './pages/batches/BatchesPage'
import NewBatchPage from './pages/batches/NewBatchPage'
import SettingsPage from './pages/settings/SettingsPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/factions" replace /> },
      { path: '/factions', element: <FactionsPage /> },
      { path: '/card-types', element: <CardTypesPage /> },
      { path: '/test-generation', element: <TestGenerationPage /> },
      { path: '/batches', element: <BatchesPage /> },
      { path: '/batches/new', element: <NewBatchPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]
```

(`PlaceholderPage` import is dropped since no route uses it anymore after Task 8 also removes the `/batches/:id` placeholder — if Task 8 hasn't run yet, leave the unused import out only once both routes it served are gone; for this task just remove the `/batches` line's placeholder usage and the now-unused `PlaceholderPage` import.)

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/batches/BatchesPage.tsx web/src/pages/batches/BatchesPage.test.tsx web/src/pages/batches/BatchRow.tsx web/src/pages/batches/NewBatchPage.tsx web/src/pages/batches/NewBatchPage.test.tsx web/src/pages/batches/ScopeStep.tsx web/src/pages/batches/PreviewStep.tsx web/src/App.tsx
git commit -m "feat: batches list and two-step submission wizard"
```

### Task 8: Batch detail page (progress, cancel, item grid, ZIP download)

**Files:**
- Create: `web/src/pages/batches/BatchDetailPage.tsx`, `web/src/pages/batches/BatchDetailPage.test.tsx`, `web/src/pages/batches/ItemCard.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `useBatch`, `cancelBatch`, `batchDownloadUrl`, `batchItemImageUrl`, `BatchItem` (Task 6 `pages/batches/api.ts` — including the `est_cost_usd` field on `Batch`, Task 4's contract); `useFactions`, `useCardTypes`; `formatCost`, `formatDuration` (`lib/format.ts`); `Button`, `ConfirmDialog`, `Tag` components.
- Produces: route `/batches/:id` renders `BatchDetailPage` — the navigation target Task 7's `NewBatchPage` already routes to on submit.

- [ ] **Step 1: Write failing tests**

`web/src/pages/batches/BatchDetailPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { MemoryRouter, Route, Routes } from 'react-router'
import { server } from '../../test/msw'
import type { Batch, BatchItem } from './api'
import BatchDetailPage from './BatchDetailPage'

const factions = [{ id: 1, name: 'Tau Empire', description: 'd', dlc: 'Galaxy in Flames', created_at: 'a', updated_at: 'b' }]
const cardTypes = [{ id: 1, name: 'combat', description: '', constraints: '', template_path: 't.png', openai_file_id: 'file-1', created_at: 'a', updated_at: 'b' }]

const baseBatch: Batch = {
  id: 5, openai_batch_id: 'b5', mode: 'draft', status: 'in_progress', jsonl_path: 'x', output_path: '',
  total_cost_usd: 0, submitted_at: 'a', completed_at: '', created_at: 'a', updated_at: 'a',
  counts: { completed: 1, failed: 0, total: 2 }, est_cost_usd: 0.02,
}
const doneItem: BatchItem = {
  id: 1, batch_id: 5, faction_id: 1, card_type_id: 1, custom_id: 'tau_empire__combat', status: 'done',
  image_path: 'batches/5/tau_empire__combat.png', input_tokens: 100, output_tokens: 400, cost_usd: 0.008, error: '',
}
const failedItem: BatchItem = { ...doneItem, id: 2, status: 'failed', image_path: '', cost_usd: 0, error: 'content policy violation' }

function renderPage(path = '/batches/5') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/batches/:id" element={<BatchDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  server.use(
    http.get('/api/factions', () => HttpResponse.json(factions)),
    http.get('/api/card-types', () => HttpResponse.json(cardTypes)),
  )
})

test('renders header progress, mode/status tags, and item grid', async () => {
  server.use(http.get('/api/batches/5', () => HttpResponse.json({ batch: baseBatch, items: [doneItem, failedItem] })))
  renderPage()
  expect(await screen.findByText('Batch #5')).toBeInTheDocument()
  expect(screen.getByText('draft')).toBeInTheDocument()
  expect(screen.getByText('in progress')).toBeInTheDocument()
  expect(screen.getByText(/1\/2 done/)).toBeInTheDocument()
  expect(screen.getAllByText(/Tau Empire/).length).toBeGreaterThan(0)
  expect(screen.getByText(/content policy violation/)).toBeInTheDocument()
})

test('completed batch shows a download link and actual cost', async () => {
  const completed: Batch = { ...baseBatch, status: 'completed', total_cost_usd: 0.008, completed_at: 'b', counts: { completed: 1, failed: 1, total: 2 } }
  server.use(http.get('/api/batches/5', () => HttpResponse.json({ batch: completed, items: [doneItem, failedItem] })))
  renderPage()
  const link = await screen.findByRole('link', { name: 'Download ZIP' })
  expect(link).toHaveAttribute('href', '/api/batches/5/download')
  expect(screen.getByText(/\$0\.01|\$0\.008/)).toBeInTheDocument()
})

test('cancel confirms, calls the API, and closes the dialog', async () => {
  let cancelled = false
  server.use(
    http.get('/api/batches/5', () => HttpResponse.json({ batch: baseBatch, items: [doneItem] })),
    http.post('/api/batches/5/cancel', () => {
      cancelled = true
      return HttpResponse.json({ ...baseBatch, status: 'cancelled' })
    }),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel batch' }))
  expect(screen.getByText(/stop processing/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Cancel batch' }))
  expect(cancelled).toBe(true)
})

test('cancel failure shows an error inside the confirm dialog', async () => {
  server.use(
    http.get('/api/batches/5', () => HttpResponse.json({ batch: baseBatch, items: [] })),
    http.post('/api/batches/5/cancel', () => HttpResponse.json({ error: 'openai: already finalizing' }, { status: 502 })),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel batch' }))
  await userEvent.click(screen.getByRole('button', { name: 'Cancel batch' }))
  expect(await screen.findByRole('alert')).toHaveTextContent(/already finalizing/)
})

test('load failure shows an alert instead of a stuck loading state', async () => {
  server.use(http.get('/api/batches/5', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
  renderPage()
  expect(await screen.findByRole('alert')).toHaveTextContent(/Failed to load batch.*boom/)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/batches/BatchDetailPage.test.tsx`
Expected: FAIL — module doesn't exist

- [ ] **Step 3: Implement**

`web/src/pages/batches/ItemCard.tsx`:

```tsx
import { Tag } from '../../components/Tag'
import { formatCost } from '../../lib/format'
import { batchItemImageUrl, type BatchItem } from './api'

export function ItemCard({
  item, batchId, factionName, cardTypeName,
}: { item: BatchItem; batchId: number; factionName: string; cardTypeName: string }) {
  const imageUrl = batchItemImageUrl(batchId, item)
  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      {imageUrl ? (
        <img src={imageUrl} alt={`${factionName} ${cardTypeName}`} className="aspect-[3/4] w-full object-cover" />
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center bg-neutral-800">
          <Tag variant={item.status === 'failed' ? 'warn' : 'neutral'}>{item.status}</Tag>
        </div>
      )}
      <div className="p-2.5">
        <div className="truncate text-[13px] font-medium">{factionName} <span className="text-ink/40">×</span> {cardTypeName}</div>
        {item.status === 'done' && <div className="mt-0.5 text-xs text-ink/50">{formatCost(item.cost_usd)}</div>}
        {item.status === 'failed' && <div role="alert" className="mt-0.5 text-xs text-danger">{item.error}</div>}
      </div>
    </div>
  )
}
```

`web/src/pages/batches/BatchDetailPage.tsx`:

```tsx
import { useState } from 'react'
import { useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Tag } from '../../components/Tag'
import { formatCost, formatDuration } from '../../lib/format'
import { useFactions } from '../factions/api'
import { useCardTypes } from '../card-types/api'
import { useBatch, cancelBatch, batchDownloadUrl } from './api'
import { ItemCard } from './ItemCard'

function elapsedMs(startISO: string, endISO: string): number {
  const start = new Date(startISO).getTime()
  const end = new Date(endISO).getTime()
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? end - start : 0
}

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const batchId = id ? Number(id) : null
  const { data, isLoading, error, refetch } = useBatch(batchId)
  const { data: factions } = useFactions()
  const { data: cardTypes } = useCardTypes()
  const queryClient = useQueryClient()
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [cancelError, setCancelError] = useState<string | null>(null)

  async function doCancel() {
    if (batchId === null) return
    setCancelling(true)
    setCancelError(null)
    try {
      await cancelBatch(batchId)
      setConfirmCancel(false)
      queryClient.invalidateQueries({ queryKey: ['batches', batchId] })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : 'failed to cancel batch')
    } finally {
      setCancelling(false)
    }
  }

  if (error) {
    return (
      <div className="max-w-5xl">
        <p role="alert" className="m-0 text-sm text-danger">
          Failed to load batch: {error instanceof Error ? error.message : 'unknown'}
        </p>
      </div>
    )
  }
  if (isLoading || !data) {
    return <div className="max-w-5xl"><p className="text-ink/60">Loading…</p></div>
  }

  const { batch, items } = data
  const active = batch.status === 'created' || batch.status === 'submitted' || batch.status === 'in_progress'
  const cancellable = batch.status === 'submitted' || batch.status === 'in_progress'
  const factionName = (fid: number) => factions?.find((f) => f.id === fid)?.name ?? '—'
  const cardTypeName = (ctid: number) => cardTypes?.find((c) => c.id === ctid)?.name ?? '—'

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <div className="mb-1.5 flex items-center gap-2.5">
            <h1 className="m-0 text-[32px] font-medium leading-tight tracking-tight">Batch #{batch.id}</h1>
            <Tag variant={batch.mode === 'final' ? 'solid-accent' : 'neutral'}>{batch.mode}</Tag>
            <Tag variant={active ? 'outline-accent' : batch.status === 'completed' ? 'solid-accent' : 'warn'}>
              {batch.status.replace('_', ' ')}
            </Tag>
          </div>
          <p className="m-0 text-sm text-ink/60">
            {batch.counts.completed + batch.counts.failed}/{batch.counts.total} done
            {batch.submitted_at && batch.completed_at && ` · ${formatDuration(elapsedMs(batch.submitted_at, batch.completed_at))}`}
            {batch.total_cost_usd > 0
              ? ` · ${formatCost(batch.total_cost_usd)} actual (est. ${formatCost(batch.est_cost_usd)})`
              : ` · est. ${formatCost(batch.est_cost_usd)}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {active && <Button onClick={() => refetch()}>Refresh</Button>}
          {cancellable && <Button onClick={() => setConfirmCancel(true)}>Cancel batch</Button>}
          {batch.status === 'completed' && (
            <a href={batchDownloadUrl(batch.id)}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-accent bg-transparent px-3.5 py-2 text-sm font-medium text-accent no-underline hover:bg-accent/10">
              Download ZIP
            </a>
          )}
        </div>
      </div>

      {batch.status === 'failed' && (
        <p role="alert" className="m-0 mb-3.5 text-sm text-danger">This batch failed — check individual items below for details.</p>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4">
        {items.map((item) => (
          <ItemCard key={item.id} item={item} batchId={batch.id}
            factionName={factionName(item.faction_id)} cardTypeName={cardTypeName(item.card_type_id)} />
        ))}
      </div>
      {items.length === 0 && <p className="m-0 text-sm text-ink/50">No items in this batch.</p>}

      {confirmCancel && (
        <ConfirmDialog title="Cancel batch?"
          body="OpenAI will stop processing any requests that haven't completed yet."
          confirmLabel="Cancel batch" cancelLabel="Keep running"
          error={cancelError}
          onConfirm={doCancel}
          onCancel={() => { if (!cancelling) { setConfirmCancel(false); setCancelError(null) } }} />
      )}
    </div>
  )
}
```

In `web/src/App.tsx`, add the detail route and drop the now-fully-unused `PlaceholderPage` import:

```tsx
import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import FactionsPage from './pages/factions/FactionsPage'
import CardTypesPage from './pages/card-types/CardTypesPage'
import TestGenerationPage from './pages/test-generation/TestGenerationPage'
import BatchesPage from './pages/batches/BatchesPage'
import NewBatchPage from './pages/batches/NewBatchPage'
import BatchDetailPage from './pages/batches/BatchDetailPage'
import SettingsPage from './pages/settings/SettingsPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/factions" replace /> },
      { path: '/factions', element: <FactionsPage /> },
      { path: '/card-types', element: <CardTypesPage /> },
      { path: '/test-generation', element: <TestGenerationPage /> },
      { path: '/batches', element: <BatchesPage /> },
      { path: '/batches/new', element: <NewBatchPage /> },
      { path: '/batches/:id', element: <BatchDetailPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 5: Type-check and build**

Run: `cd web && npx tsc --noEmit && npx vite build`
Expected: no type errors; build succeeds (confirms `PlaceholderPage.tsx` is now unused dead code — leave the file in place, nothing else imports it, but do not delete it as part of this task since removing files isn't this task's job)

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/batches/BatchDetailPage.tsx web/src/pages/batches/BatchDetailPage.test.tsx web/src/pages/batches/ItemCard.tsx web/src/App.tsx
git commit -m "feat: batch detail page — progress, cancel, item grid, ZIP download"
```

---

## Self-Review

**Spec coverage:**
- §5 schema (batches/batch_items) → Task 1.
- §4 batchpoller (60s tick, status mapping, completion processing, startup resume) → Task 5.
- §7.4 submit flow (JSONL → Files API purpose:"batch" → POST /v1/batches, 24h window) → Tasks 2–4.
- §8.3 JSONL exact shape, slugify, 1000-line cap → Task 3.
- §7.1 delete guards (deferred from M2) → Task 4.
- §9 API surface (preview/submit/list/get/cancel/item-image/download) → Task 4.
- §10 errors (surfaced message + request id via existing `openai.Client.do`; poll `isError` handling in `useBatch`) → Tasks 2, 4, 6.
- §12 wizard/detail UI acceptance (scope step with DLC grouping and disabled-without-file card types, preview step with mode banner/JSONL/cost estimate, detail page with progress/cancel/grid/ZIP/actual-vs-estimate) → Tasks 7–8.
- Batch pricing at 50% of price-table rates → Task 5 (`batchpoller.processOutputLines`) and Task 4 (`Preview`'s `est_cost`)/Task 4's `out()` (`est_cost_usd`).

**Placeholder scan:** no TBD/TODO/"similar to Task N"/handwaved steps — every step above has complete code.

**Type consistency:** `store.BatchItemInput` (Task 1) matches `jsonl.Line` → `BatchItemInput` mapping in Task 4's `Create`. `batchpoller.Counts` (Task 5) matches the `Counts` type referenced in Task 4's `batchOut`/`counts()` (Task 4 explicitly notes stubbing it if Task 5 hasn't landed yet). `store.Batch`/`store.BatchItem` JSON field names (Task 1) match the TS `Batch`/`BatchItem` types (Task 6) field-for-field, including the additive `counts` and `est_cost_usd` fields Task 4 merges in. `openai.BatchStatus` (Task 2) matches the fields `batchpoller.pollOne`/`complete` read (Task 5).
