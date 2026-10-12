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

## Workspace modes

Use the top navbar to switch between **AI Image Generation** (Faction Lab,
Generations, batches, and API settings) and **Assemble
Library** (Assemble and Cards). Factions and Card Types are available in
both modes. Shared pages retain library mode in their URL for reloads and
browser history. On narrow screens, section links appear below the navbar.

## Assemble battle cards

Open **Assemble** (`/assemble`), choose a combat card and a finished image
(from Faction Lab or a batch), and select an overlay. The default overlay
comes from the image's card type. Edit card text/resources and adjust each
text or icon layer's start position, font size, wrapping width, and spacing.
`(B)`, `(S)`, and `(M)` insert non-boxed boltgun, shield, and morale
icons; `[B]`, `[S]`, and `[M]` insert bordered box versions. The symbol picker
inserts these tokens at the text cursor. The font provides circle glyphs
for non-boxed boltgun/shield; non-boxed morale removes the font's outline
box. Older long-form tokens remain supported. Resource columns choose
their glyph independently. `**Italic text**` formats keywords; single asterisks are also supported.

**Save to card** saves content to SQLite. Upload PNG/JPEG artwork (up to
20 MiB), or choose a generated image. Enable **Edit artwork with mouse**
to drag artwork and scroll to zoom around the cursor. **Save assembly**
stores a card-owned copy of the artwork, its scale/position, and overlay choice
in SQLite. Text/icon layout is shared by the combination of generated
image template, faction, and card type, so changing positions applies to
every card using that combination. Artwork transforms and card text stay
per card. Uploaded templates have their own layout. Unfinished drafts are
retained in this browser.
**Download PNG** exports the preview at the overlay's native resolution;
without an overlay, uploads use 1140 × 1480 and generated images use their
original resolution.

Combat rules use `web/src/images/combat/background.png` and, when lower
text is present, `foreground.png`. Panels fit the actual wrapped text and
move upward as more space is needed. Rules text defaults to left alignment
and is vertically centered using visible font/icon bounds and equal panel
padding. All three textures span the full card width. `bottom.png` stays anchored to every
combat card's bottom edge. Turn off **Automatic vertical position** for
an upper/lower text block to pin its start manually; reset positions to
restore automatic placement.
