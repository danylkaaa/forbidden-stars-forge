import { useMemo } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type LineStyle = 'dashed' | 'dotted' | 'solid'
export type PrintSettings = {
  paper: 'a4' | 'letter'; orientation: 'portrait' | 'landscape'
  cardWidth: number; cardHeight: number; // the finished (cut) card size
  gap: number; margin: number // mm
  evenSpacing: boolean // spread the free space equally around and between cards (margin is the minimum)
  flip: 'long' | 'short'; includeBacks: boolean
  cutLines: boolean; cutLinesOnBacks: boolean; guidesToEdge: boolean
  trimBleed: boolean // fit more cards per sheet by trimming each card's bleed to the space between cards
  lineWidth: number; lineColor: string; lineStyle: LineStyle // width in CSS px
}
export const DEFAULT_SETTINGS: PrintSettings = {
  paper: 'a4', orientation: 'portrait', cardWidth: 63.5, cardHeight: 88, gap: 0, margin: 8, evenSpacing: true,
  flip: 'long', includeBacks: true,
  cutLines: true, cutLinesOnBacks: false, guidesToEdge: true, trimBleed: true, lineWidth: 2, lineColor: '#00a651', lineStyle: 'dashed',
}
export const usePrintSettings = create<{ settings: PrintSettings; update: (patch: Partial<PrintSettings>) => void; reset: () => void }>()(persist(set => ({
  settings: DEFAULT_SETTINGS,
  update: patch => set(s => ({ settings: { ...s.settings, ...patch } })),
  reset: () => set({ settings: DEFAULT_SETTINGS }),
}), { name: 'card-forge-print-v1', merge: (saved, current) => ({ ...current, ...(saved as object), settings: { ...DEFAULT_SETTINGS, ...(saved as { settings?: PrintSettings } | undefined)?.settings } }) }))

export const MM_PT = 72 / 25.4
export const PX_PT = 0.75
const PAPER = { a4: [210, 297], letter: [215.9, 279.4] } as const
export const pageSize = (s: PrintSettings) => {
  const [w, h] = PAPER[s.paper]
  return s.orientation === 'portrait' ? { width: w, height: h } : { width: h, height: w }
}

// The printed image is usually larger than the finished card: the extra is
// bleed on every side (`image` is the printed size in mm; the cut rectangle sits
// centred inside it). Without trimming, each slot is as big as the whole image.
// With trimming, slots are card-sized and only as much bleed as fits in the
// space between cards (and the margins) is kept, so more cards fit a sheet.
// With even spacing the free space is shared equally by the gaps between slots
// and the margins around them (the margin is the minimum).
export type Mm = { width: number; height: number }
export function gridFor(s: PrintSettings, image?: Mm) {
  const page = pageSize(s), gap = s.evenSpacing ? 0 : s.gap
  const imgW = Math.max(s.cardWidth, image?.width ?? 0), imgH = Math.max(s.cardHeight, image?.height ?? 0)
  const cellW = s.trimBleed ? s.cardWidth : imgW, cellH = s.trimBleed ? s.cardHeight : imgH
  const fit = (available: number, cell: number) => cell > 0 ? Math.max(0, Math.floor((available + gap) / (cell + gap))) : 0
  const cols = fit(page.width - 2 * s.margin, cellW), rows = fit(page.height - 2 * s.margin, cellH)
  const axis = (count: number, cell: number, total: number) => {
    if (!s.evenSpacing) return { start: (total - (count * cell + Math.max(0, count - 1) * s.gap)) / 2, step: cell + s.gap }
    const space = (total - count * cell) / (count + 1)
    return { start: space, step: cell + space }
  }
  const x = axis(cols, cellW, page.width), y = axis(rows, cellH, page.height)
  // Bleed kept on each side of the cut edge.
  const keep = (natural: number, a: { start: number; step: number }, cell: number) => s.trimBleed ? Math.max(0, Math.min(natural, a.start, (a.step - cell) / 2)) : natural
  const bleedX = keep((imgW - s.cardWidth) / 2, x, cellW), bleedY = keep((imgH - s.cardHeight) / 2, y, cellH)
  return { cols, rows, perPage: cols * rows, x0: x.start, y0: y.start, stepX: x.step, stepY: y.step, cellW, cellH, imgW, imgH, bleedX, bleedY, page }
}
export type Grid = ReturnType<typeof gridFor>
// The cut rectangle, the full image (centred on it), and the visible part of
// the image (cut rectangle plus the kept bleed).
export const slotRect = (g: Grid, s: PrintSettings, slot: number) => {
  const col = slot % g.cols, row = Math.floor(slot / g.cols)
  const x = g.x0 + col * g.stepX, y = g.y0 + row * g.stepY
  const cut = { x: x + (g.cellW - s.cardWidth) / 2, y: y + (g.cellH - s.cardHeight) / 2, w: s.cardWidth, h: s.cardHeight }
  return {
    cut,
    img: { x: cut.x - (g.imgW - cut.w) / 2, y: cut.y - (g.imgH - cut.h) / 2, w: g.imgW, h: g.imgH },
    clip: { x: cut.x - g.bleedX, y: cut.y - g.bleedY, w: cut.w + 2 * g.bleedX, h: cut.h + 2 * g.bleedY },
  }
}
export type Segment = { x1: number; y1: number; x2: number; y2: number }
// Cutting guides for the cards on a sheet. Extended guides run across the whole
// sheet along every cut edge of an occupied column and row.
export function cutGuides(g: Grid, s: PrintSettings, page: (number | null)[]): Segment[] {
  const out: Segment[] = []
  if (!s.guidesToEdge) {
    page.forEach((id, slot) => {
      if (id === null) return
      const { x, y, w, h } = slotRect(g, s, slot).cut
      out.push({ x1: x, y1: y, x2: x + w, y2: y }, { x1: x, y1: y + h, x2: x + w, y2: y + h }, { x1: x, y1: y, x2: x, y2: y + h }, { x1: x + w, y1: y, x2: x + w, y2: y + h })
    })
    return out
  }
  const cols = new Set<number>(), rows = new Set<number>()
  page.forEach((id, slot) => { if (id !== null) { cols.add(slot % g.cols); rows.add(Math.floor(slot / g.cols)) } })
  for (const col of cols) { const { x, w } = slotRect(g, s, col).cut; for (const lx of [x, x + w]) out.push({ x1: lx, y1: 0, x2: lx, y2: g.page.height }) }
  for (const row of rows) { const { y, h } = slotRect(g, s, row * g.cols).cut; for (const ly of [y, y + h]) out.push({ x1: 0, y1: ly, x2: g.page.width, y2: ly }) }
  return out
}
export const PRINT_DPI = 300
export const mmToPx = (mm: number) => Math.max(1, Math.round(mm / 25.4 * PRINT_DPI))

// Where a front slot lands on the sheet's reverse side once it is turned over.
// Flipping a portrait sheet on its long edge mirrors left to right; the short
// edge mirrors top to bottom. Landscape swaps the two.
export function backSlot(slot: number, cols: number, rows: number, flip: 'long' | 'short', orientation: 'portrait' | 'landscape') {
  const col = slot % cols, row = Math.floor(slot / cols)
  return (flip === 'long') === (orientation === 'portrait') ? row * cols + (cols - 1 - col) : (rows - 1 - row) * cols + col
}

// A sheet's reverse side: each front card moved to its mirrored slot.
export function mirrorPage(page: (number | null)[], cols: number, rows: number, flip: 'long' | 'short', orientation: 'portrait' | 'landscape') {
  const out: (number | null)[] = page.map(() => null)
  page.forEach((id, slot) => { out[backSlot(slot, cols, rows, flip, orientation)] = id })
  return out
}

export type Pages = (number | null)[][]
// Keeps the user's arrangement while cards are added or removed: removed ids
// leave holes, new ids fill holes (or new pages), and trailing empties go.
export function reconcile(pages: Pages, ids: number[], perPage: number): Pages {
  if (perPage <= 0) return []
  const wanted = new Set(ids), placed = new Set<number>()
  const next = pages.map(page => Array.from({ length: perPage }, (_, i) => {
    const id = page[i] ?? null
    if (id === null || !wanted.has(id) || placed.has(id)) return null
    placed.add(id); return id
  }))
  const fresh = ids.filter(id => !placed.has(id))
  for (const page of next) for (let i = 0; i < perPage && fresh.length; i++) if (page[i] === null) page[i] = fresh.shift()!
  while (fresh.length) next.push(Array.from({ length: perPage }, () => fresh.shift() ?? null))
  while (next.length && next.at(-1)!.every(id => id === null)) next.pop()
  return next
}
export function reflow(pages: Pages, perPage: number): Pages {
  return reconcile([], pages.flat().filter((id): id is number => id !== null), perPage)
}
export function swapSlots(pages: Pages, from: { page: number; slot: number }, to: { page: number; slot: number }): Pages {
  const next = pages.map(p => [...p])
  const a = next[from.page][from.slot]
  next[from.page][from.slot] = next[to.page][to.slot]
  next[to.page][to.slot] = a
  return next
}

export function strokeFor(s: PrintSettings) {
  const width = s.lineWidth * PX_PT
  const dash = s.lineStyle === 'dashed' ? [width * 4, width * 3] : s.lineStyle === 'dotted' ? [width, width * 2] : []
  return { color: s.lineColor, width, dash }
}

// The finished card size, for safe-area lines on previews.
export function useCutMm() {
  const width = usePrintSettings(s => s.settings.cardWidth), height = usePrintSettings(s => s.settings.cardHeight)
  return useMemo(() => ({ width, height }), [width, height])
}
