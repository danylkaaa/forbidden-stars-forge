import type { Card, Category } from '../cards/model'

export type CombatCard = Extract<Card, { category: 'combat' }>
// These are characters in ForbiddenStars, not Unicode pictographs. Ordinary
// punctuation must stay in EventFont; only explicit tokens use the icon font.
export const NATIVE_SYMBOL_CATALOG = [
  { token: 'GUN', glyph: '#', label: 'Gun — filled circle' },
  { token: 'GUN_CIRCLE_OUTLINE', glyph: '%', label: 'Gun — outlined circle' },
  { token: 'GUN_BOX', glyph: ']', label: 'Gun — filled box' },
  { token: 'GUN_BOX_OUTLINE', glyph: '}', label: 'Gun — outlined box' },
  { token: 'SKULL', glyph: '@', label: 'Skull — filled circle' },
  { token: 'SKULL_CIRCLE_OUTLINE', glyph: '$', label: 'Skull — outlined circle' },
  { token: 'SKULL_BOX', glyph: '[', label: 'Skull — filled box' },
  { token: 'SKULL_BOX_OUTLINE', glyph: '{', label: 'Skull — outlined box' },
  { token: 'MORALE', glyph: '<', label: 'Morale — outlined box' },
  { token: 'MORALE_BOX', glyph: '>', label: 'Morale — filled box' },
] as const
export const SYMBOLS: Record<string, string> = {
  ...Object.fromEntries(NATIVE_SYMBOL_CATALOG.map(s => [s.token, s.glyph])),
  MORALE_BOX_OUTLINE: '<', SHIELD: '@', SHIELD_BOX: '[', SHIELD_BOX_OUTLINE: '{',
  SHIELD_CIRCLE_OUTLINE: '$', EAGLE: '<', EAGLE_BOX: '>', EAGLE_BOX_OUTLINE: '<',
}
// Parentheses select non-boxed symbols; brackets select bordered boxes.
export const SYMBOL_CATALOG = [
  { token: '(B)', glyph: '#', label: 'Boltgun — non-boxed', unframed: false },
  { token: '[B]', glyph: '}', label: 'Boltgun — boxed', unframed: false },
  { token: '(S)', glyph: '@', label: 'Shield — non-boxed', unframed: false },
  { token: '[S]', glyph: '{', label: 'Shield — boxed', unframed: false },
  // Morale is never boxed. The font has no standalone morale glyph, so the
  // outlined box is cropped away.
  { token: '(M)', glyph: '<', label: 'Morale', unframed: true },
  { token: '(D)', glyph: 'D', label: 'Dice', unframed: false },
] as const
// [M] from older text renders as plain morale too.
const SHORT_SYMBOLS: Record<string, typeof SYMBOL_CATALOG[number]> = { ...Object.fromEntries(SYMBOL_CATALOG.map(s => [s.token, s])), '[M]': SYMBOL_CATALOG[4] }
export const RESOURCE_TOKENS = {
  guns: { circle: 'GUN', circle_outline: 'GUN_CIRCLE_OUTLINE', box: 'GUN_BOX', box_outline: 'GUN_BOX_OUTLINE' },
  shields: { circle: 'SKULL', circle_outline: 'SKULL_CIRCLE_OUTLINE', box: 'SKULL_BOX', box_outline: 'SKULL_BOX_OUTLINE' },
  eagles: { box: 'MORALE_BOX', box_outline: 'MORALE' },
} as const
export type ResourceLayer = keyof typeof RESOURCE_TOKENS
export type IconStyle = 'plain' | 'badge' | 'circle' | 'circle_outline' | 'box' | 'box_outline'
export const ICON_STYLE_LABELS: Record<IconStyle, string> = {
  plain: 'Unframed (cropped)', badge: 'Original badge', circle: 'Filled circle',
  circle_outline: 'Outlined circle', box: 'Filled box', box_outline: 'Outlined box',
}
export function resourceToken(layer: ResourceLayer, style: IconStyle | undefined): string {
  const tokens: Partial<Record<IconStyle, string>> = RESOURCE_TOKENS[layer]
  return tokens[style ?? 'badge'] ?? (layer === 'guns' ? 'GUN' : layer === 'shields' ? 'SKULL' : 'MORALE')
}
export type Run = { text: string; icon: boolean; italic: boolean; unframed?: boolean; dice?: boolean }
const TOKEN_PATTERN = new RegExp(`(\\[(?:${[...Object.keys(SYMBOLS), 'B', 'S', 'M'].join('|')})\\]|\\([BSMD]\\)|\\*\\*[^*\\n]+\\*\\*|\\*[^*\\n]+\\*)`, 'g')
export function textRuns(text: string): Run[] {
  return text.split(TOKEN_PATTERN).filter(Boolean).flatMap<Run>(part => {
    if (part.startsWith('*') && part.endsWith('*')) {
      const markers = part.startsWith('**') && part.endsWith('**') ? 2 : 1
      return textRuns(part.slice(markers, -markers)).map(run => ({ ...run, italic: true }))
    }
    const short = SHORT_SYMBOLS[part]
    if (short) return [{ text: short.glyph, icon: true, italic: false, ...(short.unframed ? { unframed: true } : {}), ...(part === '(D)' ? { dice: true } : {}) }]
    const symbol = part.startsWith('[') && part.endsWith(']') ? SYMBOLS[part.slice(1, -1)] : undefined
    return [{ text: symbol ?? part, icon: !!symbol, italic: false }]
  })
}
export type Placement = { x: number; y: number; width: number; height: number; size: number; lineHeight: number; color: string; font: 'rules' | 'event' | 'headline'; iconStyle?: IconStyle; autoY?: boolean; align?: 'left' | 'center' | 'right'; verticalAlign?: 'top' | 'center' }
export const LAYERS = ['name', 'level', 'resource_cost', 'resources', 'upper_text', 'lower_text', 'logo'] as const
export type Layer = typeof LAYERS[number]
export type Layout = Record<Layer, Placement>
export const LAYER_LABELS: Record<Layer, string> = { name: 'Title', level: 'Level', resource_cost: 'Resource price', resources: 'Resource icons (guns, shields, morale)', upper_text: 'Upper text', lower_text: 'Lower text', logo: 'Faction logo (level 0)' }
const box = (x: number, y: number, width: number, height: number, size: number, color = '#141510'): Placement => ({ x, y, width, height, size, lineHeight: 1.18, color, font: 'rules' })
// Percentages of the reference battle card: 1140 × 1480. Scale identically for
// preview and export, independently of the browser's display size.
export function defaultLayout(): Layout {
  return {
    name: { ...box(27, 6.1, 60, 5.5, 4.8), font: 'headline', align: 'left', verticalAlign: 'center' }, level: { ...box(12.2, 5.2, 6, 5.7, 5.1), font: 'headline' },
    resource_cost: { ...box(7.2, 17.4, 4, 5, 4.7, '#ffffff'), font: 'headline' },
    // One column: guns, then shields, then morale, each icon one line apart.
    resources: { ...box(10, 27, 9, 45, 6.4, '#ffffff'), iconStyle: 'plain' },
    upper_text: { ...box(11, 77.1, 80, 7.3, 2.9), autoY: true, align: 'left' }, lower_text: { ...box(10.5, 87.2, 80, 10.7, 2.9), autoY: true, align: 'left' },
    // The square badge at the top left; the logo is fitted inside, centred.
    logo: box(5.9, 5.3, 15.6, 11.5, 10),
  }
}
export function downloadName(name: string): string { return `${name.trim().replace(/[\\/:*?"<>|]/g, '-').split('').map(c => c.charCodeAt(0) < 32 ? '-' : c).join('').slice(0, 120) || 'battle-card'}.png` }

// Layers that sit on the overlay's badges. A subtype stores their positions,
// since each subtype has its own overlays.
export const OVERLAY_LAYERS = ['level', 'resource_cost', 'resources', 'logo'] as const satisfies readonly Layer[]
export const isOverlayLayer = (layer: Layer) => (OVERLAY_LAYERS as readonly Layer[]).includes(layer)
// The resource column's footprint in card %: it follows icon size and
// spacing for `count` icons rather than an editable box.
export function resourceBox(p: Placement, count: number, card = { width: 816, height: 1104 }) {
  const n = Math.max(1, count)
  return { x: p.x, y: p.y, width: p.size * .9 * card.height / card.width, height: p.size * ((n - 1) * p.lineHeight + 1) }
}

export function withSubtypeLayout(layout: Layout, subtype: Partial<Layout> | undefined): Layout {
  if (!subtype) return layout
  const saved = withLegacyResources(subtype)
  return { ...layout, ...Object.fromEntries(OVERLAY_LAYERS.map(key => [key, { ...layout[key], ...saved[key] }])) }
}

// Layouts saved before the single resource stack kept the gun column's box.
function withLegacyResources(saved: Partial<Layout>): Partial<Layout> {
  const legacy = (saved as Partial<Record<string, Placement>>).guns
  return legacy && !saved.resources ? { ...saved, resources: legacy } : saved
}

export function assemblyLayout(stored: Partial<Layout>): Layout {
  const defaults = defaultLayout(), saved = withLegacyResources(stored)
  return Object.fromEntries(LAYERS.map(key => [key, { ...defaults[key], ...saved[key] }])) as Layout
}

// Library tabs. Schema/tactic cards are the expansion's event cards.
// `expected` is how many cards of the category each faction's deck needs;
// `slug` is the ?tab= value in library links.
export const LIBRARY_TABS: { category: Category; slug: string; label: string; expected: number; keywords: string[] }[] = [
  { category: 'combat', slug: 'combat', label: 'Combat', expected: 14, keywords: ['combat', 'battle'] },
  { category: 'schema', slug: 'events', label: 'Events', expected: 8, keywords: ['event', 'schema', 'tactic'] },
  { category: 'upgrade', slug: 'upgrades', label: 'Upgrades', expected: 5, keywords: ['upgrade'] },
]
export const libraryLink = (factionId: number, category: Category) =>
  `/assemble?faction=${factionId}&tab=${LIBRARY_TABS.find(t => t.category === category)!.slug}`
// The frame's open artwork area, in % of the card. Per-card artwork is
// clipped to it and drawn first, under the generated template.
export const ART_WINDOW = { x: 21, y: 14.5, width: 79, height: 85.5 }
export const DEMO_COMBAT: CombatCard = {
  id: 0, faction_id: 0, category: 'combat', name: 'Righteous Fury', level: 2, resource_cost: 1, guns: 2, shields: 1, eagles: 1,
  upper_text: '**Battle:** Gain 1 (B) for each enemy unit in this area.', lower_text: 'Rout 1 enemy unit. Gain (M).', created_at: '', updated_at: '',
}
