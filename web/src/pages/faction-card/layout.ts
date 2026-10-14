import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet, apiSend } from '../../lib/api'
import { CARD_SIZE } from './model'

export type Side = 'front' | 'back'
// Every element is placed in % of the card (x, y, w, h), text sizes are % of
// the card height, and grouped elements (icon rows, objectives) take a scale
// and the spacing between their rows. Icons (the structures) are placed by an
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
  { key: 'city', label: 'City', side: 'front', kind: 'group' },
  { key: 'factory', label: 'Factory', side: 'front', kind: 'group' },
  { key: 'units', label: 'Unit rows', side: 'front', kind: 'group' },
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
export type FactionCardLayout = Record<ElementKey, ElementLayout>

// Reference card the defaults come from: 1932 × 966 per side.
const RX = 1932, RY = 966
const px = (x: number) => Math.round(x / RX * 10000) / 100, py = (y: number) => Math.round(y / RY * 10000) / 100
// Text sizes were designed in reference pixels; 0.0901 turns them into % of the card height.
const sz = (v: number) => Math.round(v * 0.0901 * 100) / 100
export function defaultLayout(): FactionCardLayout {
  return {
    logo: { x: 45.8, y: 14, w: 10.5, h: 16 },
    backLogo: { x: 14.1, y: 7.5, w: 11.3, h: 18 },
    title: { x: px(800), y: py(318), w: px(395), size: sz(38) },
    subtitle: { x: px(800), y: py(370), w: px(395), h: py(32), size: sz(15) },
    text: { x: px(805), y: py(404), w: px(395), h: py(128), size: sz(16) },
    objectiveHeader: { x: px(800), y: py(575), w: px(410), size: sz(25) },
    city: { x: px(1358), y: py(80), scale: 1 },
    factory: { x: px(1620), y: py(80), scale: 1 },
    units: { x: px(1350), y: py(228), scale: 1, pitch: py(100) },
    materialsStyle: { x: 0, y: 0, color: '#74b13f', nx: 0, ny: 0, shadow: 0, blur: 0.05, sx: 0.02, sy: 0.04 },
    diceStyle: { x: 0, y: 0, color: '#ffffff', nx: 0, ny: 0, shadow: 0, blur: 0.05, sx: 0.02, sy: 0.04 },
    healthStyle: { x: 0, y: 0, color: '#ffffff', nx: 0, ny: 0, shadow: 0, blur: 0.05, sx: 0.02, sy: 0.04 },
    moraleStyle: { x: 0, y: 0, color: '#e5632a', nx: 0, ny: -0.62, shadow: 0, blur: 0.05, sx: 0.02, sy: 0.04 },
    cityIcon: { x: 0, y: 0, scale: 1, outline: 0.02, color: '#ffffff' }, factoryIcon: { x: 0, y: 0, scale: 1, outline: 0.02, color: '#ffffff' }, bastionIcon: { x: 0, y: 0, scale: 1, outline: 0.02, color: '#ffffff' },
    forcesTitle: { x: px(205), y: py(291 - 22), w: px(400), size: sz(23) },
    forces: { x: px(205), y: py(364), scale: 1, pitch: py(102) },
    story: { x: px(870), y: py(212), w: px(570), h: py(190), size: sz(19) },
    signature: { x: px(870), y: py(396), w: px(585), size: sz(30) },
    signatureTitle: { x: px(870), y: py(444), w: px(585), size: sz(19) },
    portrait: { x: px(1497), y: py(209), w: px(295), h: py(287) },
    objectives: { x: px(843), y: py(544), scale: 1, pitch: py(92), gap: px(542) },
  }
}
export function mergeLayout(saved: Partial<Record<ElementKey, Partial<ElementLayout>>> | undefined): FactionCardLayout {
  const base = defaultLayout()
  return Object.fromEntries(ELEMENTS.map(({ key }) => [key, { ...base[key], ...saved?.[key] }])) as FactionCardLayout
}

// Pixel geometry shared by the renderer and the editor's overlay boxes.
export function scaler(w: number = CARD_SIZE.width, h: number = CARD_SIZE.height) {
  const kx = w / RX, ky = h / RY, g = Math.sqrt(kx * ky)
  return { kx, ky, g, X: (v: number) => v * kx, Y: (v: number) => v * ky, S: (v: number) => v * g }
}

// A structure's icon box in output pixels: the box its group gives it, grown
// about its centre by the icon's own scale and moved by its offset.
export function structureIconBox(which: 'city' | 'factory' | 'bastion', l: FactionCardLayout) {
  const { S } = scaler(), W = CARD_SIZE.width, H = CARD_SIZE.height
  const g = which === 'bastion' ? l.units : l[which], k = g.scale ?? 1
  const base = { x: g.x / 100 * W, y: g.y / 100 * H - (which === 'bastion' ? S(50) * k : 0), w: S(120) * k, h: S(100) * k }
  const e = l[`${which}Icon`], s = e.scale ?? 1
  const cx = base.x + base.w / 2 + e.x / 100 * W, cy = base.y + base.h / 2 + e.y / 100 * H
  return { x: cx - base.w * s / 2, y: cy - base.h * s / 2, w: base.w * s, h: base.h * s }
}

// The area an element occupies, in % of the card, for the editor's drag boxes.
export function elementBox(key: ElementKey, l: FactionCardLayout): { x: number; y: number; w: number; h: number } {
  const e = l[key], { X, Y, S } = scaler(), W = CARD_SIZE.width, H = CARD_SIZE.height
  const pct = (x: number, y: number, w: number, h: number) => ({ x, y, w: w / W * 100, h: h / H * 100 })
  const s = e.scale ?? 1, pitch = (e.pitch ?? 0) / 100 * H
  switch (key) {
    case 'title': case 'objectiveHeader': case 'signature': case 'signatureTitle': case 'forcesTitle': return { x: e.x, y: e.y, w: e.w ?? 20, h: (e.size ?? 2) * 1.15 }
    case 'subtitle': case 'text': case 'story': case 'portrait': case 'logo': case 'backLogo': return { x: e.x, y: e.y, w: e.w ?? 20, h: e.h ?? 10 }
    case 'materialsStyle': case 'diceStyle': case 'healthStyle': case 'moraleStyle': return { x: 0, y: 0, w: 0, h: 0 }
    case 'cityIcon': case 'factoryIcon': case 'bastionIcon': { const b = structureIconBox(key.slice(0, -4) as 'city' | 'factory' | 'bastion', l); return pct(b.x / W * 100, b.y / H * 100, b.w, b.h) }
    case 'city': case 'factory': return pct(e.x, e.y, X(215) * s, S(110) * s)
    case 'units': return { x: e.x - X(100) * s / W * 100, y: e.y - S(60) * s / H * 100, w: X(580) * s / W * 100, h: (6 * pitch + S(120) * s) / H * 100 }
    case 'forces': return { x: e.x, y: e.y - S(50) * s / H * 100, w: X(400) * s / W * 100, h: (4 * pitch + S(100) * s) / H * 100 }
    case 'objectives': return { x: e.x, y: e.y, w: (e.gap ?? 0) + X(407) * s / W * 100, h: (2 * pitch + Y(76) * s) / H * 100 }
  }
}

export function useFactionCardLayout() {
  const query = useQuery({ queryKey: ['faction-card-layout'], queryFn: () => apiGet<{ layout: Partial<Record<ElementKey, Partial<ElementLayout>>> }>('/api/faction-card-layout') })
  const layout = useMemo(() => mergeLayout(query.data?.layout), [query.data?.layout])
  return { ...query, layout, saved: query.data?.layout }
}
export const saveFactionCardLayout = (layout: Partial<Record<ElementKey, Partial<ElementLayout>>>) => apiSend<{ layout: Partial<Record<ElementKey, ElementLayout>> }>('PUT', '/api/faction-card-layout', { layout })
