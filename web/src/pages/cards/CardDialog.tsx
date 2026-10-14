import { SearchableSelect } from '../../components/SearchableSelect'
import { useState, type FormEvent } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { StepperInput } from '../../components/StepperInput'
import { Field, inputClass } from '../../components/Field'
import { DiffPanel } from '../../components/DiffPanel'
import { isDraftDirty } from '../../lib/draftForm'
import type { Faction } from '../factions/api'
import { ACTION_LABELS, CATEGORIES, FIELDS, LABELS, newDraft, type CardInput, type Category } from './model'
import { draftInput, validateCard } from './validation'
import { createCard, updateCard } from './api'
import { useCardDraft } from './store'

export function CardDialog({ id, factions, onClose, onSaved }: { id: number | null; factions: Faction[]; onClose: () => void; onSaved: () => void }) {
  const state = useCardDraft()
  const { draft, persisted } = state
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showDiff, setShowDiff] = useState(false)
  if (!draft || !persisted) return null
  const category = draft.category as Category
  const dirty = isDraftDirty(state)
  const textKeys = new Set(['name', 'text', 'upper_text', 'lower_text'])
  const keys = [...new Set([...Object.keys(persisted), ...Object.keys(draft)])]
  const label = (key: string) => FIELDS[category].find(f => f.key === key)?.label ?? key.replaceAll('_', ' ')
  const display = (key: string, value: string | undefined) => key === 'faction_id' ? factions.find(f => String(f.id) === value)?.name ?? value ?? '—' : value ?? '—'
  async function save(e: FormEvent) {
    e.preventDefault()
    if (!draft || saving) return
    const input = draftInput(draft)
    const issues = validateCard(input, factions.map(f => f.id))
    if (issues.length) { setError(issues.map(e => `${e.field}: ${e.message}`).join('; ')); return }
    setSaving(true); setError('')
    try {
      if (id !== null) await updateCard(id, input as CardInput)
      else await createCard(input as CardInput)
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed') }
    finally { setSaving(false) }
  }
  return <Dialog title={id === null ? 'New Card' : 'Edit Card'} onBackdropClick={() => { if (!saving) onClose() }}
    titleExtra={dirty ? <span className="text-xs text-warn">Unsaved changes</span> : undefined}>
    <form onSubmit={save} className="flex flex-col gap-4">
      <fieldset disabled={saving} className="m-0 flex flex-col gap-4 border-0 p-0">
        <Field label="Faction">{fieldId => <SearchableSelect id={fieldId} className={inputClass} value={draft.faction_id} onChange={e => state.setField('faction_id', e.target.value)}>
          <option value="">Select a faction</option>{factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </SearchableSelect>}</Field>
        <Field label="Name">{fieldId => <input id={fieldId} className={inputClass} value={draft.name} onChange={e => state.setField('name', e.target.value)} />}</Field>
        <Field label="Category">{fieldId => <SearchableSelect id={fieldId} className={inputClass} value={category} onChange={e => {
          const next = newDraft(e.target.value as Category, draft.faction_id); next.name = draft.name
          useCardDraft.setState({ draft: next }); setError('')
        }}>{CATEGORIES.map(c => <option key={c} value={c}>{LABELS[c]}</option>)}</SearchableSelect>}</Field>
        {FIELDS[category].map(f => <Field key={f.key} label={f.label}>{fieldId => f.kind === 'number' || f.key === 'level'
          ? <StepperInput id={fieldId} label={f.label} value={Number(draft[f.key]) || 0} min={0} max={f.key === 'level' ? 3 : 999999} onChange={n => state.setField(f.key, String(n))} />
          : f.kind === 'select'
          ? <SearchableSelect id={fieldId} className={inputClass} value={draft[f.key]} onChange={e => state.setField(f.key, e.target.value)}>{f.options?.map(o => <option key={o} value={o}>{ACTION_LABELS[o] ?? o}</option>)}</SearchableSelect>
          : f.kind === 'text' ? <textarea id={fieldId} className={`${inputClass} min-h-24`} value={draft[f.key]} onChange={e => state.setField(f.key, e.target.value)} />
            : null
        }</Field>)}
        {category === 'schema' && <p className="m-0 text-xs text-ink/60">Movement takes place within its own field.</p>}
      </fieldset>
      <p className="m-0 text-xs text-ink/60">Changes are saved only when you click Save.</p>
      {showDiff && dirty && <DiffPanel
        simpleRows={keys.filter(k => !textKeys.has(k) && draft[k] !== persisted[k]).map(k => ({ field: label(k), before: display(k, persisted[k]), after: display(k, draft[k]) }))}
        textDiffs={keys.filter(k => textKeys.has(k)).map(k => ({ field: label(k), before: persisted[k] ?? '', after: draft[k] ?? '' }))} />}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-between gap-2">
        <div>{dirty && <Button type="button" disabled={saving} onClick={() => setShowDiff(!showDiff)}>{showDiff ? 'Hide diff' : 'Show diff'}</Button>}</div>
        <div className="flex gap-2">
          {dirty && <Button type="button" disabled={saving} onClick={() => { state.discard(); setError('') }}>Discard</Button>}
          <Button type="button" disabled={saving} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={saving || !factions.length}>{saving ? 'Saving…' : 'Save'}</Button>
        </div>
      </div>
    </form>
  </Dialog>
}
