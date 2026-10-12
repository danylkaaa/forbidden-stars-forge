import { SearchableSelect } from '../../components/SearchableSelect'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { inputClass } from '../../components/Field'
import { isDraftDirty } from '../../lib/draftForm'
import { useFactions } from '../factions/api'
import { CATEGORIES, LABELS, cardDraft, newDraft, type Card } from './model'
import { useCards } from './api'
import { useCardDraft } from './store'
import { CardDialog } from './CardDialog'
import { ImportCardsDialog } from './ImportCardsDialog'
import { UnsavedGuard } from './UnsavedGuard'

export default function CardsPage() {
  const [factionId, setFactionId] = useState('')
  const [category, setCategory] = useState('')
  const factions = useFactions()
  const cards = useCards(factionId, category)
  const qc = useQueryClient()
  const [editor, setEditor] = useState<{ id: number | null } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [importDirty, setImportDirty] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [notice, setNotice] = useState('')
  const draftState = useCardDraft()
  const dirty = Boolean(editor && isDraftDirty(draftState)) || (importOpen && importDirty)
  useEffect(() => () => { useCardDraft.getState().close() }, [])
  const close = () => { useCardDraft.getState().close(); setEditor(null); setImportOpen(false); setImportDirty(false); setConfirmClose(false) }
  const requestClose = () => { if (dirty) setConfirmClose(true); else close() }
  const openEditor = (card?: Card) => {
    useCardDraft.getState().open(card ? String(card.id) : 'new', card ? cardDraft(card) : newDraft('combat', factionId || String(factions.data?.[0]?.id ?? '')))
    setEditor({ id: card?.id ?? null }); setNotice('')
  }
  const saved = () => { void qc.invalidateQueries({ queryKey: ['cards'] }); close(); setNotice('Card saved.') }
  return <div className="flex flex-col gap-5">
    <div className="flex items-center justify-between gap-3">
      <div><h1 className="mb-1 text-[32px] font-medium">Cards</h1><p className="m-0 text-sm text-ink/60">Create and edit game cards for your factions.</p></div>
      <div className="flex gap-2"><Button disabled={!factions.data?.length} onClick={() => { setImportOpen(true); setNotice('') }}>Import JSON</Button><Button variant="primary" disabled={!factions.data?.length} onClick={() => openEditor()}>New Card</Button></div>
    </div>
    {factions.isLoading && <p>Loading factions…</p>}
    {factions.error && <p role="alert" className="text-danger">{factions.error.message}</p>}
    {factions.data && !factions.data.length && <p>Create a faction before adding cards. <Link to="/factions?mode=library" className="text-accent">Open Factions</Link></p>}
    <div className="flex flex-wrap gap-3">
      <label className="text-sm">Filter by faction<SearchableSelect aria-label="Filter by faction" className={`${inputClass} mt-1`} value={factionId} onChange={e => setFactionId(e.target.value)}><option value="">All factions</option>{factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</SearchableSelect></label>
      <label className="text-sm">Filter by category<SearchableSelect aria-label="Filter by category" className={`${inputClass} mt-1`} value={category} onChange={e => setCategory(e.target.value)}><option value="">All categories</option>{CATEGORIES.map(c => <option key={c} value={c}>{LABELS[c]}</option>)}</SearchableSelect></label>
    </div>
    {notice && <p role="status" className="m-0 text-success">{notice}</p>}
    {cards.isLoading && <p>Loading cards…</p>}
    {cards.error && <p role="alert" className="text-danger">{cards.error.message}</p>}
    {cards.data && !cards.data.length && <p>No cards match these filters.</p>}
    {!!cards.data?.length && <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-divider"><th className="p-3">Name</th><th className="p-3">Faction</th><th className="p-3">Category</th><th className="p-3">Actions</th></tr></thead><tbody>{cards.data.map(c => <tr key={c.id} className="border-b border-divider"><td className="p-3">{c.name}</td><td className="p-3">{factions.data?.find(f => f.id === c.faction_id)?.name ?? 'Loading…'}</td><td className="p-3">{LABELS[c.category]}</td><td className="p-3"><Button aria-label={`Edit ${c.name}`} onClick={() => openEditor(c)}>Edit</Button></td></tr>)}</tbody></table></div>}
    {editor && <CardDialog id={editor.id} factions={factions.data ?? []} onClose={requestClose} onSaved={saved} />}
    {importOpen && <ImportCardsDialog factions={factions.data ?? []} onClose={requestClose} onDirty={setImportDirty} onImported={count => { void qc.invalidateQueries({ queryKey: ['cards'] }); close(); setNotice(`Imported ${count} cards.`) }} />}
    {confirmClose && <ConfirmDialog title="Discard unsaved changes?" body="Closing will discard your unsaved card changes." confirmLabel="Discard" cancelLabel="Keep editing" onConfirm={close} onCancel={() => setConfirmClose(false)} />}
    <UnsavedGuard dirty={dirty} discard={close} />
  </div>
}
