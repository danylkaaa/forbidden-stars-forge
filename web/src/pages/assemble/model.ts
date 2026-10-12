import type { Card } from '../cards/model'

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
  // The font has no standalone morale glyph; remove the outlined box.
  { token: '(M)', glyph: '<', label: 'Morale — non-boxed', unframed: true },
  { token: '[M]', glyph: '<', label: 'Morale — boxed', unframed: false },
] as const
const SHORT_SYMBOLS = Object.fromEntries(SYMBOL_CATALOG.map(s => [s.token, s]))
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
export type Run = { text: string; icon: boolean; italic: boolean; unframed?: boolean }
const TOKEN_PATTERN = new RegExp(`(\\[(?:${[...Object.keys(SYMBOLS), 'B', 'S', 'M'].join('|')})\\]|\\([BSM]\\)|\\*\\*[^*\\n]+\\*\\*|\\*[^*\\n]+\\*)`, 'g')
export function textRuns(text: string): Run[] {
  return text.split(TOKEN_PATTERN).filter(Boolean).flatMap<Run>(part => {
    if (part.startsWith('*') && part.endsWith('*')) {
      const markers = part.startsWith('**') && part.endsWith('**') ? 2 : 1
      return textRuns(part.slice(markers, -markers)).map(run => ({ ...run, italic: true }))
    }
    const short = SHORT_SYMBOLS[part]
    if (short) return [{ text: short.glyph, icon: true, italic: false, ...(short.unframed ? { unframed: true } : {}) }]
    const symbol = part.startsWith('[') && part.endsWith(']') ? SYMBOLS[part.slice(1, -1)] : undefined
    return [{ text: symbol ?? part, icon: !!symbol, italic: false }]
  })
}
export type Placement = { x: number; y: number; width: number; height: number; size: number; lineHeight: number; color: string; font: 'rules' | 'event' | 'headline'; iconStyle?: IconStyle; autoY?: boolean; align?: 'left' | 'center' | 'right'; verticalAlign?: 'top' | 'center' }
export const LAYERS = ['name', 'level', 'resource_cost', 'costIcon', 'guns', 'shields', 'eagles', 'upper_text', 'lower_text'] as const
export type Layer = typeof LAYERS[number]
export type Layout = Record<Layer, Placement>
export const LAYER_LABELS: Record<Layer, string> = { name: 'Title', level: 'Level', resource_cost: 'Resource price', costIcon: 'Resource cog', guns: 'Gun icons', shields: 'Shield icons', eagles: 'Morale / eagle icons', upper_text: 'Upper text', lower_text: 'Lower text' }
const box = (x: number, y: number, width: number, height: number, size: number, color = '#141510'): Placement => ({ x, y, width, height, size, lineHeight: 1.18, color, font: 'rules' })
// Percentages of the reference battle card: 1140 × 1480. Scale identically for
// preview and export, independently of the browser's display size.
export function defaultLayout(): Layout {
  return {
    name: { ...box(27, 6.1, 60, 5.5, 4.8), font: 'headline', align: 'left', verticalAlign: 'center' }, level: { ...box(12.2, 5.2, 6, 5.7, 5.1), font: 'headline' },
    resource_cost: { ...box(7.2, 17.4, 4, 5, 4.7, '#ffffff'), font: 'headline' }, costIcon: box(10.9, 16.4, 10, 7.5, 7.4, '#79b236'),
    guns: { ...box(10, 27, 9, 29, 6.4, '#ffffff'), iconStyle: 'plain' }, shields: { ...box(10, 43, 9, 21, 6.4, '#ffffff'), iconStyle: 'plain' },
    eagles: { ...box(10, 59, 9, 13, 6.4, '#ffffff'), iconStyle: 'plain' },
    upper_text: { ...box(11, 77.1, 80, 7.3, 2.9), autoY: true, align: 'left' }, lower_text: { ...box(10.5, 87.2, 80, 10.7, 2.9), autoY: true, align: 'left' },
  }
}
export function downloadName(name: string): string { return `${name.trim().replace(/[\\/:*?"<>|]/g, '-').split('').map(c => c.charCodeAt(0) < 32 ? '-' : c).join('').slice(0, 120) || 'battle-card'}.png` }

export function assemblyLayout(saved: Partial<Layout>): Layout {
  const defaults = defaultLayout()
  return Object.fromEntries(LAYERS.map(key => [key, { ...defaults[key], ...saved[key] }])) as Layout
}
