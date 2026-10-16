import type { Card, Category } from '../cards/model'

export type CombatCard = Extract<Card, { category: 'combat' }>
export type UpgradeCard = Extract<Card, { category: 'upgrade' }>
export type SchemaCard = Extract<Card, { category: 'schema' }>
// Upgrade and event cards share one renderer: the frame supplies the panels.
export type FramedCard = UpgradeCard | SchemaCard
export const isFramed = (category: Category): category is 'upgrade' | 'schema' => category !== 'combat'
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
  // Morale is always boxed, so (M) and [M] are the same icon.
  { token: '(M)', glyph: '<', label: 'Morale — always boxed', unframed: false },
  { token: '(D)', glyph: 'D', label: 'Dice', unframed: false },
] as const
// [M] is the same boxed morale icon as (M).
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
export type Run = { text: string; icon: boolean; italic: boolean; bold?: boolean; unframed?: boolean; dice?: boolean }
const TOKEN_PATTERN = new RegExp(`(\\[(?:${[...Object.keys(SYMBOLS), 'B', 'S', 'M'].join('|')})\\]|\\([BSMD]\\)|\\*\\*[^*\\n]+\\*\\*|\\*[^*\\n]+\\*|__[^_\\n]+__)`, 'g')
export function textRuns(text: string): Run[] {
  return text.split(TOKEN_PATTERN).filter(Boolean).flatMap<Run>(part => {
    // __bold__; it can be nested with italics, e.g. *__both__* or __*both*__.
    if (part.length > 4 && part.startsWith('__') && part.endsWith('__')) return textRuns(part.slice(2, -2)).map(run => ({ ...run, bold: true }))
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
export type Placement = { x: number; y: number; width: number; height: number; size: number; lineHeight: number; color: string; font: 'rules' | 'event' | 'headline'; iconStyle?: IconStyle; autoY?: boolean; align?: 'left' | 'center' | 'right'; verticalAlign?: 'top' | 'center'; paddingTop?: number; paddingBottom?: number }
export const LAYERS = ['name', 'level', 'resource_cost', 'resources', 'upper_text', 'lower_text', 'logo', 'order_icon', 'subtype', 'level_icon', 'cost_icon', 'limitation'] as const
export type Layer = typeof LAYERS[number]
export type Layout = Record<Layer, Placement>
export const LAYER_LABELS: Record<Layer, string> = { name: 'Title', level: 'Level', resource_cost: 'Resource price', resources: 'Resource icons (guns, shields, morale)', upper_text: 'Upper text', lower_text: 'Lower text', logo: 'Faction logo (starting cards)', order_icon: 'Order icon', subtype: 'Scheme / tactic label', level_icon: 'Level icon', cost_icon: 'Resource gear icon', limitation: 'Limitation' }
// Upgrade cards use the same layers with their own names: the rules text
// is the card's text, and only these layers are painted.
export const UPGRADE_LAYERS = ['name', 'level_icon', 'level', 'cost_icon', 'resource_cost', 'order_icon', 'logo', 'upper_text', 'limitation'] as const satisfies readonly Layer[]
export const SCHEMA_LAYERS = ['name', 'order_icon', 'logo', 'subtype', 'upper_text'] as const satisfies readonly Layer[]
export const SCHEMA_LAYER_LABELS: Record<Layer, string> = { ...LAYER_LABELS, order_icon: 'Action icon', upper_text: 'Description', logo: 'Faction logo' }
export const framedLayers = (category: Category): readonly Layer[] => category === 'schema' ? SCHEMA_LAYERS : UPGRADE_LAYERS
export const UPGRADE_LAYER_LABELS: Record<Layer, string> = { ...LAYER_LABELS, level: 'Level', upper_text: 'Rules text', logo: 'Faction logo' }
export const layerLabel = (layer: Layer, category: Category = 'combat') => (category === 'upgrade' ? UPGRADE_LAYER_LABELS : category === 'schema' ? SCHEMA_LAYER_LABELS : LAYER_LABELS)[layer]
const box = (x: number, y: number, width: number, height: number, size: number, color = '#141510'): Placement => ({ x, y, width, height, size, lineHeight: 1.18, color, font: 'rules' })
// Percentages of the reference battle card: 1140 × 1480. Scale identically for
// preview and export, independently of the browser's display size.
export function defaultLayout(category: Category = 'combat'): Layout {
  if (category === 'upgrade') return upgradeLayout()
  if (category === 'schema') return schemaLayout()
  return {
    name: { ...box(27, 6.1, 60, 5.5, 4.8), font: 'headline', align: 'left', verticalAlign: 'center' }, level: { ...box(10.8, 4.2, 6, 5.7, 5.1), font: 'headline' },
    resource_cost: { ...box(7.2, 17.4, 4, 5, 4.7, '#ffffff'), font: 'headline' },
    // One column: guns, then shields, then morale, each icon one line apart.
    resources: { ...box(10, 27, 9, 45, 6.4, '#ffffff'), iconStyle: 'plain' },
    upper_text: { ...box(11, 77.1, 80, 7.3, 2.9), autoY: true, align: 'left' }, lower_text: { ...box(10.5, 87.2, 80, 10.7, 2.9), autoY: true, align: 'left' },
    // The square badge at the top left; the logo is fitted inside, centred.
    logo: box(5.9, 5.3, 15.6, 11.5, 10),
    order_icon: box(28, 26.5, 44, 28, 10), level_icon: box(4.6, 1.2, 18.8, 13.8, 10), cost_icon: box(11.8, 16.4, 10, 7.4, 10), limitation: { ...box(17, 75, 66, 5, 2.6), align: 'center' },
    subtype: { ...box(15, 54, 70, 4.5, 3.4), font: 'headline', align: 'center', verticalAlign: 'center' },
  }
}
// Percentages of the reference event card: 816 × 1110. Title on the parchment
// strip, the action's dial on the right of the artwork, the scheme / tactic
// banner under it and the description on the parchment at the bottom.
function schemaLayout(): Layout {
  const base = defaultLayout('combat')
  return {
    ...base,
    name: { ...box(8.6, 5.2, 62, 6, 3.7), font: 'headline', align: 'left', verticalAlign: 'center' },
    subtype: { ...box(15, 54.2, 70, 4.6, 3.5), font: 'headline', align: 'center', verticalAlign: 'center' },
    upper_text: { ...box(11.5, 65.5, 78, 28, 2.8), lineHeight: 1.3, autoY: false, align: 'left', verticalAlign: 'center' },
    order_icon: box(74.8, 24.2, 18, 13.5, 10),
    logo: box(74.8, 1.8, 17.5, 13.5, 10),
  }
}
// Percentages of the reference upgrade card: 434 × 615. The title sits on the
// banner, price and level on the dark badges at the top left, the order's
// hexagon in the middle and the rules text on the parchment below it.
function upgradeLayout(): Layout {
  const white = '#ffffff'
  const base = defaultLayout('combat')
  return {
    ...base,
    name: { ...box(30, 17.9, 52, 6.4, 2.7), font: 'headline', align: 'center', verticalAlign: 'center' },
    // The yellow level badge over the round vent at the top left (the level in its dome), and
    // the resource gear on the dark plate under it, with the price to its left.
    level_icon: box(6.3, 3.4, 19, 13.9, 10),
    level: { ...box(11.5, 5.4, 8.2, 6.4, 5.2, white), font: 'headline', color: '#141510' },
    cost_icon: box(15.2, 18.3, 9.5, 7.1, 10),
    resource_cost: { ...box(10.2, 18.8, 5, 6.2, 3.9, white), font: 'headline' },
    // Inside the parchment panel of front.png (about 14–86% across).
    upper_text: { ...box(17, 58, 66, 16, 3.1), autoY: false, align: 'left' },
    // An optional line centred at the bottom of the parchment, after the rules text.
    limitation: { ...box(17, 75, 66, 5, 2.6), align: 'center', verticalAlign: 'center' },
    order_icon: box(28, 26, 44, 28, 10),
    // The round badge at the top right.
    logo: box(77.5, 2.5, 20, 14.5, 10),
  }
}
export function downloadName(name: string): string { return `${name.trim().replace(/[\\/:*?"<>|]/g, '-').split('').map(c => c.charCodeAt(0) < 32 ? '-' : c).join('').slice(0, 120) || 'battle-card'}.png` }

// The resource column's footprint in card %: it follows icon size and
// spacing for `count` icons rather than an editable box.
export function resourceBox(p: Placement, count: number, card = { width: 816, height: 1104 }) {
  const n = Math.max(1, count)
  return { x: p.x, y: p.y, width: p.size * .9 * card.height / card.width, height: p.size * ((n - 1) * p.lineHeight + 1) }
}

// Layouts saved before the single resource stack kept the gun column's box.
function withLegacyResources(saved: Partial<Layout>): Partial<Layout> {
  const legacy = (saved as Partial<Record<string, Placement>>).guns
  return legacy && !saved.resources ? { ...saved, resources: legacy } : saved
}

export function assemblyLayout(stored: Partial<Layout>, category: Category = 'combat'): Layout {
  const defaults = defaultLayout(category), saved = withLegacyResources(stored)
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
// Event cards show their artwork in the open area left of the action dial.
export const SCHEMA_ART_WINDOW = { x: 0, y: 12.9, width: 73.5, height: 37.6 }
export const artWindow = (category: Category) => category === 'schema' ? SCHEMA_ART_WINDOW : ART_WINDOW
export const DEMO_UPGRADE: UpgradeCard = {
  id: 0, faction_id: 0, category: 'upgrade', name: 'From the Warp', upgrade_type: 'dominate', level: 1, resource_cost: 2, limitation: 'Limit one per area.',
  text: 'While resolving this order, your ships can move through Warp Storms.', created_at: '', updated_at: '',
}
export const DEMO_SCHEMA: SchemaCard = {
  id: 0, faction_id: 0, category: 'schema', name: 'Chronomancy', subtype: 'schema', action: 'move_vertical',
  text: 'Place this card in your play area and discard all of your other schemes.\nAt the start of an execution round of combat, you may discard this card to draw up to 2 combat cards and then discard that many combat cards from your hand.', created_at: '', updated_at: '',
}
export const DEMO_COMBAT: CombatCard = {
  id: 0, faction_id: 0, category: 'combat', name: 'Righteous Fury', level: 2, resource_cost: 1, guns: 2, shields: 1, eagles: 1,
  upper_text: '**Battle:** Gain 1 (B) for each enemy unit in this area.', units: ['Skitarii', 'Light Cruiser'], unit_text: 'Rout 1 enemy unit. Gain (M).', created_at: '', updated_at: '',
}
