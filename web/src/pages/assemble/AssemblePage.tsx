import { useCallback, useEffect, useRef, useState, type MouseEventHandler } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '../../components/Button'
import { SafeAreaLines, SafeAreaToggle } from '../../components/SafeArea'
import { useCutMm } from '../print/layout'
import { buttonClass } from '../../components/buttonStyles'
import { FactionSelect } from './FactionSelect'
import { GearIcon } from '../../components/icons'
import { useQueryClient } from '@tanstack/react-query'
import { deleteCards, useCards } from '../cards/api'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { ImportCardsDialog } from '../cards/ImportCardsDialog'
import { zip } from '../../lib/zip'
import { downloadName } from './model'
import { pngBlob } from './render'
import type { Card } from '../cards/model'
import { useFactions } from '../factions/api'
import { LIBRARY_TABS } from './model'
import { backTypeName, labLink, useTemplate, useTemplateLayout, type LibraryImage } from './library'
import { useCardTypes } from '../card-types/api'
import type { Side } from './api'
import { Preview3DButton } from './Card3DViewer'
import { useAssembly } from './state'
import { useCardDraft, useCardRenderInput, useRenderedCard } from './useCardView'
import { CardCanvas } from './CardCanvas'
import { CategoryTabs } from './CategoryTabs'
import { BackImage } from './BackImage'
import { CardContextMenu } from './CardContextMenu'
import { TemplateSettingsDialog } from './TemplateSettingsDialog'

// Selection checkbox in a tile's top-left corner; always visible once
// anything is selected, otherwise on hover.
function SelectBox({ name, selected, anySelected, onToggle }: { name: string; selected: boolean; anySelected: boolean; onToggle: () => void }) {
  return <label className={`absolute left-2 top-2 z-10 grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-white/20 bg-black/60 backdrop-blur-sm ${selected || anySelected ? '' : 'opacity-0 group-hover/tile:opacity-100 focus-within:opacity-100'}`}>
    <input type="checkbox" aria-label={`Select ${name}`} checked={selected} onChange={onToggle} className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]" />
  </label>
}
type Selectable = { selected: boolean; anySelected: boolean; onToggle: () => void; onContextMenu: MouseEventHandler<HTMLDivElement> }

// The rendered card is the tile; its name sits underneath as a plain caption.
const tile = 'group block min-w-0 text-left no-underline'
const frame = 'overflow-hidden rounded-md shadow-[0_6px_18px_rgba(0,0,0,0.55)] ring-1 ring-divider transition-shadow'
const caption = 'mt-2 flex items-baseline justify-between gap-2 px-0.5 text-sm text-ink/80'

function CombatTile({ card, image, template, back, backLogoUrl, backLogoScale, onRendered, ...select }: { card: Card; image: LibraryImage | undefined; template: ReturnType<typeof useTemplateLayout>; back: string | null; backLogoUrl?: string; backLogoScale?: number; onRendered: (id: number, canvas: HTMLCanvasElement | null) => void } & Selectable) {
  const { input } = useCardRenderInput(card, image, template)
  const cutMm = useCutMm()
  const { issues, dirty } = useCardDraft(card)
  const { result, error } = useRenderedCard(input)
  useEffect(() => { onRendered(card.id, result?.canvas ?? null) }, [card.id, result, onRendered])
  return <div className="group/tile relative min-w-0" onContextMenu={select.onContextMenu}>
  <SelectBox name={card.name} {...select} />
  {result && <Preview3DButton title={card.name} canvas={result.canvas} back={back} backLogoUrl={backLogoUrl} backLogoScale={backLogoScale} className="absolute right-2 top-2 z-10" />}
  <Link to={`/assemble/cards/${card.id}`} aria-label={`Edit ${card.name}`} className={tile}>
    <div className={`${frame} ${select.selected ? 'ring-2 ring-accent' : 'group-hover:ring-2 group-hover:ring-accent'}`}>
      {result
        ? <div className="relative"><CardCanvas result={result} aria-hidden="true" className="block h-auto w-full" /><SafeAreaLines px={result.canvas} cutMm={cutMm} /></div>
        : <div className="grid aspect-[816/1104] place-items-center bg-black/30 p-3 text-center text-xs text-ink/50">
          {error || (!image ? `Choose ${{ combat: 'a combat', upgrade: 'an upgrade', schema: 'an event' }[card.category]} template (top-left settings) to preview.` : issues.length ? 'Fix this card’s fields in the editor.' : 'Rendering…')}
        </div>}
    </div>
    <span className={`${caption} group-hover:text-accent`}>
      <span className="truncate">{card.name}</span>{dirty && <span className="shrink-0 text-[10px] uppercase tracking-wider text-warn">Draft</span>}
    </span>
  </Link>
  </div>
}

// The deck's shared back, first in the grid.
function BackTile({ image, label, onChoose, generateLink }: { image: LibraryImage | undefined; label: string; onChoose: () => void; generateLink: string | null }) {
  return <div className="min-w-0">
    <button type="button" aria-label={`Choose ${label}`} onClick={onChoose} className={`${frame} block w-full cursor-pointer bg-transparent p-0 hover:ring-2 hover:ring-accent`}>
      {image
        ? <BackImage url={image.url} logoUrl={image.logoUrl} scale={image.logoScale} alt={label} />
        : <span className="grid aspect-[816/1104] place-items-center bg-[radial-gradient(circle,#3a2a20,#120c09)] p-3 text-center text-xs text-ink/55">No card back chosen. Click to choose one.</span>}
    </button>
    <span className={caption}><span className="truncate">{label}</span>{generateLink && <Link to={generateLink} className="shrink-0 text-xs text-accent no-underline hover:underline">Generate</Link>}</span>
  </div>
}

export default function AssemblePage() {
  const factions = useFactions()
  const state = useAssembly()
  const navigate = useNavigate()
  // ?faction=<id>&tab=<slug> (from the library Factions page) selects both.
  const [params, setParams] = useSearchParams()
  useEffect(() => {
    const faction = Number(params.get('faction')), tab = LIBRARY_TABS.find(t => t.slug === params.get('tab'))
    if (!(faction > 0) && !tab) return
    useAssembly.getState().select({ ...(faction > 0 ? { factionId: faction } : {}), ...(tab ? { category: tab.category } : {}) })
    setParams({}, { replace: true })
  }, [params, setParams])
  const factionId = (factions.data?.some(f => f.id === state.factionId) ? state.factionId : null) ?? factions.data?.[0]?.id ?? null
  const category = state.category
  const [settingsOpen, setSettingsOpen] = useState<Side | null>(null)
  const cards = useCards(factionId ? String(factionId) : '', '')
  const template = useTemplate(factionId, category)
  const layout = useTemplateLayout(category)
  const back = useTemplate(factionId, category, 'back')
  const backType = useCardTypes().data?.find(t => t.name === backTypeName(category))
  const faction = factions.data?.find(f => f.id === factionId)
  const tab = LIBRARY_TABS.find(t => t.category === category)!, tabLabel = tab.label
  const newCardLink = `/assemble/cards/new?faction=${factionId}&tab=${tab.slug}`
  const shown = factionId ? cards.data?.filter(c => c.category === category && c.faction_id === factionId) ?? [] : []
  const counts = Object.fromEntries(LIBRARY_TABS.map(t => [t.category, cards.data?.filter(c => c.category === t.category && c.faction_id === factionId).length ?? 0]))
  const queryError = [factions, cards, ...template.queries].find(q => q.isError)?.error ?? layout.error

  // Multiselect within the shown faction and tab.
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  useEffect(() => setSelected(new Set()), [factionId, category])
  const toggle = (id: number) => setSelected(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const chosen = shown.filter(c => selected.has(c.id))
  const canvases = useRef(new Map<number, HTMLCanvasElement>())
  const onRendered = useRef((id: number, canvas: HTMLCanvasElement | null) => { if (canvas) canvases.current.set(id, canvas); else canvases.current.delete(id) }).current
  const [confirmDelete, setConfirmDelete] = useState<Card[] | null>(null)
  const deleting = confirmDelete ?? []
  const [contextMenu, setContextMenu] = useState<{ card: Card; x: number; y: number } | null>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  useEffect(() => { closeContextMenu() }, [factionId, category, closeContextMenu])
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'delete' | 'download' | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  async function removeSelected() {
    setBusy('delete'); setActionError(null)
    try {
      await deleteCards(deleting.map(c => c.id))
      deleting.forEach(c => { useAssembly.getState().clearEdits(String(c.id)); useAssembly.getState().clearTransform(String(c.id)) })
      setSelected(prev => new Set([...prev].filter(id => !deleting.some(c => c.id === id)))); setConfirmDelete(null); setNotice(`Deleted ${deleting.length} card${deleting.length === 1 ? '' : 's'}.`)
      await queryClient.invalidateQueries({ queryKey: ['cards'] })
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Delete failed') }
    finally { setBusy(null) }
  }
  // Rendered cards as PNGs, zipped. Cards without a render are skipped.
  async function downloadSelected() {
    setBusy('download'); setActionError(null); setNotice(null)
    try {
      const used = new Set<string>(), entries = []
      for (const card of chosen) {
        const canvas = canvases.current.get(card.id)
        if (!canvas) continue
        let name = downloadName(card.name)
        for (let n = 2; used.has(name); n++) name = downloadName(`${card.name} (${n})`)
        used.add(name)
        entries.push({ name, data: new Uint8Array(await (await pngBlob(canvas)).arrayBuffer()) })
      }
      if (!entries.length) throw new Error('None of the selected cards has a rendered image to download yet.')
      const url = URL.createObjectURL(zip(entries))
      const link = document.createElement('a'); link.href = url; link.download = `${faction?.name ?? 'cards'} ${tabLabel}.zip`.replace(/[\\/:*?"<>|]/g, '-')
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      if (entries.length < chosen.length) setNotice(`Downloaded ${entries.length} of ${chosen.length}; the others have no rendered image (they are still rendering or have no template).`)
    } catch (e) { setActionError(e instanceof Error ? e.message : 'Download failed') }
    finally { setBusy(null) }
  }
  const selectProps = (card: Card) => ({ selected: selected.has(card.id), anySelected: selected.size > 0, onToggle: () => toggle(card.id), onContextMenu: ((e) => {
    e.preventDefault()
    if (!busy) setContextMenu({ card, x: e.clientX, y: e.clientY })
  }) as MouseEventHandler<HTMLDivElement> })
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <Button aria-label="Card template settings" title="Card template settings" onClick={() => setSettingsOpen('front')} className="px-2!"><GearIcon /></Button>
      <h1 className="m-0 font-display text-2xl text-accent-300">Library</h1>
      <FactionSelect factions={factions.data ?? []} value={factionId} onChange={factionId => state.select({ factionId })} />
      {factionId && <div className="ml-auto flex gap-2">
        <Button onClick={() => setImportOpen(true)}>Import JSON</Button>
        <Link to={newCardLink} className={buttonClass('primary')}>New {tabLabel.replace(/s$/, '').toLowerCase()} card</Link>
      </div>}
    </div>
    {queryError && <div role="alert" className="text-danger">{queryError.message}</div>}
    <CategoryTabs value={category} onChange={c => state.select({ category: c })} badges={counts} faction={factionId ? { active: false, onSelect: () => navigate(`/assemble/faction-card?faction=${factionId}`) } : undefined} />
    {shown.length > 0 && <div role="toolbar" aria-label="Selected cards" className="flex flex-wrap items-center gap-2 text-sm">
      <SafeAreaToggle />
      <span className="text-ink/60">{selected.size ? `${chosen.length} selected` : 'Select cards to download or delete them.'}</span>
      <Button onClick={() => setSelected(chosen.length === shown.length ? new Set() : new Set(shown.map(c => c.id)))}>{chosen.length === shown.length ? 'Select none' : 'Select all'}</Button>
      {chosen.length > 0 && <>
        <Button disabled={!!busy} onClick={() => void downloadSelected()}>{busy === 'download' ? 'Preparing…' : 'Download PNGs (zip)'}</Button>
        <Button disabled={!!busy} onClick={() => { setActionError(null); setConfirmDelete(chosen) }}>Delete</Button>
      </>}
    </div>}
    {actionError && !confirmDelete && <p role="alert" className="m-0 text-sm text-danger">{actionError}</p>}
    {notice && <p role="status" className="m-0 text-sm text-ink/70">{notice}</p>}
    {factionId && !template.isPending && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink/60">
      {template.image
        ? <><span>Template: <span className="text-ink">{template.image.name}</span></span><Link to={labLink(template.image)} className="text-accent underline">Edit in Faction Lab</Link></>
        : <><span>{template.key ? 'The chosen template image no longer exists.' : `No ${tabLabel.toLowerCase()} template chosen for ${faction?.name ?? 'this faction'}.`}</span><Button onClick={() => setSettingsOpen('front')}>Choose template</Button></>}
    </div>}
    {!factions.isPending && !factions.data?.length && <p className="text-sm text-ink/60"><Link to="/factions?mode=library" className="text-accent underline">Create a faction</Link> first.</p>}
    {factionId && <section aria-label="Card back" className="space-y-3">
      <h2 className="m-0 border-b border-divider pb-1.5 font-display text-lg text-accent-300">Card back</h2>
      <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        <BackTile image={back.image} label={`${tabLabel} back`} onChoose={() => setSettingsOpen('back')}
          generateLink={backType ? `/faction-lab?faction=${factionId}&card_type=${backType.id}` : null} />
      </div>
    </section>}
    {!cards.isPending && factionId && !shown.length && <p className="text-sm text-ink/60">No {tabLabel.toLowerCase()} cards for {faction?.name}. <Link to={newCardLink} className="text-accent underline">Add one</Link>.</p>}
    {(category === 'combat' ? [0, 1, 2, 3].map(level => ({ level, cards: shown.filter(c => c.category === 'combat' && c.level === level) })).filter(g => g.cards.length) : [{ level: null, cards: shown }]).map(group =>
      <section key={group.level ?? 'all'} aria-label={group.level === null ? `${tabLabel} cards` : `Level ${group.level}`} className="space-y-3">
        {group.level !== null && <h2 className="m-0 flex items-baseline gap-2 border-b border-divider pb-1.5 font-display text-lg text-accent-300">
          Level {group.level}<span className="font-sans text-xs font-normal text-ink/45">{group.cards.length} card{group.cards.length === 1 ? '' : 's'}</span>
        </h2>}
        <div className="grid grid-cols-2 gap-x-5 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {group.cards.map(card => <CombatTile key={card.id} card={card} image={template.image} template={layout} back={back.image?.url ?? null} backLogoUrl={back.image?.logoUrl} backLogoScale={back.image?.logoScale} onRendered={onRendered} {...selectProps(card)} />)}
        </div>
      </section>)}
    {contextMenu && <CardContextMenu name={contextMenu.card.name} x={contextMenu.x} y={contextMenu.y} onClose={closeContextMenu}
      onDelete={() => { setActionError(null); setConfirmDelete([contextMenu.card]); closeContextMenu() }} />}
    {confirmDelete && <ConfirmDialog title={`Delete ${deleting.length} card${deleting.length === 1 ? '' : 's'}?`}
      body={`This permanently deletes ${deleting.map(c => c.name).slice(0, 5).join(', ')}${deleting.length > 5 ? ` and ${deleting.length - 5} more` : ''}, with their artwork. It cannot be undone.`}
      confirmLabel={busy === 'delete' ? 'Deleting…' : 'Delete cards'} error={actionError}
      onConfirm={() => { if (!busy) void removeSelected() }} onCancel={() => { if (!busy) setConfirmDelete(null) }} />}
    {importOpen && factions.data && <ImportCardsDialog factions={factions.data} onClose={() => setImportOpen(false)} onDirty={() => {}}
      onImported={count => { setImportOpen(false); setNotice(`Imported ${count} card${count === 1 ? '' : 's'}.`); void queryClient.invalidateQueries({ queryKey: ['cards'] }) }} />}
    {settingsOpen && <TemplateSettingsDialog initialFactionId={factionId} initialCategory={category} initialSide={settingsOpen} onClose={() => setSettingsOpen(null)} />}
  </div>
}
