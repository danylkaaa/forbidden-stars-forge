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

## Built-in card types

The server creates the card types `combat`, `events`, `upgrade`, and the
back types `combat back`, `events back`, `upgrade back` on startup if they
are missing. Back types come with a prefilled card-back prompt and a plain
chroma-green template at the combat template's size; press **Upload to
OpenAI** on each back type once, then generate backs in Faction Lab. They always appear first and cannot be
deleted or renamed; their description, constraints, template and overlay
are editable.

## Library factions

In Library mode, **Factions** (`/factions?mode=library`) shows each faction's card
count per type against the deck size: 14 combat, 8 events, 5 upgrades.
Click a count to open the Library on that faction and tab. The Logo
column uploads a PNG/JPEG logo per faction; level 0 combat cards draw it
as the topmost layer in the top-left badge. Level 0 cards never show a
level requirement or resource price. Prompt editing
stays on the AI Image Generation Factions page.

## Library card types

Library → **Card Types** (`/subtypes`) has a tab per card type (Combat,
Events, Upgrades). Card Types for AI generation stay in AI Image
Generation mode.

**Text layout** (top of each tab) positions the title and the upper/lower
rules text for every card of that type (stored in `card_type_layouts`,
seeded from the last saved per-template layout). Cards cannot reposition
text themselves. Rules text centres itself in the visible parchment of its
panel unless **Automatic vertical position** is turned off (dragging it
vertically turns it off).

**Subtypes** are variants with an ordered stack of PNG overlays (bottom
first; new uploads go on top, ↑/↓ reorders). In the card editor, pick a
subtype to render its stack instead of the card type overlay. Combat has
built-in subtypes **Level 0** and **Level 1+** (created on startup, cannot
be renamed or deleted); combat cards without a chosen subtype use the one
matching their level. A subtype with no overlays falls back to the card
type overlay. Card types no longer have their own overlay: overlays come only from
subtypes. In AI Image Generation, **Card preview** (Faction Lab results
and every image lightbox) shows an image assembled as a card instead.

**Edit positions** on a subtype places its overlay-bound
layers: the resource icon stack (guns, shields, morale in one column; set
**Icon size** and **Icon spacing**), plus the faction logo square at level 0,
or the level and resource price at levels 1–3.

Both editors preview a demo card for any faction, level and price, on
that faction's chosen combat template (or, if none is chosen, its newest
combat image): drag a
box to move it, its corner to resize; ⌘Z / Ctrl+Z undoes and ⇧⌘Z redoes.
Fonts, colours, left alignment and plain resource icons are fixed. The
resource cog comes from the overlay.

Card layer order, bottom first: card artwork (inside the art window),
generated template image, overlays, parchment panels, text and icons,
bottom decoration. Artwork shows only where the template is transparent.

## Workspace modes

Use the top navbar to switch between **AI Image Generation** (Faction Lab,
Generations, batches, and API settings) and **Library**
(the card library). Factions and Card Types are available in
both modes. Shared pages retain library mode in their URL for reloads and
browser history. On narrow screens, section links appear below the navbar.

## Assemble battle cards

Open **Library** (`/assemble`) and pick a faction. The gear button (top
left) opens **Card templates** (preview with the demo card at any level
or one of the faction's cards; **Favourites only** filters images): for each faction and tab (Combat, Events,
Upgrades) choose the finished generated image (Faction Lab or batch) every
card is assembled on. Options render as demo cards. Choices are stored in
SQLite (`assembly_templates`).

The library shows the deck's **Card back** first (click it to choose one
on the settings' **Back** side, or **Generate** opens Faction Lab with the
back type), then every card of the faction per tab. The cube button on a
rendered card (also on the editor preview) opens a 3D preview with the
front and the deck back: drag to turn it, scroll to zoom, **Flip**, Esc. Combat cards render
complete (frame, overlay, resources, title, rules text, parchment panels,
bottom decoration); events and upgrades show the template with their text
until their renderer exists. **Edit in Faction Lab** opens the template's
generation in Faction Lab for area edits.

**Import JSON** (top right of the Library) opens the card importer: paste
or choose a UTF-8 file shaped `{"cards": [ … ]}`; each card needs
`faction_id`, `name`, `category` and that category's fields (the dialog
lists them, links an example, and shows every validation error before
anything is posted to `/api/cards/import`; one bad card imports none).

Tick cards (checkbox at a tile's top left, or **Select all**) to
**Download PNGs (zip)** of the rendered cards or **Delete** them after a
confirmation (`POST /api/cards/delete`, all or nothing, artwork removed).

**New … card** (top right of the Library) opens an empty form for the
selected faction and tab (`/assemble/cards/new`); combat cards preview
live on the faction's template. **Create card** saves it and opens a
combat card in its editor (add artwork there) or returns to the tab.

Click a combat card to open its editor (`/assemble/cards/:id`): edit text
and resources, add PNG/JPEG artwork (up to 20 MiB) placed in the frame's
art window. Click the artwork on the preview (or **Select artwork to move**)
to select it, then drag to move and scroll to zoom. Enter (or a click
elsewhere) applies the move as one undo step; Esc puts the artwork back. The scale and offset fields also work. **Save** stores card text and artwork position together
(⌘Z undoes artwork moves). Unsaved drafts are kept in this browser.
Artwork chosen on the new card form is uploaded when the card is created.
`(B)`, `(S)`, `(M)` insert boltgun, shield and morale icons; `[B]` and `[S]`
are boxed versions. Morale is never boxed (older `[M]` renders as `(M)`).
`**Italic text**` formats keywords. **Download PNG** exports at the
overlay's native resolution.

Combat rules use `web/src/images/combat/background.png` and, when lower
text is present, `foreground.png`. Panels fit the actual wrapped text and
move upward as more space is needed. Rules text is left aligned and vertically
centred in the visible parchment (below the panel's top border or the
divider bar, above the divider or the bottom decoration) using visible
font/icon bounds. All three textures span the full card width.
`bottom.png` stays anchored to every combat card's bottom edge.

In Faction Lab, **Card preview** above a finished run assembles it as a
card with the demo card or one of the faction's combat cards (its text,
artwork, level subtype and logo), to judge the image as a frame.
