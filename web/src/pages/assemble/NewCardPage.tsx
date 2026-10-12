import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field, inputClass, selectClass } from '../../components/Field'
import { createCard } from '../cards/api'
import { ACTION_LABELS, CATEGORIES, FIELDS, newDraft, type CardInput, type Category } from '../cards/model'
import { draftInput, validateCard } from '../cards/validation'
import { useFactions } from '../factions/api'
import { LIBRARY_TABS, libraryLink } from './model'
import { useAssembly } from './state'
import CardEditorPage from './CardEditorPage'

// Combat creation uses the same editor as saved cards. Other categories
// keep their category-specific fields until their assembly editor is ready.
export default function NewCardPage() {
  const [params, setParams] = useSearchParams()
  const category = LIBRARY_TABS.find(t => t.slug === params.get('tab'))?.category ?? useAssembly.getState().category
  const faction = params.get('faction') ?? String(useAssembly.getState().factionId ?? '')
  const changeCategory = (next: Category, factionId: string) => setParams({ faction: factionId, tab: LIBRARY_TABS.find(t => t.category === next)!.slug })
  return category === 'combat'
    ? <CardEditorPage newFactionId={faction} onCategoryChange={changeCategory} />
    : <BasicNewCardPage key={category} category={category} faction={faction} onCategoryChange={changeCategory} />
}

function BasicNewCardPage({ category, faction, onCategoryChange }: {
  category: Category; faction: string; onCategoryChange: (category: Category, factionId: string) => void
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const factions = useFactions()
  const [draft, setDraft] = useState(() => newDraft(category, faction))
  const factionId = Number(draft.faction_id) || null
  const issues = useMemo(() => validateCard(draftInput(draft), factions.data?.map(f => f.id) ?? []), [draft, factions.data])
  const set = (key: string, value: string) => setDraft(d => ({ ...d, [key]: value }))
  const create = useMutation({
    mutationFn: () => createCard(draftInput(draft) as CardInput),
    onSuccess: card => {
      void queryClient.invalidateQueries({ queryKey: ['cards'] })
      useAssembly.getState().select({ factionId: card.faction_id, category: card.category })
      navigate(libraryLink(card.faction_id, card.category))
    },
  })
  const shownIssues = issues.filter(i => draft.name || i.field !== 'name')
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link to={factionId ? libraryLink(factionId, category) : '/assemble'} className="text-sm text-accent no-underline hover:underline">← Library</Link>
        <h1 className="m-0 font-display text-2xl text-accent-300">New card</h1>
      </div>
      <Button variant="primary" disabled={!!issues.length || create.isPending} onClick={() => create.mutate()}>{create.isPending ? 'Creating…' : 'Create card'}</Button>
    </div>
    {create.isError && <p role="alert" className="text-danger">{create.error.message}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,1.2fr)_minmax(300px,1fr)]">
      <section aria-label="Card preview" className="flex min-h-80 items-center justify-center rounded-lg border border-divider bg-black/30 p-3">
        <p role="status" className="p-6 text-center text-sm text-ink/60">Previews are available for combat cards only.</p>
      </section>
      <section aria-label="Card fields" className="space-y-4 rounded-lg border border-divider bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Faction">{id => <select id={id} className={selectClass} value={draft.faction_id} onChange={e => set('faction_id', e.target.value)}>
            <option value="">Choose a faction…</option>
            {factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>}</Field>
          <Field label="Type">{id => <select id={id} className={selectClass} value={category} onChange={e => onCategoryChange(e.target.value as Category, draft.faction_id)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{LIBRARY_TABS.find(t => t.category === c)!.label}</option>)}
          </select>}</Field>
        </div>
        <Field label="Title">{id => <input id={id} className={inputClass} value={draft.name} autoFocus placeholder="Card title" onChange={e => set('name', e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FIELDS[category].filter(f => f.kind !== 'text').map(f => <Field key={f.key} label={f.label}>{id => <select id={id} className={selectClass} value={draft[f.key]} onChange={e => set(f.key, e.target.value)}>{f.options?.map(o => <option key={o} value={o}>{ACTION_LABELS[o] ?? o}</option>)}</select>}</Field>)}
        </div>
        {FIELDS[category].filter(f => f.kind === 'text').map(f => <Field key={f.key} label={f.label}>{id => <textarea id={id} rows={4} className={inputClass} value={draft[f.key]} onChange={e => set(f.key, e.target.value)} />}</Field>)}
        <p className="m-0 text-xs text-ink/60">(B), (S), (M) insert icons; [B], [S] boxed boltgun and shield (morale is never boxed). **Italic text** is supported.</p>
        {!!shownIssues.length && <div role="alert" className="text-xs text-danger">{shownIssues.map(i => <p key={i.field} className="m-0">{i.field}: {i.message}</p>)}</div>}
      </section>
    </div>
  </div>
}
