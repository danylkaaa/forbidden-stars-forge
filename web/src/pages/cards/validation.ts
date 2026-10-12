import { CATEGORIES, FIELDS, type Category, type CardInput, type CardDraft } from './model'
export type ValidationIssue = { index?: number; field: string; message: string }
export function validateCard(value: unknown, factionIds: readonly number[]): ValidationIssue[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [{ field: 'card', message: 'Must be an object' }]
  const v = value as Record<string, unknown>
  const errors: ValidationIssue[] = []
  const add = (field: string, message: string) => errors.push({ field, message })
  if (typeof v.faction_id !== 'number' || !Number.isSafeInteger(v.faction_id) || v.faction_id <= 0) add('faction_id', 'Must be a positive safe integer')
  else if (!factionIds.includes(v.faction_id)) add('faction_id', 'Faction does not exist')
  if (typeof v.name !== 'string' || !v.name.trim()) add('name', 'A non-empty name is required')
  if (!CATEGORIES.includes(v.category as Category)) { add('category', 'Must be combat, schema, or upgrade'); return errors }
  const fields = FIELDS[v.category as Category]
  const allowed = ['faction_id', 'name', 'category', ...fields.map(f => f.key)]
  for (const key of Object.keys(v)) if (!allowed.includes(key)) add(key, 'Unknown field or field from another category')
  for (const f of fields) {
    const x = v[f.key]
    if (f.kind === 'number' || f.key === 'level') {
      const max = f.key === 'level' ? 3 : Number.MAX_SAFE_INTEGER
      if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0 || x > max) add(f.key, `Must be an integer from 0 to ${max}`)
    } else if (f.kind === 'text') {
      if (typeof x !== 'string') add(f.key, 'Must be a string (empty text is allowed)')
    } else if (typeof x !== 'string' || !f.options?.includes(x)) add(f.key, `Must be one of: ${f.options?.join(', ')}`)
  }
  return errors
}
export function draftInput(draft: CardDraft): unknown {
  const category = draft.category as Category
  const input: Record<string, unknown> = { faction_id: numeric(draft.faction_id), name: draft.name.trim(), category }
  for (const f of FIELDS[category] ?? []) input[f.key] = f.kind === 'number' || f.key === 'level' ? numeric(draft[f.key]) : draft[f.key]
  return input
}
function numeric(value: string): number { return /^\d+$/.test(value) ? Number(value) : NaN }
export function parseImport(source: string, factionIds: readonly number[]): { cards: CardInput[]; errors: ValidationIssue[] } {
  let value: unknown
  try { value = JSON.parse(source.replace(/^\uFEFF/, '')) } catch { return { cards: [], errors: [{ field: 'file', message: 'Invalid JSON syntax' }] } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { cards: [], errors: [{ field: 'cards', message: 'Expected an object with a cards array' }] }
  const v = value as Record<string, unknown>
  const errors: ValidationIssue[] = Object.keys(v).filter(k => k !== 'cards').map(field => ({ field, message: 'Unknown field' }))
  if (!Array.isArray(v.cards) || v.cards.length === 0) return { cards: [], errors: [...errors, { field: 'cards', message: 'Must be a non-empty array' }] }
  v.cards.forEach((c: unknown, index: number) => errors.push(...validateCard(c, factionIds).map(e => ({ ...e, index }))))
  return { cards: errors.length ? [] : v.cards as CardInput[], errors }
}
