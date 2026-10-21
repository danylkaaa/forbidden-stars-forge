// Pure geometry of the faction card's designed elements: the front's unit table and the back's
// starting forces, letter, portrait and objectives. Nothing here touches a canvas.
import { CARD_SIZE, UNIT_SLOTS, type FactionCardData, type SlotKey } from '../model'
import type { FactionCardLayout } from '../layout'
import type { Box } from '../placeholders'

/* ---------- front: the unit table ---------- */
// Design units of the table: the artwork is drawn on a 1290-wide canvas and scaled onto the card.
export const TABLE = { x0: 40, y0: 130, w: 1100, cityTop: 185, firstTop: 408, step: 222, forgeExtra: 25, cardH: 122, forgeH: 42, fit: 0.85 } as const

// One line of the left rail: the city/factory line first, then the seven unit rows.
export type TableItem = { slot: SlotKey | null; top: number; cy: number; level: number; forge: number }

// A unit's command level; a unit without one (the bastion, or a gap) takes the previous line's level.
export function levelOf(tech: number | null | undefined, previous: number): number {
  return typeof tech === 'number' && Number.isFinite(tech) ? tech : previous
}

export function tableItems(data: Pick<FactionCardData, 'units'>): TableItem[] {
  const first = levelOf(data.units.bastion?.tech, 0)
  const items: TableItem[] = [{ slot: null, top: TABLE.cityTop, cy: TABLE.cityTop + TABLE.cardH / 2, level: first, forge: 0 }]
  let level = first, top: number = TABLE.firstTop
  UNIT_SLOTS.forEach(({ key }, i) => {
    const u = data.units[key], forge = key === 'bastion' ? 0 : Math.max(0, Math.floor(u?.forge ?? 0))
    level = levelOf(u?.tech, level)
    if (i > 0) top += TABLE.step + (items[i].forge > 0 ? TABLE.forgeExtra : 0)
    items.push({ slot: key, top, cy: top + TABLE.cardH / 2, level, forge })
  })
  return items
}

// Consecutive lines with the same command level share one pipe and one banner.
export function levelGroups(items: TableItem[]): { level: number; idx: number[] }[] {
  const groups: { level: number; idx: number[] }[] = []
  items.forEach((item, i) => {
    const last = groups.at(-1)
    if (last && last.level === item.level) last.idx.push(i)
    else groups.push({ level: item.level, idx: [i] })
  })
  return groups
}

// Where a group's banner sits: on the middle torch of an odd group, midway between the middle pair of an even one.
export function bannerCenter(items: TableItem[], idx: number[]): number {
  const n = idx.length, mid = items[idx[n >> 1]].cy
  return (n % 2 ? mid : (items[idx[(n >> 1) - 1]].cy + mid) / 2) + 5
}

export function tableBounds(items: TableItem[]): Box {
  const last = items.at(-1)!, bottom = last.top + (last.forge > 0 ? TABLE.cardH + 2 + TABLE.forgeH : TABLE.cardH) + 12
  return { x: TABLE.x0, y: TABLE.y0, w: TABLE.w, h: bottom - TABLE.y0 }
}

// Maps design units onto the card: the layout's `unitTable` gives the top-left corner (in % of the card) and a scale.
export function tableTransform(layout: FactionCardLayout, items: TableItem[]) {
  const e = layout.unitTable, k = TABLE.fit * (e.scale ?? 1), ox = e.x / 100 * CARD_SIZE.width, oy = e.y / 100 * CARD_SIZE.height
  const box = (b: Box): Box => ({ x: ox + (b.x - TABLE.x0) * k, y: oy + (b.y - TABLE.y0) * k, w: b.w * k, h: b.h * k })
  return { k, ox, oy, box, bounds: box(tableBounds(items)) }
}

/* ---------- front: the objective tokens heading ---------- */
// The heading bar in design units (35 = the layout's text size): the panel is inset by its outer border, so the whole bar is 62 tall.
export const HEADING_BAR = { inset: 6, h: 62 } as const

/* ---------- back: starting forces ---------- */
// The rows fill the layout's `forces` zone (y, w, h in % of the card): they share its height evenly
// and span its width, so they scale with the zone and with the number of rows. The zone is centred under its heading.
// `gap` is the space between a row's two cells (% of the card width), `rowGap` the space between rows (% of its height).
export type ForcesRow = { cy: number; count: Box; name: Box }
export function forcesGeometry(layout: FactionCardLayout, rowCount: number) {
  const W = CARD_SIZE.width, H = CARD_SIZE.height, g = layout.forces, t = layout.forcesTitle
  const top = g.y / 100 * H, rowW = (g.w ?? 21) / 100 * W, zoneH = (g.h ?? 58) / 100 * H
  const titleX = t.x / 100 * W, titleW = t.w !== undefined ? t.w / 100 * W : rowW, x = titleX + titleW / 2 - rowW / 2
  // The last row ends at the zone's bottom; few rows stop growing at a sensible height.
  const n = Math.max(1, rowCount), rowGap = (g.rowGap ?? 1.4) / 100 * H
  const rowH = Math.max(1, Math.min((zoneH - (n - 1) * rowGap) / n, rowW * 0.3)), pitch = rowH + rowGap, u = rowH / 112
  // The gap is centred on the split between the cells, so widening it narrows both cells by half of it.
  const split = Math.min(220 * u, rowW * 0.45), gap = Math.min((g.gap ?? 0.85) / 100 * W, rowW * 0.3)
  const cw = split - gap / 2, nameX = x + split + gap / 2
  const rows: ForcesRow[] = Array.from({ length: rowCount }, (_, i) => {
    const cy = top + rowH / 2 + i * pitch
    return { cy, count: { x, y: cy - rowH / 2, w: cw, h: rowH }, name: { x: nameX, y: cy - rowH / 2, w: x + rowW - nameX, h: rowH } }
  })
  const ty = t.y / 100 * H, room = top - ty - 22 * u
  const title: Box = { x: titleX, y: ty, w: titleW, h: Math.max(40 * u, Math.min(rowH * 0.625, room)) }
  // The zone as the editor shows it, in % of the card.
  const zone = { x: x / W * 100, y: g.y, w: rowW / W * 100, h: zoneH / H * 100 }
  return { u, rowH, rows, title, zone }
}

/* ---------- back: letter, portrait, objectives ---------- */
// Edges within this distance of the objectives block's edges are snapped to them, so the letter, the portrait and the objectives line up.
const SNAP = 0.03 * CARD_SIZE.width
// The letter's panel wraps the story text and both signature lines; its left edge lines up with the objectives below.
export function letterBox(layout: FactionCardLayout): Box {
  const W = CARD_SIZE.width, H = CARD_SIZE.height, s = layout.story, sig = layout.signature, st = layout.signatureTitle, pad = 0.014 * W
  const left = s.x / 100 * W, top = s.y / 100 * H
  const right = Math.max(s.x + (s.w ?? 0), sig.x + (sig.w ?? 0), st.x + (st.w ?? 0)) / 100 * W
  const bottom = Math.max(top + (s.h ?? 0) / 100 * H, st.y / 100 * H + (st.size ?? 2) / 100 * H * 1.3)
  const x = left - pad, edge = objectivesEdges(layout)
  const snapped = Math.abs(x - edge.left) < SNAP ? edge.left : x
  return { x: snapped, y: top - pad * 0.8, w: right + pad - snapped, h: bottom - top + 1.6 * pad }
}
// The portrait is placed automatically: as tall as the letter, `portraitStyle.gap` (% of the card width) to its right,
// and ending where the objectives end.
export function portraitBox(layout: FactionCardLayout): Box {
  const l = letterBox(layout), x = l.x + l.w + (layout.portraitStyle.gap ?? 0.8) / 100 * CARD_SIZE.width
  return { x, y: l.y, w: Math.max(0, objectivesEdges(layout).right - x), h: l.h }
}
function objectivesEdges(layout: FactionCardLayout) {
  const cells = objectiveCells(layout, 6)
  return { left: Math.min(...cells.map(c => c.frame.x)), right: Math.max(...cells.map(c => c.text.x + c.text.w)) }
}

// Design units of one objective: the picture frame (body 230 x 184, pointed tips 13 above and below) overlaps the text card.
export const OBJECTIVE = { frameW: 230, bodyH: 184, tip: 13, textX: 210, textW: 535, textH: 168, textY: 8, shift: 0.02, pitch: 210 } as const
export type ObjectiveCell = { u: number; frame: Box; body: Box; text: Box }
export function objectiveCells(layout: FactionCardLayout, count: number): ObjectiveCell[] {
  const W = CARD_SIZE.width, H = CARD_SIZE.height, g = layout.objectives
  // The whole block scales about its top-left corner: frames, text, row spacing and column gap.
  const k = g.scale ?? 1, pitch = (g.pitch ?? 0) / 100 * H * k, gap = (g.gap ?? 0) / 100 * W * k, u = pitch / OBJECTIVE.pitch
  const ox = g.x / 100 * W, oy = g.y / 100 * H, o = OBJECTIVE
  // The text card's own size (`w`, `h` in % of the card at scale 1); without one it keeps its designed size.
  const textW = g.w !== undefined ? g.w / 100 * W * k : o.textW * u, textH = g.h !== undefined ? g.h / 100 * H * k : o.textH * u
  return Array.from({ length: count }, (_, i) => {
    const x = ox + (i % 2) * gap, y = oy + Math.floor(i / 2) * pitch
    const body = { x: x + o.frameW * o.shift * u, y: y + o.tip * u, w: o.frameW * u, h: o.bodyH * u }
    return { u, body, frame: { x: body.x, y: y, w: body.w, h: body.h + 2 * o.tip * u }, text: { x: x + o.textX * u, y: body.y + o.textY * u, w: textW, h: textH } }
  })
}
