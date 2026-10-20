# FAQ

## Getting started

### How do I run Card Forge?

Run `make dev-server` (the API on port 8080, data in SQLite) and `make dev-web`
(the app on http://localhost:5173). For a single binary, run `make build`, then
`./bin/cardforge`, and open http://localhost:8080.

### Where do I put my OpenAI API key?

Under **AI Image Generation → Settings**. The `OPENAI_API_KEY` environment
variable overrides the stored key and is never written to the database.

### Where is my data stored?

In a SQLite database, `server/data/cardforge.db` by default. Set
`CARDFORGE_DB` to use another path. Uploaded and generated images are kept
next to it in `server/data/`.

### What are the two workspace modes?

The top bar switches between **AI Image Generation** (AI Lab, Image Types,
Assets and Settings) and **Library** (the cards themselves). **Print** has its
own page. Factions are available in both modes.

## Library and cards

### How do I see a faction's cards?

Open **Library** and pick a faction in the sidebar. Each tab (Combat, Events,
Upgrades, Base) shows the deck's **card back** first, then every card. The cube
button on a card opens a 3D preview with its back: drag to turn, scroll to zoom,
**Flip**, Esc to close.

### How do I create or edit a card?

**New … card** (top right of the Library) opens an empty form for the selected
faction and tab. Click a combat card to open its editor: change the text,
level, price and resources, and add PNG or JPEG artwork (up to 20 MiB). **Save**
stores the text and the artwork position together. Unsaved drafts are kept in
your browser.

### How do I move or zoom the artwork?

Click the artwork on the preview (or **Select artwork to move**), then drag to
move and scroll to zoom. Enter, or a click elsewhere, applies the move as one
undo step; Esc puts it back. ⌘Z / Ctrl+Z undoes and ⇧⌘Z redoes.

### How do I write icons and formatting in rules text?

- `(B)`, `(S)`, `(M)`: boltgun, shield and morale icons.
- `[B]`, `[S]`: boxed boltgun and shield. Morale is never boxed.
- `{B}`, `{S}`, `{M}`: the icons without a box.
- `**text**`: italic keywords.

### Can I import many cards at once?

Yes. **Import JSON** (top right of the Library) takes a pasted or uploaded
UTF-8 file shaped `{"cards": [ … ]}`. Each card needs `faction_id`, `name`,
`category` and that category's fields; the dialog lists them and shows every
validation error before importing. One bad card imports none.

### How do I download or delete several cards?

Tick cards (the checkbox at a card's top left, or **Select all**), then
**Download PNGs (zip)** or **Delete**. Deleting asks for confirmation and also
removes the cards' artwork.

## Templates and layout

### What is a card template?

The finished generated image every card of a faction and tab is assembled on.
The gear button at the top left of the Library opens **Card templates**, where
you choose it per faction and tab. Options are shown as demo cards.

### How are the layers of a combat card stacked?

From the bottom: artwork (inside the art window), the generated template image,
overlays, parchment panels, text and icons, and the bottom decoration. Artwork
only shows where the template is transparent.

### How do I move the title, text or resource icons?

**Library → Card Types** has a tab per card type. **Text layout** places the
title and the rules text for every card of that type; cards cannot move text
themselves. Rules text centres itself in the visible parchment unless
**Automatic vertical position** is off. **Edit positions** on a subtype places
the resource icon column, the faction logo at level 0, and the level and price
at levels 1–3. Drag a box to move it and its corner to resize it.

### What are subtypes?

Variants of a card type with their own stack of PNG overlays, bottom first.
Combat has the built-in subtypes **Level 0** and **Level 1+**; a combat card
without a chosen subtype uses the one matching its level.

### What are the built-in card types?

`combat`, `events` and `upgrade`, plus their back types. They are created on
startup, always listed first, and cannot be deleted or renamed; their
description, constraints and template stay editable.

## AI image generation

### How do I generate a card frame or a card back?

Open **AI Lab**, pick a faction and an image type, check the assembled prompt
and press **Generate**. **Draft** is cheaper, **Final** is full quality. Use a
result with **Use for faction**. **Card preview** shows the result assembled as
a card, so you can judge it as a frame.

### Where do I edit a faction's style?

In **AI Lab**, on the **Faction** tab: primary colour, texture and
description; **Save to faction** keeps them. **Edit with Claude** rewrites a text with the `claude`
command-line tool, if you have it installed.

## Faction card

### What size is the faction card?

258 × 152 mm after cutting, printed with 3 mm of bleed on every edge
(264 × 158 mm, 3118 × 1866 px at 300 dpi). Keep text and important art 3 mm
inside the cut line.

### How do I see the cut line and the safe area?

Tick **Show safe area** in the top bar. Red is where the card is cut; green is
the safe area. The background fills the bleed beyond the red line.

### How do I fill in a faction card?

**Library → Base** on a faction: the title, faction rule, unit names and stats,
starting forces, story, signature and objectives. Unit rows also take a 3D
model (STL) that is rendered as the unit's icon.

### How do I change the faction card layout?

**Card Types → Base** opens the faction card layout editor. Drag an area to
move it and its corner to resize it; the layout is shared by every faction.

## Printing

### How do I print cards?

Open **Print**, select cards or whole factions, choose the paper and spacing,
and press **Download PDF**. Print it at 100% scale, not "fit to page".

### How are card backs printed?

On the reverse of each sheet, mirrored so that each back lands behind its front
when you flip the sheet on its long or short edge. You can also print each back
next to its front, or save fronts and backs as two files.

### Where are the cutting lines?

For ordinary cards, just outside each card by the **Cut tolerance** (a share of
the card's size), so a slightly crooked cut still leaves the whole card. For
faction cards, on the cut edge itself: 258 × 152 mm apart, with the bleed beyond
them.

### Why is there image beyond the cutting lines?

That is bleed: extra background printed past the cut, so a cut that misses by a
little shows image, not white paper.

## Rights

### Can I share or sell the cards I make?

The app's code is MIT licensed, but the game, its factions, names and artwork,
and the assets in this repository belong to their owners. Ask them for
permission before you publish, print for others or sell anything made with it.
See [Assets and rights](../README.md#assets-and-rights).
