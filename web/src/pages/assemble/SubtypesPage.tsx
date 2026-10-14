import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { inputClass } from '../../components/Field'
import type { Category } from '../cards/model'
import { CategoryTabs } from './CategoryTabs'
import { FactionCardLayoutEditor } from '../faction-card/FactionCardLayoutEditor'
import { LIBRARY_TABS } from './model'
import { useAssembly } from './state'
import { SubtypeLayoutEditor } from './SubtypeLayoutEditor'
import { CardTypeLayoutEditor } from './CardTypeLayoutEditor'
import { CardBackEditor } from './CardBackEditor'
import { createSubtype, deleteSubtype, deleteSubtypeOverlay, moveOverlay, renameSubtype, reorderSubtypeOverlays, uploadSubtypeOverlay, isBuiltinSubtype, displaySubtypeName, useSubtypes, type Subtype } from './subtypes'

// Overlays are drawn bottom first, so the stack preview layers them in order.
function StackPreview({ subtype }: { subtype: Subtype }) {
  return <div className="relative aspect-[3/4] w-40 shrink-0 overflow-hidden rounded border border-divider bg-[repeating-conic-gradient(#2a2420_0_25%,#1a1512_0_50%)] bg-[length:16px_16px]">
    {subtype.overlays.map(o => <img key={o.id} src={o.url} alt="" className="absolute inset-0 h-full w-full object-fill" />)}
    {!subtype.overlays.length && <span className="absolute inset-0 grid place-items-center p-2 text-center text-xs text-ink/50">No overlays</span>}
  </div>
}

function SubtypePanel({ subtype }: { subtype: Subtype }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState(subtype.name)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [editingPositions, setEditingPositions] = useState(false)
  const update = (saved: Subtype) => queryClient.setQueryData<Subtype[]>(['subtypes'], old => old?.map(s => s.id === saved.id ? saved : s))
  const change = useMutation({
    mutationFn: (action: () => Promise<Subtype>) => action(),
    onSuccess: update,
  })
  const remove = useMutation({
    mutationFn: () => deleteSubtype(subtype.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subtypes'] }),
  })
  const ids = subtype.overlays.map(o => o.id)
  const busy = change.isPending || remove.isPending
  // Listed top of the stack first, matching how the layers look.
  const listed = subtype.overlays.map((o, index) => ({ ...o, index })).reverse()
  return <section aria-label={`Subtype ${subtype.name}`} className="flex flex-wrap gap-4 rounded-lg border border-divider bg-surface p-4">
    <StackPreview subtype={subtype} />
    <div className="min-w-64 flex-1 space-y-3">
      {isBuiltinSubtype(subtype) ? <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="m-0 text-lg font-medium">{displaySubtypeName(subtype.name)}</h2>
        <span className="text-[10px] uppercase tracking-wider text-ink/40">built-in</span>
        <span className="text-xs text-ink/55">Used automatically for {subtype.name === 'Level 0' ? 'starting' : 'regular (non-starting)'} combat cards without a chosen subtype.</span>
      </div> : <div className="flex flex-wrap items-center gap-2">
        <input aria-label="Subtype name" className={`${inputClass} max-w-64`} value={name} onChange={e => setName(e.target.value)} />
        <Button disabled={busy || !name.trim() || name.trim() === subtype.name} onClick={() => change.mutate(() => renameSubtype(subtype.id, name))}>Rename</Button>
        {confirmDelete
          ? <><Button variant="primary" disabled={busy} onClick={() => remove.mutate()}>Confirm delete</Button><Button onClick={() => setConfirmDelete(false)}>Cancel</Button></>
          : <Button disabled={busy} onClick={() => setConfirmDelete(true)}>Delete subtype</Button>}
      </div>}
      {(change.isError || remove.isError) && <p role="alert" className="m-0 text-sm text-danger">{(change.error ?? remove.error)?.message}</p>}
      <ol className="m-0 list-none space-y-1.5 p-0">
        {listed.map(o => <li key={o.id} className="flex items-center gap-2 rounded border border-divider bg-bg p-1.5">
          <img src={o.url} alt="" className="h-12 w-9 rounded-sm bg-black/40 object-cover" />
          <span className="flex-1 text-xs text-ink/70">Layer {o.index + 1}{o.index === 0 ? ' · bottom' : o.index === ids.length - 1 ? ' · top' : ''}</span>
          <Button aria-label={`Move layer ${o.index + 1} up`} disabled={busy || o.index === ids.length - 1} onClick={() => change.mutate(() => reorderSubtypeOverlays(subtype.id, moveOverlay(ids, o.index, 1)))}>↑</Button>
          <Button aria-label={`Move layer ${o.index + 1} down`} disabled={busy || o.index === 0} onClick={() => change.mutate(() => reorderSubtypeOverlays(subtype.id, moveOverlay(ids, o.index, -1)))}>↓</Button>
          <Button aria-label={`Remove layer ${o.index + 1}`} disabled={busy} onClick={() => change.mutate(() => deleteSubtypeOverlay(subtype.id, o.id))}>Remove</Button>
        </li>)}
      </ol>
      <label className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-3.5 py-2 text-xs font-semibold uppercase tracking-wider hover:border-accent/60 ${busy ? 'pointer-events-none opacity-45' : ''}`}>
        Upload overlay (PNG)
        <input type="file" accept="image/png" className="sr-only" aria-label={`Upload overlay for ${subtype.name}`} disabled={busy}
          onChange={e => { const file = e.target.files?.[0]; if (file) change.mutate(() => uploadSubtypeOverlay(subtype.id, file)); e.target.value = '' }} />
      </label>
      {subtype.category === 'combat' && <Button aria-expanded={editingPositions} className="ml-2" onClick={() => setEditingPositions(v => !v)}>{editingPositions ? 'Close positions' : 'Edit positions'}</Button>}
      <p className="m-0 text-xs text-ink/50">New overlays go on top. Cards with this subtype use this stack instead of the card type overlay.</p>
    </div>
    {editingPositions && <div className="w-full"><SubtypeLayoutEditor subtype={subtype} /></div>}
  </section>
}

export default function SubtypesPage() {
  const subtypes = useSubtypes()
  const queryClient = useQueryClient()
  const category = useAssembly(s => s.category)
  const select = useAssembly(s => s.select)
  const [name, setName] = useState('')
  const [factionTab, setFactionTab] = useState(false)
  const create = useMutation({
    mutationFn: ({ category, name }: { category: Category; name: string }) => createSubtype(category, name),
    onSuccess: () => { setName(''); void queryClient.invalidateQueries({ queryKey: ['subtypes'] }) },
  })
  const shown = subtypes.data?.filter(s => s.category === category) ?? []
  const counts = Object.fromEntries(LIBRARY_TABS.map(t => [t.category, subtypes.data?.filter(s => s.category === t.category).length ?? 0]))
  const label = LIBRARY_TABS.find(t => t.category === category)!.label
  return <div className="space-y-5">
    <div>
      <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Card Types</h1>
      <p className="m-0 text-sm text-ink/60">Text layout for each card type, and its subtypes with their own overlay stacks.</p>
    </div>
    <CategoryTabs value={factionTab ? null : category} onChange={c => { create.reset(); setFactionTab(false); select({ category: c }) }} badges={counts} faction={{ active: factionTab, onSelect: () => setFactionTab(true) }} />
    {factionTab ? <details className="rounded-lg border border-divider bg-surface p-4" open>
      <summary className="cursor-pointer font-display text-lg text-accent-300">Faction card layout</summary>
      <div className="mt-3"><FactionCardLayoutEditor /></div>
    </details> : <>
    <details className="rounded-lg border border-divider bg-surface p-4" open>
      <summary className="cursor-pointer font-display text-lg text-accent-300">{label} front layout</summary>
      <div className="mt-3"><CardTypeLayoutEditor key={category} category={category} /></div>
    </details>
    {category === 'combat' && <details className="rounded-lg border border-divider bg-surface p-4" open>
      <summary className="cursor-pointer font-display text-lg text-accent-300">Combat back layout</summary>
      <div className="mt-3"><CardBackEditor /></div>
    </details>}
    <h2 className="m-0 font-display text-lg text-accent-300">{label} subtypes</h2>
    <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); if (name.trim()) create.mutate({ category, name: name.trim() }) }}>
      <input aria-label="New subtype name" className={`${inputClass} max-w-72`} placeholder={`New ${label.toLowerCase()} subtype`} value={name} onChange={e => { create.reset(); setName(e.target.value) }} />
      <Button variant="primary" type="submit" disabled={!name.trim() || create.isPending}>Add subtype</Button>
    </form>
    {create.isError && <p role="alert" className="text-sm text-danger">{create.error.message}</p>}
    {subtypes.isError && <p role="alert" className="text-danger">{subtypes.error.message}</p>}
    {!subtypes.isPending && !shown.length && <p className="text-sm text-ink/60">No {label.toLowerCase()} subtypes yet.</p>}
    <div className="space-y-4">{shown.map(s => <SubtypePanel key={s.id} subtype={s} />)}</div>
    </>}
  </div>
}
