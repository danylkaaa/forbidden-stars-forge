# PRD: Card Forge — Local Card Art Generation Tool

## 1. Overview

Card Forge is a **local-only web application** for managing and generating card artwork for a homemade *Forbidden Stars* (Warhammer 40K) board game expansion. It manages factions and card type templates, generates faction descriptions via a local `claude -p` call, and produces card artwork through the OpenAI Image API — both as single test generations and as bulk jobs via the OpenAI Batch API.

**Stack:** Go backend + React frontend. Runs on localhost. Single user. No auth.

## 2. Goals

- Manage 12+ factions and 3 card types (combat, schema, upgrade) with room to grow.
- Generate consistent card artwork by editing a chromakey template image via `POST /v1/images/edits`.
- Test a single faction × card type generation interactively before committing to a batch.
- Build, preview, approve, and submit OpenAI Batch API jobs; retrieve and store the resulting images.

## 3. Non-Goals

- No multi-user support, auth, or deployment beyond localhost.
- No image editing/compositing inside the app (generated PNGs are downloaded as-is).
- No card text layout/rendering — this tool produces artwork only.

## 4. Architecture

```
┌─────────────┐     HTTP/JSON      ┌──────────────────┐
│  React SPA  │ ◄────────────────► │   Go backend     │
│  (Vite)     │                    │   (net/http or   │
└─────────────┘                    │    chi router)   │
                                   ├──────────────────┤
                                   │ SQLite (modernc  │
                                   │ .org/sqlite, no  │
                                   │ CGO)             │
                                   ├──────────────────┤
                                   │ Local FS storage │
                                   │ ./data/          │
                                   │   templates/     │
                                   │   generated/     │
                                   │   batches/       │
                                   └──────────────────┘
                                      │            │
                              ┌───────┘            └────────┐
                              ▼                             ▼
                     OpenAI API (HTTPS)          `claude -p` (local CLI
                     images/edits, files,         subprocess via os/exec)
                     batches
```

### 4.1 Backend

- **All external calls go through the backend — no exceptions.** The frontend never talks to OpenAI or the Claude CLI directly; it only calls `/api/*`. The OpenAI token exists solely server-side.
- **Async job pattern with polling.** Any endpoint that triggers an external call (Claude description generation, OpenAI test generation, batch submission) returns immediately with a job/record ID and status `pending`; the actual work runs in a background goroutine. The UI polls the corresponding `GET` endpoint (every 2s for sync-ish jobs, 60s for batches) until status is terminal (`done`/`failed`), then renders the result **and its cost**. No long-lived HTTP requests, no SSE/WebSocket needed (KISS).
- **Cost tracking.** Every OpenAI response's `usage` block (input/output token counts) is stored with the record. The backend converts tokens to USD via a configurable price table (`settings` key `price_table`, JSON; shipped with sensible defaults and clearly labeled as estimates). Costs are returned in poll responses and aggregated per batch.
- **Language:** Go 1.22+.
- **Router:** `chi` or stdlib `net/http` with `http.ServeMux` (Go 1.22 pattern routing). Keep it simple (KISS).
- **Storage:** SQLite via a pure-Go driver (`modernc.org/sqlite`) to avoid CGO. Single file `./data/cardforge.db`.
- **File storage:** uploaded template images and generated PNGs on local filesystem under `./data/`, paths referenced from DB.
- **OpenAI access:** API token read from config (see §6). All OpenAI calls happen server-side; the token never reaches the frontend.
- **Claude access:** shell out to the locally installed `claude` CLI: `claude -p "<prompt>"` via `os/exec` with a timeout (60s). Capture stdout as the generated description. Surface stderr on failure.
- **Static serving:** in production mode the Go binary serves the built React bundle (embed via `embed.FS` or serve `./web/dist`). In dev mode, Vite dev server proxies `/api` to the Go backend.

### 4.2 Frontend

- **Stack:** React 18 + Vite + TypeScript.
- **Styling:** any lightweight approach (Tailwind or CSS modules). Dark theme preferred.
- **State/data:** TanStack Query (react-query) for server state; no Redux.
- **Layout:** fixed left sidebar with sections (§7), main content area.

## 5. Data Model

```sql
-- enums stored as TEXT with CHECK constraints

CREATE TABLE factions (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL UNIQUE,
  description  TEXT NOT NULL DEFAULT '',
  dlc          TEXT NOT NULL CHECK (dlc IN ('Galaxy in Flames', 'Symphony of War', 'Darkest Dawn')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE faction_revisions (    -- append-only history for rollback
  id           INTEGER PRIMARY KEY,
  faction_id   INTEGER NOT NULL REFERENCES factions(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  dlc          TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('manual','claude','rollback')),  -- what produced this state
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE card_types (
  id                 INTEGER PRIMARY KEY,
  name               TEXT NOT NULL UNIQUE,        -- 'combat' | 'schema' | 'upgrade' (user-creatable, not hardcoded)
  description        TEXT NOT NULL DEFAULT '',    -- what this card type is, style notes
  constraints        TEXT NOT NULL DEFAULT '',    -- where to draw what: zones, chromakey color, do-not-touch areas
  template_path      TEXT,                        -- local path to uploaded chromakey template PNG
  openai_file_id     TEXT,                        -- OpenAI Files API id after upload (nullable until uploaded)
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE generations (          -- single test generations (section 4 of UI)
  id             INTEGER PRIMARY KEY,
  faction_id     INTEGER NOT NULL REFERENCES factions(id),
  card_type_id   INTEGER NOT NULL REFERENCES card_types(id),
  mode           TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft','final')),
  prompt         TEXT NOT NULL,                   -- final assembled prompt sent to OpenAI
  status         TEXT NOT NULL CHECK (status IN ('pending','done','failed')),
  image_path     TEXT,                            -- local path of resulting PNG
  input_tokens   INTEGER,                         -- from OpenAI usage block
  output_tokens  INTEGER,
  cost_usd       REAL,                            -- computed from price table at completion time
  duration_ms    INTEGER,                         -- wall time of the OpenAI call (request sent → response received)
  error          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE batches (
  id               INTEGER PRIMARY KEY,
  openai_batch_id  TEXT,                          -- null until submitted
  mode             TEXT NOT NULL DEFAULT 'draft' CHECK (mode IN ('draft','final')),
  status           TEXT NOT NULL CHECK (status IN ('created','submitted','in_progress','completed','failed','cancelled')),
  jsonl_path       TEXT NOT NULL,                 -- local copy of the request JSONL
  output_path      TEXT,                          -- local copy of result JSONL after download
  total_cost_usd   REAL,                          -- aggregated from item usage after completion
  submitted_at     TEXT,                          -- when the batch was sent to OpenAI
  completed_at     TEXT,                          -- terminal status reached (duration = completed_at - submitted_at)
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE batch_items (
  id             INTEGER PRIMARY KEY,
  batch_id       INTEGER NOT NULL REFERENCES batches(id),
  faction_id     INTEGER NOT NULL REFERENCES factions(id),
  card_type_id   INTEGER NOT NULL REFERENCES card_types(id),
  custom_id      TEXT NOT NULL,                   -- '<faction-slug>__<cardtype-slug>'
  status         TEXT NOT NULL CHECK (status IN ('pending','done','failed')),
  image_path     TEXT,
  input_tokens   INTEGER,
  output_tokens  INTEGER,
  cost_usd       REAL,
  error          TEXT
);

CREATE TABLE settings (             -- simple key/value config
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
-- keys: openai_api_key, openai_model (default 'gpt-image-2'),
--       image_size (default '816x1104'),
--       draft_quality (default 'low'), final_quality (default 'high'),
--       input_fidelity (default 'high'), claude_binary (default 'claude'),
--       price_table (JSON: per-model input/output token prices, editable)
```

## 6. Configuration

- All settings live in the `settings` table, editable via a **Settings** UI section.
- On first launch, if `openai_api_key` is empty, the UI prompts for it.
- `OPENAI_API_KEY` env var, if set, overrides the DB value (never written back to DB).
- The API key is write-only in the UI: display masked (`sk-...****`), allow replace, never return the full key from the API.

## 7. UI Sections (Sidebar)

**Global editing principle — explicit save only.** No form in the app persists anything until the user clicks **Save**. This includes AI-generated content: a Claude-generated description exists only in the form's local state until saved. Rules for all edit forms:

- All edits (typed or AI-generated) live in client-side form state; no autosave, no save-on-blur, no PUT calls on field change.
- Dirty state is visually indicated (e.g., "Unsaved changes" badge + enabled Save button).
- **Pre-save diff view:** while a form is dirty, a "Show diff" toggle (or a persistent panel below the form) renders a **side-by-side, git-style diff** for every changed text field: last persisted value on the left, current form value on the right, with word-level highlighting (green additions, red removals) and per-field grouping. Non-text changes (select fields like DLC, file replacements) are listed as `before → after` rows in the same panel. This applies to all edit forms with text fields — most importantly Faction `description` (so a Claude generation can be reviewed against the previous text before committing) and Card Type `description` / `constraints`.
  - Implementation note: use a small text-diff library (e.g., `diff` / `diff-match-patch` on the frontend); diffing is purely client-side — the "before" value is already loaded with the form.
  - The Save button sits next to the diff so review → save is one motion; Discard is equally reachable from the diff view.
- **Discard** button reverts the form to the last persisted state.
- Navigating away or closing the form with unsaved changes prompts a confirmation ("You have unsaved changes — discard?").
- Server-side snapshots/revisions are written only as part of a successful Save — never during generation or editing.

### 7.1 Factions

- Table of factions: name, DLC badge, description preview (truncated), updated_at.
- **Create/Edit form:**
  - `name` — text, required, unique.
  - `dlc` — select, exactly one of: **Galaxy in Flames**, **Symphony of War**, **Darkest Dawn**.
  - `description` — multiline textarea.
  - Button **"Generate with Claude"** next to the description field:
    - Calls `POST /api/factions/generate-description` with `{name, dlc}` → returns `{job_id, status: "pending"}` immediately; the backend runs `claude -p` in a goroutine (§8.1).
    - The UI polls `GET /api/jobs/{job_id}` every 2s until `done`/`failed`; the poll response includes the generated text and job duration.
    - On `done`, the description populates the textarea **in form state only** — nothing is persisted, no revision is written. The user can edit, regenerate, or discard it; it becomes durable only on explicit Save (which then records a revision with `source = 'claude'` if the description came from the last generation unmodified, or `source = 'manual'` if edited afterwards).
    - Show a spinner and a cancel option (cancel kills the CLI subprocess); handle CLI errors gracefully (toast with stderr excerpt).
- Delete with confirmation (block deletion if faction is referenced by batch items).
- **Revision history & rollback:**
  - Every successful save of a faction (create or update) writes an append-only snapshot to `faction_revisions` capturing the full state (`name`, `description`, `dlc`) with a `source` tag: `manual` (user edit), `claude` (saved right after a Claude generation), or `rollback`.
  - "History" button on each faction opens a panel listing revisions (timestamp, source badge, description preview) newest first.
  - Selecting a revision shows a side-by-side diff against the current state (at minimum: highlighted description diff; name/dlc shown as before → after).
  - **Restore** button applies the selected revision to the faction and records the action as a NEW revision with `source = 'rollback'` — history is never rewritten or deleted, so a rollback can itself be rolled back.
  - Snapshots are written only when the saved state actually differs from the latest revision (no duplicate entries on no-op saves).
  - Retention: keep all revisions (single-user local tool, text-only rows — size is a non-issue).

### 7.2 Card Types

- List of card types (initially the user will create: **combat**, **schema**, **upgrade** — but names are free-form, not hardcoded).
- **Create/Edit form:**
  - `name` — text, required, unique.
  - `description` — multiline: what the card type is, overall aesthetic.
  - `constraints` — multiline: layout constraints in plain language (e.g., "fill the green chromakey area with the illustration; do not modify the parchment banner at the top; keep all panels flat and rigid; light-colored text zones").
  - **Template upload** — PNG/JPEG file input with preview. Stored under `./data/templates/`. Show image dimensions after upload and warn if aspect ratio deviates from 816:1104 by more than 2%.
  - Button **"Upload to OpenAI"** — uploads the template via OpenAI Files API (`purpose: "vision"`), stores returned `file_id` in `openai_file_id`, shows the ID with a copy button. Re-upload replaces the ID. If the template image is changed, clear the stale `file_id` and require re-upload.

### 7.3 Test Generation

- Two selects: **Faction** and **Card Type** (must have `openai_file_id` set; otherwise show inline warning with link to Card Types).
- **Mode toggle: Draft / Final** — defaults to **Draft**. Draft and Final use the SAME `size` (so composition and framing match the final output) but different `quality`: `draft_quality` (default `low`) vs `final_quality` (default `high`). Show the estimated per-image cost next to the toggle so the difference is visible (~$0.01 draft vs ~$0.19 final at defaults).
- **Prompt preview** — read-only, assembled from the prompt template (§8.2). An "edit prompt" toggle allows one-off manual overrides before sending.
- **Generate** button → `POST /api/generate` → returns the generation record with `status: "pending"` immediately; the backend calls OpenAI `POST /v1/images/edits` in a goroutine:
  - `model`: from settings (default `gpt-image-2`)
  - `image`: `[{"file_id": "<card_type.openai_file_id>"}]`
  - `prompt`: assembled prompt
  - `size`: from settings (default `816x1104`) — identical for both modes
  - `quality`: resolved from mode (`draft_quality` or `final_quality`)
  - `input_fidelity`: from settings
  - `output_format`: `png`
- The UI polls `GET /api/generations/{id}` every 2s (generation can take up to ~2 minutes). On `done` the poll response includes `image_path` (rendered via the image endpoint), token usage, **`cost_usd`, and `duration_ms`** — every rendered image is captioned with both ("$0.012 · 43s"). On `failed` it includes the error.
- The backend records the wall time of the OpenAI call (`duration_ms`), decodes `b64_json`, saves the PNG under `./data/generated/`, extracts the `usage` block, computes `cost_usd` from the price table, and persists all of it before flipping status to `done`.
- History list of past test generations (thumbnail, faction, card type, **draft/final badge**, **cost + duration**, timestamp, prompt on expand) with a running total for the session.

### 7.4 Batch Processing

- **Step 1 — Select scope:** multi-select factions (with "all" toggle, grouped by DLC) × multi-select card types, plus a **Draft / Final mode selector** (defaults to Draft). Mode applies to the whole batch (one `quality` for all lines). Show computed request count (factions × card types). Validate every selected card type has `openai_file_id`.
- **Step 2 — Preview JSONL:** backend builds the JSONL (§8.3) with the mode-resolved `quality` and returns it; UI renders it in a scrollable, syntax-highlighted, read-only viewer with a per-line count and estimated cost hint (requests × rough per-image price by quality; hardcode a small lookup table, clearly labeled "estimate"). Display a prominent mode banner ("DRAFT batch — low quality" / "FINAL batch — high quality") so a final batch is never submitted by accident.
- **Step 3 — Approve & Submit:** explicit "Submit batch to OpenAI" button. Backend:
  1. Saves JSONL to `./data/batches/<id>/requests.jsonl`.
  2. Uploads it via Files API (`purpose: "batch"`).
  3. Creates the batch: `POST /v1/batches` with `endpoint: "/v1/images/edits"`, `completion_window: "24h"`.
  4. Stores `openai_batch_id`, sets status `submitted`.
- **Step 4 — Monitor:** batch list page with status. A background goroutine polls `GET /v1/batches/{id}` every 60s for non-terminal batches (also poll on page load / manual "Refresh" button). Show `request_counts` progress (completed/failed/total).
- **Step 5 — Results:** when `completed`, backend downloads `output_file_id` content, parses each line, decodes `b64_json`, saves PNGs to `./data/batches/<id>/<custom_id>.png`, extracts per-line `usage`, computes per-item `cost_usd` and the batch `total_cost_usd` (batch pricing = 50% of the price table rates), and updates `batch_items`. UI shows a result grid where **every thumbnail is captioned with its cost**, plus a batch summary header with **total cost and total batch duration** (`submitted_at → completed_at`, e.g. "36 images · $0.41 · 2h 14m"). Note: OpenAI batch output does not expose per-request wall time, so duration is reported at the batch level only; per-item metadata is cost + tokens. Download-all as ZIP, per-item error display for failed lines, and the **actual total cost vs the pre-submit estimate**. Also download `error_file_id` if present and surface failures.
- Cancel button for in-flight batches (`POST /v1/batches/{id}/cancel`) with confirmation.

### 7.5 Settings

- OpenAI API key (masked), model, image size, draft quality, final quality, input fidelity, claude binary path.
- "Test OpenAI connection" button (`GET /v1/models` behind the scenes) and "Test Claude CLI" button (runs `claude -p "Reply with OK"`).

## 8. Prompt Assembly

### 8.1 Faction description prompt (Claude CLI)

Backend template (single string passed to `claude -p`):

```
You are helping design a homemade expansion for the board game Forbidden Stars
(Warhammer 40K universe). Write an English description of the visual aesthetic
of the following faction for use in AI image-generation prompts.

Faction name: {{name}}
Expansion (DLC): {{dlc}}

Describe: color palette, materials and textures, iconography, mood, and
distinctive visual motifs. 80-140 words. Output only the description text,
no preamble, no markdown.
```

### 8.2 Image edit prompt (per card)

Assembled as:

```
Edit this card template image. {{card_type.constraints}}

Card type: {{card_type.name}} — {{card_type.description}}

Faction aesthetic: {{faction.description}}

Photorealistic style. Keep all important elements at least 6 mm from the
image edges; background artwork must extend to the full bleed edge.
Do not add any text or lettering.
```

(The exact wording lives in one Go constant / template file so it is easy to iterate on.)

### 8.3 Batch JSONL line format

One line per faction × card type combination:

```json
{"custom_id": "{{faction_slug}}__{{card_type_slug}}", "method": "POST", "url": "/v1/images/edits", "body": {"model": "gpt-image-2", "image": [{"file_id": "{{card_type.openai_file_id}}"}], "prompt": "{{assembled prompt}}", "size": "816x1104", "quality": "{{mode_quality}}", "input_fidelity": "high", "output_format": "png", "n": 1}}
```

`{{mode_quality}}` resolves from the batch mode: `draft_quality` setting for draft batches, `final_quality` for final batches. `size` never changes between modes.

Constraints:
- `custom_id` must be unique within the batch (slugify: lowercase, non-alphanumeric → `_`).
- All lines in one batch must use the same model.
- One endpoint per batch (`/v1/images/edits`).

## 9. API Endpoints (Backend)

```
GET    /api/factions
POST   /api/factions
PUT    /api/factions/{id}
DELETE /api/factions/{id}
POST   /api/factions/generate-description      {name, dlc} → {job_id, status}
GET    /api/jobs/{job_id}                       → {status, result?, error?, duration_ms}   (poll, 2s)
GET    /api/factions/{id}/revisions             (newest first)
POST   /api/factions/{id}/revisions/{revId}/restore   → updated faction (writes 'rollback' revision)

GET    /api/card-types
POST   /api/card-types                          (multipart: fields + template file)
PUT    /api/card-types/{id}
DELETE /api/card-types/{id}
POST   /api/card-types/{id}/upload-to-openai    → {openai_file_id}

POST   /api/generate                            {faction_id, card_type_id, mode, prompt_override?} → {id, status: "pending"}
GET    /api/generations/{id}                    → {status, image?, usage?, cost_usd?, duration_ms?, error?}   (poll, 2s)
GET    /api/generations                         (history, incl. cost)
GET    /api/generations/{id}/image              (serves PNG)

POST   /api/batches/preview                     {faction_ids[], card_type_ids[], mode} → {jsonl, count, est_cost}
POST   /api/batches                             {faction_ids[], card_type_ids[], mode} → batch record (submits)
GET    /api/batches
GET    /api/batches/{id}                        → {status, request_counts, total_cost_usd?, submitted_at, completed_at?, items[]}   (poll, 60s)
POST   /api/batches/{id}/cancel
GET    /api/batches/{id}/download               (ZIP of PNGs)

GET    /api/settings                            (key masked)
PUT    /api/settings
POST   /api/settings/test-openai
POST   /api/settings/test-claude
```

## 10. Error Handling & Edge Cases

- **OpenAI errors:** surface `error.message` and request ID in the UI. Do not auto-retry `image_generation_user_error`; retry 429/5xx with exponential backoff (max 3 attempts) for sync generation only (batch handles its own retries).
- **Org verification:** if OpenAI returns a verification-required error, show a dedicated message linking to the OpenAI console.
- **Claude CLI missing/failing:** detect non-zero exit or binary-not-found, show actionable error ("claude CLI not found in PATH — set path in Settings").
- **Template changed after OpenAI upload:** stale `file_id` must be cleared (see §7.2) and batch preview must refuse card types without a current `file_id`.
- **Large JSONL:** at this scale (≤ a few hundred lines) no special handling; hard cap at 1,000 lines per batch with a clear error.
- **App restart during in-flight batch:** poller resumes from DB state on startup (any batch with non-terminal status re-enters the polling loop).

## 11. Milestones (suggested build order)

1. **Skeleton:** Go server + SQLite migrations + React app shell with sidebar routing + Settings CRUD.
2. **Factions:** CRUD + Claude CLI description generation.
3. **Card Types:** CRUD + template upload + OpenAI file upload.
4. **Test Generation:** prompt assembly + sync images/edits call + history.
5. **Batch:** preview → submit → poll → download results → result grid + ZIP export.
6. **Polish:** cost estimates, validation, error states, dark theme pass.

## 12. Acceptance Criteria

- [ ] Can create a faction with DLC selection; "Generate with Claude" fills the description from local `claude -p`; the result is editable before save.
- [ ] Nothing is persisted without an explicit Save click: Claude-generated descriptions, typed edits, and uploads staged in a form are all discarded if the user navigates away and confirms; a discarded generation leaves no trace in the DB or revision history.
- [ ] While a form is dirty, a side-by-side git-style diff shows persisted vs current values for all changed text fields (word-level highlighting), including immediately after a Claude generation and before Save.
- [ ] Every faction save creates a revision; the history panel shows revisions with a diff view, and restoring an older revision brings back its exact state while preserving full history (rollback of a rollback works).
- [ ] Can create the three card types with template image, description, and constraints; can push the template to OpenAI and see the `file_id`.
- [ ] Test Generation produces a PNG for a chosen faction × card type using `/v1/images/edits` with the template `file_id`, size 816×1104, and shows it in the UI.
- [ ] Draft/Final toggle works in both Test Generation and Batch: draft uses `draft_quality`, final uses `final_quality`, size is identical in both modes, and the active mode is clearly visible before any request is sent.
- [ ] Batch section shows the exact JSONL before submission; nothing is sent to OpenAI without explicit approval.
- [ ] After batch completion, all PNGs are downloadable individually and as ZIP; failed lines show their errors.
- [ ] API key is stored locally, masked in the UI, and never sent to the frontend in full.
- [ ] Everything works fully offline except calls to OpenAI and the local Claude CLI.
- [ ] The frontend makes zero direct calls to OpenAI or the Claude CLI — verified by the browser network tab showing only `/api/*` requests.
- [ ] All external operations follow the async pattern: POST returns immediately with `pending`, the UI polls to completion.
- [ ] Every generated image displayed anywhere in the UI (test result, history, batch result grid) is captioned with its cost; test generations additionally show call duration, and batches show total batch duration (submitted → completed). Claude CLI text generations are exempt from cost/duration display (local, no billing).