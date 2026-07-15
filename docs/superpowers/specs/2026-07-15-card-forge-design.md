# Card Forge — Design Spec

**Date:** 2026-07-15
**Sources of truth:**
- Behavior, data model, API: `docs/prd/PRD-1.md` (the PRD). This spec records architecture decisions and resolves the PRD's open points; where the PRD already specifies something, this spec references rather than restates it.
- Look, layout, tokens: Claude Design project "Design for PRD" (`https://claude.ai/design/p/5a781fb8-5d03-4153-9e4a-0a309a5b55b0`) — five screens (`Factions`, `CardTypes`, `TestGeneration`, `BatchProcessing`, `Settings`) plus the Nocturne design-system stylesheet (`reference/nocturne-styles.css`).

The pre-existing `index.html` / `styles.css` at the repo root are a leftover login mockup. The app has no auth (PRD §3). They are not part of this design and will be removed during scaffolding.

## 1. Overview

Card Forge is a local-only, single-user web app for managing factions and card-type templates, generating faction descriptions via the local `claude` CLI, and producing card artwork through the OpenAI Image API — single test generations and bulk Batch API jobs. Full scope of PRD §1–§12.

## 2. Locked technology decisions

| Area | Decision |
|---|---|
| Repo layout | `server/` (Go module) + `web/` (Vite app) |
| Backend | Go 1.22+, chi router (`github.com/go-chi/chi/v5`) |
| Database | SQLite via `modernc.org/sqlite` (no CGO), file `./data/cardforge.db` |
| Migrations | `golang-migrate`, numbered `.sql` files embedded via `embed.FS` |
| Frontend | React 19 + TypeScript + Vite, React 19 form actions (`useActionState`) for saves |
| Routing | react-router |
| Server state | TanStack Query (fetching, cache, polling) |
| UI state | zustand, one store per section; React context only for scoping (per-dialog store instances), never as a global state bus |
| Draft persistence | zustand `persist` middleware → localStorage, unsaved form drafts only |
| Styling | Tailwind v4, CSS-first config: `@theme` block in `web/src/index.css` maps Nocturne tokens |
| Word diff | `diff` npm package |
| OpenAI access | Hand-rolled thin HTTP client in Go (no SDK dependency) |
| Claude access | `os/exec` subprocess, `claude -p "<prompt>"` |
| Prod serving | Go binary embeds `web/dist` via `embed.FS`; dev mode: Vite proxy `/api` → `:8080` |

## 3. Architecture

```
web/ (React 19 SPA) ── /api/* ──► server/ (Go, chi)
                                    ├── SQLite ./data/cardforge.db
                                    ├── FS ./data/{templates,generated,batches}/
                                    ├── OpenAI API (HTTPS, token server-side only)
                                    └── claude CLI (subprocess)
```

- All external calls go through the backend, no exceptions (PRD §4.1). Verified by acceptance criterion: browser network tab shows only `/api/*`.
- Uniform async pattern: any endpoint triggering external work returns immediately with an id and `status: "pending"`; work runs in a goroutine; the UI polls (2 s for generations and Claude jobs, 60 s for batches) until terminal status. Poll responses carry cost and duration where applicable.
- Every OpenAI `usage` block is stored; tokens convert to USD via the `price_table` settings key. Batch pricing = 50 % of price-table rates.

## 4. Backend package structure

One package per concern under `server/internal/`:

| Package | Responsibility | Depends on |
|---|---|---|
| `store` | SQLite access. One file per entity: factions, revisions, card types, generations, batches + items, settings. Plain SQL, no ORM. | stdlib, sqlite driver |
| `openai` | Thin client: `POST /v1/images/edits`, Files API (upload `vision`/`batch`, content download), Batches API (create/get/cancel), `GET /v1/models`. Retries 429/5xx up to 3× with exponential backoff (sync calls only; never retries `image_generation_user_error`). Surfaces `error.message` + request ID. | stdlib |
| `claude` | CLI runner: 60 s timeout, context-cancelable, captures stdout (result) and stderr (error detail). Binary path from settings. | stdlib |
| `jobs` | In-memory job registry for Claude description jobs: mutex-guarded map, job = {status, result, error, duration_ms, cancel}. Rationale: PRD defines `GET /api/jobs/{id}` but no jobs table — jobs are 60-s-lived, single-user; losing an in-flight text generation on restart is acceptable. | `claude` |
| `batchpoller` | Background goroutine, 60 s tick, polls all non-terminal batches. On startup re-enters polling for any non-terminal batch found in DB (PRD §10 restart recovery). On completion: downloads output JSONL, decodes per-line `b64_json` → `./data/batches/<id>/<custom_id>.png`, extracts per-line usage, computes per-item `cost_usd` and batch `total_cost_usd`, downloads `error_file_id` if present, updates items and batch. | `store`, `openai` |
| `pricing` | Price table (JSON in settings, seeded with labeled-estimate defaults), tokens→USD, per-image estimates by quality for previews. | `store` |
| `prompt` | The two prompt templates (PRD §8.1, §8.2) as Go constants, assembly functions, `slugify` (lowercase, non-alphanumeric → `_`). | — |
| `api` | chi handlers, one file per section. Thin: validate, delegate, encode. | all above |

### Data model and migrations

Schema exactly as PRD §5. Migrations split by milestone:

| Migration | Contents |
|---|---|
| 0001 | `settings` + seed defaults (PRD §5 comment block) |
| 0002 | `factions`, `faction_revisions` |
| 0003 | `card_types` |
| 0004 | `generations` |
| 0005 | `batches`, `batch_items` |

### API surface

Exactly PRD §9. Settings API: key write-only, returned masked (`sk-…` + last 4); `OPENAI_API_KEY` env var overrides DB value and is never written back.

## 5. Frontend architecture

### State — three layers, strict separation

1. **Server state — TanStack Query only.** All fetching, caching, and polling. Polling via `refetchInterval` returning the interval while status is non-terminal and `false` once terminal. Server data never copied into zustand.
2. **Client/UI state — zustand.** One store per section: `factionsStore`, `cardTypesStore`, `testGenStore`, `batchWizardStore`, `settingsStore`; small shared stores where needed (toasts). Holds drafts, dirty flags, dialog and wizard state, mode toggles, expanded rows.
3. **Persistence — localStorage via zustand `persist`,** scoped to unsaved form drafts only (faction, card type, settings). Key includes entity id (or `new`). Cleared on Save and on Discard. The DB is untouched until explicit Save — the PRD's explicit-save principle is preserved; drafts merely survive a reload.

### Modularity rules

- One component, one concern. Page components only compose.
- Target ≤ 150 lines per component file, hard cap ~200 — split when exceeded.
- Section layout: `web/src/pages/<section>/` contains the page, its subcomponents, `store.ts` (zustand), and `api.ts` (the section's typed query/mutation hooks).
- `web/src/components/`: shared primitives — Button, Input, Select, SegmentedControl, Tag, Badge, Dialog, ConfirmDialog, DiffPanel, Spinner, Toast.
- `web/src/lib/`: API client (typed fetch wrappers), `useDraftForm`, word-diff util, formatting helpers (cost, duration).

### `useDraftForm` — the shared draft/diff framework

Generic hook over a zustand draft slice, used by all three edit forms (Factions, Card Types, Settings). Provides: persisted snapshot, draft values, per-field setters, `isDirty`, side-by-side word-level diff rows for text fields and `before → after` rows for non-text fields, Discard (revert to persisted), unsaved-changes confirmation on close/navigation, and localStorage draft persistence. Save is a React 19 action (`useActionState`): the action performs the API call, returns `{error}` for inline display, and on success updates the persisted snapshot, clears the localStorage draft, and invalidates the section's query.

This implements PRD §7's global editing principle (explicit save, dirty badge, "Show diff" toggle, discard, navigation guard) exactly once.

### Styling

Nocturne tokens from `reference/nocturne-styles.css` mapped into a Tailwind v4 `@theme` block (`--color-bg: #161826`, `--color-surface: #232532`, `--color-accent: #9184d9`, accent/neutral ramps, radii, spacing, Inter font). Components use Tailwind utilities against those theme values; the design screens' inline styles and `x-dc`/`sc-*` templating are a preview DSL — translate the visual intent, never copy the markup. Dark theme only, per the design.

## 6. Sections — behavior and design notes

Behavior per PRD §7.1–§7.5; layout per the corresponding design screen. App shell: fixed 240 px sidebar (brand lockup "Card Forge / local · offline", five nav links with active state), scrollable main area. Default route `/` → `/factions`.

### Factions (`/factions`)
Table (name, DLC tag, truncated description, updated, row actions history/edit/delete). Create/edit dialog: name, DLC segmented control (the three fixed DLCs), description textarea with "Generate with Claude" button (spinner + cancel while pending; result lands in form state only). Diff panel per `useDraftForm`. Delete confirmation; delete disabled with tooltip when referenced by batch items. History dialog: revisions newest-first (source badge manual/claude/rollback, timestamp, preview), expandable to side-by-side diff against current state, Restore writes a new `rollback` revision (PRD §7.1). Revision `source` = `claude` only when the saved description equals the last generation unmodified. No revision written when the saved state equals the latest revision.

### Card Types (`/card-types`)
Three-column card grid: template thumbnail (or dashed "no template" placeholder), dimensions label, aspect-ratio warning when deviating > 2 % from 816:1104, name, description, file-id tag or "not uploaded". Create/edit dialog: name, description, constraints, template dropzone (PNG/JPEG, dimensions shown after upload), OpenAI file panel (id + copy button, Upload/Re-upload button, disabled until a template exists). Replacing the template clears the stale `openai_file_id` and requires re-upload (PRD §7.2, §10). Template upload is staged in the form and sent with Save (multipart), consistent with explicit-save.

### Test Generation (`/test-generation`)
Setup panel: faction select, card-type select (options without a file id labeled and warned inline with a link to Card Types), Draft/Final segmented control with per-image cost estimate, read-only assembled prompt preview with "Edit prompt" toggle for a one-off override, Generate button (disabled without file id; hint shows mode, fixed size, ~2 min expectation). Draft and Final share `size`; only `quality` differs (PRD §7.3). Result and history: expandable rows — thumbnail, faction × card type, mode badge, timestamp, duration, cost; expanded: large image, prompt, Download PNG. Every image captioned with cost; test generations also show duration. Running session cost total above the list.

### Batch Processing (`/batches`)
Three views. **List:** batch rows (mode tag, status pill, progress bar, done/failed/total counts, cost or estimated cost, created date) + New Batch. **New-batch wizard**, two steps in `batchWizardStore`: (1) Scope — factions multi-select grouped by DLC with group and select-all toggles, card-type checkboxes (no-file types disabled with warning), Draft/Final mode for the whole batch, live request count, Preview button disabled at zero; (2) Preview — prominent mode banner (draft: neutral; final: amber warning), line count, estimated cost (per-image estimate table, labeled "estimate"), scrollable read-only JSONL viewer with highlighted `custom_id`s, 1,000-line hard cap note, explicit "Submit batch to OpenAI" button. Nothing reaches OpenAI before this click (PRD §7.4). **Detail:** progress header (counts, bar, cost), Refresh + Cancel (confirmation: "in-flight requests stop, completed items are kept") while live, Download-all ZIP when completed; item grid — thumbnail with status tag, `custom_id`, per-item cost caption ("$0.00 (not billed)" for failed), error text for failed lines, per-item download. Batch summary shows total cost, actual vs pre-submit estimate, and total duration (`submitted_at → completed_at`). ZIP streamed by Go `archive/zip`.

### Settings (`/settings`)
Two cards (OpenAI, Claude CLI) + save row, per the Settings screen. API key masked with Replace flow (write-only). Model, image size, input fidelity; draft quality select constrained to {low, medium}, final quality to {medium, high} — a design-screen guardrail adopted over the PRD's unconstrained values (defaults `low`/`high` per PRD). Claude binary path. "Test OpenAI connection" (`GET /v1/models`) and "Test Claude CLI" (`claude -p "Reply with OK"`) buttons with inline results. First launch with empty key: UI prompts for it.

### Resolved PRD↔design deltas

- Quality selects constrained (above) — design wins.
- Batch cancel semantics: completed items kept — design wins (PRD silent).
- Login mockup at repo root: dead, removed (PRD: no auth).

## 7. Error handling

PRD §10 in full: OpenAI `error.message` + request ID in UI; no auto-retry of `image_generation_user_error`; 429/5xx retried ×3 with backoff for sync generation only; org-verification error gets a dedicated message linking to the OpenAI console; missing/failing Claude CLI yields an actionable message ("claude CLI not found in PATH — set path in Settings") with stderr excerpt in a toast; stale file ids blocked at batch preview; 1,000-line batch cap with clear error; batch poller resumes from DB state on startup. Frontend: load/save failures render inline error banners; failed generations show the error in place of the image.

## 8. Testing

**Go** — table-driven, against real temp SQLite files:
- `store`: CRUD + revision-snapshot rules (no-op saves write nothing; rollback chains preserved).
- `api`: httptest handler tests per section, including key masking and multipart card-type create.
- `openai`: client against `httptest.Server` fakes — retry behavior, error extraction, request shape (image edits body, batch create).
- `batchpoller`: fake OpenAI end-to-end — submit → poll → complete → PNGs on disk, costs computed; restart-recovery case.
- `prompt`, `pricing`: unit tests (assembly, slugify uniqueness, token→USD, batch 50 % rate).
- `jobs`: lifecycle incl. cancel and timeout.

**Web** — Vitest + RTL + MSW:
- `useDraftForm`: dirty tracking, diff rows, discard, localStorage persistence/cleanup, navigation guard.
- Per page: primary flows (create/edit/save, generate-and-poll to done and to failed, wizard scope→preview→submit, history restore).
- Polling hooks: interval active while pending, stops at terminal.

## 9. Milestones (build order, one implementation-plan phase each)

1. **Skeleton** — repo scaffolding, Go server + migration 0001 + settings CRUD (test buttons stubbed), React shell with sidebar + routing, Tailwind theme, Settings page end-to-end. *Remove leftover login mockup.*
2. **Factions** — migration 0002, CRUD + revisions/rollback, Claude CLI integration + jobs registry, `useDraftForm` + DiffPanel (built here, reused after), real "Test Claude CLI" button.
3. **Card Types** — migration 0003, CRUD + template upload + OpenAI Files integration, real "Test OpenAI connection" button.
4. **Test Generation** — migration 0004, prompt assembly, images/edits call + generation records, polling UI + history.
5. **Batch** — migration 0005, JSONL build/preview, submit, batchpoller, results download + ZIP, batch UI (list/wizard/detail).
6. **Polish** — cost estimates everywhere, validation, error states, dark-theme pass, acceptance-criteria sweep (PRD §12).

## 10. Acceptance criteria

PRD §12 verbatim — the checklist is the definition of done for the whole project.
