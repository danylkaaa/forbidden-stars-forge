# Card Forge — Milestone 3: Card Types Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card Types CRUD with chromakey template upload (staged in form, saved via multipart), OpenAI Files API integration (`purpose: "vision"`) with stale file-id clearing, and a real "Test OpenAI connection" button.

**Architecture:** Backend adds migration 0003 (card_types), a `CardTypesStore`, a hand-rolled `internal/openai` client (models list + file upload, 429/5xx retry), and card-types API handlers (multipart create/update writing templates to `<dataDir>/templates/`, template serving, upload-to-openai). `NewRouter` gains a `dataDir` parameter. Frontend adds `apiSendForm`, an aspect-ratio util, the card-types data layer (reusing `createDraftFormStore`), and the Card Types page (3-column grid, dialog with dropzone + staged file + OpenAI file panel + diff).

**Tech Stack:** Existing stack (Go 1.24+/chi/modernc-sqlite/golang-migrate; React 19/Vite/Tailwind v4/TanStack Query/zustand/Vitest+RTL+MSW). No new dependencies.

**Spec:** `docs/superpowers/specs/2026-07-15-card-forge-design.md` (§4 packages, §6 Card Types). PRD: `docs/prd/PRD-1.md` (§5 schema, §7.2 behavior, §9 API, §10 errors).

## Global Constraints

- All API JSON snake_case. Server `:8080`. Explicit save only: template file staged in form state, sent with Save (multipart); nothing persists before Save.
- `card_types` schema exactly PRD §5: name UNIQUE, description, constraints, template_path (nullable), openai_file_id (nullable), timestamps. No revisions for card types.
- Replacing the template ALWAYS clears the stale `openai_file_id` (server-side, same transaction) — PRD §7.2/§10.
- Template files: PNG or JPEG only, max 20 MB, stored under `<dataDir>/templates/` (dataDir from `CARDFORGE_DATA` env, default `./data`); DB stores the relative path. Old template file deleted best-effort on replace/delete.
- Aspect warning (client-side): deviation of w/h from 816:1104 by more than 2% → warning text "Aspect ratio deviates from 816:1104 by X.X% — consider re-cropping".
- OpenAI: key resolution = `OPENAI_API_KEY` env overrides settings `openai_api_key` (never written back). Files upload uses `purpose: "vision"`. Errors surface `error.message` + request id (`x-request-id`). Retry 429/5xx up to 3 attempts with exponential backoff. Missing key → actionable message "OpenAI API key not set — add it in Settings".
- `POST /api/settings/test-openai` becomes REAL: `GET /v1/models`, 10 s timeout, ALWAYS HTTP 200 `{ok, message}` (failure is data, not an HTTP error) — mirrors M2's test-claude pattern.
- Frontend component files ≤~150 lines (hard cap 200); every input labeled via Field/htmlFor/aria (M1 lesson); error paths surfaced as `role="alert"` (M2 final-review lesson: every await in a user flow gets try/catch + visible error).
- Commit after every task.

---

### Task 1: Migration 0003 + CardTypesStore

**Files:**
- Create: `server/internal/store/migrations/0003_card_types.up.sql`, `server/internal/store/migrations/0003_card_types.down.sql`, `server/internal/store/cardtypes.go`
- Test: `server/internal/store/cardtypes_test.go`

**Interfaces:**
- Consumes: `store.Open`, `ErrNotFound`, `ErrDuplicateName`, `isUniqueViolation` (M2).
- Produces (Task 3 consumes): `store.CardType{ID int64; Name, Description, Constraints, TemplatePath, OpenAIFileID string; CreatedAt, UpdatedAt string}` (json `id,name,description,constraints,template_path,openai_file_id,created_at,updated_at`; empty string = null); `store.NewCardTypesStore(db *sql.DB) *CardTypesStore`; methods `List() ([]CardType, error)` (name ASC), `Get(id int64) (CardType, error)`, `Create(name, description, constraints, templatePath string) (CardType, error)`, `Update(id int64, name, description, constraints string, newTemplatePath *string) (CardType, error)` (non-nil newTemplatePath sets template_path AND clears openai_file_id in the same UPDATE), `SetFileID(id int64, fileID string) error`, `Delete(id int64) error`.

- [ ] **Step 1: Write migration files**

`server/internal/store/migrations/0003_card_types.up.sql`:

```sql
CREATE TABLE card_types (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,
  description        TEXT NOT NULL DEFAULT '',
  constraints        TEXT NOT NULL DEFAULT '',
  template_path      TEXT,
  openai_file_id     TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`server/internal/store/migrations/0003_card_types.down.sql`:

```sql
DROP TABLE card_types;
```

- [ ] **Step 2: Write failing tests**

`server/internal/store/cardtypes_test.go`:

```go
package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func openCardTypes(t *testing.T) *CardTypesStore {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewCardTypesStore(db)
}

func TestCardTypeCreateAndGet(t *testing.T) {
	s := openCardTypes(t)
	ct, err := s.Create("combat", "frontline warriors", "fill the crimson zone", "")
	if err != nil {
		t.Fatal(err)
	}
	if ct.ID == 0 || ct.Name != "combat" || ct.TemplatePath != "" || ct.OpenAIFileID != "" {
		t.Fatalf("bad card type: %+v", ct)
	}
	got, err := s.Get(ct.ID)
	if err != nil || got.Constraints != "fill the crimson zone" {
		t.Fatalf("get: %+v err=%v", got, err)
	}
}

func TestCardTypeDuplicateName(t *testing.T) {
	s := openCardTypes(t)
	s.Create("schema", "", "", "")
	_, err := s.Create("schema", "", "", "")
	if !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("err = %v", err)
	}
}

func TestCardTypeListOrdersByName(t *testing.T) {
	s := openCardTypes(t)
	s.Create("upgrade", "", "", "")
	s.Create("combat", "", "", "")
	all, err := s.List()
	if err != nil || len(all) != 2 {
		t.Fatalf("list: %v len=%d", err, len(all))
	}
	if all[0].Name != "combat" || all[1].Name != "upgrade" {
		t.Fatalf("order: %s, %s", all[0].Name, all[1].Name)
	}
}

func TestCardTypeUpdateTemplateClearsFileID(t *testing.T) {
	s := openCardTypes(t)
	ct, _ := s.Create("combat", "", "", "templates/a.png")
	if err := s.SetFileID(ct.ID, "file-abc123"); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Get(ct.ID)
	if got.OpenAIFileID != "file-abc123" {
		t.Fatalf("file id = %q", got.OpenAIFileID)
	}

	// fields-only update keeps the file id
	upd, err := s.Update(ct.ID, "combat", "new desc", "new constraints", nil)
	if err != nil || upd.OpenAIFileID != "file-abc123" {
		t.Fatalf("fields-only update: %+v err=%v", upd, err)
	}

	// template replacement clears it
	newPath := "templates/b.png"
	upd, err = s.Update(ct.ID, "combat", "new desc", "new constraints", &newPath)
	if err != nil {
		t.Fatal(err)
	}
	if upd.TemplatePath != "templates/b.png" || upd.OpenAIFileID != "" {
		t.Fatalf("template update: %+v", upd)
	}
}

func TestCardTypeUpdateNotFoundAndDuplicate(t *testing.T) {
	s := openCardTypes(t)
	if _, err := s.Update(999, "x", "", "", nil); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing: %v", err)
	}
	s.Create("combat", "", "", "")
	ct, _ := s.Create("schema", "", "", "")
	if _, err := s.Update(ct.ID, "combat", "", "", nil); !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("rename to duplicate: %v", err)
	}
}

func TestCardTypeDelete(t *testing.T) {
	s := openCardTypes(t)
	ct, _ := s.Create("combat", "", "", "")
	if err := s.Delete(ct.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(ct.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get after delete: %v", err)
	}
	if err := s.Delete(ct.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("double delete: %v", err)
	}
}

func TestCardTypeSetFileIDNotFound(t *testing.T) {
	s := openCardTypes(t)
	if err := s.SetFileID(999, "file-x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("set file id missing: %v", err)
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && go test ./internal/store/`
Expected: FAIL — `undefined: NewCardTypesStore`

- [ ] **Step 4: Implement**

`server/internal/store/cardtypes.go`:

```go
package store

import "database/sql"

type CardType struct {
	ID           int64  `json:"id"`
	Name         string `json:"name"`
	Description  string `json:"description"`
	Constraints  string `json:"constraints"`
	TemplatePath string `json:"template_path"`
	OpenAIFileID string `json:"openai_file_id"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

type CardTypesStore struct {
	db *sql.DB
}

func NewCardTypesStore(db *sql.DB) *CardTypesStore {
	return &CardTypesStore{db: db}
}

const cardTypeCols = "id, name, description, constraints, COALESCE(template_path,''), COALESCE(openai_file_id,''), created_at, updated_at"

func scanCardType(row interface{ Scan(...any) error }) (CardType, error) {
	var ct CardType
	err := row.Scan(&ct.ID, &ct.Name, &ct.Description, &ct.Constraints, &ct.TemplatePath, &ct.OpenAIFileID, &ct.CreatedAt, &ct.UpdatedAt)
	if err == sql.ErrNoRows {
		return ct, ErrNotFound
	}
	return ct, err
}

func (s *CardTypesStore) List() ([]CardType, error) {
	rows, err := s.db.Query("SELECT " + cardTypeCols + " FROM card_types ORDER BY name ASC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]CardType, 0)
	for rows.Next() {
		ct, err := scanCardType(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, ct)
	}
	return out, rows.Err()
}

func (s *CardTypesStore) Get(id int64) (CardType, error) {
	return scanCardType(s.db.QueryRow("SELECT "+cardTypeCols+" FROM card_types WHERE id = ?", id))
}

func nullable(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func (s *CardTypesStore) Create(name, description, constraints, templatePath string) (CardType, error) {
	res, err := s.db.Exec(
		`INSERT INTO card_types (name, description, constraints, template_path) VALUES (?, ?, ?, ?)`,
		name, description, constraints, nullable(templatePath))
	if err != nil {
		if isUniqueViolation(err) {
			return CardType{}, ErrDuplicateName
		}
		return CardType{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return CardType{}, err
	}
	return s.Get(id)
}

// Update saves fields; a non-nil newTemplatePath replaces the template AND
// clears the stale openai_file_id in the same statement (PRD §7.2).
func (s *CardTypesStore) Update(id int64, name, description, constraints string, newTemplatePath *string) (CardType, error) {
	var res sql.Result
	var err error
	if newTemplatePath != nil {
		res, err = s.db.Exec(
			`UPDATE card_types SET name = ?, description = ?, constraints = ?,
			 template_path = ?, openai_file_id = NULL, updated_at = datetime('now') WHERE id = ?`,
			name, description, constraints, nullable(*newTemplatePath), id)
	} else {
		res, err = s.db.Exec(
			`UPDATE card_types SET name = ?, description = ?, constraints = ?, updated_at = datetime('now') WHERE id = ?`,
			name, description, constraints, id)
	}
	if err != nil {
		if isUniqueViolation(err) {
			return CardType{}, ErrDuplicateName
		}
		return CardType{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return CardType{}, ErrNotFound
	}
	return s.Get(id)
}

func (s *CardTypesStore) SetFileID(id int64, fileID string) error {
	res, err := s.db.Exec(
		`UPDATE card_types SET openai_file_id = ?, updated_at = datetime('now') WHERE id = ?`, fileID, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *CardTypesStore) Delete(id int64) error {
	res, err := s.db.Exec(`DELETE FROM card_types WHERE id = ?`, id)
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
Expected: PASS (all packages)

- [ ] **Step 6: Commit**

```bash
git add server/internal/store/
git commit -m "feat: card types store with stale file-id clearing on template change"
```

---

### Task 2: OpenAI client (models list + file upload, retry)

**Files:**
- Create: `server/internal/openai/client.go`
- Test: `server/internal/openai/client_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 3 consumes; M4 extends with images/edits): `openai.New(apiKey string) *Client` (BaseURL defaults `https://api.openai.com`, RetryBase 500 ms); `Client{APIKey, BaseURL string, RetryBase time.Duration}`; `(c) ListModels(ctx) (int, error)` — GET /v1/models, returns model count; `(c) UploadFile(ctx, filename, purpose string, data io.Reader) (string, error)` — multipart POST /v1/files, returns file id. Errors: missing key → "OpenAI API key not set — add it in Settings"; API error → `openai: <error.message> (request id <x-request-id>)`; 429/5xx retried up to 3 attempts total with backoff RetryBase·2ⁿ.

- [ ] **Step 1: Write failing tests**

`server/internal/openai/client_test.go`:

```go
package openai

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func testClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	srv := httptest.NewServer(handler)
	t.Cleanup(srv.Close)
	c := New("sk-test")
	c.BaseURL = srv.URL
	c.RetryBase = time.Millisecond
	return c
}

func TestListModels(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" || r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Errorf("bad request: %s %s auth=%q", r.Method, r.URL.Path, r.Header.Get("Authorization"))
		}
		w.Write([]byte(`{"data":[{"id":"gpt-image-2"},{"id":"gpt-4.1"}]}`))
	})
	n, err := c.ListModels(context.Background())
	if err != nil || n != 2 {
		t.Fatalf("n=%d err=%v", n, err)
	}
}

func TestMissingKey(t *testing.T) {
	c := New("")
	_, err := c.ListModels(context.Background())
	if err == nil || !strings.Contains(err.Error(), "OpenAI API key not set") {
		t.Fatalf("err = %v", err)
	}
}

func TestAPIErrorSurfacesMessageAndRequestID(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_123")
		w.WriteHeader(http.StatusUnauthorized)
		w.Write([]byte(`{"error":{"message":"Incorrect API key provided"}}`))
	})
	_, err := c.ListModels(context.Background())
	if err == nil || !strings.Contains(err.Error(), "Incorrect API key provided") || !strings.Contains(err.Error(), "req_123") {
		t.Fatalf("err = %v", err)
	}
}

func TestRetriesOn5xxThenSucceeds(t *testing.T) {
	attempts := 0
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts < 3 {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte(`{"error":{"message":"server error"}}`))
			return
		}
		w.Write([]byte(`{"data":[{"id":"m"}]}`))
	})
	n, err := c.ListModels(context.Background())
	if err != nil || n != 1 || attempts != 3 {
		t.Fatalf("n=%d attempts=%d err=%v", n, attempts, err)
	}
}

func TestGivesUpAfterThreeAttempts(t *testing.T) {
	attempts := 0
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusTooManyRequests)
		w.Write([]byte(`{"error":{"message":"rate limited"}}`))
	})
	_, err := c.ListModels(context.Background())
	if err == nil || attempts != 3 {
		t.Fatalf("attempts=%d err=%v", attempts, err)
	}
}

func TestNoRetryOn4xx(t *testing.T) {
	attempts := 0
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"bad request"}}`))
	})
	_, err := c.ListModels(context.Background())
	if err == nil || attempts != 1 {
		t.Fatalf("attempts=%d err=%v", attempts, err)
	}
}

func TestUploadFile(t *testing.T) {
	c := testClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files" || r.Method != http.MethodPost {
			t.Errorf("bad request: %s %s", r.Method, r.URL.Path)
		}
		if err := r.ParseMultipartForm(1 << 20); err != nil {
			t.Errorf("parse multipart: %v", err)
		}
		if got := r.FormValue("purpose"); got != "vision" {
			t.Errorf("purpose = %q", got)
		}
		f, hdr, err := r.FormFile("file")
		if err != nil {
			t.Errorf("form file: %v", err)
		} else {
			defer f.Close()
			b, _ := io.ReadAll(f)
			if string(b) != "png-bytes" || hdr.Filename != "combat.png" {
				t.Errorf("file content=%q name=%q", b, hdr.Filename)
			}
		}
		w.Write([]byte(`{"id":"file-8a2f91cd"}`))
	})
	id, err := c.UploadFile(context.Background(), "combat.png", "vision", strings.NewReader("png-bytes"))
	if err != nil || id != "file-8a2f91cd" {
		t.Fatalf("id=%q err=%v", id, err)
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && go test ./internal/openai/`
Expected: FAIL — package does not exist

- [ ] **Step 3: Implement**

`server/internal/openai/client.go`:

```go
// Package openai is a thin hand-rolled client for the OpenAI API (spec §4:
// no SDK dependency). M3 needs models list + file upload; M4 adds images.
package openai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"time"
)

type Client struct {
	APIKey    string
	BaseURL   string
	RetryBase time.Duration
	http      *http.Client
}

func New(apiKey string) *Client {
	return &Client{
		APIKey:    apiKey,
		BaseURL:   "https://api.openai.com",
		RetryBase: 500 * time.Millisecond,
		http:      &http.Client{},
	}
}

type apiError struct {
	Error struct {
		Message string `json:"message"`
	} `json:"error"`
}

// do sends the request, retrying 429/5xx up to 3 attempts total (PRD §10).
// body is rebuilt per attempt via makeBody.
func (c *Client) do(ctx context.Context, method, path, contentType string, makeBody func() (io.Reader, error)) ([]byte, error) {
	if c.APIKey == "" {
		return nil, errors.New("OpenAI API key not set — add it in Settings")
	}
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(c.RetryBase << (attempt - 1)):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		body, err := makeBody()
		if err != nil {
			return nil, err
		}
		req, err := http.NewRequestWithContext(ctx, method, c.BaseURL+path, body)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+c.APIKey)
		if contentType != "" {
			req.Header.Set("Content-Type", contentType)
		}
		resp, err := c.http.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		data, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			lastErr = err
			continue
		}
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			return data, nil
		}
		var ae apiError
		_ = json.Unmarshal(data, &ae)
		msg := ae.Error.Message
		if msg == "" {
			msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
		}
		lastErr = fmt.Errorf("openai: %s (request id %s)", msg, resp.Header.Get("x-request-id"))
		if resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500 {
			continue // retryable
		}
		return nil, lastErr
	}
	return nil, lastErr
}

func (c *Client) ListModels(ctx context.Context) (int, error) {
	data, err := c.do(ctx, http.MethodGet, "/v1/models", "", func() (io.Reader, error) { return nil, nil })
	if err != nil {
		return 0, err
	}
	var out struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return 0, fmt.Errorf("openai: bad models response: %w", err)
	}
	return len(out.Data), nil
}

// UploadFile uploads via the Files API and returns the file id.
// The file bytes are read once up front so retries can rebuild the body.
func (c *Client) UploadFile(ctx context.Context, filename, purpose string, data io.Reader) (string, error) {
	fileBytes, err := io.ReadAll(data)
	if err != nil {
		return "", err
	}
	var contentType string
	makeBody := func() (io.Reader, error) {
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		if err := w.WriteField("purpose", purpose); err != nil {
			return nil, err
		}
		fw, err := w.CreateFormFile("file", filename)
		if err != nil {
			return nil, err
		}
		if _, err := fw.Write(fileBytes); err != nil {
			return nil, err
		}
		if err := w.Close(); err != nil {
			return nil, err
		}
		contentType = w.FormDataContentType()
		return &buf, nil
	}
	// Build once to fix contentType before do() sends the first request.
	if _, err := makeBody(); err != nil {
		return "", err
	}
	respData, err := c.do(ctx, http.MethodPost, "/v1/files", contentType, makeBody)
	if err != nil {
		return "", err
	}
	var out struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(respData, &out); err != nil || out.ID == "" {
		return "", fmt.Errorf("openai: bad files response: %w", err)
	}
	return out.ID, nil
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./internal/openai/`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add server/internal/openai/
git commit -m "feat: hand-rolled openai client with models, file upload, and retry"
```

---

### Task 3: Card types API — multipart CRUD, template serving, upload-to-openai, real test-openai

**Files:**
- Create: `server/internal/api/cardtypes.go`
- Modify: `server/internal/api/router.go` (dataDir param + routes), `server/internal/api/settings.go` (real TestOpenAI + shared key resolver), `server/main.go` (CARDFORGE_DATA env → dataDir), `server/internal/api/router_test.go` + `server/internal/api/settings_test.go` + `server/internal/api/spa_test.go` (NewRouter signature: add `t.TempDir()` as dataDir in helpers)
- Test: `server/internal/api/cardtypes_test.go`

**Interfaces:**
- Consumes: `store.NewCardTypesStore` + methods (Task 1), `openai.New/ListModels/UploadFile` (Task 2), `writeJSON`/`writeError` (M1), `newTestRouter`/`doJSON` (test helpers — updated here).
- Produces (frontend Tasks 4–6 consume):
  - `NewRouter(db *sql.DB, staticFS fs.FS, dataDir string) http.Handler` — NEW SIGNATURE; all existing callers updated.
  - `GET /api/card-types` → 200 `[]CardType`
  - `POST /api/card-types` multipart (fields `name`, `description`, `constraints`; optional file part `template`, PNG/JPEG, ≤20 MB) → 201 CardType; 400 invalid; 409 duplicate
  - `PUT /api/card-types/{id}` same multipart → 200; file part present → template replaced + `openai_file_id` cleared; 404; 409
  - `DELETE /api/card-types/{id}` → 204 (template file removed best-effort); 404
  - `GET /api/card-types/{id}/template` → 200 image bytes (Content-Type from extension); 404 when none
  - `POST /api/card-types/{id}/upload-to-openai` → 200 `{"openai_file_id":"file-..."}`; 409 `{"error":"no template uploaded"}`; 502 `{"error":"openai: ..."}` on API failure; key from env-over-settings
  - `POST /api/settings/test-openai` now REAL: `GET /v1/models` with 10 s timeout → always 200 `{ok, message}` ("Connected — N models available" / error text)
  - Shared helper `resolveOpenAIKey(all map[string]string) string` (env `OPENAI_API_KEY` overrides `openai_api_key` setting) and package-level `var openAIBaseURL = "https://api.openai.com"` (tests override).

- [ ] **Step 1: Update NewRouter signature + helpers**

In `server/internal/api/router.go` change the signature and store dataDir:

```go
func NewRouter(db *sql.DB, staticFS fs.FS, dataDir string) http.Handler {
```

In the `db != nil` block append (after the jobs routes):

```go
			cardTypes := &CardTypesHandler{
				Store:    store.NewCardTypesStore(db),
				Settings: store.NewSettingsStore(db),
				DataDir:  dataDir,
			}
			r.Get("/card-types", cardTypes.List)
			r.Post("/card-types", cardTypes.Create)
			r.Put("/card-types/{id}", cardTypes.Update)
			r.Delete("/card-types/{id}", cardTypes.Delete)
			r.Get("/card-types/{id}/template", cardTypes.ServeTemplate)
			r.Post("/card-types/{id}/upload-to-openai", cardTypes.UploadToOpenAI)
```

Update every existing `NewRouter(` call: `router_test.go` → `NewRouter(nil, nil, t.TempDir())`; `spa_test.go` → `NewRouter(nil, staticFS, t.TempDir())`; `settings_test.go` `newTestRouter` → `NewRouter(db, nil, t.TempDir())`; `main.go`:

```go
	dataDir := os.Getenv("CARDFORGE_DATA")
	if dataDir == "" {
		dataDir = "./data"
	}
	r := api.NewRouter(db, dist, dataDir)
```

- [ ] **Step 2: Write failing tests**

`server/internal/api/cardtypes_test.go`:

```go
package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// pngBytes is a minimal valid PNG header + IHDR for sniffing; content
// correctness beyond magic bytes is not validated server-side.
var pngBytes = append([]byte("\x89PNG\r\n\x1a\n"), bytes.Repeat([]byte{0}, 16)...)

func multipartBody(t *testing.T, fields map[string]string, fileField, fileName string, fileContent []byte) (*bytes.Buffer, string) {
	t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for k, v := range fields {
		w.WriteField(k, v)
	}
	if fileField != "" {
		fw, err := w.CreateFormFile(fileField, fileName)
		if err != nil {
			t.Fatal(err)
		}
		fw.Write(fileContent)
	}
	w.Close()
	return &buf, w.FormDataContentType()
}

func doMultipart(t *testing.T, h http.Handler, method, path string, fields map[string]string, fileName string, fileContent []byte) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	fileField := ""
	if fileName != "" {
		fileField = "template"
	}
	body, ct := multipartBody(t, fields, fileField, fileName, fileContent)
	req := httptest.NewRequest(method, path, body)
	req.Header.Set("Content-Type", ct)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func TestCardTypeCreateWithTemplate(t *testing.T) {
	h := newTestRouter(t)
	rec, out := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "d", "constraints": "c"}, "combat.png", pngBytes)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %v", rec.Code, out)
	}
	if out["name"] != "combat" || out["template_path"] == "" || out["openai_file_id"] != "" {
		t.Fatalf("bad body: %v", out)
	}

	id := int64(out["id"].(float64))
	req := httptest.NewRequest(http.MethodGet, fmt.Sprintf("/api/card-types/%d/template", id), nil)
	rec2 := httptest.NewRecorder()
	h.ServeHTTP(rec2, req)
	if rec2.Code != 200 || !bytes.HasPrefix(rec2.Body.Bytes(), []byte("\x89PNG")) {
		t.Fatalf("serve template: %d len=%d", rec2.Code, rec2.Body.Len())
	}
	if ct := rec2.Header().Get("Content-Type"); ct != "image/png" {
		t.Fatalf("content type: %q", ct)
	}
}

func TestCardTypeCreateWithoutTemplate(t *testing.T) {
	h := newTestRouter(t)
	rec, out := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "upgrade", "description": "", "constraints": ""}, "", nil)
	if rec.Code != http.StatusCreated || out["template_path"] != "" {
		t.Fatalf("%d %v", rec.Code, out)
	}
	rec2, _ := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/card-types/%v/template", int64(out["id"].(float64))), "")
	if rec2.Code != http.StatusNotFound {
		t.Fatalf("template of none: %d", rec2.Code)
	}
}

func TestCardTypeValidation(t *testing.T) {
	h := newTestRouter(t)
	rec, _ := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "  ", "description": "", "constraints": ""}, "", nil)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("empty name: %d", rec.Code)
	}
	rec, _ = doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "x", "description": "", "constraints": ""}, "notes.txt", []byte("hello"))
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("bad file type: %d", rec.Code)
	}
	doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "dup", "description": "", "constraints": ""}, "", nil)
	rec, _ = doMultipart(t, h, http.MethodPost, "/api/card-types", map[string]string{"name": "dup", "description": "", "constraints": ""}, "", nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate: %d", rec.Code)
	}
}

func TestCardTypeUpdateReplacingTemplateClearsFileID(t *testing.T) {
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "a.png", pngBytes)
	id := int64(created["id"].(float64))

	// simulate an uploaded file id directly via the fake-openai flow below
	// (here: fields-only update keeps template)
	rec, out := doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id),
		map[string]string{"name": "combat", "description": "new", "constraints": ""}, "", nil)
	if rec.Code != 200 || out["template_path"] == "" {
		t.Fatalf("fields-only update: %d %v", rec.Code, out)
	}

	rec, out = doMultipart(t, h, http.MethodPut, fmt.Sprintf("/api/card-types/%d", id),
		map[string]string{"name": "combat", "description": "new", "constraints": ""}, "b.jpg", []byte("\xff\xd8\xffjpegdata"))
	if rec.Code != 200 || out["openai_file_id"] != "" {
		t.Fatalf("template replace: %d %v", rec.Code, out)
	}
}

func TestCardTypeDelete(t *testing.T) {
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "", nil)
	id := int64(created["id"].(float64))
	rec, _ := doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d", id), "")
	if rec.Code != http.StatusNoContent {
		t.Fatalf("delete: %d", rec.Code)
	}
	rec, _ = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/card-types/%d", id), "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("double delete: %d", rec.Code)
	}
}

func TestUploadToOpenAI(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files" {
			t.Errorf("path %s", r.URL.Path)
		}
		w.Write([]byte(`{"id":"file-fake123"}`))
	}))
	defer fake.Close()
	oldBase := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = oldBase }()

	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "a.png", pngBytes)
	id := int64(created["id"].(float64))

	rec, out := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%d/upload-to-openai", id), "")
	if rec.Code != 200 || out["openai_file_id"] != "file-fake123" {
		t.Fatalf("upload: %d %v", rec.Code, out)
	}
	rec, out = doJSON(t, h, http.MethodGet, "/api/card-types", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if list[0]["openai_file_id"] != "file-fake123" {
		t.Fatalf("persisted file id: %v", list[0])
	}
}

func TestUploadToOpenAIWithoutTemplate(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "upgrade", "description": "", "constraints": ""}, "", nil)
	rec, _ := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%v/upload-to-openai", int64(created["id"].(float64))), "")
	if rec.Code != http.StatusConflict {
		t.Fatalf("no template: %d", rec.Code)
	}
}

func TestUploadToOpenAIFailure(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("x-request-id", "req_9")
		w.WriteHeader(http.StatusBadRequest)
		w.Write([]byte(`{"error":{"message":"invalid file"}}`))
	}))
	defer fake.Close()
	oldBase := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = oldBase }()

	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	_, created := doMultipart(t, h, http.MethodPost, "/api/card-types",
		map[string]string{"name": "combat", "description": "", "constraints": ""}, "a.png", pngBytes)
	rec, out := doJSON(t, h, http.MethodPost, fmt.Sprintf("/api/card-types/%v/upload-to-openai", int64(created["id"].(float64))), "")
	if rec.Code != http.StatusBadGateway {
		t.Fatalf("failure status: %d %v", rec.Code, out)
	}
	msg, _ := out["error"].(string)
	if !strings.Contains(msg, "invalid file") || !strings.Contains(msg, "req_9") {
		t.Fatalf("error message: %q", msg)
	}
}

func TestRealTestOpenAIEndpoint(t *testing.T) {
	fake := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"data":[{"id":"a"},{"id":"b"},{"id":"c"}]}`))
	}))
	defer fake.Close()
	oldBase := openAIBaseURL
	openAIBaseURL = fake.URL
	defer func() { openAIBaseURL = oldBase }()

	t.Setenv("OPENAI_API_KEY", "sk-env")
	h := newTestRouter(t)
	rec, out := doJSON(t, h, http.MethodPost, "/api/settings/test-openai", "")
	if rec.Code != 200 || out["ok"] != true {
		t.Fatalf("%d %v", rec.Code, out)
	}
	if msg, _ := out["message"].(string); !strings.Contains(msg, "3 models") {
		t.Fatalf("message: %v", out["message"])
	}

	// failure path: no key anywhere
	t.Setenv("OPENAI_API_KEY", "")
	rec, out = doJSON(t, h, http.MethodPost, "/api/settings/test-openai", "")
	if rec.Code != 200 || out["ok"] != false {
		t.Fatalf("no-key case: %d %v", rec.Code, out)
	}
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && go test ./internal/api/`
Expected: FAIL — compile error (NewRouter signature) then 404s on new routes

- [ ] **Step 4: Implement handler**

`server/internal/api/cardtypes.go`:

```go
package api

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
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
}

func parseCardTypeForm(r *http.Request) (cardTypeFields, string) {
	if err := r.ParseMultipartForm(maxTemplateBytes + (1 << 20)); err != nil {
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
	fields, msg := parseCardTypeForm(r)
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
	writeJSON(w, http.StatusCreated, ct)
}

func (h *CardTypesHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	fields, msg := parseCardTypeForm(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	prev, err := h.Store.Get(id)
	if err != nil {
		h.cardTypeErr(w, err)
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
	if err := h.Store.Delete(id); err != nil {
		h.cardTypeErr(w, err)
		return
	}
	h.removeTemplateFile(ct.TemplatePath)
	w.WriteHeader(http.StatusNoContent)
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
```

In `server/internal/api/settings.go`, replace the stub `TestOpenAI`:

```go
func (h *SettingsHandler) TestOpenAI(w http.ResponseWriter, r *http.Request) {
	all, err := h.Store.GetAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	client := openai.New(resolveOpenAIKey(all))
	client.BaseURL = openAIBaseURL
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	n, err := client.ListModels(ctx)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": fmt.Sprintf("Connected — %d models available", n)})
}
```

Add imports `"fmt"`, `"cardforge/internal/openai"` to settings.go. Also update the M1 stub test: in `settings_test.go` `TestStubTestEndpoints` now has no remaining stub endpoints — DELETE the test entirely (both test-openai and test-claude are real; each has its own real-endpoint test).

- [ ] **Step 5: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS (all packages)

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat: card types API with template upload, openai files integration, and real test-openai"
```

---

### Task 4: Frontend form-data helper + aspect util + card-types data layer

**Files:**
- Modify: `web/src/lib/api.ts` (add `apiSendForm`)
- Create: `web/src/pages/card-types/aspect.ts`, `web/src/pages/card-types/api.ts`, `web/src/pages/card-types/store.ts`
- Test: `web/src/pages/card-types/aspect.test.ts`, `web/src/pages/card-types/api.test.ts`

**Interfaces:**
- Consumes: `parse<T>`/`ApiError` internals of `lib/api.ts` (Task exists since M1/M2), `createDraftFormStore`/`isDraftDirty` (M2), backend endpoints (Task 3).
- Produces (Tasks 5–6 consume):
  - `apiSendForm<T>(method: string, path: string, form: FormData): Promise<T>` — like `apiSend` but no Content-Type header (browser sets multipart boundary), same error/204 handling.
  - `aspect.ts`: `TARGET_RATIO = 816 / 1104`; `computeAspectWarning(w: number, h: number): string | null` — null when within 2%, else "Aspect ratio deviates from 816:1104 by X.X% — consider re-cropping".
  - `api.ts`: `CardType {id:number; name:string; description:string; constraints:string; template_path:string; openai_file_id:string; created_at:string; updated_at:string}`; `useCardTypes()` (key `['card-types']`); `buildCardTypeForm(fields: {name:string; description:string; constraints:string}, template: File | null): FormData`; `createCardType(form: FormData)`; `updateCardType(id: number, form: FormData)`; `deleteCardType(id: number)` (204→undefined); `uploadToOpenAI(id: number): Promise<{openai_file_id: string}>`; `templateUrl(ct: CardType): string | null` — null when no template, else `/api/card-types/${id}/template?v=${encodeURIComponent(updated_at)}` (cache-buster).
  - `store.ts`: `CardTypeDraft = {name:string; description:string; constraints:string}`; `useCardTypeDraft = createDraftFormStore<CardTypeDraft>('cardforge:card-type-draft')`; `useCardTypesUi` zustand store `{dialogMode:'create'|'edit'|null; editingId:number|null; stagedFile:File|null; stagedMeta:{w:number; h:number; url:string}|null; showDiff:boolean; discardConfirmOpen:boolean; deleteConfirmId:number|null}` + `openCreate()`, `openEdit(ct: CardType)`, `closeDialog()`, `set(partial)`. Staged file lives ONLY in memory (File objects can't persist to localStorage) — a reload drops the staged file but keeps text drafts.

- [ ] **Step 1: Write failing tests**

`web/src/pages/card-types/aspect.test.ts`:

```ts
import { computeAspectWarning } from './aspect'

test('exact 816x1104 has no warning', () => {
  expect(computeAspectWarning(816, 1104)).toBeNull()
})

test('within 2% has no warning', () => {
  expect(computeAspectWarning(820, 1104)).toBeNull() // ~0.5% off
})

test('beyond 2% warns with percentage', () => {
  const w = computeAspectWarning(830, 1080) // ~4% off
  expect(w).toMatch(/deviates from 816:1104 by \d+\.\d%/)
  expect(w).toMatch(/re-cropping/)
})

test('zero dimensions return null', () => {
  expect(computeAspectWarning(0, 0)).toBeNull()
})
```

`web/src/pages/card-types/api.test.ts`:

```ts
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { buildCardTypeForm, createCardType, deleteCardType, uploadToOpenAI, templateUrl } from './api'
import type { CardType } from './api'

test('buildCardTypeForm includes fields and optional template', () => {
  const file = new File(['png'], 'combat.png', { type: 'image/png' })
  const form = buildCardTypeForm({ name: 'combat', description: 'd', constraints: 'c' }, file)
  expect(form.get('name')).toBe('combat')
  expect(form.get('description')).toBe('d')
  expect(form.get('constraints')).toBe('c')
  expect((form.get('template') as File).name).toBe('combat.png')

  const noFile = buildCardTypeForm({ name: 'x', description: '', constraints: '' }, null)
  expect(noFile.get('template')).toBeNull()
})

test('createCardType posts multipart and parses response', async () => {
  server.use(
    http.post('/api/card-types', async ({ request }) => {
      const form = await request.formData()
      return HttpResponse.json(
        { id: 1, name: form.get('name'), description: '', constraints: '', template_path: '', openai_file_id: '', created_at: 'a', updated_at: 'b' },
        { status: 201 },
      )
    }),
  )
  const ct = await createCardType(buildCardTypeForm({ name: 'combat', description: '', constraints: '' }, null))
  expect(ct.id).toBe(1)
  expect(ct.name).toBe('combat')
})

test('deleteCardType resolves on 204', async () => {
  server.use(http.delete('/api/card-types/3', () => new HttpResponse(null, { status: 204 })))
  await expect(deleteCardType(3)).resolves.toBeUndefined()
})

test('uploadToOpenAI returns file id; error surfaces message', async () => {
  server.use(http.post('/api/card-types/1/upload-to-openai', () => HttpResponse.json({ openai_file_id: 'file-x' })))
  await expect(uploadToOpenAI(1)).resolves.toEqual({ openai_file_id: 'file-x' })

  server.use(http.post('/api/card-types/2/upload-to-openai', () => HttpResponse.json({ error: 'openai: invalid file (request id req_1)' }, { status: 502 })))
  await expect(uploadToOpenAI(2)).rejects.toThrow(/invalid file/)
})

test('templateUrl builds cache-busted url or null', () => {
  const base: CardType = { id: 5, name: 'x', description: '', constraints: '', template_path: 'templates/a.png', openai_file_id: '', created_at: 'a', updated_at: '2026-07-17 10:00:00' }
  expect(templateUrl(base)).toBe('/api/card-types/5/template?v=2026-07-17%2010%3A00%3A00')
  expect(templateUrl({ ...base, template_path: '' })).toBeNull()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/card-types/`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement**

Append to `web/src/lib/api.ts`:

```ts
export function apiSendForm<T>(method: string, path: string, form: FormData): Promise<T> {
  // No Content-Type header — the browser sets the multipart boundary.
  return fetch(path, { method, body: form }).then((res) => parse<T>(res))
}
```

`web/src/pages/card-types/aspect.ts`:

```ts
export const TARGET_RATIO = 816 / 1104

// PRD §7.2: warn when the template's aspect ratio deviates from 816:1104
// by more than 2%.
export function computeAspectWarning(w: number, h: number): string | null {
  if (!w || !h) return null
  const deviation = (Math.abs(w / h - TARGET_RATIO) / TARGET_RATIO) * 100
  if (deviation <= 2) return null
  return `Aspect ratio deviates from 816:1104 by ${deviation.toFixed(1)}% — consider re-cropping`
}
```

`web/src/pages/card-types/api.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend, apiSendForm } from '../../lib/api'

export type CardType = {
  id: number
  name: string
  description: string
  constraints: string
  template_path: string
  openai_file_id: string
  created_at: string
  updated_at: string
}

export function useCardTypes() {
  return useQuery({ queryKey: ['card-types'], queryFn: () => apiGet<CardType[]>('/api/card-types') })
}

export function buildCardTypeForm(
  fields: { name: string; description: string; constraints: string },
  template: File | null,
): FormData {
  const form = new FormData()
  form.set('name', fields.name)
  form.set('description', fields.description)
  form.set('constraints', fields.constraints)
  if (template) form.set('template', template)
  return form
}

export function createCardType(form: FormData): Promise<CardType> {
  return apiSendForm<CardType>('POST', '/api/card-types', form)
}

export function updateCardType(id: number, form: FormData): Promise<CardType> {
  return apiSendForm<CardType>('PUT', `/api/card-types/${id}`, form)
}

export function deleteCardType(id: number): Promise<undefined> {
  return apiSend<undefined>('DELETE', `/api/card-types/${id}`, undefined)
}

export function uploadToOpenAI(id: number): Promise<{ openai_file_id: string }> {
  return apiSend('POST', `/api/card-types/${id}/upload-to-openai`, undefined)
}

export function templateUrl(ct: CardType): string | null {
  if (!ct.template_path) return null
  return `/api/card-types/${ct.id}/template?v=${encodeURIComponent(ct.updated_at)}`
}
```

`web/src/pages/card-types/store.ts`:

```ts
import { create } from 'zustand'
import { createDraftFormStore } from '../../lib/draftForm'
import type { CardType } from './api'

export type CardTypeDraft = {
  name: string
  description: string
  constraints: string
}

export const useCardTypeDraft = createDraftFormStore<CardTypeDraft>('cardforge:card-type-draft')

type CardTypesUiState = {
  dialogMode: 'create' | 'edit' | null
  editingId: number | null
  stagedFile: File | null
  stagedMeta: { w: number; h: number; url: string } | null
  showDiff: boolean
  discardConfirmOpen: boolean
  deleteConfirmId: number | null
  openCreate: () => void
  openEdit: (ct: CardType) => void
  closeDialog: () => void
  set: (partial: Partial<Omit<CardTypesUiState, 'openCreate' | 'openEdit' | 'closeDialog' | 'set'>>) => void
}

export const useCardTypesUi = create<CardTypesUiState>()((set) => ({
  dialogMode: null,
  editingId: null,
  stagedFile: null,
  stagedMeta: null,
  showDiff: false,
  discardConfirmOpen: false,
  deleteConfirmId: null,
  openCreate: () => {
    useCardTypeDraft.getState().open('new', { name: '', description: '', constraints: '' })
    set({ dialogMode: 'create', editingId: null, stagedFile: null, stagedMeta: null, showDiff: false })
  },
  openEdit: (ct) => {
    useCardTypeDraft.getState().open(String(ct.id), { name: ct.name, description: ct.description, constraints: ct.constraints })
    set({ dialogMode: 'edit', editingId: ct.id, stagedFile: null, stagedMeta: null, showDiff: false })
  },
  closeDialog: () => {
    useCardTypeDraft.getState().close()
    set({ dialogMode: null, editingId: null, stagedFile: null, stagedMeta: null, showDiff: false, discardConfirmOpen: false })
  },
  set: (partial) => set(partial),
}))
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/api.ts web/src/pages/card-types/
git commit -m "feat: card-types data layer with multipart helper and aspect util"
```

---

### Task 5: Card Types page — grid, dialog with dropzone + OpenAI file panel

**Files:**
- Create: `web/src/pages/card-types/CardTypesPage.tsx`, `web/src/pages/card-types/CardTypeCard.tsx`, `web/src/pages/card-types/CardTypeDialog.tsx`, `web/src/pages/card-types/TemplateDropzone.tsx`, `web/src/pages/card-types/OpenAIFilePanel.tsx`
- Modify: `web/src/App.tsx` (route `/card-types` → `<CardTypesPage />`), `web/src/components/Sidebar.test.tsx` (add `/api/card-types` MSW handler if the route render needs it)
- Test: `web/src/pages/card-types/CardTypesPage.test.tsx`

**Interfaces:**
- Consumes: everything from Task 4; `Button`/`Field`/`inputClass` (M1), `Dialog`/`ConfirmDialog`/`Tag`/`DiffPanel` (M2 — ConfirmDialog has optional `error` prop), `isDraftDirty` (M2).
- Produces: working Card Types section. Dirty definition: `isDraftDirty(draftState) || ui.stagedFile !== null`. Save action builds `FormData` via `buildCardTypeForm(draft, ui.stagedFile)` and calls create/update; on success invalidates `['card-types']` and closes. Upload-to-OpenAI button lives in `OpenAIFilePanel`: rendered only in edit mode; disabled while `ui.stagedFile !== null` (staged template must be saved first — title attribute "Save the new template first") or when the persisted card type has no template; on success invalidates `['card-types']`; errors shown role=alert in the panel.

- [ ] **Step 1: Write failing tests**

`web/src/pages/card-types/CardTypesPage.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useCardTypesUi, useCardTypeDraft } from './store'
import type { CardType } from './api'
import CardTypesPage from './CardTypesPage'

const cardTypes: CardType[] = [
  { id: 1, name: 'combat', description: 'frontline warriors', constraints: 'fill crimson zone', template_path: 'templates/a.png', openai_file_id: 'file-8a2f91cd', created_at: 'a', updated_at: 'u1' },
  { id: 2, name: 'upgrade', description: 'insignia art', constraints: '', template_path: '', openai_file_id: '', created_at: 'a', updated_at: 'u2' },
]

// jsdom can't load images: stub Image so onFileSelect gets fixed dimensions.
class FakeImage {
  onload: null | (() => void) = null
  naturalWidth = 830
  naturalHeight = 1080
  set src(_v: string) {
    queueMicrotask(() => this.onload?.())
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <CardTypesPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  vi.stubGlobal('Image', FakeImage)
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} })
  useCardTypeDraft.getState().close()
  useCardTypesUi.setState({ dialogMode: null, editingId: null, stagedFile: null, stagedMeta: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null })
  server.use(http.get('/api/card-types', () => HttpResponse.json(cardTypes)))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('renders grid with file-id tag and not-uploaded state', async () => {
  renderPage()
  expect(await screen.findByText('combat')).toBeInTheDocument()
  expect(screen.getByText('file-8a2f91cd')).toBeInTheDocument()
  expect(screen.getByText('not uploaded')).toBeInTheDocument()
})

test('create flow posts multipart with staged file', async () => {
  let gotName: unknown, gotFile: File | null = null
  server.use(
    http.post('/api/card-types', async ({ request }) => {
      const form = await request.formData()
      gotName = form.get('name')
      gotFile = form.get('template') as File | null
      return HttpResponse.json({ id: 3, name: gotName, description: '', constraints: '', template_path: 'templates/x.png', openai_file_id: '', created_at: 'a', updated_at: 'u' }, { status: 201 })
    }),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /New Card Type/ }))
  const dialog = screen.getByRole('dialog', { name: 'New Card Type' })
  await userEvent.type(within(dialog).getByLabelText('Name'), 'schema')
  await userEvent.type(within(dialog).getByLabelText('Constraints'), 'blue grid')
  const file = new File(['png'], 'schema.png', { type: 'image/png' })
  await userEvent.upload(within(dialog).getByLabelText(/Template image/), file)
  expect(await within(dialog).findByText(/deviates from 816:1104/)).toBeInTheDocument() // FakeImage is 830x1080
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save Card Type' }))
  await screen.findByText('combat') // dialog closed
  expect(gotName).toBe('schema')
  expect(gotFile?.name).toBe('schema.png')
})

test('staged file makes form dirty; discard clears it', async () => {
  renderPage()
  await screen.findByText('combat')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Card Type' })
  expect(within(dialog).queryByText('Unsaved changes')).not.toBeInTheDocument()
  const file = new File(['png'], 'new.png', { type: 'image/png' })
  await userEvent.upload(within(dialog).getByLabelText(/Template image/), file)
  expect(await within(dialog).findByText('Unsaved changes')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
  expect(within(dialog).queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('upload-to-openai disabled while template staged; works in clean edit mode', async () => {
  let uploaded = false
  server.use(http.post('/api/card-types/1/upload-to-openai', () => { uploaded = true; return HttpResponse.json({ openai_file_id: 'file-new' }) }))
  renderPage()
  await screen.findByText('combat')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Card Type' })
  const uploadBtn = within(dialog).getByRole('button', { name: /Re-upload|Upload to OpenAI/ })
  expect(uploadBtn).toBeEnabled()
  const file = new File(['png'], 'new.png', { type: 'image/png' })
  await userEvent.upload(within(dialog).getByLabelText(/Template image/), file)
  expect(within(dialog).getByRole('button', { name: /Re-upload|Upload to OpenAI/ })).toBeDisabled()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
  await userEvent.click(within(dialog).getByRole('button', { name: /Re-upload|Upload to OpenAI/ }))
  expect(uploaded).toBe(true)
})

test('upload-to-openai failure shows alert', async () => {
  server.use(http.post('/api/card-types/1/upload-to-openai', () => HttpResponse.json({ error: 'openai: invalid file (request id req_1)' }, { status: 502 })))
  renderPage()
  await screen.findByText('combat')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Card Type' })
  await userEvent.click(within(dialog).getByRole('button', { name: /Re-upload|Upload to OpenAI/ }))
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/invalid file/)
})

test('delete failure shows alert in confirm dialog', async () => {
  server.use(http.delete('/api/card-types/2', () => HttpResponse.json({ error: 'boom' }, { status: 500 })))
  renderPage()
  await screen.findByText('upgrade')
  await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
  await userEvent.click(screen.getByRole('button', { name: 'Delete card type' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('boom')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/card-types/CardTypesPage.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/pages/card-types/TemplateDropzone.tsx`:

```tsx
import { useId } from 'react'
import { computeAspectWarning } from './aspect'
import { templateUrl, type CardType } from './api'
import { useCardTypesUi } from './store'

// Staged file preview beats persisted template; persisted template beats
// the empty dropzone.
export function TemplateDropzone({ persisted }: { persisted: CardType | null }) {
  const id = useId()
  const ui = useCardTypesUi()
  const persistedUrl = persisted ? templateUrl(persisted) : null

  function onFileSelect(file: File | undefined) {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      useCardTypesUi.getState().set({
        stagedFile: file,
        stagedMeta: { w: img.naturalWidth, h: img.naturalHeight, url },
      })
    }
    img.src = url
  }

  const meta = ui.stagedMeta
  const warning = meta ? computeAspectWarning(meta.w, meta.h) : null
  const previewUrl = meta?.url ?? persistedUrl

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-ink/70">Template image</label>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed border-ink/25 p-3">
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => onFileSelect(e.target.files?.[0])}
        />
        {previewUrl ? (
          <img src={previewUrl} alt="Template preview" className="max-h-40 rounded" />
        ) : (
          <span className="font-mono text-[11px] tracking-wide text-ink/60">Click to upload PNG or JPEG</span>
        )}
        {meta && (
          <span className="font-mono text-[10px] text-ink/55">
            {meta.w}×{meta.h} — staged, saved on Save
          </span>
        )}
      </label>
      {warning && (
        <p className="mt-1.5 rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-[11px] text-warn">{warning}</p>
      )}
    </div>
  )
}
```

`web/src/pages/card-types/OpenAIFilePanel.tsx`:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { uploadToOpenAI, type CardType } from './api'
import { useCardTypesUi } from './store'

export function OpenAIFilePanel({ persisted }: { persisted: CardType | null }) {
  const stagedFile = useCardTypesUi((s) => s.stagedFile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  if (!persisted) return null // create mode: save first

  const hasTemplate = persisted.template_path !== ''
  const disabled = busy || !hasTemplate || stagedFile !== null
  const title = stagedFile !== null ? 'Save the new template first' : !hasTemplate ? 'Upload a template first' : undefined

  async function onUpload() {
    if (!persisted) return
    setBusy(true)
    setError(null)
    try {
      await uploadToOpenAI(persisted.id)
      queryClient.invalidateQueries({ queryKey: ['card-types'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setBusy(false)
    }
  }

  const idText = persisted.openai_file_id || (hasTemplate ? 'Not uploaded' : 'Upload a template first')

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-bg p-3">
      <div className="min-w-0">
        <div className="mb-0.5 text-xs text-ink/70">OpenAI file</div>
        <div className={`overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs ${persisted.openai_file_id ? 'text-accent-300' : 'text-ink/45'}`}>
          {idText}
        </div>
        {error && <p role="alert" className="m-0 mt-1 text-xs text-danger">{error}</p>}
      </div>
      <span className="flex flex-none gap-1.5">
        {persisted.openai_file_id && (
          <Button type="button" onClick={() => navigator.clipboard?.writeText(persisted.openai_file_id).catch(() => {})}>
            Copy
          </Button>
        )}
        <Button variant="primary" type="button" disabled={disabled} title={title} onClick={onUpload}>
          {busy ? 'Uploading…' : persisted.openai_file_id ? 'Re-upload' : 'Upload to OpenAI'}
        </Button>
      </span>
    </div>
  )
}
```

`web/src/pages/card-types/CardTypeDialog.tsx`:

```tsx
import { useActionState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog } from '../../components/Dialog'
import { DiffPanel } from '../../components/DiffPanel'
import { Field, inputClass } from '../../components/Field'
import { isDraftDirty } from '../../lib/draftForm'
import { buildCardTypeForm, createCardType, updateCardType, type CardType } from './api'
import { OpenAIFilePanel } from './OpenAIFilePanel'
import { TemplateDropzone } from './TemplateDropzone'
import { useCardTypeDraft, useCardTypesUi } from './store'

export function CardTypeDialog({ cardTypes }: { cardTypes: CardType[] }) {
  const ui = useCardTypesUi()
  const draftState = useCardTypeDraft()
  const queryClient = useQueryClient()
  const { draft, persisted } = draftState
  const persistedCt = cardTypes.find((c) => c.id === ui.editingId) ?? null
  const dirty = isDraftDirty(draftState) || ui.stagedFile !== null

  const [saveResult, saveAction, saving] = useActionState(
    async (): Promise<{ error: string | null }> => {
      const d = useCardTypeDraft.getState().draft
      const { dialogMode, editingId, stagedFile } = useCardTypesUi.getState()
      if (!d || !d.name.trim()) return { error: 'Name is required' }
      const form = buildCardTypeForm(
        { name: d.name.trim(), description: d.description, constraints: d.constraints },
        stagedFile,
      )
      try {
        if (dialogMode === 'edit' && editingId !== null) await updateCardType(editingId, form)
        else await createCardType(form)
        queryClient.invalidateQueries({ queryKey: ['card-types'] })
        useCardTypesUi.getState().closeDialog()
        return { error: null }
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Save failed' }
      }
    },
    { error: null },
  )

  if (ui.dialogMode === null || !draft) return null

  const requestClose = () => {
    if (dirty) ui.set({ discardConfirmOpen: true })
    else ui.closeDialog()
  }

  const discardAll = () => {
    draftState.discard()
    ui.set({ stagedFile: null, stagedMeta: null })
  }

  const textField = (key: 'description' | 'constraints', label: string, placeholder: string) => (
    <Field label={label}>
      {(id) => (
        <textarea id={id} value={draft[key]} placeholder={placeholder}
          onChange={(e) => draftState.setField(key, e.target.value)}
          className={`${inputClass} min-h-16 resize-y font-sans`} />
      )}
    </Field>
  )

  return (
    <>
      <Dialog
        title={ui.dialogMode === 'edit' ? 'Edit Card Type' : 'New Card Type'}
        width="min(560px,100%)"
        titleExtra={dirty ? (
          <span className="whitespace-nowrap rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-[11px] text-warn">Unsaved changes</span>
        ) : undefined}
      >
        <Field label="Name">
          {(id) => (
            <input id={id} type="text" value={draft.name} placeholder="e.g. combat"
              onChange={(e) => draftState.setField('name', e.target.value)} className={inputClass} />
          )}
        </Field>
        {textField('description', 'Description', 'What this card type is, overall aesthetic…')}
        {textField('constraints', 'Constraints', 'Zones, chromakey color, do-not-touch areas…')}

        {ui.showDiff && dirty && persisted && (
          <DiffPanel simpleRows={[]}
            textDiffs={[
              { field: 'name', before: persisted.name, after: draft.name },
              { field: 'description', before: persisted.description, after: draft.description },
              { field: 'constraints', before: persisted.constraints, after: draft.constraints },
            ]} />
        )}

        <TemplateDropzone persisted={persistedCt} />
        <OpenAIFilePanel persisted={persistedCt} />

        {saveResult.error && <p role="alert" className="m-0 text-sm text-danger">{saveResult.error}</p>}

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div>
            {dirty && (
              <button type="button" onClick={() => ui.set({ showDiff: !ui.showDiff })}
                className="cursor-pointer border-0 bg-transparent px-1 py-1.5 text-[13px] font-medium text-accent">
                {ui.showDiff ? 'Hide diff' : 'Show diff'}
              </button>
            )}
          </div>
          <form action={saveAction} className="flex gap-2">
            {dirty && <Button type="button" onClick={discardAll}>Discard</Button>}
            <Button type="button" onClick={requestClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!draft.name.trim() || saving}>
              {saving ? 'Saving…' : 'Save Card Type'}
            </Button>
          </form>
        </div>
      </Dialog>

      {ui.discardConfirmOpen && (
        <ConfirmDialog title="Discard unsaved changes?"
          body="You have unsaved changes to this card type. Closing now will discard them."
          confirmLabel="Discard" cancelLabel="Keep editing"
          onConfirm={() => { ui.set({ discardConfirmOpen: false }); ui.closeDialog() }}
          onCancel={() => ui.set({ discardConfirmOpen: false })} />
      )}
    </>
  )
}
```

`web/src/pages/card-types/CardTypeCard.tsx`:

```tsx
import { Button } from '../../components/Button'
import { Tag } from '../../components/Tag'
import { templateUrl, type CardType } from './api'

export function CardTypeCard({ ct, onEdit, onDelete }: { ct: CardType; onEdit: () => void; onDelete: () => void }) {
  const url = templateUrl(ct)
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-neutral-800)]">
      {url ? (
        <img src={url} alt={`${ct.name} template`} className="h-24 w-full rounded object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center rounded border-[1.5px] border-dashed border-ink/25">
          <span className="font-mono text-[10px] tracking-wide text-ink/55">NO TEMPLATE UPLOADED</span>
        </div>
      )}
      <div>
        <div className="mb-0.5 text-[17px] font-medium leading-tight">{ct.name}</div>
        <p className="m-0 text-[13px] text-ink/70">{ct.description}</p>
      </div>
      <div className="text-[11px]">
        {ct.openai_file_id ? (
          <Tag variant="solid-accent">{ct.openai_file_id}</Tag>
        ) : (
          <Tag variant="neutral">not uploaded</Tag>
        )}
      </div>
      <div className="mt-auto flex gap-1.5 border-t border-ink/10 pt-2">
        <Button className="flex-1" onClick={onEdit}>Edit</Button>
        <Button onClick={onDelete}>Delete</Button>
      </div>
    </div>
  )
}
```

`web/src/pages/card-types/CardTypesPage.tsx`:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { deleteCardType, useCardTypes } from './api'
import { CardTypeCard } from './CardTypeCard'
import { CardTypeDialog } from './CardTypeDialog'
import { useCardTypesUi } from './store'

export default function CardTypesPage() {
  const { data, isLoading, error } = useCardTypes()
  const ui = useCardTypesUi()
  const queryClient = useQueryClient()
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const confirmTarget = data?.find((c) => c.id === ui.deleteConfirmId)

  async function confirmDelete() {
    if (!confirmTarget) return
    try {
      await deleteCardType(confirmTarget.id)
      ui.set({ deleteConfirmId: null })
      queryClient.invalidateQueries({ queryKey: ['card-types'] })
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'failed to delete card type')
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Card Types</h1>
          <p className="m-0 text-sm text-ink/60">{data?.length ?? 0} card types · each holds one chromakey template</p>
        </div>
        <Button variant="primary" onClick={ui.openCreate}>New Card Type</Button>
      </div>

      {isLoading && <p className="text-ink/60">Loading…</p>}
      {error && <p role="alert" className="text-danger">Failed to load card types: {error instanceof Error ? error.message : 'unknown'}</p>}
      {data && (
        <div className="grid grid-cols-3 gap-4">
          {data.map((ct) => (
            <CardTypeCard key={ct.id} ct={ct}
              onEdit={() => ui.openEdit(ct)}
              onDelete={() => { setDeleteError(null); ui.set({ deleteConfirmId: ct.id }) }} />
          ))}
        </div>
      )}

      <CardTypeDialog cardTypes={data ?? []} />

      {confirmTarget && (
        <ConfirmDialog title="Delete card type?"
          body={`Removing ${confirmTarget.name} can't be undone.`}
          confirmLabel="Delete card type"
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => { ui.set({ deleteConfirmId: null }); setDeleteError(null) }} />
      )}
    </div>
  )
}
```

In `web/src/App.tsx`: `import CardTypesPage from './pages/card-types/CardTypesPage'` and swap the card-types placeholder route to `{ path: '/card-types', element: <CardTypesPage /> }`. If `Sidebar.test.tsx` now hits an unhandled `/api/card-types` request in any test, add `http.get('/api/card-types', () => HttpResponse.json([]))` alongside its existing handlers (M2 precedent).

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run && npm run build`
Expected: PASS + clean build

- [ ] **Step 5: Commit**

```bash
git add web/src/
git commit -m "feat: card types page with template dropzone and openai file panel"
```

---

### Task 6: End-to-end verification (Playwright)

**Files:**
- None created (verification only; fix anything broken found)

- [ ] **Step 1: Full suites**

Run: `make test`
Expected: Go all packages PASS; Vitest all suites PASS.

- [ ] **Step 2: Live Playwright verification**

Start backend (`rm -f /tmp/cardforge-m3.db* && cd server && CARDFORGE_DB=/tmp/cardforge-m3.db CARDFORGE_DATA=/tmp/cardforge-m3-data go run .`) and Vite (`cd web && npm run dev`) in background. Prepare a test PNG: `python3 -c "..."` or `sips`/ImageMagick — simplest: screenshot any window region 816×1104-ish, or generate: `python3 -c "import struct,zlib; ..."` — if awkward, use any PNG on disk and note its dimensions. Via Playwright MCP at `http://localhost:5173/card-types`:

1. Empty grid renders; create "combat" with description + constraints, attach the PNG in the dropzone → staged preview + dimensions; if aspect deviates >2% the warning shows. Save → card appears with template thumbnail.
2. Edit: change constraints → dirty badge → Show diff (three text fields) → Save.
3. Upload to OpenAI: with `OPENAI_API_KEY` unset/invalid, click Upload to OpenAI → role=alert error shows in the panel (record the message). If the environment has a valid key, verify the happy path instead: file id appears, Copy button works, card grid shows the id tag.
4. Replace template: stage a new file → Upload button disables ("Save the new template first") → Save → openai_file_id cleared (grid shows "not uploaded").
5. Settings → "Test OpenAI connection" → real response (ok or error text) appears.
6. Delete card type → confirm → gone.
7. Screenshot → `.superpowers/sdd/task-6-cardtypes.png`. Check console for errors.

Kill both servers after.

- [ ] **Step 3: Commit (only if fixes were needed)**

Fix + test + commit individually (`fix: …`) if verification exposed bugs; otherwise nothing to commit.

---

## Self-review notes

- **Spec coverage (M3, spec §9 milestone 3):** migration 0003 ✔ (T1); CardTypesStore w/ stale file-id clear ✔ (T1); openai client (files+models, retry, request-id errors) ✔ (T2); multipart CRUD + template storage + serving ✔ (T3); upload-to-openai ✔ (T3); real Test OpenAI ✔ (T3); dataDir wiring ✔ (T3); apiSendForm + aspect util + data layer ✔ (T4); grid + dialog + dropzone + file panel + diff ✔ (T5); e2e ✔ (T6).
- **PRD §7.2 details:** dims shown after upload ✔ (dropzone staged meta); >2% aspect warn ✔; file_id + copy button ✔; re-upload replaces id ✔ (SetFileID overwrite); template change → stale id cleared + re-upload required ✔ (store + disabled button while staged).
- **M1/M2 lessons applied:** labeled inputs everywhere (Field/htmlFor); every user-flow await wrapped with try/catch + role=alert (delete, upload, save); ConfirmDialog error prop reused; 204 guard reused; no chi NotFound changes; typed unique check reused.
- **Known deferrals:** batch-preview refusal of card types without file_id → M5; images/edits client method → M4; template dims not stored server-side (client-side only, PRD schema kept verbatim).
- **Type consistency:** `NewRouter(db, staticFS, dataDir)` used consistently T3 (all call sites listed); `CardType` json fields match Go tags (T1↔T4); `buildCardTypeForm(fields, template)` matches T5 save action; `templateUrl(ct)` cache-buster matches T5 usage; `useCardTypesUi` state fields match T5 consumers; `openAIBaseURL` override used by both cardtypes and settings tests (same package).
- **Plan-defect watch (M1/M2 pattern):** reviewed the multipart flow for the known classes — file saved before row insert leaves an orphan on insert failure → handled (removeTemplateFile on store error); update replacing template deletes old file only after successful DB update ✔; no-file PUT keeps template ✔.
