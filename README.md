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
