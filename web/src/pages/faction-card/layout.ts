import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'
import { CARD_SIZE, DEFAULT_MODEL_STYLE, defaultData, type ModelStyle } from './model'
import { TABLE, forcesGeometry, objectiveCells, tableItems, tableTransform } from './design/geometry'

export type Side = 'front' | 'back'
// Every element is placed in % of the card (x, y, w, h), text sizes are % of
// the card height, and grouped elements (the unit table, initial forces,
// objectives) take a scale and, for rows, the spacing between them. Icons (the structures) are placed by an
// offset (x, y in %) from where their group puts them, and their own scale.
// Structure icons also take an outline (width × icon height) in `color`.
// Style elements (no box) set how an icon and its number look: number colour
// and offset from the icon centre (× icon size), and the icon's drop shadow
// (strength 0–1, blur and offset × icon size).
export type ElementLayout = { x: number; y: number; w?: number; h?: number; size?: number; scale?: number; pitch?: number; gap?: number; color?: string; outline?: number; nx?: number; ny?: number; shadow?: number; blur?: number; sx?: number; sy?: number }
export const ELEMENTS = [
  { key: 'logo', label: 'Faction logo', side: 'front', kind: 'image' },
  { key: 'title', label: 'Faction title', side: 'front', kind: 'text' },
  { key: 'subtitle', label: 'Subtitle', side: 'front', kind: 'text' },
  { key: 'text', label: 'Faction text', side: 'front', kind: 'box' },
  { key: 'objectiveHeader', label: 'Objective tokens heading', side: 'front', kind: 'text' },
  { key: 'unitTable', label: 'Unit table (city, factory and unit rows)', side: 'front', kind: 'group' },
  { key: 'cityIcon', label: 'City icon', side: 'front', kind: 'icon' },
  { key: 'factoryIcon', label: 'Factory icon', side: 'front', kind: 'icon' },
  { key: 'bastionIcon', label: 'Bastion icon', side: 'front', kind: 'icon' },
  { key: 'materialsStyle', label: 'Materials icon and number', side: 'front', kind: 'style' },
  { key: 'diceStyle', label: 'Dice icon and number', side: 'front', kind: 'style' },
  { key: 'healthStyle', label: 'Skulls (health) icon and number', side: 'front', kind: 'style' },
  { key: 'moraleStyle', label: 'Eagle (morale) icon and number', side: 'front', kind: 'style' },
  { key: 'backLogo', label: 'Faction logo', side: 'back', kind: 'image' },
  { key: 'forcesTitle', label: 'Initial forces heading', side: 'back', kind: 'text' },
  { key: 'forces', label: 'Initial forces rows', side: 'back', kind: 'group' },
  { key: 'story', label: 'Story text', side: 'back', kind: 'box' },
  { key: 'signature', label: 'Signature', side: 'back', kind: 'text' },
  { key: 'signatureTitle', label: 'Signature title', side: 'back', kind: 'text' },
  { key: 'portrait', label: 'Portrait', side: 'back', kind: 'image' },
  { key: 'objectives', label: 'Objectives', side: 'back', kind: 'group' },
] as const
export type ElementKey = typeof ELEMENTS[number]['key']
export type ElementKind = typeof ELEMENTS[number]['kind']
// `modelStyle` (shadow, outline, inner shadow, contrast of the unit icons) is
// shared by every faction; it is edited on the Card Types page.
export type FactionCardLayout = Record<ElementKey, ElementLayout> & { modelStyle: ModelStyle }
export type SavedLayout = Partial<Record<ElementKey, Partial<ElementLayout>>> & { modelStyle?: Partial<ModelStyle> }

// Reference card the defaults come from: 1932 × 966 per side.
const RX = 1932, RY = 966
const px = (x: number) => Math.round(x / RX * 10000) / 100, py = (y: number) => Math.round(y / RY * 10000) / 100
// Text sizes were designed in reference pixels; 0.0901 turns them into % of the card height.
const sz = (v: number) => Math.round(v * 0.0901 * 100) / 100
export function defaultLayout(): FactionCardLayout {
  return {
    modelStyle: DEFAULT_MODEL_STYLE,
    logo: { x: 45.8, y: 14, w: 10.5, h: 16 },
    backLogo: { x: 14.1, y: 7.5, w: 11.3, h: 18 },
    title: { x: px(800), y: py(318), w: px(395), size: sz(38) },
    subtitle: { x: px(800), y: py(370), w: px(395), h: py(32), size: sz(15) },
    text: { x: px(805), y: py(404), w: px(395), h: py(128), size: sz(16) },
    objectiveHeader: { x: px(800), y: py(575), w: px(410), size: sz(25) },
    // Top-left corner of the table's design area, as % of the card; scale 1 fits it to the card's height.
    unitTable: { x: 63.5, y: 7.5, scale: 1 },
    materialsStyle: { x: 0, y: 0, color: '#18bf48', nx: 0, ny: 0, shadow: 0, blur: 0.05, sx: 0.02, sy: 0.04 },
    diceStyle: { x: 0, y: 0, color: '#ffffff', nx: 0, ny: 0, shadow: 0, blur: 0.05, sx: 0.02, sy: 0.04 },
    healthStyle: { x: 0, y: 0, color: '#ffffff', nx: 0, ny: 0, shadow: 0, blur: 0.05, sx: 0.02, sy: 0.04 },
    moraleStyle: { x: 0, y: 0, color: '#e5632a', nx: 0, ny: 0, shadow: 0, blur: 0.05, sx: 0.02, sy: 0.04 },
    cityIcon: { x: 0, y: 0, scale: 1, outline: 0.02, color: '#ffffff' }, factoryIcon: { x: 0, y: 0, scale: 1, outline: 0.02, color: '#ffffff' }, bastionIcon: { x: 0, y: 0, scale: 1, outline: 0.02, color: '#ffffff' },
    forcesTitle: { x: px(205), y: py(291 - 22), w: px(410), size: sz(23) },
    forces: { x: px(205), y: py(364), scale: 1, pitch: py(102) },
    story: { x: px(870), y: py(212), w: px(570), h: py(190), size: sz(19) },
    signature: { x: px(870), y: py(396), w: px(585), size: sz(30) },
    signatureTitle: { x: px(870), y: py(444), w: px(585), size: sz(19) },
    portrait: { x: px(1497), y: py(209), w: px(295), h: py(287) },
    objectives: { x: px(843), y: py(544), scale: 1, pitch: py(92), gap: px(542) },
  }
}
export function mergeLayout(saved: SavedLayout | undefined): FactionCardLayout {
  const base = defaultLayout()
  return { ...Object.fromEntries(ELEMENTS.map(({ key }) => [key, { ...base[key], ...saved?.[key] }])), modelStyle: { ...DEFAULT_MODEL_STYLE, ...saved?.modelStyle } } as FactionCardLayout
}

// Pixel geometry shared by the renderer and the editor's overlay boxes.
export function scaler(w: number = CARD_SIZE.width, h: number = CARD_SIZE.height) {
  const kx = w / RX, ky = h / RY, g = Math.sqrt(kx * ky)
  return { kx, ky, g, X: (v: number) => v * kx, Y: (v: number) => v * ky, S: (v: number) => v * g }
}

// A structure's icon box in output pixels: where the unit table puts its circle, grown about
// the circle's centre by the icon's own scale and moved by its offset. The image is drawn at
// its natural proportions inside this box, so only the width is meaningful.
const STRUCTURE_WIDTH = { city: 92, factory: 90, bastion: 80 } as const
const STRUCTURE_CIRCLE = { city: { x: 335, cy: TABLE.cityTop + TABLE.cardH / 2 }, factory: { x: 818, cy: TABLE.cityTop + TABLE.cardH / 2 }, bastion: { x: 335, cy: TABLE.firstTop + TABLE.cardH / 2 } } as const
export function structureIconBox(which: 'city' | 'factory' | 'bastion', l: FactionCardLayout) {
  const W = CARD_SIZE.width, H = CARD_SIZE.height, t = tableTransform(l, tableItems(defaultData())), c = STRUCTURE_CIRCLE[which]
  const e = l[`${which}Icon`], s = e.scale ?? 1, w = STRUCTURE_WIDTH[which] * t.k * s
  return { x: t.ox + (c.x - TABLE.x0) * t.k - w / 2 + e.x / 100 * W, y: t.oy + (c.cy - TABLE.y0 + 5) * t.k - w / 2 + e.y / 100 * H, w, h: w }
}

// The faction logo is always centred: above the title on the front, above the starting-forces heading on the back.
// Only its height (and width) are set in the layout; its horizontal position follows the heading it sits over.
export function logoRect(side: Side, l: FactionCardLayout): { x: number; y: number; w: number; h: number } {
  const e = side === 'front' ? l.logo : l.backLogo, heading = side === 'front' ? l.title : l.forcesTitle
  const w = e.w ?? 10, h = e.h ?? w * CARD_SIZE.width / CARD_SIZE.height
  return { x: heading.x + (heading.w ?? 20) / 2 - w / 2, y: e.y, w, h }
}

// The area an element occupies, in % of the card, for the editor's drag boxes.
export function elementBox(key: ElementKey, l: FactionCardLayout): { x: number; y: number; w: number; h: number } {
  const e = l[key], W = CARD_SIZE.width, H = CARD_SIZE.height
  const pct = (x: number, y: number, w: number, h: number) => ({ x, y, w: w / W * 100, h: h / H * 100 })
  switch (key) {
    case 'forcesTitle': { const t = forcesGeometry(l, 1).title; return pct(t.x / W * 100, t.y / H * 100, t.w, t.h) }
    case 'objectiveHeader': { const u = (e.size ?? 2) / 100 * H / 35; return pct(e.x, e.y - 6 * u / H * 100, (e.w ?? 20) / 100 * W, 50 * u) }
    case 'title': case 'signature': case 'signatureTitle': return { x: e.x, y: e.y, w: e.w ?? 20, h: (e.size ?? 2) * 1.15 }
    case 'logo': return logoRect('front', l)
    case 'backLogo': return logoRect('back', l)
    case 'subtitle': case 'text': case 'story': case 'portrait': return { x: e.x, y: e.y, w: e.w ?? 20, h: e.h ?? 10 }
    case 'materialsStyle': case 'diceStyle': case 'healthStyle': case 'moraleStyle': return { x: 0, y: 0, w: 0, h: 0 }
    case 'cityIcon': case 'factoryIcon': case 'bastionIcon': { const b = structureIconBox(key.slice(0, -4) as 'city' | 'factory' | 'bastion', l); return pct(b.x / W * 100, b.y / H * 100, b.w, b.h) }
    case 'unitTable': { const b = tableTransform(l, tableItems(defaultData())).bounds; return pct(b.x / W * 100, b.y / H * 100, b.w, b.h) }
    case 'forces': {
      const g = forcesGeometry(l, 4), first = g.rows[0], last = g.rows.at(-1)!
      return pct(first.count.x / W * 100, first.count.y / H * 100, first.name.x + first.name.w - first.count.x, last.cy + g.rowH / 2 - first.count.y)
    }
    case 'objectives': {
      const cells = objectiveCells(l, 6), x0 = Math.min(...cells.map(c => c.frame.x)), y0 = Math.min(...cells.map(c => c.frame.y))
      return pct(x0 / W * 100, y0 / H * 100, Math.max(...cells.map(c => c.text.x + c.text.w)) - x0, Math.max(...cells.map(c => c.frame.y + c.frame.h)) - y0)
    }
  }
}

export function useFactionCardLayout() {
  const query = useQuery({ queryKey: ['faction-card-layout'], queryFn: () => apiGet<{ layout: SavedLayout }>('/api/faction-card-layout') })
  const layout = useMemo(() => mergeLayout(query.data?.layout), [query.data?.layout])
  return { ...query, layout, saved: query.data?.layout }
}
export const saveFactionCardLayout = (layout: SavedLayout) => apiSend<{ layout: SavedLayout }>('PUT', '/api/faction-card-layout', { layout })
