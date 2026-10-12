import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field, inputClass, selectClass } from '../../components/Field'
import { createCard } from '../cards/api'
import { ACTION_LABELS, CATEGORIES, FIELDS, newDraft, type CardInput, type Category } from '../cards/model'
import { draftInput, validateCard } from '../cards/validation'
import { useFactions } from '../factions/api'
import { CardCanvas } from './CardCanvas'
import { useTemplate, useTemplateLayout } from './library'
import { useFactionLogos } from './logos'
import { LIBRARY_TABS, libraryLink, withSubtypeLayout, type CombatCard } from './model'
import type { RenderInput } from './render'
import { useAssembly } from './state'
import { resolveSubtype, useSubtypes } from './subtypes'
import { useRenderedCard } from './useCardView'
import { uploadArtwork } from './api'

// An empty card form for the library's faction and tab. Combat cards preview
// live on the faction's template, including artwork chosen here; it is
// uploaded right after the card is created and positioned in the editor.
export default function NewCardPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const factions = useFactions()
  const initialCategory = LIBRARY_TABS.find(t => t.slug === params.get('tab'))?.category ?? useAssembly.getState().category
  const [draft, setDraft] = useState(() => newDraft(initialCategory, params.get('faction') ?? String(useAssembly.getState().factionId ?? '')))
  const category = draft.category as Category
  const factionId = Number(draft.faction_id) || null
  const issues = useMemo(() => validateCard(draftInput(draft), factions.data?.map(f => f.id) ?? []), [draft, factions.data])
  const set = (key: string, value: string) => setDraft(d => ({ ...d, [key]: value }))
  const [artwork, setArtwork] = useState<File | null>(null)
  const [artworkUrl, setArtworkUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!artwork) { setArtworkUrl(null); return }
    const url = URL.createObjectURL(artwork); setArtworkUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [artwork])

  // Preview with a placeholder title until one is typed.
  const previewIssues = useMemo(() => validateCard(draftInput({ ...draft, name: draft.name || 'New card' }), factions.data?.map(f => f.id) ?? []), [draft, factions.data])
  const previewCard = useMemo(() => category === 'combat' && factions.data && !previewIssues.length ? draftInput({ ...draft, name: draft.name || 'New card' }) as CombatCard : null, [category, draft, factions.data, previewIssues])
  const template = useTemplate(factionId, 'combat')
  const templateLayout = useTemplateLayout()
  const subtypes = useSubtypes(), logos = useFactionLogos()
  const subtype = resolveSubtype(subtypes.data, 0, previewCard)
  const logoUrl = logos.data?.find(l => l.faction_id === factionId)?.url ?? null
  const input = useMemo<RenderInput | null>(() => previewCard && template.image && templateLayout.ready && !subtypes.isPending && !logos.isPending
    ? { card: previewCard, layout: withSubtypeLayout(templateLayout.layout, subtype?.layout), imageUrl: template.image.url, overlayUrl: null, overlayUrls: subtype?.overlays.map(o => o.url) ?? [], logoUrl, artworkUrl }
    : null, [previewCard, template.image, templateLayout.ready, templateLayout.layout, subtypes.isPending, logos.isPending, subtype, logoUrl, artworkUrl])
  const { result, error } = useRenderedCard(input)

  const create = useMutation({
    mutationFn: async () => {
      const card = await createCard(draftInput(draft) as CardInput)
      // The card exists even if the upload fails; the editor reports it and
      // offers the upload again.
      let artworkError = ''
      if (artwork && card.category === 'combat') await uploadArtwork(String(card.id), artwork).catch(e => { artworkError = e instanceof Error ? e.message : 'upload failed' })
      return { card, artworkError }
    },
    onSuccess: ({ card, artworkError }) => {
      void queryClient.invalidateQueries({ queryKey: ['cards'] })
      useAssembly.getState().select({ factionId: card.faction_id, category: card.category })
      navigate(card.category === 'combat' ? `/assemble/cards/${card.id}` : libraryLink(card.faction_id, card.category), { state: artworkError ? { artworkError } : undefined })
    },
  })
  const fieldIssue = (key: string) => draft.name || key !== 'name' ? issues.find(i => i.field === key)?.message : undefined

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
      <section aria-label="Card preview" className="flex min-h-80 items-center justify-center rounded-lg border border-divider bg-black/30 p-3 lg:sticky lg:top-5">
        {result
          ? <CardCanvas result={result} aria-label="New card preview" className="block h-auto max-h-[85vh] max-w-full" />
          : <p role="status" className="p-6 text-center text-sm text-ink/60">{category !== 'combat'
            ? 'Previews are available for combat cards only.'
            : error || (previewIssues.length ? 'Fill in the fields to see the preview.' : !template.isPending && !template.image ? 'No combat template chosen for this faction. Pick one with the settings button in the library.' : 'Rendering card…')}</p>}
      </section>
      <section aria-label="Card fields" className="space-y-4 rounded-lg border border-divider bg-surface p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Faction">{id => <select id={id} className={selectClass} value={draft.faction_id} onChange={e => set('faction_id', e.target.value)}>
            <option value="">Choose a faction…</option>
            {factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>}</Field>
          <Field label="Type">{id => <select id={id} className={selectClass} value={category} onChange={e => setDraft(d => ({ ...newDraft(e.target.value as Category, d.faction_id), name: d.name }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{LIBRARY_TABS.find(t => t.category === c)!.label}</option>)}
          </select>}</Field>
        </div>
        <Field label="Title">{id => <input id={id} className={inputClass} value={draft.name} autoFocus placeholder="Card title" onChange={e => set('name', e.target.value)} />}</Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {FIELDS[category].filter(f => f.kind !== 'text').map(f => <Field key={f.key} label={f.label}>{id => f.kind === 'select'
            ? <select id={id} className={selectClass} value={draft[f.key]} onChange={e => set(f.key, e.target.value)}>{f.options?.map(o => <option key={o} value={o}>{ACTION_LABELS[o] ?? o}</option>)}</select>
            : <input id={id} type="number" min={0} step={1} className={inputClass} value={draft[f.key]} onChange={e => set(f.key, e.target.value)}
              disabled={f.key === 'resource_cost' && draft.level === '0'} title={f.key === 'resource_cost' && draft.level === '0' ? 'Level 0 cards have no resource price' : undefined} />}</Field>)}
        </div>
        {category === 'combat' && <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center rounded-md border border-divider px-3.5 py-2 text-xs font-semibold uppercase tracking-wider hover:border-accent/60">
            {artwork ? 'Replace artwork' : 'Add artwork'}
            <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Artwork file (PNG / JPEG)"
              onChange={e => { const file = e.target.files?.[0]; if (file) setArtwork(file); e.target.value = '' }} />
          </label>
          {artwork && <><span className="truncate text-xs text-ink/60">{artwork.name}</span><Button onClick={() => setArtwork(null)}>Remove</Button></>}
        </div>}
        {FIELDS[category].filter(f => f.kind === 'text').map(f => <Field key={f.key} label={f.label}>{id => <textarea id={id} rows={4} className={inputClass} value={draft[f.key]} onChange={e => set(f.key, e.target.value)} />}</Field>)}
        <p className="m-0 text-xs text-ink/60">(B), (S), (M) insert icons; [B], [S] boxed boltgun and shield (morale is never boxed). **Italic text** is supported.{category === 'combat' ? ' Position the artwork in the editor after creating the card.' : ''}</p>
        {issues.some(i => fieldIssue(i.field)) && <div role="alert" className="text-xs text-danger">{issues.filter(i => fieldIssue(i.field)).map(i => <p key={i.field} className="m-0">{i.field}: {i.message}</p>)}</div>}
      </section>
    </div>
  </div>
}
