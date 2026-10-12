export const CATEGORIES = ['combat', 'schema', 'upgrade'] as const
export type Category = typeof CATEGORIES[number]
type Common = { faction_id: number; name: string; category: Category }
export type CardInput = Common & (
  | { category: 'combat'; level: number; resource_cost: number; shields: number; guns: number; eagles: number; upper_text: string; lower_text: string }
  | { category: 'schema'; subtype: 'schema' | 'tactic'; text: string; action: 'rotate_clockwise' | 'rotate_counterclockwise' | 'move_vertical' | 'move_horizontal' }
  | { category: 'upgrade'; upgrade_type: 'deploy' | 'advance' | 'strategize' | 'upgrade'; text: string }
)
export type Card = CardInput & { id: number; created_at: string; updated_at: string }
export type CardField = { key: string; label: string; kind: 'number' | 'text' | 'select'; options?: readonly string[]; max?: number }
export const LABELS: Record<Category, string> = { combat: 'Combat', schema: 'Schema / Tactic', upgrade: 'Upgrade' }
export const FIELDS: Record<Category, CardField[]> = {
  combat: [
    { key: 'level', label: 'Level', kind: 'select', options: ['0', '1', '2', '3'] },
    { key: 'resource_cost', label: 'Resource price', kind: 'number' },
    { key: 'shields', label: 'Shields', kind: 'number' },
    { key: 'guns', label: 'Guns', kind: 'number' },
    { key: 'eagles', label: 'Eagles', kind: 'number' },
    { key: 'upper_text', label: 'Upper text', kind: 'text' },
    { key: 'lower_text', label: 'Lower text', kind: 'text' },
  ],
  schema: [
    { key: 'subtype', label: 'Subtype', kind: 'select', options: ['schema', 'tactic'] },
    { key: 'action', label: 'Action', kind: 'select', options: ['rotate_clockwise', 'rotate_counterclockwise', 'move_vertical', 'move_horizontal'] },
    { key: 'text', label: 'Text', kind: 'text' },
  ],
  upgrade: [
    { key: 'upgrade_type', label: 'Upgrade type', kind: 'select', options: ['deploy', 'advance', 'strategize', 'upgrade'] },
    { key: 'text', label: 'Text', kind: 'text' },
  ],
}
export const ACTION_LABELS: Record<string, string> = {
  rotate_clockwise: 'Rotate clockwise', rotate_counterclockwise: 'Rotate counterclockwise',
  move_vertical: 'Move vertically', move_horizontal: 'Move horizontally',
}
export type CardDraft = Record<string, string>
export function newDraft(category: Category, factionId = ''): CardDraft {
  const draft: CardDraft = { faction_id: factionId, name: '', category }
  for (const f of FIELDS[category]) draft[f.key] = f.options?.[0] ?? (f.kind === 'number' ? '0' : '')
  return draft
}
export function cardDraft(card: CardInput): CardDraft {
  return Object.fromEntries(Object.entries(card).filter(([key]) => !['id', 'created_at', 'updated_at'].includes(key)).map(([key, value]) => [key, String(value)]))
}
