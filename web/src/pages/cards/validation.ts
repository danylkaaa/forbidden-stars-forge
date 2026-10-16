import { CATEGORIES, FIELDS, splitLowerText, splitUnits, type Category, type CardInput, type CardDraft } from './model'
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
  const allowed = ['faction_id', 'name', 'category', ...(v.category === 'combat' ? ['starting'] : []), ...fields.map(f => f.key)]
  for (const key of Object.keys(v)) if (!allowed.includes(key)) add(key, 'Unknown field or field from another category')
  // A combat card is a starting card only with "starting": true (level 0, no
  // price; both default to that); otherwise it is a regular card of level 0–3.
  let effective = v
  if (v.category === 'combat' && 'starting' in v) {
    if (typeof v.starting !== 'boolean') add('starting', 'Must be true or false')
    else if (v.starting) {
      effective = { ...v, level: v.level ?? 0, resource_cost: v.resource_cost ?? 0 }
      if (effective.level !== 0) add('level', 'Must be 0 for a starting card')
      if (effective.resource_cost !== 0) add('resource_cost', 'Must be 0 for a starting card')
    }
  }
  for (const f of fields) {
    const x = effective[f.key]
    if (f.optional && x === undefined) continue
    if (f.kind === 'number' || f.key === 'level') {
      const max = f.key === 'level' ? 3 : Number.MAX_SAFE_INTEGER
      if (typeof x !== 'number' || !Number.isSafeInteger(x) || x < 0 || x > max) add(f.key, `Must be an integer from 0 to ${max}`)
    } else if (f.kind === 'list') {
      if (!Array.isArray(x) || x.some(u => typeof u !== 'string' || !u.trim() || u.includes('/'))) add(f.key, 'Must be a list of non-empty unit names without "/" (an empty list is allowed)')
    } else if (f.kind === 'text') {
      if (typeof x !== 'string') add(f.key, 'Must be a string (empty text is allowed)')
    } else if (typeof x !== 'string' || !f.options?.includes(x)) add(f.key, `Must be one of: ${f.options?.join(', ')}`)
  }
  return errors
}
export function draftInput(draft: CardDraft): unknown {
  const category = draft.category as Category
  const input: Record<string, unknown> = { faction_id: numeric(draft.faction_id), name: draft.name.trim(), category }
  for (const f of FIELDS[category] ?? []) {
    // An optional field left empty is not sent at all.
    if (f.optional && !(draft[f.key] ?? '').trim()) continue
    input[f.key] = f.kind === 'number' || f.key === 'level' ? numeric(draft[f.key]) : f.kind === 'list' ? splitUnits(draft[f.key] ?? '') : draft[f.key]
  }
  if (category === 'combat') input.starting = draft.starting === 'true'
  return input
}
function numeric(value: string): number { return /^\d+$/.test(value) ? Number(value) : NaN }
export function parseImport(source: string, factionIds: readonly number[]): { cards: CardInput[]; errors: ValidationIssue[] } {
  let value: unknown
  try { value = JSON.parse(source.replace(/^\uFEFF/, '')) } catch { return { cards: [], errors: [{ field: 'file', message: 'Invalid JSON syntax' }] } }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { cards: [], errors: [{ field: 'cards', message: 'Expected an object with a cards array' }] }
  const v = value as Record<string, unknown>
  const errors: ValidationIssue[] = []
  if (!Array.isArray(v.cards) || v.cards.length === 0) return { cards: [], errors: [...errors, { field: 'cards', message: 'Must be a non-empty array' }] }
  // Import files may include extraction metadata or fields for other categories.
  // Only pass the selected category's fields to validation and the API.
  const cards = v.cards.map((card: unknown) => {
    if (!card || typeof card !== 'object' || Array.isArray(card)) return card
    let c = card as Record<string, unknown>
    // Files from before the split carry one lower_text: its "names:" prefix becomes the units.
    if (c.category === 'combat' && typeof c.lower_text === 'string' && !('unit_text' in c) && !('units' in c)) {
      const { lower_text, ...rest } = c
      c = { ...rest, ...splitLowerText(lower_text) }
    }
    const fields = CATEGORIES.includes(c.category as Category) ? FIELDS[c.category as Category] : []
    const allowed = ['faction_id', 'name', 'category', ...(c.category === 'combat' ? ['starting'] : []), ...fields.map(f => f.key)]
    // An optional field may be null (as exports often write it): that means it is left out.
    const optional = fields.filter(f => f.optional).map(f => f.key)
    return Object.fromEntries(Object.entries(c).filter(([key, value]) => allowed.includes(key) && !(optional.includes(key) && value === null)))
  })
  cards.forEach((c: unknown, index: number) => errors.push(...validateCard(c, factionIds).map(e => ({ ...e, index }))))
  return { cards: errors.length ? [] : cards as CardInput[], errors }
}
