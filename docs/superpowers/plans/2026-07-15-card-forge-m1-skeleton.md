# Card Forge — Milestone 1: Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Working skeleton — Go/chi server with SQLite migrations and Settings CRUD (test buttons stubbed), React 19 shell with Nocturne-themed sidebar routing, Settings page end-to-end.

**Architecture:** `server/` Go module (chi, modernc SQLite, golang-migrate embedded migrations, `embed.FS` prod serving) + `web/` Vite React 19 SPA (react-router, TanStack Query for server state, zustand for UI state with localStorage draft persistence, Tailwind v4 CSS-first theme). Dev: Vite proxies `/api` → `:8080`.

**Tech Stack:** Go 1.24, chi v5, modernc.org/sqlite, golang-migrate v4; React 19, TypeScript, Vite, Tailwind v4, react-router v7, @tanstack/react-query v5, zustand v5, Vitest + RTL + MSW.

**Spec:** `docs/superpowers/specs/2026-07-15-card-forge-design.md`. PRD: `docs/prd/PRD-1.md`.

## Global Constraints

- Backend module name `cardforge`; server listens on `:8080`; SQLite file `./data/cardforge.db` (override via `CARDFORGE_DB` env var for tests).
- All API JSON uses `snake_case` keys, on both sides — no camelCase mapping layer.
- API key is write-only: never returned in full; masked as `sk-…` + last 4 chars; `OPENAI_API_KEY` env var overrides DB value and is never written back (PRD §6).
- Settings defaults (PRD §5): `openai_model=gpt-image-2`, `image_size=816x1104`, `draft_quality=low`, `final_quality=high`, `input_fidelity=high`, `claude_binary=claude`.
- Quality enums (spec §6 Settings): `draft_quality ∈ {low, medium}`, `final_quality ∈ {medium, high}`, `input_fidelity ∈ {low, high}` — validate on PUT, reject otherwise with 400.
- `POST /api/settings/test-openai` and `/test-claude` are **stubs** in this milestone (canned JSON; real calls arrive in M3/M2).
- Frontend: no component file over ~150 lines (hard cap 200) — split instead.
- Explicit save only: nothing persists to the server without the Save button; unsaved drafts live in zustand and survive reload via localStorage (`persist` middleware), cleared on Save/Discard.
- Nocturne tokens (design `reference/nocturne-styles.css`): bg `#161826`, surface `#232532`, text `#e9e9ed`, accent `#9184d9`, divider `rgba(233,233,237,0.16)`, warn `#d9b86a`, danger `#e29393`, success `#a8d9a8`, radius 8px/14px, font Inter. Dark theme only.
- Commit after every task (message shown in each task's final step).

---

### Task 1: Repo scaffolding + Go server with health endpoint

**Files:**
- Delete: `index.html`, `styles.css` (leftover login mockup — PRD: no auth)
- Create: `.gitignore`, `server/go.mod` (via `go mod init`), `server/main.go`, `server/internal/api/router.go`
- Test: `server/internal/api/router_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `api.NewRouter(db *sql.DB, staticFS fs.FS) http.Handler` — Task 4 adds settings routes into it, Task 5 uses `staticFS`. `GET /api/health` → `200 {"ok":true}`.

- [ ] **Step 1: Delete mockup, write .gitignore**

```bash
git rm index.html styles.css
```

`.gitignore`:

```gitignore
data/
bin/
node_modules/
web/dist/
server/webdist/*
!server/webdist/.gitkeep
.DS_Store
```

- [ ] **Step 2: Init Go module, write failing router test**

```bash
mkdir -p server/internal/api && cd server && go mod init cardforge
```

`server/internal/api/router_test.go`:

```go
package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealth(t *testing.T) {
	r := NewRouter(nil, nil)
	req := httptest.NewRequest(http.MethodGet, "/api/health", nil)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Body.String(); got != "{\"ok\":true}\n" {
		t.Fatalf("body = %q", got)
	}
}
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd server && go test ./...`
Expected: FAIL — `undefined: NewRouter`

- [ ] **Step 4: Implement router and main**

`server/internal/api/router.go`:

```go
package api

import (
	"database/sql"
	"encoding/json"
	"io/fs"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func NewRouter(db *sql.DB, staticFS fs.FS) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		})
	})

	return r
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
```

`server/main.go`:

```go
package main

import (
	"log"
	"net/http"

	"cardforge/internal/api"
)

func main() {
	r := api.NewRouter(nil, nil)
	log.Println("cardforge listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
```

```bash
cd server && go get github.com/go-chi/chi/v5 && go mod tidy
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: scaffold Go server with chi router and health endpoint"
```

---

### Task 2: SQLite open + embedded migration 0001 (settings)

**Files:**
- Create: `server/internal/store/db.go`, `server/internal/store/migrations/0001_settings.up.sql`, `server/internal/store/migrations/0001_settings.down.sql`
- Test: `server/internal/store/db_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `store.Open(path string) (*sql.DB, error)` — opens/creates the DB, runs all embedded migrations up. Used by Task 3 tests, Task 4 handlers, Task 10 main.

- [ ] **Step 1: Write failing test**

`server/internal/store/db_test.go`:

```go
package store

import (
	"path/filepath"
	"testing"
)

func TestOpenMigratesAndSeedsSettings(t *testing.T) {
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	var model string
	err = db.QueryRow(`SELECT value FROM settings WHERE key = 'openai_model'`).Scan(&model)
	if err != nil {
		t.Fatal(err)
	}
	if model != "gpt-image-2" {
		t.Fatalf("openai_model = %q, want gpt-image-2", model)
	}

	var n int
	if err := db.QueryRow(`SELECT COUNT(*) FROM settings`).Scan(&n); err != nil {
		t.Fatal(err)
	}
	if n != 8 {
		t.Fatalf("settings rows = %d, want 8", n)
	}
}

func TestOpenIsIdempotent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "test.db")
	for i := 0; i < 2; i++ {
		db, err := Open(path)
		if err != nil {
			t.Fatalf("open #%d: %v", i+1, err)
		}
		db.Close()
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./internal/store/`
Expected: FAIL — `undefined: Open`

- [ ] **Step 3: Write migration files**

`server/internal/store/migrations/0001_settings.up.sql`:

```sql
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);

INSERT INTO settings (key, value) VALUES
  ('openai_api_key', ''),
  ('openai_model', 'gpt-image-2'),
  ('image_size', '816x1104'),
  ('draft_quality', 'low'),
  ('final_quality', 'high'),
  ('input_fidelity', 'high'),
  ('claude_binary', 'claude'),
  ('price_table', '{"note":"estimates - edit to match current OpenAI pricing","gpt-image-2":{"input_per_1m_usd":10.0,"output_per_1m_usd":40.0}}');
```

`server/internal/store/migrations/0001_settings.down.sql`:

```sql
DROP TABLE settings;
```

- [ ] **Step 4: Implement Open**

`server/internal/store/db.go`:

```go
package store

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	migratesqlite "github.com/golang-migrate/migrate/v4/database/sqlite"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	_ "modernc.org/sqlite"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// Open creates the parent directory if needed, opens the SQLite database,
// and runs all embedded migrations up. Safe to call repeatedly.
func Open(path string) (*sql.DB, error) {
	if dir := filepath.Dir(path); dir != "." {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)")
	if err != nil {
		return nil, err
	}
	// modernc/sqlite: a single writer connection avoids SQLITE_BUSY races.
	db.SetMaxOpenConns(1)

	if err := runMigrations(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return db, nil
}

func runMigrations(db *sql.DB) error {
	src, err := iofs.New(migrationsFS, "migrations")
	if err != nil {
		return err
	}
	drv, err := migratesqlite.WithInstance(db, &migratesqlite.Config{})
	if err != nil {
		return err
	}
	m, err := migrate.NewWithInstance("iofs", src, "sqlite", drv)
	if err != nil {
		return err
	}
	if err := m.Up(); err != nil && !errors.Is(err, migrate.ErrNoChange) {
		return err
	}
	return nil
}
```

```bash
cd server && go get github.com/golang-migrate/migrate/v4 modernc.org/sqlite && go mod tidy
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd server && go test ./internal/store/`
Expected: PASS (both tests)

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat: add SQLite store with embedded settings migration"
```

---

### Task 3: Settings store (GetAll / SetMany)

**Files:**
- Create: `server/internal/store/settings.go`
- Test: `server/internal/store/settings_test.go`

**Interfaces:**
- Consumes: `store.Open` (Task 2).
- Produces: `store.NewSettingsStore(db *sql.DB) *SettingsStore`; `(*SettingsStore).GetAll() (map[string]string, error)`; `(*SettingsStore).SetMany(kv map[string]string) error` (transactional; only updates existing keys). Used by Task 4.

- [ ] **Step 1: Write failing test**

`server/internal/store/settings_test.go`:

```go
package store

import (
	"path/filepath"
	"testing"
)

func openTestDB(t *testing.T) *SettingsStore {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewSettingsStore(db)
}

func TestGetAllReturnsSeededDefaults(t *testing.T) {
	s := openTestDB(t)
	all, err := s.GetAll()
	if err != nil {
		t.Fatal(err)
	}
	if all["draft_quality"] != "low" || all["final_quality"] != "high" {
		t.Fatalf("unexpected defaults: %v", all)
	}
}

func TestSetManyUpdatesValues(t *testing.T) {
	s := openTestDB(t)
	err := s.SetMany(map[string]string{
		"openai_model": "gpt-image-3",
		"claude_binary": "/usr/local/bin/claude",
	})
	if err != nil {
		t.Fatal(err)
	}
	all, _ := s.GetAll()
	if all["openai_model"] != "gpt-image-3" {
		t.Fatalf("openai_model = %q", all["openai_model"])
	}
	if all["claude_binary"] != "/usr/local/bin/claude" {
		t.Fatalf("claude_binary = %q", all["claude_binary"])
	}
}

func TestSetManyIgnoresUnknownKeys(t *testing.T) {
	s := openTestDB(t)
	if err := s.SetMany(map[string]string{"bogus_key": "x"}); err != nil {
		t.Fatal(err)
	}
	all, _ := s.GetAll()
	if _, ok := all["bogus_key"]; ok {
		t.Fatal("unknown key was inserted")
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./internal/store/`
Expected: FAIL — `undefined: NewSettingsStore`

- [ ] **Step 3: Implement**

`server/internal/store/settings.go`:

```go
package store

import "database/sql"

type SettingsStore struct {
	db *sql.DB
}

func NewSettingsStore(db *sql.DB) *SettingsStore {
	return &SettingsStore{db: db}
}

func (s *SettingsStore) GetAll() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]string)
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

// SetMany updates existing settings keys in one transaction.
// Unknown keys are ignored (UPDATE matches no row).
func (s *SettingsStore) SetMany(kv map[string]string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for k, v := range kv {
		if _, err := tx.Exec(`UPDATE settings SET value = ? WHERE key = ?`, v, k); err != nil {
			return err
		}
	}
	return tx.Commit()
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./internal/store/`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add server/internal/store/
git commit -m "feat: add settings store with GetAll/SetMany"
```

---

### Task 4: Settings API — GET/PUT with masking, env override, validation, stub test endpoints

**Files:**
- Create: `server/internal/api/settings.go`
- Modify: `server/internal/api/router.go` (register routes)
- Test: `server/internal/api/settings_test.go`

**Interfaces:**
- Consumes: `store.NewSettingsStore`, `GetAll`, `SetMany` (Task 3); `store.Open` (Task 2, tests only); `writeJSON`/`writeError` (Task 1).
- Produces: HTTP API consumed by Task 8's frontend client:
  - `GET /api/settings` → 200 `settingsResponse` (below)
  - `PUT /api/settings` body `settingsUpdate` → 200 fresh `settingsResponse`, or 400 `{"error": "..."}` on invalid enum
  - `POST /api/settings/test-openai` → 200 `{"ok":true,"message":"stub: real connection test arrives with the Card Types milestone"}`
  - `POST /api/settings/test-claude` → 200 `{"ok":true,"message":"stub: real CLI test arrives with the Factions milestone"}`

`settingsResponse` JSON: `openai_api_key_masked` (string), `openai_api_key_from_env` (bool), `openai_model`, `image_size`, `draft_quality`, `final_quality`, `input_fidelity`, `claude_binary`, `price_table` (all strings).
`settingsUpdate` JSON: same string fields but `openai_api_key` instead of the masked pair; empty `openai_api_key` = leave unchanged.

- [ ] **Step 1: Write failing tests**

`server/internal/api/settings_test.go`:

```go
package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"cardforge/internal/store"
)

func newTestRouter(t *testing.T) http.Handler {
	t.Helper()
	db, err := store.Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewRouter(db, nil)
}

func doJSON(t *testing.T, h http.Handler, method, path, body string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	return rec, out
}

func TestGetSettingsDefaults(t *testing.T) {
	rec, out := doJSON(t, newTestRouter(t), http.MethodGet, "/api/settings", "")
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	if out["openai_model"] != "gpt-image-2" || out["openai_api_key_masked"] != "" {
		t.Fatalf("unexpected: %v", out)
	}
	if out["openai_api_key_from_env"] != false {
		t.Fatal("from_env should be false")
	}
}

func TestPutSetsAndMasksKey(t *testing.T) {
	r := newTestRouter(t)
	body := `{"openai_api_key":"sk-proj-9f0a12de34bc","openai_model":"gpt-image-2","image_size":"816x1104","draft_quality":"medium","final_quality":"high","input_fidelity":"high","claude_binary":"claude","price_table":"{}"}`
	rec, out := doJSON(t, r, http.MethodPut, "/api/settings", body)
	if rec.Code != 200 {
		t.Fatalf("status %d: %v", rec.Code, out)
	}
	if out["openai_api_key_masked"] != "sk-…34bc" {
		t.Fatalf("masked = %v", out["openai_api_key_masked"])
	}
	if out["draft_quality"] != "medium" {
		t.Fatalf("draft_quality = %v", out["draft_quality"])
	}

	// empty key on next PUT leaves the stored key unchanged
	body2 := strings.Replace(body, `"sk-proj-9f0a12de34bc"`, `""`, 1)
	_, out2 := doJSON(t, r, http.MethodPut, "/api/settings", body2)
	if out2["openai_api_key_masked"] != "sk-…34bc" {
		t.Fatalf("key was clobbered: %v", out2["openai_api_key_masked"])
	}
}

func TestPutRejectsInvalidQuality(t *testing.T) {
	body := `{"openai_api_key":"","openai_model":"m","image_size":"816x1104","draft_quality":"ultra","final_quality":"high","input_fidelity":"high","claude_binary":"claude","price_table":"{}"}`
	rec, _ := doJSON(t, newTestRouter(t), http.MethodPut, "/api/settings", body)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status %d, want 400", rec.Code)
	}
}

func TestEnvVarOverridesKey(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-env-key-ffff")
	_, out := doJSON(t, newTestRouter(t), http.MethodGet, "/api/settings", "")
	if out["openai_api_key_masked"] != "sk-…ffff" {
		t.Fatalf("masked = %v", out["openai_api_key_masked"])
	}
	if out["openai_api_key_from_env"] != true {
		t.Fatal("from_env should be true")
	}
}

func TestStubTestEndpoints(t *testing.T) {
	r := newTestRouter(t)
	for _, path := range []string{"/api/settings/test-openai", "/api/settings/test-claude"} {
		rec, out := doJSON(t, r, http.MethodPost, path, "")
		if rec.Code != 200 || out["ok"] != true {
			t.Fatalf("%s: status %d body %v", path, rec.Code, out)
		}
	}
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && go test ./internal/api/`
Expected: FAIL — GET /api/settings returns 404 (route not registered)

- [ ] **Step 3: Implement handler**

`server/internal/api/settings.go`:

```go
package api

import (
	"encoding/json"
	"net/http"
	"os"

	"cardforge/internal/store"
)

type SettingsHandler struct {
	Store *store.SettingsStore
}

type settingsResponse struct {
	OpenAIAPIKeyMasked  string `json:"openai_api_key_masked"`
	OpenAIAPIKeyFromEnv bool   `json:"openai_api_key_from_env"`
	OpenAIModel         string `json:"openai_model"`
	ImageSize           string `json:"image_size"`
	DraftQuality        string `json:"draft_quality"`
	FinalQuality        string `json:"final_quality"`
	InputFidelity       string `json:"input_fidelity"`
	ClaudeBinary        string `json:"claude_binary"`
	PriceTable          string `json:"price_table"`
}

type settingsUpdate struct {
	OpenAIAPIKey  string `json:"openai_api_key"`
	OpenAIModel   string `json:"openai_model"`
	ImageSize     string `json:"image_size"`
	DraftQuality  string `json:"draft_quality"`
	FinalQuality  string `json:"final_quality"`
	InputFidelity string `json:"input_fidelity"`
	ClaudeBinary  string `json:"claude_binary"`
	PriceTable    string `json:"price_table"`
}

func maskKey(key string) string {
	if key == "" {
		return ""
	}
	last4 := key
	if len(key) > 4 {
		last4 = key[len(key)-4:]
	}
	return "sk-…" + last4
}

func oneOf(v string, allowed ...string) bool {
	for _, a := range allowed {
		if v == a {
			return true
		}
	}
	return false
}

func (h *SettingsHandler) buildResponse() (settingsResponse, error) {
	all, err := h.Store.GetAll()
	if err != nil {
		return settingsResponse{}, err
	}
	key, fromEnv := all["openai_api_key"], false
	if env := os.Getenv("OPENAI_API_KEY"); env != "" {
		key, fromEnv = env, true
	}
	return settingsResponse{
		OpenAIAPIKeyMasked:  maskKey(key),
		OpenAIAPIKeyFromEnv: fromEnv,
		OpenAIModel:         all["openai_model"],
		ImageSize:           all["image_size"],
		DraftQuality:        all["draft_quality"],
		FinalQuality:        all["final_quality"],
		InputFidelity:       all["input_fidelity"],
		ClaudeBinary:        all["claude_binary"],
		PriceTable:          all["price_table"],
	}, nil
}

func (h *SettingsHandler) Get(w http.ResponseWriter, _ *http.Request) {
	resp, err := h.buildResponse()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *SettingsHandler) Put(w http.ResponseWriter, r *http.Request) {
	var u settingsUpdate
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	if !oneOf(u.DraftQuality, "low", "medium") {
		writeError(w, http.StatusBadRequest, "draft_quality must be low or medium")
		return
	}
	if !oneOf(u.FinalQuality, "medium", "high") {
		writeError(w, http.StatusBadRequest, "final_quality must be medium or high")
		return
	}
	if !oneOf(u.InputFidelity, "low", "high") {
		writeError(w, http.StatusBadRequest, "input_fidelity must be low or high")
		return
	}

	kv := map[string]string{
		"openai_model":   u.OpenAIModel,
		"image_size":     u.ImageSize,
		"draft_quality":  u.DraftQuality,
		"final_quality":  u.FinalQuality,
		"input_fidelity": u.InputFidelity,
		"claude_binary":  u.ClaudeBinary,
		"price_table":    u.PriceTable,
	}
	if u.OpenAIAPIKey != "" { // write-only: empty means "leave unchanged"
		kv["openai_api_key"] = u.OpenAIAPIKey
	}
	if err := h.Store.SetMany(kv); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	resp, err := h.buildResponse()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *SettingsHandler) TestOpenAI(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "stub: real connection test arrives with the Card Types milestone",
	})
}

func (h *SettingsHandler) TestClaude(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":      true,
		"message": "stub: real CLI test arrives with the Factions milestone",
	})
}
```

Modify `server/internal/api/router.go` — replace the `r.Route("/api", ...)` block:

```go
	r.Route("/api", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
			writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
		})
		if db != nil {
			settings := &SettingsHandler{Store: store.NewSettingsStore(db)}
			r.Get("/settings", settings.Get)
			r.Put("/settings", settings.Put)
			r.Post("/settings/test-openai", settings.TestOpenAI)
			r.Post("/settings/test-claude", settings.TestClaude)
		}
	})
```

Add import `"cardforge/internal/store"` to router.go.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS (all packages)

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat: settings API with key masking, env override, and stub test endpoints"
```

---

### Task 5: Static embed + SPA fallback + Makefile

**Files:**
- Create: `server/internal/api/spa.go`, `server/webdist/.gitkeep`, `Makefile`
- Modify: `server/internal/api/router.go` (NotFound → SPA handler), `server/main.go` (embed + wire DB)
- Test: `server/internal/api/spa_test.go`

**Interfaces:**
- Consumes: `NewRouter(db, staticFS)` (Task 1), `store.Open` (Task 2).
- Produces: production serving — any non-`/api` path serves the embedded SPA (file if it exists, else `index.html`). `make dev-server`, `make dev-web`, `make build`, `make test` targets. Final `main.go` used unchanged by later milestones.

- [ ] **Step 1: Write failing SPA handler test**

`server/internal/api/spa_test.go`:

```go
package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
)

func TestSPAServesFilesAndFallsBackToIndex(t *testing.T) {
	staticFS := fstest.MapFS{
		"index.html":    {Data: []byte("<html>app</html>")},
		"assets/app.js": {Data: []byte("console.log(1)")},
	}
	r := NewRouter(nil, staticFS)

	cases := []struct {
		path string
		want string
	}{
		{"/", "<html>app</html>"},
		{"/assets/app.js", "console.log(1)"},
		{"/settings", "<html>app</html>"}, // client route → index fallback
	}
	for _, c := range cases {
		req := httptest.NewRequest(http.MethodGet, c.path, nil)
		rec := httptest.NewRecorder()
		r.ServeHTTP(rec, req)
		if rec.Code != 200 || rec.Body.String() != c.want {
			t.Fatalf("%s: code=%d body=%q", c.path, rec.Code, rec.Body.String())
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && go test ./internal/api/`
Expected: FAIL — `/settings` and `/` return 404 (no SPA handler wired)

- [ ] **Step 3: Implement SPA handler and wire it**

`server/internal/api/spa.go`:

```go
package api

import (
	"io/fs"
	"net/http"
	"strings"
)

// spaHandler serves files from staticFS; unknown paths fall back to
// index.html so client-side routes work on hard reload.
func spaHandler(staticFS fs.FS) http.HandlerFunc {
	fileServer := http.FileServerFS(staticFS)
	return func(w http.ResponseWriter, r *http.Request) {
		p := strings.TrimPrefix(r.URL.Path, "/")
		if p == "" {
			p = "index.html"
		}
		if _, err := fs.Stat(staticFS, p); err != nil {
			http.ServeFileFS(w, r, staticFS, "index.html")
			return
		}
		fileServer.ServeHTTP(w, r)
	}
}
```

In `server/internal/api/router.go`, before `return r`:

```go
	if staticFS != nil {
		r.NotFound(spaHandler(staticFS))
	}
```

Replace `server/main.go`:

```go
package main

import (
	"embed"
	"io/fs"
	"log"
	"net/http"
	"os"

	"cardforge/internal/api"
	"cardforge/internal/store"
)

//go:embed all:webdist
var webFS embed.FS

func main() {
	dbPath := os.Getenv("CARDFORGE_DB")
	if dbPath == "" {
		dbPath = "./data/cardforge.db"
	}
	db, err := store.Open(dbPath)
	if err != nil {
		log.Fatalf("open db: %v", err)
	}
	defer db.Close()

	dist, err := fs.Sub(webFS, "webdist")
	if err != nil {
		log.Fatalf("webdist: %v", err)
	}

	r := api.NewRouter(db, dist)
	log.Println("cardforge listening on :8080")
	log.Fatal(http.ListenAndServe(":8080", r))
}
```

```bash
touch server/webdist/.gitkeep
```

`Makefile` (repo root):

```makefile
.PHONY: dev-server dev-web build test

dev-server:
	cd server && CARDFORGE_DB=./data/cardforge.db go run .

dev-web:
	cd web && npm run dev

build:
	cd web && npm run build
	rm -rf server/webdist && mkdir -p server/webdist
	cp -R web/dist/. server/webdist/
	cd server && go build -o ../bin/cardforge .

test:
	cd server && go test ./...
	cd web && npx vitest run
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS. Also `cd server && go build ./...` succeeds (embed finds `webdist/` via `.gitkeep`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: SPA static serving with embed and Makefile targets"
```

---

### Task 6: Web scaffold — Vite + React 19 + Tailwind v4 Nocturne theme + test setup

**Files:**
- Create: `web/` (Vite react-ts template), `web/vite.config.ts`, `web/src/index.css`, `web/src/lib/api.ts`, `web/src/test/setup.ts`, `web/src/test/msw.ts`
- Test: `web/src/lib/api.test.ts`

**Interfaces:**
- Consumes: nothing (backend contract mocked with MSW).
- Produces: `apiGet<T>(path: string): Promise<T>` and `apiSend<T>(method: string, path: string, body: unknown): Promise<T>` throwing `ApiError { status: number; message }` on non-2xx (Tasks 8–9 use these). Tailwind theme tokens (`bg-bg`, `bg-surface`, `text-ink`, `text-accent`, `border-divider`, `text-warn`, `text-danger`, `text-success`, `rounded-md`=8px, `rounded-lg`=14px) for all UI tasks. MSW test server for Task 9.

- [ ] **Step 1: Scaffold and install**

```bash
npm create vite@latest web -- --template react-ts
cd web
npm install react-router @tanstack/react-query zustand
npm install -D tailwindcss @tailwindcss/vite vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom msw
```

Verify `web/package.json` has `"react": "^19"`. Add script: `"test": "vitest"`.
Delete template noise: `web/src/App.css`, `web/src/assets/react.svg`, `web/public/vite.svg`.

- [ ] **Step 2: Configure Vite + Vitest + proxy**

Replace `web/vite.config.ts`:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: { '/api': 'http://localhost:8080' },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
})
```

- [ ] **Step 3: Nocturne theme**

Replace `web/src/index.css`:

```css
@import 'tailwindcss';
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

@theme {
  --color-bg: #161826;
  --color-surface: #232532;
  --color-ink: #e9e9ed;
  --color-accent: #9184d9;
  --color-accent-2: #a7a1db;
  --color-divider: rgba(233, 233, 237, 0.16);
  --color-warn: #d9b86a;
  --color-danger: #e29393;
  --color-success: #a8d9a8;

  --color-accent-100: #f5f4ff;
  --color-accent-300: #d2cefd;
  --color-accent-500: #968ae0;
  --color-accent-700: #5d5294;
  --color-accent-800: #423a6a;
  --color-accent-900: #2b2741;

  --color-neutral-100: #f3f5fe;
  --color-neutral-500: #9397ab;
  --color-neutral-800: #3f424d;
  --color-neutral-900: #292b31;

  --radius-md: 8px;
  --radius-lg: 14px;

  --font-sans: 'Inter', system-ui, sans-serif;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-ink);
  font-family: var(--font-sans);
  font-size: 15px;
  line-height: 1.55;
}

::selection {
  background: rgba(145, 132, 217, 0.3);
}
```

- [ ] **Step 4: Test setup + MSW server + failing api client test**

`web/src/test/setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from './msw'

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => server.close())
```

`web/src/test/msw.ts`:

```ts
import { setupServer } from 'msw/node'

export const server = setupServer()
```

`web/src/lib/api.test.ts`:

```ts
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw'
import { apiGet, apiSend, ApiError } from './api'

test('apiGet returns parsed JSON', async () => {
  server.use(http.get('/api/health', () => HttpResponse.json({ ok: true })))
  await expect(apiGet<{ ok: boolean }>('/api/health')).resolves.toEqual({ ok: true })
})

test('apiSend sends body and parses response', async () => {
  server.use(
    http.put('/api/settings', async ({ request }) => {
      const body = (await request.json()) as { openai_model: string }
      return HttpResponse.json({ openai_model: body.openai_model })
    }),
  )
  await expect(
    apiSend('PUT', '/api/settings', { openai_model: 'x' }),
  ).resolves.toEqual({ openai_model: 'x' })
})

test('non-2xx throws ApiError with server message', async () => {
  server.use(
    http.put('/api/settings', () =>
      HttpResponse.json({ error: 'draft_quality must be low or medium' }, { status: 400 }),
    ),
  )
  const err = await apiSend('PUT', '/api/settings', {}).catch((e) => e)
  expect(err).toBeInstanceOf(ApiError)
  expect(err.status).toBe(400)
  expect(err.message).toBe('draft_quality must be low or medium')
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/api.test.ts`
Expected: FAIL — `./api` module not found

- [ ] **Step 6: Implement api client**

`web/src/lib/api.ts`:

```ts
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // non-JSON error body — keep the status message
    }
    throw new ApiError(res.status, message)
  }
  return (await res.json()) as T
}

export function apiGet<T>(path: string): Promise<T> {
  return fetch(path).then((res) => parse<T>(res))
}

export function apiSend<T>(method: string, path: string, body: unknown): Promise<T> {
  return fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then((res) => parse<T>(res))
}
```

- [ ] **Step 7: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold web app with Tailwind Nocturne theme, api client, and test setup"
```

---

### Task 7: App shell — sidebar, routes, placeholder pages

**Files:**
- Create: `web/src/components/icons.tsx`, `web/src/components/Sidebar.tsx`, `web/src/components/AppLayout.tsx`, `web/src/components/PlaceholderPage.tsx`, `web/src/App.tsx` (replace template), `web/src/main.tsx` (replace template)
- Delete: template `web/src/App.tsx` contents (replaced)
- Test: `web/src/components/Sidebar.test.tsx`

**Interfaces:**
- Consumes: theme tokens (Task 6).
- Produces: route table — `/factions`, `/card-types`, `/test-generation`, `/batches`, `/settings`; `/` redirects to `/factions`. `AppLayout` renders sidebar + `<Outlet/>`. Task 9 replaces the `/settings` placeholder element with `<SettingsPage/>`.

- [ ] **Step 1: Write failing sidebar test**

`web/src/components/Sidebar.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { routes } from '../App'

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(<RouterProvider router={router} />)
}

test('sidebar renders all five section links', () => {
  renderAt('/settings')
  for (const label of ['Factions', 'Card Types', 'Test Generation', 'Batch Processing', 'Settings']) {
    expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
  }
})

test('active route link is marked current', () => {
  renderAt('/card-types')
  expect(screen.getByRole('link', { name: 'Card Types' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Factions' })).not.toHaveAttribute('aria-current')
})

test('root redirects to factions', () => {
  renderAt('/')
  expect(screen.getByRole('link', { name: 'Factions' })).toHaveAttribute('aria-current', 'page')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/components/Sidebar.test.tsx`
Expected: FAIL — `routes` not exported from `../App`

- [ ] **Step 3: Implement icons, sidebar, layout, routes**

`web/src/components/icons.tsx` (stroke icons from the design screens):

```tsx
type IconProps = { className?: string }

export function FactionsIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="2" y="2" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function CardTypesIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="2" y="3" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function TestGenIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M9 2L11 7L16 9L11 11L9 16L7 11L2 9L7 7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BatchIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="2" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}
```

`web/src/components/Sidebar.tsx`:

```tsx
import { NavLink } from 'react-router'
import type { ComponentType } from 'react'
import { FactionsIcon, CardTypesIcon, TestGenIcon, BatchIcon, SettingsIcon } from './icons'

const items: { to: string; label: string; Icon: ComponentType<{ className?: string }> }[] = [
  { to: '/factions', label: 'Factions', Icon: FactionsIcon },
  { to: '/card-types', label: 'Card Types', Icon: CardTypesIcon },
  { to: '/test-generation', label: 'Test Generation', Icon: TestGenIcon },
  { to: '/batches', label: 'Batch Processing', Icon: BatchIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsIcon },
]

export function Sidebar() {
  return (
    <aside className="w-60 flex-none flex flex-col gap-5 p-4 border-r border-divider">
      <div className="flex items-center gap-2 px-1 pt-1 pb-2">
        <div className="w-7 h-7 rounded-md border-[1.5px] border-accent flex-none" />
        <div>
          <div className="font-medium text-base tracking-tight">Card Forge</div>
          <div className="text-[10px] tracking-widest uppercase text-ink/50">local · offline</div>
        </div>
      </div>
      <nav className="flex flex-col gap-0.5">
        {items.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-md text-sm no-underline ${
                isActive ? 'text-accent-300 bg-accent-900 font-medium' : 'text-ink/50 hover:text-ink/80'
              }`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  )
}
```

`web/src/components/AppLayout.tsx`:

```tsx
import { Outlet } from 'react-router'
import { Sidebar } from './Sidebar'

export function AppLayout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto px-10 py-8">
        <Outlet />
      </main>
    </div>
  )
}
```

`web/src/components/PlaceholderPage.tsx`:

```tsx
export function PlaceholderPage({ title, milestone }: { title: string; milestone: number }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-[32px] font-medium tracking-tight leading-tight mb-1.5">{title}</h1>
      <div className="mt-4 p-4 rounded-md bg-surface text-sm text-ink/60">
        Coming in Milestone {milestone}.
      </div>
    </div>
  )
}
```

Replace `web/src/App.tsx`:

```tsx
import { Navigate, type RouteObject } from 'react-router'
import { AppLayout } from './components/AppLayout'
import { PlaceholderPage } from './components/PlaceholderPage'

export const routes: RouteObject[] = [
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Navigate to="/factions" replace /> },
      { path: '/factions', element: <PlaceholderPage title="Factions" milestone={2} /> },
      { path: '/card-types', element: <PlaceholderPage title="Card Types" milestone={3} /> },
      { path: '/test-generation', element: <PlaceholderPage title="Test Generation" milestone={4} /> },
      { path: '/batches', element: <PlaceholderPage title="Batch Processing" milestone={5} /> },
      { path: '/settings', element: <PlaceholderPage title="Settings" milestone={1} /> },
    ],
  },
]
```

Replace `web/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { routes } from './App'
import './index.css'

const queryClient = new QueryClient()
const router = createBrowserRouter(routes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS (all). Also `npm run build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/
git commit -m "feat: app shell with Nocturne sidebar, routing, and placeholder pages"
```

---

### Task 8: Settings data layer — types, query hooks, zustand store

**Files:**
- Create: `web/src/pages/settings/api.ts`, `web/src/pages/settings/store.ts`
- Test: `web/src/pages/settings/store.test.ts`

**Interfaces:**
- Consumes: `apiGet`, `apiSend` (Task 6); backend contract (Task 4).
- Produces (Task 9 consumes all of this):
  - `Settings` type (mirrors Task 4 `settingsResponse`, snake_case), `SettingsUpdate` type (mirrors `settingsUpdate`)
  - `useSettings()` — TanStack Query hook, key `['settings']`
  - `putSettings(u: SettingsUpdate): Promise<Settings>`
  - `postTestOpenAI(): Promise<TestResult>`, `postTestClaude(): Promise<TestResult>` where `TestResult = { ok: boolean; message: string }`
  - `useSettingsStore` (zustand + persist, localStorage key `cardforge:settings-draft`), `SettingsDraft` type, `selectIsDirty(state): boolean`
  - Store actions: `init(s: Settings)`, `setField(key, value)`, `startEditKey()`, `discard()`, `markSaved(s: Settings)`

- [ ] **Step 1: Write failing store test**

`web/src/pages/settings/store.test.ts`:

```ts
import { useSettingsStore, selectIsDirty } from './store'
import type { Settings } from './api'

const serverSettings: Settings = {
  openai_api_key_masked: 'sk-…34bc',
  openai_api_key_from_env: false,
  openai_model: 'gpt-image-2',
  image_size: '816x1104',
  draft_quality: 'low',
  final_quality: 'high',
  input_fidelity: 'high',
  claude_binary: 'claude',
  price_table: '{}',
}

beforeEach(() => {
  useSettingsStore.setState({ persisted: null, draft: null, editingKey: false })
})

test('init sets persisted and draft; not dirty', () => {
  useSettingsStore.getState().init(serverSettings)
  expect(selectIsDirty(useSettingsStore.getState())).toBe(false)
  expect(useSettingsStore.getState().draft?.openai_model).toBe('gpt-image-2')
})

test('setField makes store dirty; discard reverts', () => {
  const s = useSettingsStore.getState()
  s.init(serverSettings)
  useSettingsStore.getState().setField('openai_model', 'gpt-image-3')
  expect(selectIsDirty(useSettingsStore.getState())).toBe(true)
  useSettingsStore.getState().discard()
  expect(selectIsDirty(useSettingsStore.getState())).toBe(false)
  expect(useSettingsStore.getState().draft?.openai_model).toBe('gpt-image-2')
})

test('non-empty key input is dirty; markSaved resets', () => {
  useSettingsStore.getState().init(serverSettings)
  useSettingsStore.getState().setField('openai_api_key_input', 'sk-new')
  expect(selectIsDirty(useSettingsStore.getState())).toBe(true)
  useSettingsStore.getState().markSaved({ ...serverSettings, openai_api_key_masked: 'sk-…-new' })
  expect(selectIsDirty(useSettingsStore.getState())).toBe(false)
  expect(useSettingsStore.getState().draft?.openai_api_key_input).toBe('')
})

test('init does not clobber an existing (possibly restored) draft', () => {
  useSettingsStore.getState().init(serverSettings)
  useSettingsStore.getState().setField('claude_binary', '/opt/claude')
  useSettingsStore.getState().init(serverSettings) // e.g. query refetch
  expect(useSettingsStore.getState().draft?.claude_binary).toBe('/opt/claude')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/settings/store.test.ts`
Expected: FAIL — modules not found

- [ ] **Step 3: Implement api.ts**

`web/src/pages/settings/api.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'

export type Settings = {
  openai_api_key_masked: string
  openai_api_key_from_env: boolean
  openai_model: string
  image_size: string
  draft_quality: 'low' | 'medium'
  final_quality: 'medium' | 'high'
  input_fidelity: 'low' | 'high'
  claude_binary: string
  price_table: string
}

export type SettingsUpdate = Omit<Settings, 'openai_api_key_masked' | 'openai_api_key_from_env'> & {
  openai_api_key: string // empty string = leave unchanged (write-only key)
}

export type TestResult = { ok: boolean; message: string }

export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: () => apiGet<Settings>('/api/settings') })
}

export function putSettings(u: SettingsUpdate): Promise<Settings> {
  return apiSend<Settings>('PUT', '/api/settings', u)
}

export function postTestOpenAI(): Promise<TestResult> {
  return apiSend<TestResult>('POST', '/api/settings/test-openai', {})
}

export function postTestClaude(): Promise<TestResult> {
  return apiSend<TestResult>('POST', '/api/settings/test-claude', {})
}
```

- [ ] **Step 4: Implement store.ts**

`web/src/pages/settings/store.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Settings } from './api'

export type SettingsDraft = {
  openai_api_key_input: string
  openai_model: string
  image_size: string
  draft_quality: 'low' | 'medium'
  final_quality: 'medium' | 'high'
  input_fidelity: 'low' | 'high'
  claude_binary: string
}

type SettingsState = {
  persisted: SettingsDraft | null
  draft: SettingsDraft | null
  editingKey: boolean
  init: (s: Settings) => void
  setField: <K extends keyof SettingsDraft>(key: K, value: SettingsDraft[K]) => void
  startEditKey: () => void
  discard: () => void
  markSaved: (s: Settings) => void
}

const fromSettings = (s: Settings): SettingsDraft => ({
  openai_api_key_input: '',
  openai_model: s.openai_model,
  image_size: s.image_size,
  draft_quality: s.draft_quality,
  final_quality: s.final_quality,
  input_fidelity: s.input_fidelity,
  claude_binary: s.claude_binary,
})

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      persisted: null,
      draft: null,
      editingKey: false,
      // Sets the server snapshot; keeps any existing draft (it may have
      // been restored from localStorage before the query resolved).
      init: (s) => {
        const snap = fromSettings(s)
        set((st) => ({ persisted: snap, draft: st.draft ?? { ...snap } }))
      },
      setField: (key, value) =>
        set((st) => (st.draft ? { draft: { ...st.draft, [key]: value } } : {})),
      startEditKey: () => set({ editingKey: true }),
      discard: () =>
        set((st) => ({
          draft: st.persisted ? { ...st.persisted } : null,
          editingKey: false,
        })),
      markSaved: (s) => {
        const snap = fromSettings(s)
        set({ persisted: snap, draft: { ...snap }, editingKey: false })
      },
    }),
    {
      name: 'cardforge:settings-draft',
      // Only the unsaved draft persists; the snapshot always comes fresh
      // from the server (explicit-save principle: DB is source of truth).
      partialize: (st) => ({ draft: st.draft, editingKey: st.editingKey }),
    },
  ),
)

export function selectIsDirty(st: SettingsState): boolean {
  if (!st.persisted || !st.draft) return false
  if (st.draft.openai_api_key_input !== '') return true
  const p = st.persisted
  const d = st.draft
  return (
    d.openai_model !== p.openai_model ||
    d.image_size !== p.image_size ||
    d.draft_quality !== p.draft_quality ||
    d.final_quality !== p.final_quality ||
    d.input_fidelity !== p.input_fidelity ||
    d.claude_binary !== p.claude_binary
  )
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS (all)

- [ ] **Step 6: Commit**

```bash
git add web/src/pages/
git commit -m "feat: settings data layer - query hooks and zustand draft store"
```

---

### Task 9: Settings page UI

**Files:**
- Create: `web/src/components/Button.tsx`, `web/src/components/Field.tsx`, `web/src/pages/settings/SettingsPage.tsx`, `web/src/pages/settings/ApiKeyField.tsx`, `web/src/pages/settings/OpenAISection.tsx`, `web/src/pages/settings/ClaudeSection.tsx`, `web/src/pages/settings/TestButton.tsx`, `web/src/pages/settings/SaveBar.tsx`
- Modify: `web/src/App.tsx` (route `/settings` → `<SettingsPage />`)
- Test: `web/src/pages/settings/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: everything Task 8 produces; `Button`/`Field` primitives created here; routes (Task 7).
- Produces: working Settings page. `Button` (`variant: 'primary' | 'secondary'`) and `Field` (`label` + children) are reused by later milestones.

- [ ] **Step 1: Write failing page test**

`web/src/pages/settings/SettingsPage.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useSettingsStore } from './store'
import type { Settings } from './api'
import SettingsPage from './SettingsPage'

const base: Settings = {
  openai_api_key_masked: 'sk-…34bc',
  openai_api_key_from_env: false,
  openai_model: 'gpt-image-2',
  image_size: '816x1104',
  draft_quality: 'low',
  final_quality: 'high',
  input_fidelity: 'high',
  claude_binary: 'claude',
  price_table: '{}',
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <SettingsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useSettingsStore.setState({ persisted: null, draft: null, editingKey: false })
  server.use(http.get('/api/settings', () => HttpResponse.json(base)))
})

test('renders loaded settings; no dirty badge', async () => {
  renderPage()
  expect(await screen.findByDisplayValue('gpt-image-2')).toBeInTheDocument()
  expect(screen.getByText('sk-…34bc')).toBeInTheDocument()
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('editing a field shows dirty badge; discard reverts', async () => {
  renderPage()
  const model = await screen.findByLabelText('Model')
  await userEvent.clear(model)
  await userEvent.type(model, 'gpt-image-3')
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Discard' }))
  expect(screen.getByDisplayValue('gpt-image-2')).toBeInTheDocument()
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('save PUTs update and clears dirty state', async () => {
  let putBody: Record<string, unknown> | null = null
  server.use(
    http.put('/api/settings', async ({ request }) => {
      putBody = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ ...base, openai_model: 'gpt-image-3' })
    }),
  )
  renderPage()
  const model = await screen.findByLabelText('Model')
  await userEvent.clear(model)
  await userEvent.type(model, 'gpt-image-3')
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  await screen.findByDisplayValue('gpt-image-3')
  expect(putBody).toMatchObject({ openai_model: 'gpt-image-3', openai_api_key: '' })
  expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('replace key flow sends new key', async () => {
  server.use(
    http.put('/api/settings', () =>
      HttpResponse.json({ ...base, openai_api_key_masked: 'sk-…-new' }),
    ),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Replace' }))
  await userEvent.type(screen.getByPlaceholderText('sk-…'), 'sk-brand-new')
  expect(screen.getByText('Unsaved changes')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  expect(await screen.findByText('sk-…-new')).toBeInTheDocument()
})

test('stub test buttons show canned result', async () => {
  server.use(
    http.post('/api/settings/test-openai', () =>
      HttpResponse.json({ ok: true, message: 'stub: real connection test arrives with the Card Types milestone' }),
    ),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: 'Test OpenAI connection' }))
  expect(await screen.findByText(/stub: real connection test/)).toBeInTheDocument()
})

test('failed save shows error banner', async () => {
  server.use(
    http.put('/api/settings', () =>
      HttpResponse.json({ error: 'draft_quality must be low or medium' }, { status: 400 }),
    ),
  )
  renderPage()
  const model = await screen.findByLabelText('Model')
  await userEvent.type(model, 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Save Settings' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('draft_quality must be low or medium')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/pages/settings/SettingsPage.test.tsx`
Expected: FAIL — `./SettingsPage` not found

- [ ] **Step 3: Implement shared primitives**

`web/src/components/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes } from 'react'

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary'
}

export function Button({ variant = 'secondary', className = '', ...rest }: Props) {
  const base =
    'inline-flex items-center justify-center gap-1.5 cursor-pointer font-medium text-sm px-3.5 py-2 rounded-md border bg-transparent disabled:opacity-45 disabled:cursor-not-allowed'
  const look =
    variant === 'primary'
      ? 'text-accent border-accent hover:bg-accent/10'
      : 'text-ink border-divider hover:bg-ink/5'
  return <button className={`${base} ${look} ${className}`} {...rest} />
}
```

`web/src/components/Field.tsx`:

```tsx
import type { ReactNode } from 'react'
import { useId } from 'react'

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="block text-xs mb-1 text-ink/70">
        {label}
      </label>
      {children(id)}
    </div>
  )
}

export const inputClass =
  'w-full min-h-9 px-2.5 py-1.5 text-sm text-ink bg-bg border border-divider rounded-md ' +
  'focus:outline-none focus:border-accent font-mono'

export const selectClass =
  'w-full min-h-9 px-2.5 py-1.5 text-sm text-ink bg-bg border border-divider rounded-md focus:outline-none focus:border-accent'
```

- [ ] **Step 4: Implement settings components**

`web/src/pages/settings/ApiKeyField.tsx`:

```tsx
import { Button } from '../../components/Button'
import { inputClass } from '../../components/Field'
import { useSettingsStore } from './store'
import type { Settings } from './api'

export function ApiKeyField({ settings }: { settings: Settings }) {
  const editingKey = useSettingsStore((s) => s.editingKey)
  const keyInput = useSettingsStore((s) => s.draft?.openai_api_key_input ?? '')
  const startEditKey = useSettingsStore((s) => s.startEditKey)
  const setField = useSettingsStore((s) => s.setField)

  return (
    <div>
      <span className="block text-xs mb-1 text-ink/70">API key</span>
      {editingKey ? (
        <input
          type="text"
          value={keyInput}
          placeholder="sk-…"
          onChange={(e) => setField('openai_api_key_input', e.target.value)}
          className={`${inputClass} border-accent`}
        />
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex-1 min-h-9 flex items-center px-2.5 font-mono text-[13px] text-ink/70 bg-bg border border-divider rounded-md">
            {settings.openai_api_key_masked || 'Not set'}
          </div>
          <Button variant="primary" type="button" onClick={startEditKey}>
            Replace
          </Button>
        </div>
      )}
      <p className="text-[11px] text-ink/45 mt-1">
        Write-only — never returned in full once saved.
        {settings.openai_api_key_from_env && ' Currently overridden by the OPENAI_API_KEY env var.'}
      </p>
    </div>
  )
}
```

`web/src/pages/settings/TestButton.tsx`:

```tsx
import { useState } from 'react'
import { Button } from '../../components/Button'
import type { TestResult } from './api'

export function TestButton({ label, run }: { label: string; run: () => Promise<TestResult> }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  async function onClick() {
    setBusy(true)
    setResult(null)
    try {
      setResult(await run())
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Request failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" disabled={busy} onClick={onClick}>
        {busy ? 'Testing…' : label}
      </Button>
      {result && (
        <span className={`text-[13px] ${result.ok ? 'text-success' : 'text-danger'}`}>
          {result.message}
        </span>
      )}
    </div>
  )
}
```

`web/src/pages/settings/OpenAISection.tsx`:

```tsx
import { Field, inputClass, selectClass } from '../../components/Field'
import { ApiKeyField } from './ApiKeyField'
import { TestButton } from './TestButton'
import { postTestOpenAI, type Settings } from './api'
import { useSettingsStore, type SettingsDraft } from './store'

export function OpenAISection({ settings }: { settings: Settings }) {
  const draft = useSettingsStore((s) => s.draft)
  const setField = useSettingsStore((s) => s.setField)
  if (!draft) return null

  const text = (key: 'openai_model' | 'image_size', label: string) => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          type="text"
          value={draft[key]}
          onChange={(e) => setField(key, e.target.value)}
          className={inputClass}
        />
      )}
    </Field>
  )

  const select = <K extends 'draft_quality' | 'final_quality' | 'input_fidelity'>(
    key: K,
    label: string,
    options: SettingsDraft[K][],
  ) => (
    <Field label={label}>
      {(id) => (
        <select
          id={id}
          value={draft[key]}
          onChange={(e) => setField(key, e.target.value as SettingsDraft[K])}
          className={selectClass}
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      )}
    </Field>
  )

  return (
    <section className="flex flex-col gap-3.5 p-4 rounded-md bg-surface shadow-[0_0_0_1px_#3f424d]">
      <h2 className="text-[13px] font-medium">OpenAI</h2>
      <ApiKeyField settings={settings} />
      {text('openai_model', 'Model')}
      <div className="grid grid-cols-2 gap-3.5">
        {text('image_size', 'Image size')}
        {select('input_fidelity', 'Input fidelity', ['low', 'high'])}
      </div>
      <div className="grid grid-cols-2 gap-3.5">
        {select('draft_quality', 'Draft quality', ['low', 'medium'])}
        {select('final_quality', 'Final quality', ['medium', 'high'])}
      </div>
      <TestButton label="Test OpenAI connection" run={postTestOpenAI} />
    </section>
  )
}
```

`web/src/pages/settings/ClaudeSection.tsx`:

```tsx
import { Field, inputClass } from '../../components/Field'
import { TestButton } from './TestButton'
import { postTestClaude } from './api'
import { useSettingsStore } from './store'

export function ClaudeSection() {
  const draft = useSettingsStore((s) => s.draft)
  const setField = useSettingsStore((s) => s.setField)
  if (!draft) return null

  return (
    <section className="flex flex-col gap-3.5 p-4 rounded-md bg-surface shadow-[0_0_0_1px_#3f424d]">
      <h2 className="text-[13px] font-medium">Claude CLI</h2>
      <Field label="Binary path">
        {(id) => (
          <input
            id={id}
            type="text"
            value={draft.claude_binary}
            onChange={(e) => setField('claude_binary', e.target.value)}
            className={inputClass}
          />
        )}
      </Field>
      <TestButton label="Test Claude CLI" run={postTestClaude} />
    </section>
  )
}
```

`web/src/pages/settings/SaveBar.tsx` (`price_table` is passed through from the loaded settings — sending a literal would clobber the seeded default; the pricing UI arrives in M6):

```tsx
import { useActionState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { putSettings, type Settings } from './api'
import { useSettingsStore, selectIsDirty } from './store'

export function SaveBar({ settings }: { settings: Settings }) {
  const dirty = useSettingsStore(selectIsDirty)
  const discard = useSettingsStore((s) => s.discard)
  const queryClient = useQueryClient()

  const [result, saveAction, pending] = useActionState(
    async (): Promise<{ error: string | null }> => {
      const { draft, markSaved } = useSettingsStore.getState()
      if (!draft) return { error: null }
      try {
        const saved = await putSettings({
          openai_api_key: draft.openai_api_key_input,
          openai_model: draft.openai_model,
          image_size: draft.image_size,
          draft_quality: draft.draft_quality,
          final_quality: draft.final_quality,
          input_fidelity: draft.input_fidelity,
          claude_binary: draft.claude_binary,
          price_table: settings.price_table, // pass through until pricing UI (M6)
        })
        markSaved(saved)
        queryClient.setQueryData(['settings'], saved)
        return { error: null }
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Save failed' }
      }
    },
    { error: null },
  )

  return (
    <form action={saveAction} className="flex items-center justify-end gap-2">
      {result.error && (
        <p role="alert" className="text-danger text-sm mr-auto">
          {result.error}
        </p>
      )}
      {dirty && (
        <Button type="button" onClick={discard}>
          Discard
        </Button>
      )}
      <Button variant="primary" type="submit" disabled={!dirty || pending}>
        {pending ? 'Saving…' : 'Save Settings'}
      </Button>
    </form>
  )
}
```

`web/src/pages/settings/SettingsPage.tsx`:

```tsx
import { useEffect } from 'react'
import { useSettings } from './api'
import { useSettingsStore, selectIsDirty } from './store'
import { OpenAISection } from './OpenAISection'
import { ClaudeSection } from './ClaudeSection'
import { SaveBar } from './SaveBar'

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings()
  const init = useSettingsStore((s) => s.init)
  const dirty = useSettingsStore(selectIsDirty)

  useEffect(() => {
    if (data) init(data)
  }, [data, init])

  if (isLoading) return <p className="text-ink/60">Loading…</p>
  if (error || !data)
    return (
      <p role="alert" className="text-danger">
        Failed to load settings: {error instanceof Error ? error.message : 'unknown error'}
      </p>
    )

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 mb-1.5">
        <div>
          <h1 className="text-[32px] font-medium tracking-tight leading-tight mb-1.5">Settings</h1>
          <p className="text-sm text-ink/60 m-0">
            Stored locally · never leaves this machine except the calls below
          </p>
        </div>
        {dirty && (
          <span className="text-[11px] text-warn bg-warn/10 border border-warn/30 px-2.5 py-0.5 rounded-full whitespace-nowrap">
            Unsaved changes
          </span>
        )}
      </div>
      <OpenAISection settings={data} />
      <ClaudeSection />
      <SaveBar settings={data} />
    </div>
  )
}
```

Modify `web/src/App.tsx` — add import and replace the settings route:

```tsx
import SettingsPage from './pages/settings/SettingsPage'
// ...
      { path: '/settings', element: <SettingsPage /> },
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS (all suites)

- [ ] **Step 6: Commit**

```bash
git add web/src/
git commit -m "feat: settings page with draft store, key replace flow, and stub test buttons"
```

---

### Task 10: End-to-end verification

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: everything.
- Produces: verified working skeleton; quickstart docs.

- [ ] **Step 1: Full test suites**

Run: `make test`
Expected: Go PASS all packages; Vitest PASS all suites.

- [ ] **Step 2: Production build + smoke test**

```bash
make build
CARDFORGE_DB=/tmp/cardforge-smoke.db ./bin/cardforge &
sleep 1
curl -s http://localhost:8080/api/settings   # → JSON with "openai_model":"gpt-image-2"
curl -s http://localhost:8080/settings | head -c 100   # → built index.html
curl -s -X POST http://localhost:8080/api/settings/test-claude   # → {"ok":true,...}
kill %1
```

Expected: settings JSON with defaults; HTML for the SPA route; stub JSON.

- [ ] **Step 3: Dev-mode smoke test**

Terminal A: `make dev-server`. Terminal B: `make dev-web`.
Open `http://localhost:5173/settings` — Nocturne dark UI, sidebar with 5 items, Settings form loaded from the API. Edit model → "Unsaved changes" badge; reload page → edit survives (localStorage); Discard → reverts; Save → persists (verify by restarting dev-server and reloading).

- [ ] **Step 4: Write README**

`README.md`:

```markdown
# Card Forge

Local-only web app for managing factions and card-type templates and
generating card artwork for a homemade Forbidden Stars expansion.
See `docs/prd/PRD-1.md` and `docs/superpowers/specs/`.

## Development

- `make dev-server` — Go API on :8080 (SQLite in ./data/)
- `make dev-web` — Vite dev server on :5173 (proxies /api)
- `make test` — Go + Vitest suites

## Production build

- `make build` — builds the SPA, embeds it, produces `bin/cardforge`
- `./bin/cardforge` — serves everything on :8080

`OPENAI_API_KEY` env var overrides the stored key (never written to DB).
`CARDFORGE_DB` overrides the SQLite path.
```

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add README with quickstart"
```

---

## Self-review notes

- **Spec coverage (M1 scope):** scaffolding ✔ (T1, T6), migration 0001 + seed ✔ (T2), settings CRUD ✔ (T3–T4), masked/write-only key + env override ✔ (T4), stub test buttons ✔ (T4, T9), embed + SPA serving + Makefile ✔ (T5), Tailwind Nocturne theme ✔ (T6), shell + sidebar + routes ✔ (T7), zustand + persist draft store ✔ (T8), Settings page end-to-end with explicit save/discard/dirty badge ✔ (T9), login mockup removed ✔ (T1), verification ✔ (T10).
- **Deliberately deferred:** diff panel and `useDraftForm` generalization → M2 (per spec §9); real test-connection calls → M2/M3; price_table editing UI → M6 (PUT passes the loaded value through unchanged).
- **Type consistency check:** `NewRouter(db *sql.DB, staticFS fs.FS)` used in T1/T4/T5 tests consistently; `Settings`/`SettingsUpdate` field names match Go JSON tags (snake_case); `selectIsDirty` signature consistent between T8 and T9; `TestResult` shared. Masking format `sk-…` + last 4 identical in Go (`maskKey`) and tests.
