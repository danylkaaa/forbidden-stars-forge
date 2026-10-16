export const CATEGORIES = ['combat', 'schema', 'upgrade'] as const
export type Category = typeof CATEGORIES[number]
export const UPGRADE_TYPES = ['deploy', 'advance', 'strategize', 'dominate', 'orbital_strike'] as const
export const orderLabel = (type: string) => { const text = type.replace(/_/g, ' '); return text[0].toUpperCase() + text.slice(1) }
export type UpgradeType = typeof UPGRADE_TYPES[number]
type Common = { faction_id: number; name: string; category: Category }
export type CardInput = Common & (
  | { category: 'combat'; starting?: boolean; level: number; resource_cost: number; shields: number; guns: number; eagles: number; upper_text: string; units: string[]; unit_text: string }
  | { category: 'schema'; subtype: 'schema' | 'tactic'; text: string; action: 'rotate_clockwise' | 'rotate_counterclockwise' | 'move_vertical' | 'move_horizontal' | 'move_everywhere' }
  | { category: 'upgrade'; upgrade_type: UpgradeType; level: number; resource_cost: number; text: string; limitation?: string }
)
export type Card = CardInput & { id: number; created_at: string; updated_at: string }
export type CardField = { key: string; label: string; kind: 'number' | 'text' | 'select' | 'list'; options?: readonly string[]; max?: number; optional?: boolean }
export const LABELS: Record<Category, string> = { combat: 'Combat', schema: 'Schema / Tactic', upgrade: 'Upgrade' }
export const FIELDS: Record<Category, CardField[]> = {
  combat: [
    { key: 'level', label: 'Level', kind: 'select', options: ['0', '1', '2', '3'] },
    { key: 'resource_cost', label: 'Resource price', kind: 'number' },
    { key: 'shields', label: 'Shields', kind: 'number' },
    { key: 'guns', label: 'Guns', kind: 'number' },
    { key: 'eagles', label: 'Eagles', kind: 'number' },
    { key: 'upper_text', label: 'Upper text', kind: 'text' },
    { key: 'units', label: 'Unit names', kind: 'list' },
    { key: 'unit_text', label: 'Unit text', kind: 'text' },
  ],
  schema: [
    { key: 'subtype', label: 'Subtype', kind: 'select', options: ['schema', 'tactic'] },
    { key: 'action', label: 'Action', kind: 'select', options: ['rotate_clockwise', 'rotate_counterclockwise', 'move_vertical', 'move_horizontal', 'move_everywhere'] },
    { key: 'text', label: 'Text', kind: 'text' },
  ],
  upgrade: [
    { key: 'upgrade_type', label: 'Order', kind: 'select', options: UPGRADE_TYPES },
    { key: 'level', label: 'Level', kind: 'select', options: ['0', '1', '2', '3'] },
    { key: 'resource_cost', label: 'Resource price', kind: 'number' },
    { key: 'text', label: 'Text', kind: 'text' },
    { key: 'limitation', label: 'Limitation (optional)', kind: 'text', optional: true },
  ],
}
export const ACTION_LABELS: Record<string, string> = {
  rotate_clockwise: 'Rotate clockwise', rotate_counterclockwise: 'Rotate counterclockwise',
  move_vertical: 'Move vertically', move_horizontal: 'Move horizontally', move_everywhere: 'Move everywhere',
}
export type CardDraft = Record<string, string>
export function newDraft(category: Category, factionId = ''): CardDraft {
  const draft: CardDraft = { faction_id: factionId, name: '', category }
  for (const f of FIELDS[category]) draft[f.key] = f.options?.[0] ?? (f.kind === 'number' ? '0' : '')
  if (category === 'combat') draft.starting = 'false'
  return draft
}
// Unit names are edited as one "A/B" line and stored as a list.
export const UNIT_SEPARATOR = '/'
export const splitUnits = (text: string) => text.split(UNIT_SEPARATOR).map(u => u.trim()).filter(Boolean)
export const joinUnits = (units: readonly string[]) => units.join(UNIT_SEPARATOR)
// The lower text of a combat card as shown: the unit names in italics, a space, a colon, then the unit text.
export function lowerText(card: { units?: readonly string[]; unit_text?: string }) {
  const names = (card.units ?? []).filter(Boolean)
  return names.length ? `*${joinUnits(names)}* : ${card.unit_text ?? ''}` : card.unit_text ?? ''
}
// Splits an old lower text ("Skitarii/Light Cruiser: Force ...") into unit names and unit text.
export function splitLowerText(text: string): { units: string[]; unit_text: string } {
  const at = text.indexOf(':')
  const prefix = at > 0 ? text.slice(0, at) : ''
  if (!prefix.includes(UNIT_SEPARATOR) || prefix.length > 60 || /[.*()[\]]/.test(prefix)) return { units: [], unit_text: text }
  const units = splitUnits(prefix)
  return units.length ? { units, unit_text: text.slice(at + 1).trimStart() } : { units: [], unit_text: text }
}
export function cardDraft(card: CardInput): CardDraft {
  const draft = Object.fromEntries(Object.entries(card).filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key)).map(([key, value]) => [key, key === 'units' ? joinUnits(value as string[]) : String(value)]))
  // Optional fields a card does not have are empty, not missing.
  for (const f of FIELDS[card.category] ?? []) if (f.optional && draft[f.key] === undefined) draft[f.key] = ''
  return draft
}
