# Card Forge — Milestone 2: Factions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Factions CRUD with append-only revision history and rollback, Claude CLI description generation behind an in-memory async job registry, the shared draft-form/diff framework, and a real "Test Claude CLI" button.

**Architecture:** Backend adds migration 0002 (factions + faction_revisions), a `FactionsStore`, a `claude` CLI runner, an in-memory `jobs` registry (POST returns `pending` + job id; UI polls every 2 s), and factions/jobs API handlers. Frontend adds a word-diff utility, shared Dialog/ConfirmDialog/Tag/DiffPanel components, a generic `createDraftFormStore` factory (zustand + localStorage persist), and the Factions page (table, create/edit dialog with Generate-with-Claude, history dialog with restore).

**Tech Stack:** Existing M1 stack (Go 1.24+/chi/modernc-sqlite/golang-migrate; React 19/Vite/Tailwind v4/react-router/TanStack Query/zustand/Vitest+RTL+MSW) plus the `diff` npm package.

**Spec:** `docs/superpowers/specs/2026-07-15-card-forge-design.md` (§4 packages, §6 Factions). PRD: `docs/prd/PRD-1.md` (§5 schema, §7.1 behavior, §8.1 prompt, §9 API).

## Global Constraints

- All API JSON snake_case. Server on `:8080`. SQLite via `store.Open` (adds `foreign_keys(1)` pragma in this milestone).
- DLC enum exactly: `Galaxy in Flames`, `Symphony of War`, `Darkest Dawn`. Revision source enum exactly: `manual`, `claude`, `rollback` (`rollback` is server-set on restore only; clients may send only `manual`/`claude`).
- Revision rules (PRD §7.1): every successful create/update writes a revision; NO revision (and no row change) on a no-op save; restore applies the selected revision and writes a NEW revision with `source='rollback'`; history is never rewritten or deleted.
- Async pattern (PRD §4.1): `POST /api/factions/generate-description` returns `{job_id, status:"pending"}` immediately; work runs in a goroutine with a 60 s timeout; UI polls `GET /api/jobs/{id}` every 2 s until `done`/`failed`; cancel kills the subprocess. Jobs are in-memory (spec §4: lost on restart, acceptable).
- Claude prompt template verbatim from PRD §8.1. Claude binary path from settings key `claude_binary`. CLI errors surface stderr excerpt; missing binary → actionable message "claude CLI not found — set path in Settings".
- Explicit save only: Claude-generated text lands in form state, never persisted before Save; revision `source='claude'` only when the saved description equals the last generation unmodified, else `manual` (derived client-side).
- Pre-save diff (PRD §7): side-by-side word-level diff (green additions / red removals) for changed text fields; `before → after` rows for non-text (name, dlc); Discard reverts; closing dirty form asks confirmation.
- Frontend component files ≤~150 lines (hard cap 200); every input labeled via the `Field` pattern (M1 a11y lesson); Nocturne theme tokens for styling.
- `parse<T>` in `web/src/lib/api.ts` gains a 204 guard (deferred M1 finding) — DELETE endpoints return 204.
- Faction delete: plain delete in M2 (batch_items doesn't exist until M5; the referenced-block guard is added in M5).
- Commit after every task.

---

### Task 1: Migration 0002 + FactionsStore CRUD with revision writes

**Files:**
- Create: `server/internal/store/migrations/0002_factions.up.sql`, `server/internal/store/migrations/0002_factions.down.sql`, `server/internal/store/factions.go`
- Modify: `server/internal/store/db.go` (add `foreign_keys(1)` pragma to the DSN)
- Test: `server/internal/store/factions_test.go`

**Interfaces:**
- Consumes: `store.Open` (M1).
- Produces (Tasks 2, 6 consume): types `store.Faction{ID int64; Name, Description, DLC string; CreatedAt, UpdatedAt string}` (json tags `id,name,description,dlc,created_at,updated_at`) and `store.FactionRevision{ID, FactionID int64; Name, Description, DLC, Source, CreatedAt string}` (json `id,faction_id,name,description,dlc,source,created_at`); `store.NewFactionsStore(db *sql.DB) *FactionsStore`; methods `List() ([]Faction, error)` (updated_at DESC), `Get(id int64) (Faction, error)`, `Create(name, description, dlc, source string) (Faction, error)`, `Update(id int64, name, description, dlc, source string) (Faction, bool, error)` (bool=false on no-op save, no revision written), `Delete(id int64) error`; sentinel errors `store.ErrNotFound`, `store.ErrDuplicateName`.

- [ ] **Step 1: Write migration files**

`server/internal/store/migrations/0002_factions.up.sql`:

```sql
CREATE TABLE factions (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  dlc          TEXT NOT NULL CHECK (dlc IN ('Galaxy in Flames', 'Symphony of War', 'Darkest Dawn')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE faction_revisions (
  id           INTEGER PRIMARY KEY,
  faction_id   INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  dlc          TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('manual','claude','rollback')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

`server/internal/store/migrations/0002_factions.down.sql`:

```sql
DROP TABLE faction_revisions;
DROP TABLE factions;
```

In `server/internal/store/db.go`, change the DSN line to enable FK enforcement (needed for ON DELETE CASCADE):

```go
	db, err := sql.Open("sqlite", path+"?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)")
```

- [ ] **Step 2: Write failing tests**

`server/internal/store/factions_test.go`:

```go
package store

import (
	"errors"
	"path/filepath"
	"testing"
)

func openFactions(t *testing.T) *FactionsStore {
	t.Helper()
	db, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	return NewFactionsStore(db)
}

func TestCreateWritesFactionAndRevision(t *testing.T) {
	s := openFactions(t)
	f, err := s.Create("Tau Empire", "blue-grey plating", "Galaxy in Flames", "manual")
	if err != nil {
		t.Fatal(err)
	}
	if f.ID == 0 || f.Name != "Tau Empire" || f.DLC != "Galaxy in Flames" {
		t.Fatalf("bad faction: %+v", f)
	}
	revs, err := s.Revisions(f.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(revs) != 1 || revs[0].Source != "manual" || revs[0].Description != "blue-grey plating" {
		t.Fatalf("bad revisions: %+v", revs)
	}
}

func TestCreateDuplicateName(t *testing.T) {
	s := openFactions(t)
	if _, err := s.Create("Eldar", "", "Darkest Dawn", "manual"); err != nil {
		t.Fatal(err)
	}
	_, err := s.Create("Eldar", "", "Darkest Dawn", "manual")
	if !errors.Is(err, ErrDuplicateName) {
		t.Fatalf("err = %v, want ErrDuplicateName", err)
	}
}

func TestUpdateWritesRevisionOnlyWhenChanged(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create("Necrons", "gunmetal", "Darkest Dawn", "manual")

	_, changed, err := s.Update(f.ID, "Necrons", "gunmetal and jade", "Darkest Dawn", "claude")
	if err != nil || !changed {
		t.Fatalf("changed=%v err=%v", changed, err)
	}
	// no-op save: identical state → no new revision, changed=false
	_, changed, err = s.Update(f.ID, "Necrons", "gunmetal and jade", "Darkest Dawn", "manual")
	if err != nil || changed {
		t.Fatalf("no-op save: changed=%v err=%v", changed, err)
	}
	revs, _ := s.Revisions(f.ID)
	if len(revs) != 2 {
		t.Fatalf("revisions = %d, want 2", len(revs))
	}
	if revs[0].Source != "claude" { // newest first
		t.Fatalf("newest revision source = %q", revs[0].Source)
	}
}

func TestListOrdersByUpdatedDesc(t *testing.T) {
	s := openFactions(t)
	s.Create("A", "", "Galaxy in Flames", "manual")
	s.Create("B", "", "Symphony of War", "manual")
	all, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(all) != 2 {
		t.Fatalf("len = %d", len(all))
	}
}

func TestDeleteCascadesRevisions(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create("Orks", "", "Symphony of War", "manual")
	if err := s.Delete(f.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(f.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get after delete: %v", err)
	}
	revs, _ := s.Revisions(f.ID)
	if len(revs) != 0 {
		t.Fatalf("revisions not cascaded: %d", len(revs))
	}
	if err := s.Delete(f.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("double delete: %v", err)
	}
}
```

(`Revisions` is implemented in Task 2 — for this task add the minimal query so the test file compiles; Task 2 adds Restore.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd server && go test ./internal/store/`
Expected: FAIL — `undefined: NewFactionsStore` etc.

- [ ] **Step 4: Implement**

`server/internal/store/factions.go`:

```go
package store

import (
	"database/sql"
	"errors"
	"strings"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrDuplicateName = errors.New("name already exists")
)

type Faction struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	DLC         string `json:"dlc"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
}

type FactionRevision struct {
	ID          int64  `json:"id"`
	FactionID   int64  `json:"faction_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	DLC         string `json:"dlc"`
	Source      string `json:"source"`
	CreatedAt   string `json:"created_at"`
}

type FactionsStore struct {
	db *sql.DB
}

func NewFactionsStore(db *sql.DB) *FactionsStore {
	return &FactionsStore{db: db}
}

const factionCols = "id, name, description, dlc, created_at, updated_at"

func scanFaction(row interface{ Scan(...any) error }) (Faction, error) {
	var f Faction
	err := row.Scan(&f.ID, &f.Name, &f.Description, &f.DLC, &f.CreatedAt, &f.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return f, ErrNotFound
	}
	return f, err
}

func (s *FactionsStore) List() ([]Faction, error) {
	rows, err := s.db.Query("SELECT " + factionCols + " FROM factions ORDER BY updated_at DESC, id DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]Faction, 0)
	for rows.Next() {
		f, err := scanFaction(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

func (s *FactionsStore) Get(id int64) (Faction, error) {
	return scanFaction(s.db.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", id))
}

func insertRevision(tx *sql.Tx, factionID int64, name, description, dlc, source string) error {
	_, err := tx.Exec(
		`INSERT INTO faction_revisions (faction_id, name, description, dlc, source) VALUES (?, ?, ?, ?, ?)`,
		factionID, name, description, dlc, source)
	return err
}

func (s *FactionsStore) Create(name, description, dlc, source string) (Faction, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Faction{}, err
	}
	defer tx.Rollback()

	res, err := tx.Exec(`INSERT INTO factions (name, description, dlc) VALUES (?, ?, ?)`, name, description, dlc)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return Faction{}, ErrDuplicateName
		}
		return Faction{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return Faction{}, err
	}
	if err := insertRevision(tx, id, name, description, dlc, source); err != nil {
		return Faction{}, err
	}
	f, err := scanFaction(tx.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", id))
	if err != nil {
		return Faction{}, err
	}
	return f, tx.Commit()
}

// Update saves new state and writes a revision. A save identical to the
// current state is a no-op: no row change, no revision, changed=false.
func (s *FactionsStore) Update(id int64, name, description, dlc, source string) (Faction, bool, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Faction{}, false, err
	}
	defer tx.Rollback()

	cur, err := scanFaction(tx.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", id))
	if err != nil {
		return Faction{}, false, err
	}
	if cur.Name == name && cur.Description == description && cur.DLC == dlc {
		return cur, false, tx.Commit()
	}

	_, err = tx.Exec(
		`UPDATE factions SET name = ?, description = ?, dlc = ?, updated_at = datetime('now') WHERE id = ?`,
		name, description, dlc, id)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return Faction{}, false, ErrDuplicateName
		}
		return Faction{}, false, err
	}
	if err := insertRevision(tx, id, name, description, dlc, source); err != nil {
		return Faction{}, false, err
	}
	f, err := scanFaction(tx.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", id))
	if err != nil {
		return Faction{}, false, err
	}
	return f, true, tx.Commit()
}

func (s *FactionsStore) Delete(id int64) error {
	res, err := s.db.Exec(`DELETE FROM factions WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *FactionsStore) Revisions(factionID int64) ([]FactionRevision, error) {
	rows, err := s.db.Query(
		`SELECT id, faction_id, name, description, dlc, source, created_at
		 FROM faction_revisions WHERE faction_id = ? ORDER BY id DESC`, factionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]FactionRevision, 0)
	for rows.Next() {
		var r FactionRevision
		if err := rows.Scan(&r.ID, &r.FactionID, &r.Name, &r.Description, &r.DLC, &r.Source, &r.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS (all packages — settings tests must still pass with the new pragma)

- [ ] **Step 6: Commit**

```bash
git add server/
git commit -m "feat: factions store with revision writes and FK cascade"
```

---

### Task 2: Restore (rollback) in FactionsStore

**Files:**
- Modify: `server/internal/store/factions.go`
- Test: `server/internal/store/factions_test.go` (append)

**Interfaces:**
- Consumes: Task 1 store.
- Produces: `(*FactionsStore).Restore(factionID, revisionID int64) (Faction, error)` — applies the revision's state to the faction and appends a new revision with `source='rollback'`; `ErrNotFound` when the revision doesn't exist or belongs to another faction. Task 6's restore endpoint consumes this.

- [ ] **Step 1: Append failing tests**

Append to `server/internal/store/factions_test.go`:

```go
func TestRestoreAppliesRevisionAndAppendsRollback(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create("Eldar", "v1", "Darkest Dawn", "manual")
	s.Update(f.ID, "Eldar", "v2", "Darkest Dawn", "manual")
	revs, _ := s.Revisions(f.ID) // [v2, v1]
	oldest := revs[len(revs)-1]

	restored, err := s.Restore(f.ID, oldest.ID)
	if err != nil {
		t.Fatal(err)
	}
	if restored.Description != "v1" {
		t.Fatalf("description = %q, want v1", restored.Description)
	}
	revs, _ = s.Revisions(f.ID)
	if len(revs) != 3 || revs[0].Source != "rollback" || revs[0].Description != "v1" {
		t.Fatalf("bad history after restore: %+v", revs)
	}
}

func TestRestoreOfRollbackWorks(t *testing.T) {
	s := openFactions(t)
	f, _ := s.Create("Orks", "v1", "Symphony of War", "manual")
	s.Update(f.ID, "Orks", "v2", "Symphony of War", "manual")
	revs, _ := s.Revisions(f.ID)
	s.Restore(f.ID, revs[len(revs)-1].ID) // back to v1 (rollback rev)
	revs, _ = s.Revisions(f.ID)           // [rollback(v1), v2, v1]
	if _, err := s.Restore(f.ID, revs[1].ID); err != nil {
		t.Fatal(err) // rollback of a rollback
	}
	cur, _ := s.Get(f.ID)
	if cur.Description != "v2" {
		t.Fatalf("description = %q, want v2", cur.Description)
	}
	revs, _ = s.Revisions(f.ID)
	if len(revs) != 4 {
		t.Fatalf("history length = %d, want 4 (never rewritten)", len(revs))
	}
}

func TestRestoreWrongFaction(t *testing.T) {
	s := openFactions(t)
	a, _ := s.Create("A2", "", "Galaxy in Flames", "manual")
	b, _ := s.Create("B2", "", "Galaxy in Flames", "manual")
	bRevs, _ := s.Revisions(b.ID)
	if _, err := s.Restore(a.ID, bRevs[0].ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("cross-faction restore: %v", err)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/store/`
Expected: FAIL — `undefined: s.Restore`

- [ ] **Step 3: Implement Restore**

Append to `server/internal/store/factions.go`:

```go
// Restore applies a past revision's state and appends a new revision with
// source='rollback'. History is append-only — nothing is rewritten.
func (s *FactionsStore) Restore(factionID, revisionID int64) (Faction, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return Faction{}, err
	}
	defer tx.Rollback()

	var name, description, dlc string
	err = tx.QueryRow(
		`SELECT name, description, dlc FROM faction_revisions WHERE id = ? AND faction_id = ?`,
		revisionID, factionID).Scan(&name, &description, &dlc)
	if errors.Is(err, sql.ErrNoRows) {
		return Faction{}, ErrNotFound
	}
	if err != nil {
		return Faction{}, err
	}

	res, err := tx.Exec(
		`UPDATE factions SET name = ?, description = ?, dlc = ?, updated_at = datetime('now') WHERE id = ?`,
		name, description, dlc, factionID)
	if err != nil {
		return Faction{}, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return Faction{}, ErrNotFound
	}
	if err := insertRevision(tx, factionID, name, description, dlc, "rollback"); err != nil {
		return Faction{}, err
	}
	f, err := scanFaction(tx.QueryRow("SELECT "+factionCols+" FROM factions WHERE id = ?", factionID))
	if err != nil {
		return Faction{}, err
	}
	return f, tx.Commit()
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./internal/store/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/internal/store/
git commit -m "feat: revision restore with append-only rollback"
```

---

### Task 3: Claude CLI runner

**Files:**
- Create: `server/internal/claude/runner.go`
- Test: `server/internal/claude/runner_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `claude.Runner{Binary string}` with `Run(ctx context.Context, prompt string) (string, error)` — executes `<binary> -p <prompt>`, returns trimmed stdout; missing binary → error containing "claude CLI not found"; non-zero exit → error containing a stderr excerpt (≤300 chars); context timeout/cancel → error containing "timed out or was cancelled". Tasks 6 (test-claude) and 5/6 (generate job) consume this.

- [ ] **Step 1: Write failing tests**

`server/internal/claude/runner_test.go`:

```go
package claude

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fakeBinary(t *testing.T, script string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "fake-claude")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestRunReturnsTrimmedStdout(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, `echo "  generated text  "`)}
	out, err := r.Run(context.Background(), "prompt")
	if err != nil {
		t.Fatal(err)
	}
	if out != "generated text" {
		t.Fatalf("out = %q", out)
	}
}

func TestRunPassesPromptAsDashPArg(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, `[ "$1" = "-p" ] && echo "$2" || exit 1`)}
	out, err := r.Run(context.Background(), "hello world")
	if err != nil {
		t.Fatal(err)
	}
	if out != "hello world" {
		t.Fatalf("out = %q", out)
	}
}

func TestRunSurfacesStderrOnFailure(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, `echo "boom detail" >&2; exit 1`)}
	_, err := r.Run(context.Background(), "prompt")
	if err == nil || !strings.Contains(err.Error(), "boom detail") {
		t.Fatalf("err = %v, want stderr excerpt", err)
	}
}

func TestRunMissingBinary(t *testing.T) {
	r := &Runner{Binary: "/nonexistent/claude-binary"}
	_, err := r.Run(context.Background(), "prompt")
	if err == nil || !strings.Contains(err.Error(), "claude CLI not found") {
		t.Fatalf("err = %v", err)
	}
}

func TestRunTimeout(t *testing.T) {
	r := &Runner{Binary: fakeBinary(t, `sleep 5`)}
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	_, err := r.Run(ctx, "prompt")
	if err == nil || !strings.Contains(err.Error(), "timed out or was cancelled") {
		t.Fatalf("err = %v", err)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/claude/`
Expected: FAIL — package does not exist / `undefined: Runner`

- [ ] **Step 3: Implement**

`server/internal/claude/runner.go`:

```go
// Package claude shells out to the locally installed claude CLI.
package claude

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
)

type Runner struct {
	Binary string // path or name of the claude binary; empty means "claude"
}

func (r *Runner) Run(ctx context.Context, prompt string) (string, error) {
	bin := r.Binary
	if bin == "" {
		bin = "claude"
	}
	if _, err := exec.LookPath(bin); err != nil {
		return "", fmt.Errorf("claude CLI not found (%q) — set path in Settings", bin)
	}

	cmd := exec.CommandContext(ctx, bin, "-p", prompt)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		if ctxErr := ctx.Err(); errors.Is(ctxErr, context.DeadlineExceeded) || errors.Is(ctxErr, context.Canceled) {
			return "", fmt.Errorf("claude CLI timed out or was cancelled")
		}
		excerpt := strings.TrimSpace(stderr.String())
		if len(excerpt) > 300 {
			excerpt = excerpt[:300]
		}
		if excerpt == "" {
			excerpt = err.Error()
		}
		return "", fmt.Errorf("claude CLI failed: %s", excerpt)
	}
	return strings.TrimSpace(stdout.String()), nil
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./internal/claude/`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/internal/claude/
git commit -m "feat: claude CLI runner with timeout and stderr surfacing"
```

---

### Task 4: In-memory jobs registry

**Files:**
- Create: `server/internal/jobs/registry.go`
- Test: `server/internal/jobs/registry_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces (Task 6 consumes): `jobs.Job{ID string; Status Status; Result string; Error string; DurationMS int64}` with `Status` constants `jobs.Pending/Done/Failed` (strings `pending/done/failed`); `jobs.New(timeout time.Duration) *Registry`; `(*Registry).Start(fn func(ctx context.Context) (string, error)) string`; `(*Registry).Get(id string) (Job, bool)`; `(*Registry).Cancel(id string) bool`.

- [ ] **Step 1: Write failing tests**

`server/internal/jobs/registry_test.go`:

```go
package jobs

import (
	"context"
	"errors"
	"testing"
	"time"
)

func waitTerminal(t *testing.T, r *Registry, id string) Job {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		j, ok := r.Get(id)
		if !ok {
			t.Fatalf("job %s vanished", id)
		}
		if j.Status != Pending {
			return j
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("job never reached terminal status")
	return Job{}
}

func TestJobSucceeds(t *testing.T) {
	r := New(time.Second)
	id := r.Start(func(ctx context.Context) (string, error) { return "result text", nil })

	if j, ok := r.Get(id); !ok || (j.Status != Pending && j.Status != Done) {
		t.Fatalf("immediately after start: %+v ok=%v", j, ok)
	}
	j := waitTerminal(t, r, id)
	if j.Status != Done || j.Result != "result text" || j.Error != "" {
		t.Fatalf("job = %+v", j)
	}
	if j.DurationMS < 0 {
		t.Fatalf("duration = %d", j.DurationMS)
	}
}

func TestJobFails(t *testing.T) {
	r := New(time.Second)
	id := r.Start(func(ctx context.Context) (string, error) { return "", errors.New("cli exploded") })
	j := waitTerminal(t, r, id)
	if j.Status != Failed || j.Error != "cli exploded" {
		t.Fatalf("job = %+v", j)
	}
}

func TestJobTimeout(t *testing.T) {
	r := New(50 * time.Millisecond)
	id := r.Start(func(ctx context.Context) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	})
	j := waitTerminal(t, r, id)
	if j.Status != Failed {
		t.Fatalf("job = %+v", j)
	}
}

func TestCancel(t *testing.T) {
	r := New(time.Minute)
	id := r.Start(func(ctx context.Context) (string, error) {
		<-ctx.Done()
		return "", ctx.Err()
	})
	if !r.Cancel(id) {
		t.Fatal("cancel returned false")
	}
	j := waitTerminal(t, r, id)
	if j.Status != Failed {
		t.Fatalf("job = %+v", j)
	}
	if r.Cancel("job-999") {
		t.Fatal("cancel of unknown id returned true")
	}
}

func TestGetUnknown(t *testing.T) {
	r := New(time.Second)
	if _, ok := r.Get("nope"); ok {
		t.Fatal("unknown id returned ok")
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/jobs/`
Expected: FAIL — package does not exist

- [ ] **Step 3: Implement**

`server/internal/jobs/registry.go`:

```go
// Package jobs is an in-memory registry for short-lived async jobs
// (Claude description generation). Jobs are lost on restart by design —
// they live ~60s and the UI polls every 2s (spec §4).
package jobs

import (
	"context"
	"fmt"
	"sync"
	"time"
)

type Status string

const (
	Pending Status = "pending"
	Done    Status = "done"
	Failed  Status = "failed"
)

type Job struct {
	ID         string `json:"id"`
	Status     Status `json:"status"`
	Result     string `json:"result,omitempty"`
	Error      string `json:"error,omitempty"`
	DurationMS int64  `json:"duration_ms"`
}

type entry struct {
	job    Job
	cancel context.CancelFunc
}

type Registry struct {
	mu      sync.Mutex
	nextID  int
	jobs    map[string]*entry
	timeout time.Duration
}

func New(timeout time.Duration) *Registry {
	return &Registry{jobs: make(map[string]*entry), timeout: timeout}
}

func (r *Registry) Start(fn func(ctx context.Context) (string, error)) string {
	r.mu.Lock()
	r.nextID++
	id := fmt.Sprintf("job-%d", r.nextID)
	ctx, cancel := context.WithTimeout(context.Background(), r.timeout)
	r.jobs[id] = &entry{job: Job{ID: id, Status: Pending}, cancel: cancel}
	r.mu.Unlock()

	go func() {
		start := time.Now()
		result, err := fn(ctx)
		cancel()
		r.mu.Lock()
		defer r.mu.Unlock()
		e := r.jobs[id]
		e.job.DurationMS = time.Since(start).Milliseconds()
		if err != nil {
			e.job.Status = Failed
			e.job.Error = err.Error()
		} else {
			e.job.Status = Done
			e.job.Result = result
		}
	}()
	return id
}

func (r *Registry) Get(id string) (Job, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.jobs[id]
	if !ok {
		return Job{}, false
	}
	return e.job, true
}

// Cancel cancels the job's context (killing the CLI subprocess via
// exec.CommandContext). The job transitions to failed via its goroutine.
func (r *Registry) Cancel(id string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	e, ok := r.jobs[id]
	if !ok {
		return false
	}
	e.cancel()
	return true
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./internal/jobs/`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add server/internal/jobs/
git commit -m "feat: in-memory async job registry with timeout and cancel"
```

---

### Task 5: Prompt template package

**Files:**
- Create: `server/internal/prompt/prompt.go`
- Test: `server/internal/prompt/prompt_test.go`

**Interfaces:**
- Consumes: nothing.
- Produces: `prompt.FactionDescription(name, dlc string) string` — PRD §8.1 template with name/dlc interpolated. Task 6 consumes.

- [ ] **Step 1: Write failing test**

`server/internal/prompt/prompt_test.go`:

```go
package prompt

import (
	"strings"
	"testing"
)

func TestFactionDescriptionInterpolates(t *testing.T) {
	p := FactionDescription("Tau Empire", "Galaxy in Flames")
	for _, want := range []string{
		"Faction name: Tau Empire",
		"Expansion (DLC): Galaxy in Flames",
		"Forbidden Stars",
		"80-140 words",
		"no preamble, no markdown",
	} {
		if !strings.Contains(p, want) {
			t.Fatalf("prompt missing %q:\n%s", want, p)
		}
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/prompt/`
Expected: FAIL — package does not exist

- [ ] **Step 3: Implement**

`server/internal/prompt/prompt.go`:

```go
// Package prompt holds the prompt templates (PRD §8) in one place so the
// wording is easy to iterate on.
package prompt

import "fmt"

const factionDescriptionTemplate = `You are helping design a homemade expansion for the board game Forbidden Stars
(Warhammer 40K universe). Write an English description of the visual aesthetic
of the following faction for use in AI image-generation prompts.

Faction name: %s
Expansion (DLC): %s

Describe: color palette, materials and textures, iconography, mood, and
distinctive visual motifs. 80-140 words. Output only the description text,
no preamble, no markdown.`

func FactionDescription(name, dlc string) string {
	return fmt.Sprintf(factionDescriptionTemplate, name, dlc)
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./internal/prompt/`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/internal/prompt/
git commit -m "feat: faction description prompt template"
```

---

### Task 6: Factions + jobs API handlers, real Test Claude

**Files:**
- Create: `server/internal/api/factions.go`, `server/internal/api/jobs.go`
- Modify: `server/internal/api/router.go` (register routes), `server/internal/api/settings.go` (real TestClaude)
- Test: `server/internal/api/factions_test.go`, `server/internal/api/jobs_test.go`

**Interfaces:**
- Consumes: `store.NewFactionsStore` + methods (Tasks 1–2), `claude.Runner` (Task 3), `jobs.New/Start/Get/Cancel` (Task 4), `prompt.FactionDescription` (Task 5), `writeJSON`/`writeError` (M1).
- Produces (frontend Tasks 10–13 consume):
  - `GET /api/factions` → 200 `[]Faction`
  - `POST /api/factions` `{name, description, dlc, source}` → 201 Faction; 400 invalid name/dlc/source; 409 duplicate name
  - `PUT /api/factions/{id}` same body → 200 Faction; 404; 409
  - `DELETE /api/factions/{id}` → 204 empty; 404
  - `GET /api/factions/{id}/revisions` → 200 `[]FactionRevision` (newest first)
  - `POST /api/factions/{id}/revisions/{revID}/restore` → 200 Faction; 404
  - `POST /api/factions/generate-description` `{name, dlc}` → 202 `{"job_id":"job-N","status":"pending"}`; 400 invalid
  - `GET /api/jobs/{id}` → 200 `{id, status, result?, error?, duration_ms}`; 404
  - `POST /api/jobs/{id}/cancel` → 200 `{"ok":true}`; 404
  - `POST /api/settings/test-claude` now REAL: runs `claude_binary -p "Reply with OK"` with 10 s timeout → 200 `{ok: true|false, message}` (message = CLI output on success, error text on failure; always 200 — failure is data, not an HTTP error)
- Validation: `name` required (trimmed non-empty); `dlc` ∈ the 3 DLC values; `source` ∈ {manual, claude} (empty defaults to manual).

- [ ] **Step 1: Write failing tests**

`server/internal/api/factions_test.go`:

```go
package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

func createFaction(t *testing.T, h http.Handler, name string) map[string]any {
	t.Helper()
	body := fmt.Sprintf(`{"name":%q,"description":"desc","dlc":"Galaxy in Flames","source":"manual"}`, name)
	rec, out := doJSON(t, h, http.MethodPost, "/api/factions", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("create: %d %v", rec.Code, out)
	}
	return out
}

func TestFactionCRUD(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Tau Empire")
	id := int64(f["id"].(float64))

	rec, _ := doJSON(t, h, http.MethodGet, "/api/factions", "")
	var list []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &list)
	if rec.Code != 200 || len(list) != 1 {
		t.Fatalf("list: %d len=%d", rec.Code, len(list))
	}

	rec, out := doJSON(t, h, http.MethodPut, fmt.Sprintf("/api/factions/%d", id),
		`{"name":"Tau Empire","description":"new desc","dlc":"Galaxy in Flames","source":"claude"}`)
	if rec.Code != 200 || out["description"] != "new desc" {
		t.Fatalf("update: %d %v", rec.Code, out)
	}

	rec, _ = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/factions/%d", id), "")
	if rec.Code != http.StatusNoContent || rec.Body.Len() != 0 {
		t.Fatalf("delete: %d body=%q", rec.Code, rec.Body.String())
	}
	rec, _ = doJSON(t, h, http.MethodDelete, fmt.Sprintf("/api/factions/%d", id), "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("double delete: %d", rec.Code)
	}
}

func TestFactionValidation(t *testing.T) {
	h := newTestRouter(t)
	cases := []struct {
		body string
		want int
	}{
		{`{"name":"  ","description":"","dlc":"Galaxy in Flames","source":"manual"}`, 400},
		{`{"name":"X","description":"","dlc":"Not A DLC","source":"manual"}`, 400},
		{`{"name":"X","description":"","dlc":"Galaxy in Flames","source":"rollback"}`, 400},
		{`not json`, 400},
	}
	for _, c := range cases {
		rec, _ := doJSON(t, h, http.MethodPost, "/api/factions", c.body)
		if rec.Code != c.want {
			t.Fatalf("body %s: %d, want %d", c.body, rec.Code, c.want)
		}
	}
	createFaction(t, h, "Dup")
	rec, _ := doJSON(t, h, http.MethodPost, "/api/factions",
		`{"name":"Dup","description":"","dlc":"Galaxy in Flames","source":"manual"}`)
	if rec.Code != http.StatusConflict {
		t.Fatalf("duplicate: %d, want 409", rec.Code)
	}
}

func TestRevisionsAndRestoreEndpoints(t *testing.T) {
	h := newTestRouter(t)
	f := createFaction(t, h, "Eldar")
	id := int64(f["id"].(float64))
	doJSON(t, h, http.MethodPut, fmt.Sprintf("/api/factions/%d", id),
		`{"name":"Eldar","description":"v2","dlc":"Galaxy in Flames","source":"manual"}`)

	rec, _ := doJSON(t, h, http.MethodGet, fmt.Sprintf("/api/factions/%d/revisions", id), "")
	var revs []map[string]any
	json.Unmarshal(rec.Body.Bytes(), &revs)
	if rec.Code != 200 || len(revs) != 2 || revs[0]["description"] != "v2" {
		t.Fatalf("revisions: %d %v", rec.Code, revs)
	}

	oldest := int64(revs[1]["id"].(float64))
	rec, out := doJSON(t, h, http.MethodPost,
		fmt.Sprintf("/api/factions/%d/revisions/%d/restore", id, oldest), "")
	if rec.Code != 200 || out["description"] != "desc" {
		t.Fatalf("restore: %d %v", rec.Code, out)
	}

	rec, _ = doJSON(t, h, http.MethodPost,
		fmt.Sprintf("/api/factions/%d/revisions/99999/restore", id), "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("restore missing rev: %d", rec.Code)
	}
}
```

`server/internal/api/jobs_test.go`:

```go
package api

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// installFakeClaude writes a fake claude binary and points the settings
// key claude_binary at it via the API.
func installFakeClaude(t *testing.T, h http.Handler, script string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "fake-claude")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	body := fmt.Sprintf(`{"openai_api_key":"","openai_model":"m","image_size":"816x1104","draft_quality":"low","final_quality":"high","input_fidelity":"high","claude_binary":%q,"price_table":"{}"}`, path)
	rec, _ := doJSON(t, h, http.MethodPut, "/api/settings", body)
	if rec.Code != 200 {
		t.Fatalf("settings put: %d", rec.Code)
	}
}

func pollJob(t *testing.T, h http.Handler, jobID string) map[string]any {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		rec, out := doJSON(t, h, http.MethodGet, "/api/jobs/"+jobID, "")
		if rec.Code != 200 {
			t.Fatalf("get job: %d", rec.Code)
		}
		if out["status"] != "pending" {
			return out
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("job never finished")
	return nil
}

func TestGenerateDescriptionJob(t *testing.T) {
	h := newTestRouter(t)
	installFakeClaude(t, h, `echo "A vivid aesthetic."`)

	rec, out := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"Tau Empire","dlc":"Galaxy in Flames"}`)
	if rec.Code != http.StatusAccepted || out["status"] != "pending" {
		t.Fatalf("start: %d %v", rec.Code, out)
	}
	job := pollJob(t, h, out["job_id"].(string))
	if job["status"] != "done" || job["result"] != "A vivid aesthetic." {
		t.Fatalf("job: %v", job)
	}
}

func TestGenerateDescriptionFailure(t *testing.T) {
	h := newTestRouter(t)
	installFakeClaude(t, h, `echo "quota exceeded" >&2; exit 1`)

	_, out := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"X","dlc":"Darkest Dawn"}`)
	job := pollJob(t, h, out["job_id"].(string))
	if job["status"] != "failed" {
		t.Fatalf("job: %v", job)
	}
	if errStr, _ := job["error"].(string); errStr == "" {
		t.Fatalf("job error empty: %v", job)
	}
}

func TestGenerateDescriptionValidation(t *testing.T) {
	h := newTestRouter(t)
	rec, _ := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"","dlc":"Galaxy in Flames"}`)
	if rec.Code != 400 {
		t.Fatalf("empty name: %d", rec.Code)
	}
	rec, _ = doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"X","dlc":"Bad"}`)
	if rec.Code != 400 {
		t.Fatalf("bad dlc: %d", rec.Code)
	}
}

func TestJobNotFoundAndCancel(t *testing.T) {
	h := newTestRouter(t)
	rec, _ := doJSON(t, h, http.MethodGet, "/api/jobs/job-999", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("unknown job: %d", rec.Code)
	}
	rec, _ = doJSON(t, h, http.MethodPost, "/api/jobs/job-999/cancel", "")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("cancel unknown: %d", rec.Code)
	}

	installFakeClaude(t, h, `sleep 30`)
	_, out := doJSON(t, h, http.MethodPost, "/api/factions/generate-description",
		`{"name":"X","dlc":"Darkest Dawn"}`)
	jobID := out["job_id"].(string)
	rec, _ = doJSON(t, h, http.MethodPost, "/api/jobs/"+jobID+"/cancel", "")
	if rec.Code != 200 {
		t.Fatalf("cancel: %d", rec.Code)
	}
	job := pollJob(t, h, jobID)
	if job["status"] != "failed" {
		t.Fatalf("cancelled job: %v", job)
	}
}

func TestRealTestClaudeEndpoint(t *testing.T) {
	h := newTestRouter(t)
	installFakeClaude(t, h, `echo "OK"`)
	rec, out := doJSON(t, h, http.MethodPost, "/api/settings/test-claude", "")
	if rec.Code != 200 || out["ok"] != true || out["message"] != "OK" {
		t.Fatalf("test-claude ok case: %d %v", rec.Code, out)
	}

	installFakeClaude(t, h, `echo "broken install" >&2; exit 1`)
	rec, out = doJSON(t, h, http.MethodPost, "/api/settings/test-claude", "")
	if rec.Code != 200 || out["ok"] != false {
		t.Fatalf("test-claude failure case: %d %v", rec.Code, out)
	}
}
```

- [ ] **Step 2: Run to verify failure**

Run: `cd server && go test ./internal/api/`
Expected: FAIL — 404s on new routes; test-claude still returns stub message

- [ ] **Step 3: Implement handlers**

`server/internal/api/factions.go`:

```go
package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"cardforge/internal/store"
)

var dlcValues = []string{"Galaxy in Flames", "Symphony of War", "Darkest Dawn"}

type FactionsHandler struct {
	Store *store.FactionsStore
}

type factionSave struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	DLC         string `json:"dlc"`
	Source      string `json:"source"`
}

func decodeFactionSave(r *http.Request) (factionSave, string) {
	var s factionSave
	if err := json.NewDecoder(r.Body).Decode(&s); err != nil {
		return s, "invalid JSON: " + err.Error()
	}
	s.Name = strings.TrimSpace(s.Name)
	if s.Name == "" {
		return s, "name is required"
	}
	if !oneOf(s.DLC, dlcValues...) {
		return s, "dlc must be one of: " + strings.Join(dlcValues, ", ")
	}
	if s.Source == "" {
		s.Source = "manual"
	}
	if !oneOf(s.Source, "manual", "claude") {
		return s, "source must be manual or claude"
	}
	return s, ""
}

func idParam(r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, name), 10, 64)
	return id, err == nil
}

func (h *FactionsHandler) storeErr(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrNotFound):
		writeError(w, http.StatusNotFound, "faction not found")
	case errors.Is(err, store.ErrDuplicateName):
		writeError(w, http.StatusConflict, "a faction with this name already exists")
	default:
		writeError(w, http.StatusInternalServerError, err.Error())
	}
}

func (h *FactionsHandler) List(w http.ResponseWriter, _ *http.Request) {
	all, err := h.Store.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, all)
}

func (h *FactionsHandler) Create(w http.ResponseWriter, r *http.Request) {
	s, msg := decodeFactionSave(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	f, err := h.Store.Create(s.Name, s.Description, s.DLC, s.Source)
	if err != nil {
		h.storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, f)
}

func (h *FactionsHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	s, msg := decodeFactionSave(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	f, _, err := h.Store.Update(id, s.Name, s.Description, s.DLC, s.Source)
	if err != nil {
		h.storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, f)
}

func (h *FactionsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.Store.Delete(id); err != nil {
		h.storeErr(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *FactionsHandler) Revisions(w http.ResponseWriter, r *http.Request) {
	id, ok := idParam(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	revs, err := h.Store.Revisions(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, revs)
}

func (h *FactionsHandler) Restore(w http.ResponseWriter, r *http.Request) {
	id, ok1 := idParam(r, "id")
	revID, ok2 := idParam(r, "revID")
	if !ok1 || !ok2 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	f, err := h.Store.Restore(id, revID)
	if err != nil {
		h.storeErr(w, err)
		return
	}
	writeJSON(w, http.StatusOK, f)
}
```

`server/internal/api/jobs.go`:

```go
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"

	"cardforge/internal/claude"
	"cardforge/internal/jobs"
	"cardforge/internal/prompt"
	"cardforge/internal/store"
)

type JobsHandler struct {
	Registry *jobs.Registry
	Settings *store.SettingsStore
}

func (h *JobsHandler) claudeBinary() string {
	all, err := h.Settings.GetAll()
	if err != nil {
		return "claude"
	}
	if b := all["claude_binary"]; b != "" {
		return b
	}
	return "claude"
}

func (h *JobsHandler) GenerateDescription(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
		DLC  string `json:"dlc"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON: "+err.Error())
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if !oneOf(req.DLC, dlcValues...) {
		writeError(w, http.StatusBadRequest, "dlc must be one of: "+strings.Join(dlcValues, ", "))
		return
	}

	runner := &claude.Runner{Binary: h.claudeBinary()}
	p := prompt.FactionDescription(req.Name, req.DLC)
	id := h.Registry.Start(func(ctx context.Context) (string, error) {
		return runner.Run(ctx, p)
	})
	writeJSON(w, http.StatusAccepted, map[string]string{"job_id": id, "status": "pending"})
}

func (h *JobsHandler) Get(w http.ResponseWriter, r *http.Request) {
	job, ok := h.Registry.Get(chi.URLParam(r, "id"))
	if !ok {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (h *JobsHandler) Cancel(w http.ResponseWriter, r *http.Request) {
	if !h.Registry.Cancel(chi.URLParam(r, "id")) {
		writeError(w, http.StatusNotFound, "job not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
```

In `server/internal/api/settings.go`, replace the stub `TestClaude` method:

```go
func (h *SettingsHandler) TestClaude(w http.ResponseWriter, r *http.Request) {
	all, err := h.Store.GetAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	bin := all["claude_binary"]
	runner := &claude.Runner{Binary: bin}
	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()
	out, err := runner.Run(ctx, "Reply with OK")
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "message": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "message": out})
}
```

Add imports `"context"`, `"time"`, `"cardforge/internal/claude"` to settings.go.

In `server/internal/api/router.go`, extend the `db != nil` block (after the settings routes):

```go
			factions := &FactionsHandler{Store: store.NewFactionsStore(db)}
			r.Get("/factions", factions.List)
			r.Post("/factions", factions.Create)
			r.Put("/factions/{id}", factions.Update)
			r.Delete("/factions/{id}", factions.Delete)
			r.Get("/factions/{id}/revisions", factions.Revisions)
			r.Post("/factions/{id}/revisions/{revID}/restore", factions.Restore)

			jobsH := &JobsHandler{Registry: jobs.New(60 * time.Second), Settings: store.NewSettingsStore(db)}
			r.Post("/factions/generate-description", jobsH.GenerateDescription)
			r.Get("/jobs/{id}", jobsH.Get)
			r.Post("/jobs/{id}/cancel", jobsH.Cancel)
```

Add imports `"time"`, `"cardforge/internal/jobs"` to router.go. (chi routes the static segment `generate-description` before the `{id}` param — no conflict.)

- [ ] **Step 4: Run tests to verify pass**

Run: `cd server && go test ./...`
Expected: PASS. Note: `TestStubTestEndpoints` from M1 asserts test-claude returns `ok:true` — with the real implementation and no `claude` binary guaranteed in the test env, UPDATE that M1 test: remove `/api/settings/test-claude` from its loop (test-openai remains a stub until M3); real test-claude behavior is covered by `TestRealTestClaudeEndpoint`.

- [ ] **Step 5: Commit**

```bash
git add server/
git commit -m "feat: factions and jobs API with real claude test endpoint"
```

---

### Task 7: Frontend api-client 204 guard + word-diff utility

**Files:**
- Modify: `web/src/lib/api.ts` (204 guard in `parse<T>`)
- Create: `web/src/lib/diff.ts`
- Test: `web/src/lib/api.test.ts` (append), `web/src/lib/diff.test.ts`

**Interfaces:**
- Consumes: `diff` npm package (install in this task: `cd web && npm install diff`).
- Produces: `apiSend`/`apiGet` resolve `undefined` for 204 responses (Task 10's deleteFaction relies on this); `DiffToken = { text: string; type: 'same' | 'add' | 'remove' }`; `sideBySideDiff(before: string, after: string): { left: DiffToken[]; right: DiffToken[]; changed: boolean }` — left = same+removed tokens, right = same+added tokens (Task 8's DiffPanel consumes).

- [ ] **Step 1: Append failing api test + write failing diff test**

Append to `web/src/lib/api.test.ts`:

```ts
test('204 response resolves undefined instead of throwing', async () => {
  server.use(http.delete('/api/factions/1', () => new HttpResponse(null, { status: 204 })))
  await expect(apiSend('DELETE', '/api/factions/1', undefined)).resolves.toBeUndefined()
})
```

`web/src/lib/diff.test.ts`:

```ts
import { sideBySideDiff } from './diff'

test('identical strings are unchanged', () => {
  const d = sideBySideDiff('same text', 'same text')
  expect(d.changed).toBe(false)
  expect(d.left.every((t) => t.type === 'same')).toBe(true)
  expect(d.right.every((t) => t.type === 'same')).toBe(true)
})

test('word replacement shows remove on left, add on right', () => {
  const d = sideBySideDiff('old grim word', 'new grim word')
  expect(d.changed).toBe(true)
  expect(d.left.some((t) => t.type === 'remove' && t.text.includes('old'))).toBe(true)
  expect(d.left.some((t) => t.type === 'add')).toBe(false)
  expect(d.right.some((t) => t.type === 'add' && t.text.includes('new'))).toBe(true)
  expect(d.right.some((t) => t.type === 'remove')).toBe(false)
})

test('empty before means everything added', () => {
  const d = sideBySideDiff('', 'brand new')
  expect(d.changed).toBe(true)
  expect(d.right.some((t) => t.type === 'add')).toBe(true)
  expect(d.left.filter((t) => t.text !== '').every((t) => t.type !== 'add')).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npm install diff && npx vitest run src/lib/`
Expected: FAIL — 204 case throws JSON parse error; `./diff` module not found

- [ ] **Step 3: Implement**

In `web/src/lib/api.ts`, at the top of `parse<T>` after the `!res.ok` block:

```ts
  if (res.status === 204) {
    return undefined as T
  }
```

`web/src/lib/diff.ts`:

```ts
import { diffWordsWithSpace } from 'diff'

export type DiffToken = { text: string; type: 'same' | 'add' | 'remove' }

// Side-by-side word diff: left column = before (same + removed tokens),
// right column = after (same + added tokens).
export function sideBySideDiff(
  before: string,
  after: string,
): { left: DiffToken[]; right: DiffToken[]; changed: boolean } {
  const parts = diffWordsWithSpace(before, after)
  const left: DiffToken[] = []
  const right: DiffToken[] = []
  let changed = false
  for (const p of parts) {
    if (p.added) {
      changed = true
      right.push({ text: p.value, type: 'add' })
    } else if (p.removed) {
      changed = true
      left.push({ text: p.value, type: 'remove' })
    } else {
      left.push({ text: p.value, type: 'same' })
      right.push({ text: p.value, type: 'same' })
    }
  }
  return { left, right, changed }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS (all suites)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ web/package.json web/package-lock.json
git commit -m "feat: word-diff utility and 204 handling in api client"
```

---

### Task 8: Shared Dialog, ConfirmDialog, Tag, DiffPanel components

**Files:**
- Create: `web/src/components/Dialog.tsx`, `web/src/components/ConfirmDialog.tsx`, `web/src/components/Tag.tsx`, `web/src/components/DiffPanel.tsx`
- Test: `web/src/components/DiffPanel.test.tsx`

**Interfaces:**
- Consumes: `sideBySideDiff`/`DiffToken` (Task 7), `Button` (M1).
- Produces (Tasks 11–13 consume):
  - `Dialog({ title, titleExtra?, width?, children }: { title: string; titleExtra?: ReactNode; width?: string; children: ReactNode })` — fixed backdrop + surface panel; no backdrop-click close (explicit buttons only).
  - `ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel, cancelLabel? })` — danger-styled confirm button.
  - `Tag({ children, variant }: { variant: 'solid-accent' | 'outline-accent' | 'neutral' | 'warn' })`.
  - `DiffPanel({ simpleRows, textDiffs }: { simpleRows: { field: string; before: string; after: string }[]; textDiffs: { field: string; before: string; after: string }[] })` — renders `before → after` rows and side-by-side word-diff columns (only for changed textDiffs).

- [ ] **Step 1: Write failing DiffPanel test**

`web/src/components/DiffPanel.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import { DiffPanel } from './DiffPanel'

test('renders simple before/after rows', () => {
  render(<DiffPanel simpleRows={[{ field: 'dlc', before: 'Galaxy in Flames', after: 'Darkest Dawn' }]} textDiffs={[]} />)
  expect(screen.getByText('dlc')).toBeInTheDocument()
  expect(screen.getByText('Galaxy in Flames')).toBeInTheDocument()
  expect(screen.getByText('Darkest Dawn')).toBeInTheDocument()
})

test('renders side-by-side word diff for changed text field', () => {
  render(<DiffPanel simpleRows={[]} textDiffs={[{ field: 'description', before: 'old text', after: 'new text' }]} />)
  expect(screen.getByText('description')).toBeInTheDocument()
  expect(screen.getByText('Before')).toBeInTheDocument()
  expect(screen.getByText('After')).toBeInTheDocument()
  expect(screen.getByText(/old/)).toBeInTheDocument()
  expect(screen.getByText(/new/)).toBeInTheDocument()
})

test('unchanged text field renders nothing', () => {
  const { container } = render(<DiffPanel simpleRows={[]} textDiffs={[{ field: 'description', before: 'same', after: 'same' }]} />)
  expect(container.textContent).not.toContain('description')
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/components/DiffPanel.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/components/Dialog.tsx`:

```tsx
import type { ReactNode } from 'react'

export function Dialog({
  title,
  titleExtra,
  width = 'min(620px,100%)',
  children,
}: {
  title: string
  titleExtra?: ReactNode
  width?: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-10 grid place-items-center overflow-y-auto bg-neutral-900/50 p-5">
      <div
        role="dialog"
        aria-label={title}
        className="flex max-h-[90vh] flex-col gap-4 overflow-y-auto rounded-lg bg-surface p-5 shadow-[0_0_0_1px_var(--color-neutral-500),0_16px_40px_rgba(0,0,0,0.65)]"
        style={{ width }}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="m-0 text-xl font-medium">{title}</h2>
          {titleExtra}
        </div>
        {children}
      </div>
    </div>
  )
}
```

`web/src/components/ConfirmDialog.tsx`:

```tsx
import { Dialog } from './Dialog'

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog title={title} width="min(400px,100%)">
      <p className="m-0 text-sm opacity-85">{body}</p>
      <div className="mt-1.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-transparent px-3.5 py-2 text-sm font-medium text-ink hover:bg-ink/5"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-danger/50 bg-transparent px-3.5 py-2 text-sm font-medium text-danger hover:bg-danger/10"
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
```

`web/src/components/Tag.tsx`:

```tsx
import type { ReactNode } from 'react'

const variants = {
  'solid-accent': 'bg-accent-800 text-accent-100',
  'outline-accent': 'border border-accent text-accent',
  neutral: 'bg-neutral-800 text-neutral-100',
  warn: 'bg-warn/15 text-warn',
} as const

export function Tag({ children, variant }: { children: ReactNode; variant: keyof typeof variants }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2.5 py-0.5 text-[11px] tracking-wide whitespace-nowrap ${variants[variant]}`}>
      {children}
    </span>
  )
}
```

`web/src/components/DiffPanel.tsx`:

```tsx
import { sideBySideDiff, type DiffToken } from '../lib/diff'

const tokenClass: Record<DiffToken['type'], string> = {
  same: 'text-ink/75',
  add: 'bg-success/20 text-success',
  remove: 'bg-danger/20 text-danger line-through',
}

function DiffColumn({ label, tokens }: { label: string; tokens: DiffToken[] }) {
  return (
    <div className="rounded-md bg-surface px-3 py-2 text-[13px] leading-relaxed">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-ink/40">{label}</div>
      {tokens.map((t, i) => (
        <span key={i} className={tokenClass[t.type]}>
          {t.text}
        </span>
      ))}
    </div>
  )
}

export function DiffPanel({
  simpleRows,
  textDiffs,
}: {
  simpleRows: { field: string; before: string; after: string }[]
  textDiffs: { field: string; before: string; after: string }[]
}) {
  const changedText = textDiffs
    .map((d) => ({ ...d, diff: sideBySideDiff(d.before, d.after) }))
    .filter((d) => d.diff.changed)

  if (simpleRows.length === 0 && changedText.length === 0) return null

  return (
    <div className="flex flex-col gap-3 rounded-md border border-ink/10 bg-bg p-3.5">
      <div className="text-[11px] uppercase tracking-wider text-ink/50">Changes since last save</div>
      {simpleRows.map((row) => (
        <div key={row.field} className="flex gap-3 text-[13px]">
          <span className="w-20 flex-none text-ink/50">{row.field}</span>
          <span className="text-danger line-through">{row.before}</span>
          <span className="text-ink/30">→</span>
          <span className="text-success">{row.after}</span>
        </div>
      ))}
      {changedText.map((d) => (
        <div key={d.field}>
          <div className="mb-1.5 text-[13px] text-ink/50">{d.field}</div>
          <div className="grid grid-cols-2 gap-3">
            <DiffColumn label="Before" tokens={d.diff.left} />
            <DiffColumn label="After" tokens={d.diff.right} />
          </div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/components/
git commit -m "feat: shared dialog, confirm, tag, and diff panel components"
```

---

### Task 9: Generic draft-form store factory

**Files:**
- Create: `web/src/lib/draftForm.ts`
- Test: `web/src/lib/draftForm.test.ts`

**Interfaces:**
- Consumes: zustand + persist (installed).
- Produces (Task 11 consumes; future milestones reuse for card types): `createDraftFormStore<T extends Record<string, string>>(storageKey: string)` returning a zustand hook with state `{ entityKey: string | null; persisted: T | null; draft: T | null }` and actions `open(entityKey: string, snapshot: T)` (restores a persisted localStorage draft for the same entityKey, otherwise draft = snapshot), `setField(key: keyof T & string, value: string)`, `discard()`, `markSaved(snapshot: T)` (updates persisted+draft, clears storage), `close()` (clears everything including storage); plus exported helper `isDraftDirty<T>(state): boolean`.

- [ ] **Step 1: Write failing test**

`web/src/lib/draftForm.test.ts`:

```ts
import { createDraftFormStore, isDraftDirty } from './draftForm'

type D = { name: string; description: string }

function freshStore() {
  return createDraftFormStore<D>(`test:draft:${Math.random()}`)
}

test('open sets snapshot; not dirty', () => {
  const use = freshStore()
  use.getState().open('7', { name: 'A', description: 'x' })
  expect(isDraftDirty(use.getState())).toBe(false)
  expect(use.getState().draft).toEqual({ name: 'A', description: 'x' })
})

test('setField dirties; discard reverts', () => {
  const use = freshStore()
  use.getState().open('7', { name: 'A', description: 'x' })
  use.getState().setField('description', 'y')
  expect(isDraftDirty(use.getState())).toBe(true)
  use.getState().discard()
  expect(isDraftDirty(use.getState())).toBe(false)
  expect(use.getState().draft?.description).toBe('x')
})

test('markSaved resets baseline', () => {
  const use = freshStore()
  use.getState().open('7', { name: 'A', description: 'x' })
  use.getState().setField('name', 'B')
  use.getState().markSaved({ name: 'B', description: 'x' })
  expect(isDraftDirty(use.getState())).toBe(false)
  expect(use.getState().persisted?.name).toBe('B')
})

test('draft persists to localStorage and is restored by open with same entityKey', () => {
  const key = `test:draft:${Math.random()}`
  const a = createDraftFormStore<D>(key)
  a.getState().open('42', { name: 'A', description: 'x' })
  a.getState().setField('description', 'edited')

  const b = createDraftFormStore<D>(key) // simulates reload
  b.getState().open('42', { name: 'A', description: 'x' })
  expect(b.getState().draft?.description).toBe('edited')
  expect(isDraftDirty(b.getState())).toBe(true)
})

test('open with different entityKey ignores stored draft', () => {
  const key = `test:draft:${Math.random()}`
  const a = createDraftFormStore<D>(key)
  a.getState().open('42', { name: 'A', description: 'x' })
  a.getState().setField('description', 'edited')

  const b = createDraftFormStore<D>(key)
  b.getState().open('43', { name: 'B', description: 'z' })
  expect(b.getState().draft).toEqual({ name: 'B', description: 'z' })
})

test('close clears state and storage', () => {
  const key = `test:draft:${Math.random()}`
  const a = createDraftFormStore<D>(key)
  a.getState().open('42', { name: 'A', description: 'x' })
  a.getState().setField('name', 'B')
  a.getState().close()
  expect(a.getState().draft).toBeNull()

  const b = createDraftFormStore<D>(key)
  b.getState().open('42', { name: 'A', description: 'x' })
  expect(b.getState().draft?.name).toBe('A') // nothing restored
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/lib/draftForm.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/lib/draftForm.ts`:

```ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type DraftFormState<T extends Record<string, string>> = {
  entityKey: string | null
  persisted: T | null
  draft: T | null
  open: (entityKey: string, snapshot: T) => void
  setField: (key: keyof T & string, value: string) => void
  discard: () => void
  markSaved: (snapshot: T) => void
  close: () => void
}

// Draft-form store factory (spec §5): persisted snapshot vs editable draft,
// localStorage persistence of the unsaved draft only. The persisted snapshot
// always comes fresh from the server via open()/markSaved().
export function createDraftFormStore<T extends Record<string, string>>(storageKey: string) {
  return create<DraftFormState<T>>()(
    persist(
      (set, get) => ({
        entityKey: null,
        persisted: null,
        draft: null,
        open: (entityKey, snapshot) => {
          const st = get()
          // Restore a stored draft only if it belongs to the same entity.
          const keep = st.entityKey === entityKey && st.draft !== null
          set({
            entityKey,
            persisted: { ...snapshot },
            draft: keep ? st.draft : { ...snapshot },
          })
        },
        setField: (key, value) =>
          set((st) => (st.draft ? { draft: { ...st.draft, [key]: value } } : {})),
        discard: () =>
          set((st) => ({ draft: st.persisted ? { ...st.persisted } : null })),
        markSaved: (snapshot) =>
          set({ persisted: { ...snapshot }, draft: { ...snapshot } }),
        close: () => set({ entityKey: null, persisted: null, draft: null }),
      }),
      {
        name: storageKey,
        partialize: (st) => ({ entityKey: st.entityKey, draft: st.draft }),
      },
    ),
  )
}

export function isDraftDirty<T extends Record<string, string>>(st: {
  persisted: T | null
  draft: T | null
}): boolean {
  if (!st.persisted || !st.draft) return false
  return Object.keys(st.persisted).some((k) => st.persisted![k] !== st.draft![k])
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS (note: two stores sharing one storageKey both rehydrate from localStorage — the reload test relies on this)

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/
git commit -m "feat: generic draft-form store factory with localStorage persistence"
```

---

### Task 10: Factions data layer (api hooks, job polling, UI store)

**Files:**
- Create: `web/src/pages/factions/api.ts`, `web/src/pages/factions/store.ts`, `web/src/pages/factions/dlc.ts`
- Test: `web/src/pages/factions/api.test.ts`

**Interfaces:**
- Consumes: `apiGet`/`apiSend` (Task 7 guard included), `createDraftFormStore`/`isDraftDirty` (Task 9), backend endpoints (Task 6).
- Produces (Tasks 11–13 consume):
  - `dlc.ts`: `export const DLC_VALUES = ['Galaxy in Flames', 'Symphony of War', 'Darkest Dawn'] as const; export type DLC = (typeof DLC_VALUES)[number]`
  - `api.ts`: types `Faction {id:number; name:string; description:string; dlc:DLC; created_at:string; updated_at:string}`, `FactionRevision {id:number; faction_id:number; name:string; description:string; dlc:DLC; source:'manual'|'claude'|'rollback'; created_at:string}`, `FactionSave {name:string; description:string; dlc:DLC; source:'manual'|'claude'}`, `Job {id:string; status:'pending'|'done'|'failed'; result?:string; error?:string; duration_ms:number}`;
    hooks/fns `useFactions()` (key `['factions']`), `createFaction(s:FactionSave)`, `updateFaction(id:number, s:FactionSave)`, `deleteFaction(id:number)` (204→undefined), `useRevisions(factionId:number|null)` (key `['factions',id,'revisions']`, enabled when non-null), `restoreRevision(factionId:number, revId:number)`, `startGenerateDescription(name:string, dlc:DLC): Promise<{job_id:string; status:string}>`, `cancelJob(jobId:string)`, `useJob(jobId:string|null)` — poll every 2000 ms while status is `pending`, stop when terminal or jobId null.
  - `store.ts`: `FactionDraft = {name:string; dlc:string; description:string}`; `useFactionDraft = createDraftFormStore<FactionDraft>('cardforge:faction-draft')`; `useFactionsUi` zustand store: `{dialogMode:'create'|'edit'|null; editingId:number|null; lastGenerated:string|null; showDiff:boolean; discardConfirmOpen:boolean; deleteConfirmId:number|null; historyFactionId:number|null; expandedRevId:number|null; activeJobId:string|null}` + setters `openCreate()`, `openEdit(f:Faction)` (calls `useFactionDraft.open`), `closeDialog()` (also `useFactionDraft.close()`), `set(partial)` generic setter for the rest.

- [ ] **Step 1: Write failing test**

`web/src/pages/factions/api.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import type { ReactNode } from 'react'
import { server } from '../../test/msw'
import { useJob, deleteFaction } from './api'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

test('useJob polls until terminal status', async () => {
  let calls = 0
  server.use(
    http.get('/api/jobs/job-1', () => {
      calls++
      return HttpResponse.json(
        calls < 3
          ? { id: 'job-1', status: 'pending', duration_ms: 0 }
          : { id: 'job-1', status: 'done', result: 'generated', duration_ms: 1200 },
      )
    }),
  )
  const { result } = renderHook(() => useJob('job-1'), { wrapper })
  await waitFor(() => expect(result.current.data?.status).toBe('done'), { timeout: 10_000 })
  expect(result.current.data?.result).toBe('generated')
  expect(calls).toBeGreaterThanOrEqual(3)
}, 15_000)

test('useJob disabled when jobId null', () => {
  const { result } = renderHook(() => useJob(null), { wrapper })
  expect(result.current.fetchStatus).toBe('idle')
})

test('deleteFaction resolves on 204', async () => {
  server.use(http.delete('/api/factions/5', () => new HttpResponse(null, { status: 204 })))
  await expect(deleteFaction(5)).resolves.toBeUndefined()
})
```

Rename the file to `api.test.tsx` if JSX in the wrapper requires it (it does): use `web/src/pages/factions/api.test.tsx`.

Note on poll speed in tests: `useJob` accepts an optional second arg `intervalMs = 2000`; the test may pass a small interval — but the simplest reliable approach is keeping 2000 ms and the 15 s test timeout above. Implement `useJob(jobId, intervalMs = 2000)` so tests can pass `100`. Update the renderHook line to `useJob('job-1', 100)` and drop the long timeouts.

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/factions/`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/pages/factions/dlc.ts`:

```ts
export const DLC_VALUES = ['Galaxy in Flames', 'Symphony of War', 'Darkest Dawn'] as const
export type DLC = (typeof DLC_VALUES)[number]
```

`web/src/pages/factions/api.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'
import type { DLC } from './dlc'

export type Faction = {
  id: number
  name: string
  description: string
  dlc: DLC
  created_at: string
  updated_at: string
}

export type FactionRevision = {
  id: number
  faction_id: number
  name: string
  description: string
  dlc: DLC
  source: 'manual' | 'claude' | 'rollback'
  created_at: string
}

export type FactionSave = {
  name: string
  description: string
  dlc: DLC
  source: 'manual' | 'claude'
}

export type Job = {
  id: string
  status: 'pending' | 'done' | 'failed'
  result?: string
  error?: string
  duration_ms: number
}

export function useFactions() {
  return useQuery({ queryKey: ['factions'], queryFn: () => apiGet<Faction[]>('/api/factions') })
}

export function createFaction(s: FactionSave): Promise<Faction> {
  return apiSend<Faction>('POST', '/api/factions', s)
}

export function updateFaction(id: number, s: FactionSave): Promise<Faction> {
  return apiSend<Faction>('PUT', `/api/factions/${id}`, s)
}

export function deleteFaction(id: number): Promise<undefined> {
  return apiSend<undefined>('DELETE', `/api/factions/${id}`, undefined)
}

export function useRevisions(factionId: number | null) {
  return useQuery({
    queryKey: ['factions', factionId, 'revisions'],
    queryFn: () => apiGet<FactionRevision[]>(`/api/factions/${factionId}/revisions`),
    enabled: factionId !== null,
  })
}

export function restoreRevision(factionId: number, revId: number): Promise<Faction> {
  return apiSend<Faction>('POST', `/api/factions/${factionId}/revisions/${revId}/restore`, undefined)
}

export function startGenerateDescription(name: string, dlc: DLC): Promise<{ job_id: string; status: string }> {
  return apiSend('POST', '/api/factions/generate-description', { name, dlc })
}

export function cancelJob(jobId: string): Promise<{ ok: boolean }> {
  return apiSend('POST', `/api/jobs/${jobId}/cancel`, undefined)
}

export function useJob(jobId: string | null, intervalMs = 2000) {
  return useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => apiGet<Job>(`/api/jobs/${jobId}`),
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status
      return s === 'done' || s === 'failed' ? false : intervalMs
    },
  })
}
```

`web/src/pages/factions/store.ts`:

```ts
import { create } from 'zustand'
import { createDraftFormStore } from '../../lib/draftForm'
import type { Faction } from './api'

export type FactionDraft = {
  name: string
  dlc: string
  description: string
}

export const useFactionDraft = createDraftFormStore<FactionDraft>('cardforge:faction-draft')

type FactionsUiState = {
  dialogMode: 'create' | 'edit' | null
  editingId: number | null
  lastGenerated: string | null
  showDiff: boolean
  discardConfirmOpen: boolean
  deleteConfirmId: number | null
  historyFactionId: number | null
  expandedRevId: number | null
  activeJobId: string | null
  openCreate: () => void
  openEdit: (f: Faction) => void
  closeDialog: () => void
  set: (partial: Partial<Omit<FactionsUiState, 'openCreate' | 'openEdit' | 'closeDialog' | 'set'>>) => void
}

export const useFactionsUi = create<FactionsUiState>()((set) => ({
  dialogMode: null,
  editingId: null,
  lastGenerated: null,
  showDiff: false,
  discardConfirmOpen: false,
  deleteConfirmId: null,
  historyFactionId: null,
  expandedRevId: null,
  activeJobId: null,
  openCreate: () => {
    useFactionDraft.getState().open('new', { name: '', dlc: 'Galaxy in Flames', description: '' })
    set({ dialogMode: 'create', editingId: null, lastGenerated: null, showDiff: false, activeJobId: null })
  },
  openEdit: (f) => {
    useFactionDraft.getState().open(String(f.id), { name: f.name, dlc: f.dlc, description: f.description })
    set({ dialogMode: 'edit', editingId: f.id, lastGenerated: null, showDiff: false, activeJobId: null })
  },
  closeDialog: () => {
    useFactionDraft.getState().close()
    set({ dialogMode: null, editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, activeJobId: null })
  },
  set: (partial) => set(partial),
}))
```

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/factions/
git commit -m "feat: factions data layer with job polling and UI store"
```

---

### Task 11: Factions table page + create/edit dialog

**Files:**
- Create: `web/src/pages/factions/FactionsPage.tsx`, `web/src/pages/factions/FactionsTable.tsx`, `web/src/pages/factions/FactionDialog.tsx`, `web/src/pages/factions/DlcTag.tsx`
- Modify: `web/src/App.tsx` (route `/factions` → `<FactionsPage />`)
- Test: `web/src/pages/factions/FactionsPage.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 8–10; `Button`, `Field`, `inputClass` (M1).
- Produces: working Factions section minus Generate/History (Tasks 12–13 slot into `FactionDialog`/page). `FactionDialog` renders a `generateSlot?: ReactNode` prop area next to the Description label (Task 12 fills it) — include the prop now so Task 12 doesn't restructure. `FactionsTable` takes `onHistory: (f: Faction) => void` (Task 13 wires it; this task passes a no-op setter into `useFactionsUi.set({historyFactionId})`).

- [ ] **Step 1: Write failing tests**

`web/src/pages/factions/FactionsPage.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useFactionsUi, useFactionDraft } from './store'
import type { Faction } from './api'
import FactionsPage from './FactionsPage'

const factions: Faction[] = [
  { id: 1, name: 'Tau Empire', description: 'Blue-grey plating and honeycomb geometry over ritual.', dlc: 'Galaxy in Flames', created_at: '2026-07-10', updated_at: '2026-07-14' },
  { id: 2, name: 'Eldar', description: 'Bonewhite curves.', dlc: 'Darkest Dawn', created_at: '2026-07-09', updated_at: '2026-07-12' },
]

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <FactionsPage />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useFactionsUi.setState({ dialogMode: null, editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null, historyFactionId: null, expandedRevId: null, activeJobId: null })
  useFactionDraft.getState().close()
  server.use(http.get('/api/factions', () => HttpResponse.json(factions)))
})

test('renders table rows with DLC tags', async () => {
  renderPage()
  expect(await screen.findByText('Tau Empire')).toBeInTheDocument()
  expect(screen.getByText('Galaxy in Flames')).toBeInTheDocument()
  expect(screen.getByText('Eldar')).toBeInTheDocument()
})

test('create flow posts and closes dialog', async () => {
  let posted: Record<string, unknown> | null = null
  server.use(
    http.post('/api/factions', async ({ request }) => {
      posted = (await request.json()) as Record<string, unknown>
      return HttpResponse.json({ id: 3, name: posted.name, description: posted.description, dlc: posted.dlc, created_at: 'now', updated_at: 'now' }, { status: 201 })
    }),
  )
  renderPage()
  await userEvent.click(await screen.findByRole('button', { name: /New Faction/ }))
  const dialog = screen.getByRole('dialog', { name: 'New Faction' })
  await userEvent.type(within(dialog).getByLabelText('Name'), 'Necrons')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Darkest Dawn' }))
  await userEvent.type(within(dialog).getByLabelText('Description'), 'gunmetal')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Save Faction' }))
  await screen.findByText('Tau Empire') // dialog closed, back to table
  expect(posted).toMatchObject({ name: 'Necrons', dlc: 'Darkest Dawn', description: 'gunmetal', source: 'manual' })
  expect(screen.queryByRole('dialog', { name: 'New Faction' })).not.toBeInTheDocument()
})

test('edit shows dirty badge and diff panel', async () => {
  renderPage()
  await screen.findByText('Tau Empire')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Faction' })
  const desc = within(dialog).getByLabelText('Description')
  await userEvent.clear(desc)
  await userEvent.type(desc, 'New aesthetic text')
  expect(within(dialog).getByText('Unsaved changes')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Show diff' }))
  expect(within(dialog).getByText('Before')).toBeInTheDocument()
  await userEvent.click(within(dialog).getByRole('button', { name: 'Discard' }))
  expect(within(dialog).queryByText('Unsaved changes')).not.toBeInTheDocument()
})

test('closing dirty dialog asks confirmation', async () => {
  renderPage()
  await screen.findByText('Tau Empire')
  await userEvent.click(screen.getAllByRole('button', { name: 'Edit' })[0])
  const dialog = screen.getByRole('dialog', { name: 'Edit Faction' })
  await userEvent.type(within(dialog).getByLabelText('Name'), 'X')
  await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
  expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
  expect(screen.getByRole('dialog', { name: 'Edit Faction' })).toBeInTheDocument()
})

test('delete asks confirmation and calls DELETE', async () => {
  let deleted = false
  server.use(http.delete('/api/factions/2', () => { deleted = true; return new HttpResponse(null, { status: 204 }) }))
  renderPage()
  await screen.findByText('Eldar')
  await userEvent.click(screen.getAllByRole('button', { name: 'Delete' })[1])
  expect(screen.getByText('Delete faction?')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Delete faction' }))
  await screen.findByText('Tau Empire')
  expect(deleted).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/factions/FactionsPage.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/pages/factions/DlcTag.tsx`:

```tsx
import { Tag } from '../../components/Tag'
import type { DLC } from './dlc'

const variantByDlc = {
  'Galaxy in Flames': 'solid-accent',
  'Symphony of War': 'outline-accent',
  'Darkest Dawn': 'neutral',
} as const

export function DlcTag({ dlc }: { dlc: DLC }) {
  return <Tag variant={variantByDlc[dlc]}>{dlc}</Tag>
}
```

`web/src/pages/factions/FactionsTable.tsx`:

```tsx
import { Button } from '../../components/Button'
import { DlcTag } from './DlcTag'
import type { Faction } from './api'

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function FactionsTable({
  factions,
  onEdit,
  onHistory,
  onDelete,
}: {
  factions: Faction[]
  onEdit: (f: Faction) => void
  onHistory: (f: Faction) => void
  onDelete: (f: Faction) => void
}) {
  return (
    <div className="max-w-5xl overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60">
            <th className="px-4 py-3.5 font-medium">Name</th>
            <th className="px-4 py-3.5 font-medium">DLC</th>
            <th className="px-4 py-3.5 font-medium">Description</th>
            <th className="px-4 py-3.5 font-medium">Updated</th>
            <th className="px-4 py-3.5" />
          </tr>
        </thead>
        <tbody>
          {factions.map((f) => (
            <tr key={f.id} className="border-t border-ink/8 hover:bg-ink/4">
              <td className="whitespace-nowrap px-4 py-3 font-medium">{f.name}</td>
              <td className="px-4 py-3"><DlcTag dlc={f.dlc} /></td>
              <td className="max-w-80 px-4 py-3 text-ink/70">{truncate(f.description, 78)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-[13px] text-ink/50">{f.updated_at}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <span className="inline-flex gap-1.5">
                  <Button onClick={() => onHistory(f)}>History</Button>
                  <Button onClick={() => onEdit(f)}>Edit</Button>
                  <Button onClick={() => onDelete(f)}>Delete</Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

`web/src/pages/factions/FactionDialog.tsx` (uses `useActionState` save like M1's SaveBar; `generateSlot` filled by Task 12):

```tsx
import { useActionState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DiffPanel } from '../../components/DiffPanel'
import { Field, inputClass } from '../../components/Field'
import { isDraftDirty } from '../../lib/draftForm'
import { createFaction, updateFaction, type FactionSave } from './api'
import { DLC_VALUES, type DLC } from './dlc'
import { useFactionDraft, useFactionsUi } from './store'

export function FactionDialog({ generateSlot }: { generateSlot?: ReactNode }) {
  const ui = useFactionsUi()
  const draftState = useFactionDraft()
  const dirty = isDraftDirty(draftState)
  const queryClient = useQueryClient()
  const { draft, persisted } = draftState

  const [saveResult, saveAction, saving] = useActionState(
    async (): Promise<{ error: string | null }> => {
      const d = useFactionDraft.getState().draft
      const { lastGenerated, dialogMode, editingId } = useFactionsUi.getState()
      if (!d || !d.name.trim()) return { error: 'Name is required' }
      const save: FactionSave = {
        name: d.name.trim(),
        description: d.description,
        dlc: d.dlc as DLC,
        source: lastGenerated !== null && d.description === lastGenerated ? 'claude' : 'manual',
      }
      try {
        if (dialogMode === 'edit' && editingId !== null) await updateFaction(editingId, save)
        else await createFaction(save)
        queryClient.invalidateQueries({ queryKey: ['factions'] })
        useFactionsUi.getState().closeDialog()
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

  const simpleRows = []
  if (ui.dialogMode === 'edit' && persisted) {
    if (draft.name !== persisted.name) simpleRows.push({ field: 'name', before: persisted.name, after: draft.name })
    if (draft.dlc !== persisted.dlc) simpleRows.push({ field: 'dlc', before: persisted.dlc, after: draft.dlc })
  }

  return (
    <>
      <Dialog
        title={ui.dialogMode === 'edit' ? 'Edit Faction' : 'New Faction'}
        titleExtra={dirty ? (
          <span className="whitespace-nowrap rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-[11px] text-warn">Unsaved changes</span>
        ) : undefined}
      >
        <Field label="Name">
          {(id) => (
            <input id={id} type="text" value={draft.name} placeholder="e.g. Tau Empire"
              onChange={(e) => draftState.setField('name', e.target.value)} className={inputClass} />
          )}
        </Field>

        <div>
          <span className="mb-1 block text-xs text-ink/70">DLC</span>
          <div className="inline-flex overflow-hidden rounded-md border border-divider" role="group" aria-label="DLC">
            {DLC_VALUES.map((v, i) => (
              <button key={v} type="button" onClick={() => draftState.setField('dlc', v)}
                className={`px-3 py-1.5 text-[13px] cursor-pointer bg-transparent border-0 ${i > 0 ? 'border-l border-divider' : ''} ${draft.dlc === v ? 'text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-ink'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="faction-description" className="text-xs text-ink/70">Description</label>
            {generateSlot}
          </div>
          <textarea id="faction-description" aria-label="Description" value={draft.description}
            placeholder="Color palette, materials, iconography, mood…"
            onChange={(e) => draftState.setField('description', e.target.value)}
            className={`${inputClass} min-h-28 resize-y font-sans`} />
          <p className="mt-1 text-[11px] text-ink/45">Nothing is persisted until you click Save — including generated text.</p>
        </div>

        {ui.showDiff && dirty && persisted && (
          <DiffPanel simpleRows={simpleRows}
            textDiffs={[{ field: 'description', before: persisted.description, after: draft.description }]} />
        )}

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
            {dirty && <Button type="button" onClick={() => draftState.discard()}>Discard</Button>}
            <Button type="button" onClick={requestClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!draft.name.trim() || saving}>
              {saving ? 'Saving…' : 'Save Faction'}
            </Button>
          </form>
        </div>
      </Dialog>

      {ui.discardConfirmOpen && (
        <ConfirmDialog title="Discard unsaved changes?"
          body="You have unsaved changes to this faction. Closing now will discard them."
          confirmLabel="Discard" cancelLabel="Keep editing"
          onConfirm={() => { ui.set({ discardConfirmOpen: false }); ui.closeDialog() }}
          onCancel={() => ui.set({ discardConfirmOpen: false })} />
      )}
    </>
  )
}
```

`web/src/pages/factions/FactionsPage.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { deleteFaction, useFactions } from './api'
import { FactionDialog } from './FactionDialog'
import { FactionsTable } from './FactionsTable'
import { useFactionsUi } from './store'

export default function FactionsPage() {
  const { data, isLoading, error } = useFactions()
  const ui = useFactionsUi()
  const queryClient = useQueryClient()

  const confirmTarget = data?.find((f) => f.id === ui.deleteConfirmId)

  async function confirmDelete() {
    if (!confirmTarget) return
    await deleteFaction(confirmTarget.id)
    ui.set({ deleteConfirmId: null })
    queryClient.invalidateQueries({ queryKey: ['factions'] })
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Factions</h1>
          <p className="m-0 text-sm text-ink/60">{data?.length ?? 0} factions · shared across every card type</p>
        </div>
        <Button variant="primary" onClick={ui.openCreate}>New Faction</Button>
      </div>

      {isLoading && <p className="text-ink/60">Loading…</p>}
      {error && <p role="alert" className="text-danger">Failed to load factions: {error instanceof Error ? error.message : 'unknown'}</p>}
      {data && (
        <FactionsTable factions={data}
          onEdit={ui.openEdit}
          onHistory={(f) => ui.set({ historyFactionId: f.id, expandedRevId: null })}
          onDelete={(f) => ui.set({ deleteConfirmId: f.id })} />
      )}

      <FactionDialog />

      {confirmTarget && (
        <ConfirmDialog title="Delete faction?"
          body={`Removing ${confirmTarget.name} can't be undone.`}
          confirmLabel="Delete faction"
          onConfirm={confirmDelete}
          onCancel={() => ui.set({ deleteConfirmId: null })} />
      )}
    </div>
  )
}
```

In `web/src/App.tsx`: `import FactionsPage from './pages/factions/FactionsPage'` and replace the factions placeholder route with `{ path: '/factions', element: <FactionsPage /> }`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run && npm run build`
Expected: PASS + clean build. Sidebar.test route render of `/factions` now mounts FactionsPage — if its MSW handlers 404, add `http.get('/api/factions', () => HttpResponse.json([]))` to that test's handlers (same pattern as the /settings handler added in M1 Task 9).

- [ ] **Step 5: Commit**

```bash
git add web/src/
git commit -m "feat: factions page with table, create/edit dialog, diff and confirms"
```

---

### Task 12: Generate-with-Claude flow

**Files:**
- Create: `web/src/pages/factions/GenerateButton.tsx`
- Modify: `web/src/pages/factions/FactionsPage.tsx` (pass `generateSlot={<GenerateButton />}` to `<FactionDialog />`)
- Test: `web/src/pages/factions/GenerateButton.test.tsx`

**Interfaces:**
- Consumes: `startGenerateDescription`, `cancelJob`, `useJob` (Task 10), `useFactionDraft`/`useFactionsUi` (Task 10), `Job` type.
- Produces: `GenerateButton({ intervalMs = 2000 })` — renders "Generate with Claude" (disabled while name empty or job pending); on click starts a job with the CURRENT draft name/dlc; while pending shows "Generating…" + a "Cancel generation" button (calls `cancelJob`); on `done` writes `result` into the draft's `description` AND `useFactionsUi.lastGenerated`, sets `showDiff: true` (form state only — no persistence); on `failed` renders the job error inline (role=alert).

- [ ] **Step 1: Write failing test**

`web/src/pages/factions/GenerateButton.test.tsx`:

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useFactionDraft, useFactionsUi } from './store'
import { GenerateButton } from './GenerateButton'

function renderBtn() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <GenerateButton intervalMs={50} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useFactionsUi.setState({ dialogMode: 'create', editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null, historyFactionId: null, expandedRevId: null, activeJobId: null })
  useFactionDraft.getState().open('new', { name: 'Tau Empire', dlc: 'Galaxy in Flames', description: '' })
})

test('disabled when name empty', () => {
  useFactionDraft.getState().setField('name', '')
  renderBtn()
  expect(screen.getByRole('button', { name: /Generate with Claude/ })).toBeDisabled()
})

test('successful generation fills description in form state only', async () => {
  let polls = 0
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-1', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-1', () => {
      polls++
      return HttpResponse.json(
        polls < 2
          ? { id: 'job-1', status: 'pending', duration_ms: 0 }
          : { id: 'job-1', status: 'done', result: 'Grim dark aesthetic.', duration_ms: 900 },
      )
    }),
  )
  renderBtn()
  await userEvent.click(screen.getByRole('button', { name: /Generate with Claude/ }))
  expect(screen.getByText(/Generating…/)).toBeInTheDocument()
  await waitFor(() => expect(useFactionDraft.getState().draft?.description).toBe('Grim dark aesthetic.'))
  expect(useFactionsUi.getState().lastGenerated).toBe('Grim dark aesthetic.')
  expect(useFactionsUi.getState().showDiff).toBe(true)
})

test('failed generation shows error', async () => {
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-2', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-2', () =>
      HttpResponse.json({ id: 'job-2', status: 'failed', error: 'claude CLI failed: quota', duration_ms: 10 })),
  )
  renderBtn()
  await userEvent.click(screen.getByRole('button', { name: /Generate with Claude/ }))
  expect(await screen.findByRole('alert')).toHaveTextContent('claude CLI failed: quota')
})

test('cancel button posts cancel', async () => {
  let cancelled = false
  server.use(
    http.post('/api/factions/generate-description', () =>
      HttpResponse.json({ job_id: 'job-3', status: 'pending' }, { status: 202 })),
    http.get('/api/jobs/job-3', () => HttpResponse.json({ id: 'job-3', status: 'pending', duration_ms: 0 })),
    http.post('/api/jobs/job-3/cancel', () => { cancelled = true; return HttpResponse.json({ ok: true }) }),
  )
  renderBtn()
  await userEvent.click(screen.getByRole('button', { name: /Generate with Claude/ }))
  await userEvent.click(await screen.findByRole('button', { name: 'Cancel generation' }))
  expect(cancelled).toBe(true)
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/factions/GenerateButton.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/pages/factions/GenerateButton.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { cancelJob, startGenerateDescription, useJob } from './api'
import type { DLC } from './dlc'
import { useFactionDraft, useFactionsUi } from './store'

export function GenerateButton({ intervalMs = 2000 }: { intervalMs?: number }) {
  const name = useFactionDraft((s) => s.draft?.name ?? '')
  const dlc = useFactionDraft((s) => s.draft?.dlc ?? '')
  const activeJobId = useFactionsUi((s) => s.activeJobId)
  const [jobError, setJobError] = useState<string | null>(null)

  const job = useJob(activeJobId, intervalMs)
  const pending = activeJobId !== null && (job.data === undefined || job.data.status === 'pending')

  useEffect(() => {
    const j = job.data
    if (!j || j.status === 'pending') return
    const ui = useFactionsUi.getState()
    if (ui.activeJobId !== j.id) return
    if (j.status === 'done' && j.result !== undefined) {
      useFactionDraft.getState().setField('description', j.result)
      ui.set({ lastGenerated: j.result, showDiff: true, activeJobId: null })
    } else if (j.status === 'failed') {
      ui.set({ activeJobId: null })
      setJobError(j.error ?? 'generation failed')
    }
  }, [job.data])

  async function onGenerate() {
    setJobError(null)
    try {
      const res = await startGenerateDescription(name.trim(), dlc as DLC)
      useFactionsUi.getState().set({ activeJobId: res.job_id })
    } catch (e) {
      setJobError(e instanceof Error ? e.message : 'failed to start generation')
    }
  }

  async function onCancel() {
    if (activeJobId) await cancelJob(activeJobId).catch(() => {})
  }

  return (
    <span className="inline-flex items-center gap-2">
      {jobError && <span role="alert" className="text-[11px] text-danger">{jobError}</span>}
      {pending && (
        <button type="button" onClick={onCancel} aria-label="Cancel generation"
          className="cursor-pointer border-0 bg-transparent p-0 text-xs font-medium text-ink/60 hover:text-ink">
          Cancel generation
        </button>
      )}
      <button type="button" onClick={onGenerate} disabled={!name.trim() || pending}
        className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-45">
        {pending ? 'Generating…' : 'Generate with Claude'}
      </button>
    </span>
  )
}
```

In `web/src/pages/factions/FactionsPage.tsx`: `import { GenerateButton } from './GenerateButton'` and change `<FactionDialog />` to `<FactionDialog generateSlot={<GenerateButton />} />`.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/factions/
git commit -m "feat: generate-with-claude flow with polling and cancel"
```

---

### Task 13: History dialog with restore

**Files:**
- Create: `web/src/pages/factions/HistoryDialog.tsx`
- Modify: `web/src/pages/factions/FactionsPage.tsx` (render `<HistoryDialog factions={data ?? []} />`)
- Test: `web/src/pages/factions/HistoryDialog.test.tsx`

**Interfaces:**
- Consumes: `useRevisions`, `restoreRevision`, `Faction`/`FactionRevision` (Task 10), `Dialog`, `Tag`, `DiffPanel`, `Button`; `useFactionsUi.historyFactionId/expandedRevId`.
- Produces: `HistoryDialog({ factions }: { factions: Faction[] })` — open when `historyFactionId` non-null; revisions newest-first (source Tag: claude=solid-accent, manual=neutral, rollback=outline-accent; timestamp; description preview; "current" marker on newest); row click toggles expansion; expanded shows `DiffPanel` (revision vs current faction) + "Restore this version" (disabled on newest); restore calls API, invalidates `['factions']`, collapses.

- [ ] **Step 1: Write failing test**

`web/src/pages/factions/HistoryDialog.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw'
import { useFactionsUi, useFactionDraft } from './store'
import type { Faction, FactionRevision } from './api'
import { HistoryDialog } from './HistoryDialog'

const faction: Faction = { id: 1, name: 'Eldar', description: 'v2 text', dlc: 'Darkest Dawn', created_at: 'a', updated_at: 'b' }
const revisions: FactionRevision[] = [
  { id: 12, faction_id: 1, name: 'Eldar', description: 'v2 text', dlc: 'Darkest Dawn', source: 'manual', created_at: '2026-07-15' },
  { id: 11, faction_id: 1, name: 'Eldar', description: 'v1 text', dlc: 'Darkest Dawn', source: 'claude', created_at: '2026-07-14' },
]

function renderDlg() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <HistoryDialog factions={[faction]} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  useFactionDraft.getState().close()
  useFactionsUi.setState({ dialogMode: null, editingId: null, lastGenerated: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null, historyFactionId: 1, expandedRevId: null, activeJobId: null })
  server.use(http.get('/api/factions/1/revisions', () => HttpResponse.json(revisions)))
})

test('lists revisions newest first with source badges', async () => {
  renderDlg()
  const dialog = await screen.findByRole('dialog', { name: /Eldar — History/ })
  expect(within(dialog).getByText('claude')).toBeInTheDocument()
  expect(within(dialog).getByText('manual')).toBeInTheDocument()
  expect(within(dialog).getByText('current')).toBeInTheDocument()
})

test('expanding an old revision shows diff and restore posts', async () => {
  let restored = false
  server.use(
    http.post('/api/factions/1/revisions/11/restore', () => {
      restored = true
      return HttpResponse.json({ ...faction, description: 'v1 text' })
    }),
  )
  renderDlg()
  const dialog = await screen.findByRole('dialog', { name: /History/ })
  await userEvent.click(within(dialog).getByText(/v1 text/))
  expect(within(dialog).getByText('Before')).toBeInTheDocument()
  const restoreBtn = within(dialog).getByRole('button', { name: 'Restore this version' })
  expect(restoreBtn).toBeEnabled()
  await userEvent.click(restoreBtn)
  expect(restored).toBe(true)
})

test('newest revision restore disabled', async () => {
  renderDlg()
  const dialog = await screen.findByRole('dialog', { name: /History/ })
  await userEvent.click(within(dialog).getByText(/v2 text/))
  expect(within(dialog).getByRole('button', { name: 'Restore this version' })).toBeDisabled()
})
```

- [ ] **Step 2: Run to verify failure**

Run: `cd web && npx vitest run src/pages/factions/HistoryDialog.test.tsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`web/src/pages/factions/HistoryDialog.tsx`:

```tsx
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { DiffPanel } from '../../components/DiffPanel'
import { Tag } from '../../components/Tag'
import { restoreRevision, useRevisions, type Faction, type FactionRevision } from './api'
import { useFactionsUi } from './store'

const sourceVariant = { claude: 'solid-accent', manual: 'neutral', rollback: 'outline-accent' } as const

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

function RevisionRow({ rev, faction, isCurrent }: { rev: FactionRevision; faction: Faction; isCurrent: boolean }) {
  const ui = useFactionsUi()
  const queryClient = useQueryClient()
  const expanded = ui.expandedRevId === rev.id

  async function onRestore() {
    await restoreRevision(faction.id, rev.id)
    queryClient.invalidateQueries({ queryKey: ['factions'] })
    ui.set({ expandedRevId: null })
  }

  const simpleRows = []
  if (rev.name !== faction.name) simpleRows.push({ field: 'name', before: rev.name, after: faction.name })
  if (rev.dlc !== faction.dlc) simpleRows.push({ field: 'dlc', before: rev.dlc, after: faction.dlc })

  return (
    <div className="overflow-hidden rounded-md border border-ink/10">
      <button type="button" onClick={() => ui.set({ expandedRevId: expanded ? null : rev.id })}
        className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3.5 py-3 text-left text-ink">
        <Tag variant={sourceVariant[rev.source]}>{rev.source}</Tag>
        <span className="whitespace-nowrap text-xs text-ink/50">{rev.created_at}</span>
        <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px] text-ink/65">
          {truncate(rev.description, 60)}
        </span>
        {isCurrent && <span className="whitespace-nowrap text-[11px] text-ink/40">current</span>}
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 px-3.5 pb-3.5">
          <DiffPanel simpleRows={simpleRows}
            textDiffs={[{ field: 'description (this revision → current)', before: rev.description, after: faction.description }]} />
          <Button className="self-start" disabled={isCurrent} onClick={onRestore}>Restore this version</Button>
        </div>
      )}
    </div>
  )
}

export function HistoryDialog({ factions }: { factions: Faction[] }) {
  const ui = useFactionsUi()
  const faction = factions.find((f) => f.id === ui.historyFactionId) ?? null
  const { data: revisions } = useRevisions(faction ? faction.id : null)

  if (!faction) return null

  return (
    <Dialog title={`${faction.name} — History`} width="min(640px,100%)"
      titleExtra={<Button onClick={() => ui.set({ historyFactionId: null, expandedRevId: null })}>Close</Button>}>
      <div className="flex flex-col gap-2">
        {revisions?.map((rev, i) => (
          <RevisionRow key={rev.id} rev={rev} faction={faction} isCurrent={i === 0} />
        ))}
        {revisions && revisions.length === 0 && <p className="m-0 text-sm text-ink/50">No revisions yet.</p>}
      </div>
    </Dialog>
  )
}
```

In `web/src/pages/factions/FactionsPage.tsx`: import and render `<HistoryDialog factions={data ?? []} />` after the FactionDialog line.

- [ ] **Step 4: Run tests to verify pass**

Run: `cd web && npx vitest run && npm run build`
Expected: PASS + clean build

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/factions/
git commit -m "feat: revision history dialog with diff and restore"
```

---

### Task 14: End-to-end verification (Playwright)

**Files:**
- None created (verification only; fix anything broken found)

**Interfaces:**
- Consumes: everything.

- [ ] **Step 1: Full suites**

Run: `make test`
Expected: Go all packages PASS; Vitest all suites PASS.

- [ ] **Step 2: Live Playwright verification**

Start backend (`cd server && CARDFORGE_DB=/tmp/cardforge-m2.db go run .`) and Vite (`cd web && npm run dev`) in background. Via Playwright MCP at `http://localhost:5173/factions`:

1. Empty table renders; create "Tau Empire" (Galaxy in Flames) with a typed description → row appears with DLC tag.
2. Edit: change description → dirty badge → Show diff renders side-by-side → Save → table updates.
3. History → two revisions (manual × 2), newest marked current → expand older → diff renders → Restore → table shows old description → History now has three entries, newest tagged `rollback`.
4. Generate with Claude: in edit dialog click "Generate with Claude" — real local `claude` CLI runs (may take up to ~60 s; UI shows Generating… + Cancel). On completion textarea fills, dirty badge + diff appear, nothing persisted until Save. If claude CLI unavailable or >90 s, cancel and verify the failure path shows the inline error instead (record which path ran).
5. Settings → "Test Claude CLI" → real response (OK or error) appears.
6. Delete a faction → confirm dialog → row gone.
7. Screenshot → `.superpowers/sdd/task-14-factions.png`. Check console for errors.

Kill both servers after.

- [ ] **Step 3: Commit (only if fixes were needed)**

If verification exposed bugs, fix + test + commit individually (`fix: …`). Otherwise nothing to commit.

---

## Self-review notes

- **Spec coverage (M2, spec §9 milestone 2):** migration 0002 ✔ (T1); CRUD + revisions/rollback ✔ (T1-T2, T6); Claude CLI ✔ (T3); jobs registry ✔ (T4); prompt §8.1 ✔ (T5); API §9 ✔ (T6); real Test Claude ✔ (T6); draft-form framework ✔ (T9, `createDraftFormStore` — spec's `useDraftForm` responsibility, factory form); DiffPanel + word diff ✔ (T7-T8); Factions UI incl. generate + history/restore ✔ (T10-T13); delete confirm + unsaved guard ✔ (T11); client-side source derivation ✔ (T11 save + T12 lastGenerated); e2e ✔ (T14).
- **Known deferrals:** referenced-by-batch delete block → M5 (batch_items doesn't exist yet); route-change unsaved guard → M6 polish (dialog-scoped guard covers M2 edits); settings store not retrofitted onto createDraftFormStore (works as-is; optional M6 cleanup).
- **M1 lessons applied:** all inputs labeled (Field/htmlFor/aria-label — no bare span labels); DELETE returns 204 + parse guard (T7); no new NotFound wiring; maskKey untouched.
- **M1 test to update:** T6 Step 4 explicitly instructs removing test-claude from `TestStubTestEndpoints` (real endpoint covered by `TestRealTestClaudeEndpoint`).
- **Type consistency:** `FactionSave.source` manual|claude matches T6 validation and T11 save action; `useJob(jobId, intervalMs)` consistent T10/T12; JSON field names match Go struct tags (T1/T6); `generateSlot` declared T11, filled T12; `HistoryDialog({factions})` matches T13 page usage.
