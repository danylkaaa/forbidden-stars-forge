// The back's designed elements: the starting-forces list, the letter's panel, the portrait
// window and the six objectives with their pointed picture frames. Positions come from the
// layout (see geometry.ts); everything inside a block is drawn in design units.
import type { InitialRow, Objective } from '../model'
import type { FactionCardLayout } from '../layout'
import { measureParagraph, paintParagraph } from '../text'
import type { Box } from '../placeholders'
import { forcesGeometry, letterBox, objectiveCells, portraitBox, OBJECTIVE } from './geometry'
import { band, boxShadow, connector, cornerSquares, fitImage, recolor, screenGradient, screenPanel, withShadows, CARD_SHADOW, type Ctx, type DesignAssets, type Drawable } from './paint'
import { centerNormal, fitFont } from './text'
import type { CardTheme } from './theme'

const INK = '#141510'
const BACK_U = 1.4   // design units to pixels for the letter and portrait panels

// Runs `draw` in a block's own design units: origin at the box's top-left, `u` pixels per unit.
function inBlock(ctx: Ctx, b: Box, u: number, draw: (w: number, h: number) => void) {
  ctx.save(); ctx.translate(b.x, b.y); ctx.scale(u, u); draw(b.w / u, b.h / u); ctx.restore()
}

export type ForcesInput = {
  rows: InitialRow[]; title: string; layout: FactionCardLayout; theme: CardTheme; assets: DesignAssets; seed: string
  // Paints a row's icon (a unit model, structure, token or library card) inside the box.
  icon: (ctx: Ctx, row: InitialRow, box: Box) => void
}
export function drawForces(ctx: Ctx, p: ForcesInput): { warnings: string[] } {
  const { theme: T, assets: A } = p, warnings: string[] = []
  const art = A.light ? recolor(A.light, { hue: T.hue }) : null
  const g = forcesGeometry(p.layout, p.rows.length), { u } = g, titleBox = g.title
  // Light bars run out of both sides of the title and of each row, and join its two cells; they sit behind the panels.
  inBlock(ctx, titleBox, u, (w, h) => { connector(ctx, art, -34, 8, h / 2); connector(ctx, art, w - 8, w + 34, h / 2) })
  g.rows.forEach(r => inBlock(ctx, r.count, u, (w, h) => {
    const nx = (r.name.x - r.count.x) / u, nw = r.name.w / u
    connector(ctx, art, -34, 8, h / 2); connector(ctx, art, w - 8, nx + 8, h / 2); connector(ctx, art, nx + nw - 8, nx + nw + 34, h / 2)
  }))
  inBlock(ctx, titleBox, u, (w, h) => {
    screenPanel(ctx, { x: 0, y: 0, w, h }, T, `${p.seed}-forces-title`)
    const size = fitFont(ctx, p.title.toUpperCase(), w - 28, 48, 12)
    if (!size.fits) warnings.push('The initial forces heading does not fit its area. Shorten it.')
    centerNormal(ctx, p.title.toUpperCase(), w / 2, 0, h, size.size, { color: '#1c1c1c', align: 'center' }, 3)
  })
  p.rows.slice(0, g.rows.length).forEach((row, i) => {
    const r = g.rows[i]
    inBlock(ctx, r.count, u, (w, h) => {
      screenPanel(ctx, { x: 0, y: 0, w, h }, T, `${p.seed}-forces-count-${i}`)
      centerNormal(ctx, String(row.count), 33, 0, h, 64, { color: '#1c1c1c', align: 'center' }, 10)
      ctx.fillStyle = 'rgba(0,0,0,.14)'; ctx.fillRect(66, 8, 2, h - 16)
      p.icon(ctx, row, { x: 70, y: 12, w: w - 76, h: h - 24 })
    })
    inBlock(ctx, r.name, u, (w, h) => {
      screenPanel(ctx, { x: 0, y: 0, w, h }, T, `${p.seed}-forces-name-${i}`)
      const label = row.label.toUpperCase(), fit = fitFont(ctx, label, w - 28, 40, 12)
      if (!fit.fits) warnings.push(`Initial force ${i + 1} does not fit its area. Shorten it.`)
      centerNormal(ctx, label, w / 2, 0, h, fit.size, { color: '#1c1c1c', align: 'center' }, 3)
    })
  })
  return { warnings }
}

// The letter's panel, behind the story text and the signature (the caller paints those on top).
export function drawLetterPanel(ctx: Ctx, layout: FactionCardLayout, T: CardTheme, seed: string): Box {
  const b = letterBox(layout)
  inBlock(ctx, b, BACK_U, (w, h) => screenPanel(ctx, { x: 0, y: 0, w, h }, T, `${seed}-letter`))
  return b
}

// The portrait: the picture fills the panel (cropped, never squashed) under its borders; a light bar joins it to the letter.
export function drawPortrait(ctx: Ctx, layout: FactionCardLayout, T: CardTheme, A: DesignAssets, picture: Drawable | null) {
  const b = portraitBox(layout), l = letterBox(layout)
  const art = A.light ? recolor(A.light, { hue: T.hue }) : null
  const top = Math.max(l.y, b.y), bottom = Math.min(l.y + l.h, b.y + b.h), cy = bottom > top ? (top + bottom) / 2 : (l.y + l.h / 2)
  inBlock(ctx, { x: l.x + l.w - 8 * BACK_U, y: cy, w: b.x - (l.x + l.w) + 16 * BACK_U, h: 0 }, BACK_U, w => connector(ctx, art, 0, w, 0))
  inBlock(ctx, b, BACK_U, (w, h) => {
    const box = { x: 0, y: 0, w, h }
    boxShadow(ctx, box, CARD_SHADOW)
    screenGradient(ctx, box, T)
    if (picture) fitImage(ctx, picture, box, 'cover')
    band(ctx, box, -2, 0, T.outline); band(ctx, box, 4, 6, T.outline)
    cornerSquares(ctx, box, T)
  })
}

// The six objectives: each a text card with a picture frame (chamfered body, pointed tips) overlapping its left edge.
const OUTER = [[12, 13], [103, 13], [115, 0], [127, 13], [218, 13], [230, 25], [230, 185], [218, 197], [127, 197], [115, 210], [103, 197], [12, 197], [0, 185], [0, 25]]
const INNER = [[19.3, 25.3], [106, 25.3], [115, 15.8], [124, 25.3], [210.7, 25.3], [217.7, 32.3], [217.7, 177.7], [210.7, 184.7], [124, 184.7], [115, 194.2], [106, 184.7], [19.3, 184.7], [12.3, 177.7], [12.3, 32.3]]
const polygon = (ctx: Ctx, pts: number[][]) => { pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath() }

export type ObjectivesInput = { objectives: Objective[]; pictures: (Drawable | null)[]; layout: FactionCardLayout; theme: CardTheme; seed: string }
export function drawObjectives(ctx: Ctx, p: ObjectivesInput): { warnings: string[] } {
  const { theme: T } = p, warnings: string[] = [], cells = objectiveCells(p.layout, p.objectives.length), o = OBJECTIVE
  p.objectives.forEach((obj, i) => {
    const c = cells[i], u = c.u
    // text card
    inBlock(ctx, c.text, u, (w, h) => {
      screenPanel(ctx, { x: 0, y: 0, w, h }, T, `${p.seed}-objective-${i}`)
      if (!obj.name && !obj.text) return
      const spans = [{ text: obj.name ? `${obj.name}: ` : '', bold: true, italic: false }, { text: obj.text, italic: true }]
      const style = { x: 40, y: 0, width: w - 60, height: h - 12, size: 30, lineHeight: 1.08, color: INK, family: 'CardEvent', italic: true }
      const m = measureParagraph(ctx, spans, style)
      if (m.overflow) warnings.push(`Objective ${i + 1} does not fit its area. Shorten it.`)
      paintParagraph(ctx, spans, { ...style, y: (h - m.height) / 2, size: m.size })
    })
    // picture frame, above the card
    inBlock(ctx, { x: c.body.x, y: c.frame.y, w: c.frame.w, h: c.frame.h }, u, () => {
      const box = { x: 0, y: 0, w: o.frameW, h: o.bodyH + 2 * o.tip }
      withShadows(ctx, [{ dx: 0, dy: 5, blur: 6, color: 'rgba(0,0,0,.6)' }], () => {
        ctx.save(); ctx.beginPath(); polygon(ctx, OUTER); ctx.clip()
        screenGradient(ctx, box, T)
        const pic = p.pictures[i]
        if (pic) fitImage(ctx, pic, box, 'cover')
        // the frame's border is one solid colour
        ctx.shadowColor = 'rgba(0,0,0,.75)'; ctx.shadowBlur = 14 * ctx.getTransform().a
        ctx.fillStyle = T.frame; ctx.beginPath(); polygon(ctx, OUTER); polygon(ctx, INNER); ctx.fill('evenodd')
        ctx.restore()
      })
    })
  })
  return { warnings }
}
