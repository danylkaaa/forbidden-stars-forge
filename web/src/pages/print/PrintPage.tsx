import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/Button'
import { Field, inputClass, selectClass } from '../../components/Field'
import { buildPdf, type PdfOp } from '../../lib/pdf'
import { useCards } from '../cards/api'
import type { Card, Category } from '../cards/model'
import { useFactions } from '../factions/api'
import { LIBRARY_TABS } from '../assemble/model'
import { useTemplate, useTemplateLayout } from '../assemble/library'
import { useCardRenderInput, useRenderedCard } from '../assemble/useCardView'
import { backSlot, besideSlots, pairOfSlot, pairsPerRow, mmToPx, cutGuides, gridFor, PRINT_DPI, type Grid, mirrorPage, MM_PT, reconcile, reflow, slotRect, strokeFor, swapSlots, usePrintSettings, type Pages, type PrintSettings } from './layout'
import { canvasAsset, useBackAsset, type PrintAsset } from './assets'
import { useFactionCardCanvases } from '../faction-card/useFactionCardCanvases'

// A faction card is 258 × 170 mm (268 × 180 mm with 5 mm bleed: 3165 × 2126 px at 300 dpi). It prints on its
// own: its size replaces the page's card size, landscape.
const FACTION_CARD_MM = { cardWidth: 258, cardHeight: 170 }

// Renders a faction's card (front and back) off-screen as print assets.
function FactionCardRenderer({ factionId, onFront, onBack }: { factionId: number; onFront: (id: number, asset: PrintAsset | null) => void; onBack: (id: number, asset: PrintAsset | null) => void }) {
  const { front, back, probes } = useFactionCardCanvases(factionId)
  useEffect(() => {
    if (!front) return
    let cancelled = false, made: PrintAsset | null = null
    canvasAsset(front).then(asset => { if (cancelled) URL.revokeObjectURL(asset.url); else { made = asset; onFront(factionId, asset) } }).catch(() => {})
    return () => { cancelled = true; onFront(factionId, null); if (made) URL.revokeObjectURL(made.url) }
  }, [front, factionId, onFront])
  useEffect(() => {
    if (!back) return
    let cancelled = false, made: PrintAsset | null = null
    canvasAsset(back).then(asset => { if (cancelled) URL.revokeObjectURL(asset.url); else { made = asset; onBack(factionId, asset) } }).catch(() => {})
    return () => { cancelled = true; onBack(factionId, null); if (made) URL.revokeObjectURL(made.url) }
  }, [back, factionId, onBack])
  return <>{probes}</>
}

// Renders one card off-screen and reports it as a print asset.
function CardRenderer({ card, template, onAsset }: { card: Card; template: ReturnType<typeof useTemplateLayout>; onAsset: (id: number, asset: PrintAsset | null) => void }) {
  const { image } = useTemplate(card.faction_id, 'combat')
  const { input } = useCardRenderInput(card, image, template)
  const { result } = useRenderedCard(input)
  useEffect(() => {
    if (!result) return
    let cancelled = false, made: PrintAsset | null = null
    canvasAsset(result.canvas).then(asset => { if (cancelled) URL.revokeObjectURL(asset.url); else { made = asset; onAsset(card.id, asset) } }).catch(() => {})
    return () => { cancelled = true; onAsset(card.id, null); if (made) URL.revokeObjectURL(made.url) }
  }, [result, card.id, onAsset])
  return null
}

// What a selected faction has set up: its combat template and card back.
type FactionStatus = { template: 'loading' | 'missing' | 'ok'; back: 'loading' | 'none' | 'ready' | 'error'; backAsset: PrintAsset | null; error: string }
function FactionRenderer({ factionId, imagePx, onStatus }: { factionId: number; imagePx: { width: number; height: number }; onStatus: (id: number, status: FactionStatus | null) => void }) {
  const template = useTemplate(factionId, 'combat'), back = useTemplate(factionId, 'combat', 'back')
  const { asset, error } = useBackAsset(back.image?.url, back.image?.logoUrl, back.image?.logoScale, imagePx, 'combat', factionId, back.image?.elementUrl)
  const templateState = template.isPending ? 'loading' : template.image ? 'ok' : 'missing'
  const backState = back.isPending ? 'loading' : !back.image ? 'none' : error ? 'error' : asset ? 'ready' : 'loading'
  useEffect(() => { onStatus(factionId, { template: templateState, back: backState, backAsset: asset, error }) }, [factionId, templateState, backState, asset, error, onStatus])
  useEffect(() => () => onStatus(factionId, null), [factionId, onStatus])
  return null
}

type Slot = { page: number; slot: number }
function Sheet({ title, settings, grid: g, cards, assets, back, sides, drag }: {
  title: string; settings: PrintSettings; grid: Grid
  cards: (number | null)[]; assets: Record<number, PrintAsset | undefined>; back?: (id: number) => PrintAsset | undefined
  sides?: boolean[] // one-sided sheet: which slots show the back of their card
  drag?: { onStart: (slot: number) => void; onDrop: (slot: number) => void }
}) {
  const { width, height } = g.page
  const stroke = strokeFor(settings), toMm = (pt: number) => pt / MM_PT
  const lines = settings.cutLines && (!back || !!sides || settings.cutLinesOnBacks)
  return <figure className="m-0 w-64 flex-none">
    <div className="relative w-full overflow-hidden rounded-sm bg-white shadow-[0_6px_18px_rgba(0,0,0,0.55)]" style={{ aspectRatio: `${width} / ${height}` }}>
      {cards.map((id, slot) => {
        const r = slotRect(g, settings, slot)
        const isBack = !!back && (!sides || sides[slot]), url = id === null ? null : isBack ? back(id)?.url : assets[id]?.url
        const pct = (v: number, total: number) => `${v / total * 100}%`
        return <div key={slot} data-slot={slot} className={`absolute overflow-hidden ${drag ? 'outline-1 -outline-offset-1 outline-dashed outline-black/15' : ''}`}
          style={{ left: pct(r.clip.x, width), top: pct(r.clip.y, height), width: pct(r.clip.w, width), height: pct(r.clip.h, height) }}
          onDragOver={drag ? e => e.preventDefault() : undefined} onDrop={drag ? e => { e.preventDefault(); drag.onDrop(slot) } : undefined}>
          {id !== null && (url
            ? <img src={url} alt="" draggable={!!drag} onDragStart={drag ? e => { e.dataTransfer.effectAllowed = 'move'; drag.onStart(slot) } : undefined}
              className={`absolute max-w-none object-fill ${drag ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={{ left: pct(r.img.x - r.clip.x, r.clip.w), top: pct(r.img.y - r.clip.y, r.clip.h), width: pct(r.img.w, r.clip.w), height: pct(r.img.h, r.clip.h) }} />
            : isBack ? null : <div className="grid h-full w-full place-items-center bg-black/10 text-[8px] text-black/50">…</div>)}
        </div>
      })}
      {lines && <svg viewBox={`0 0 ${width} ${height}`} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        {cutGuides(g, settings, cards).map((l, i) => <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke={stroke.color} strokeWidth={toMm(stroke.width)} strokeDasharray={stroke.dash.map(d => toMm(d)).join(' ') || undefined} />)}
      </svg>}
    </div>
    <figcaption className="mt-1.5 text-xs text-ink/60">{title}</figcaption>
  </figure>
}

function NumberField({ label, value, onChange, min = 0, step = 1, disabled }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; disabled?: boolean }) {
  return <Field label={label}>{id => <input id={id} type="number" disabled={disabled} min={min} step={step} value={value} className={inputClass}
    onChange={e => { const v = e.target.valueAsNumber; if (Number.isFinite(v) && v >= min) onChange(v) }} />}</Field>
}
const Group = ({ title, children }: { title: string; children: ReactNode }) =>
  <fieldset className="m-0 space-y-3 rounded-md border border-divider p-3"><legend className="px-1 font-display text-sm text-accent-300">{title}</legend>{children}</fieldset>

// A combat card is printed twice unless the user changes it.
const DEFAULT_COPIES = 2, MAX_COPIES = 20

export default function PrintPage() {
  const factions = useFactions()
  const { settings: stored, update, reset } = usePrintSettings()
  const [mode, setMode] = useState<'cards' | 'faction'>('cards')
  const factionMode = mode === 'faction'
  const settings = useMemo<PrintSettings>(() => factionMode ? { ...stored, ...FACTION_CARD_MM, orientation: 'landscape' } : stored, [stored, factionMode])
  const cards = useCards('', ''), layout = useTemplateLayout()

  const [categories, setCategories] = useState<Set<Category>>(new Set(['combat']))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<number>>(new Set())
  const printable = (c: Card) => c.category === 'combat'
  const q = query.trim().toLowerCase()
  // Factions with at least one card to show; a faction-name match shows all its cards.
  const groups = useMemo(() => [...(factions.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map(faction => {
    const mine = (cards.data ?? []).filter(c => c.faction_id === faction.id && categories.has(c.category))
      .sort((a, b) => (a.category === 'combat' && b.category === 'combat' ? Number(!!b.starting) - Number(!!a.starting) || a.level - b.level : 0) || a.name.localeCompare(b.name))
    return { faction, cards: !q || faction.name.toLowerCase().includes(q) ? mine : mine.filter(c => c.name.toLowerCase().includes(q)) }
  }).filter(g => g.cards.length), [factions.data, cards.data, categories, q])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  // Faction cards are chosen by faction, one per faction.
  const [fSelected, setFSelected] = useState<Set<number>>(new Set())
  const sortedFactions = useMemo(() => [...(factions.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })), [factions.data])
  const toggleFaction = (id: number) => setFSelected(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next })
  const toggle = (id: number) => setSelected(prev => { const next = new Set(prev); if (!next.delete(id)) next.add(id); return next })
  const setMany = (ids: number[], on: boolean) => setSelected(prev => { const next = new Set(prev); ids.forEach(id => on ? next.add(id) : next.delete(id)); return next })
  const shownIds = groups.flatMap(g => g.cards.filter(printable).map(c => c.id))
  const [statuses, setStatuses] = useState<Record<number, FactionStatus | undefined>>({})
  const onStatus = useCallback((id: number, status: FactionStatus | null) => setStatuses(prev => {
    const next = { ...prev }
    if (status) next[id] = status; else delete next[id]
    return next
  }), [])
  // Selected cards whose faction has no combat template cannot be rendered.
  const selectedCards = useMemo(() => (cards.data ?? []).filter(c => selected.has(c.id) && printable(c)), [cards.data, selected])
  const allCards = useMemo(() => selectedCards.filter(c => statuses[c.faction_id]?.template !== 'missing'), [selectedCards, statuses])
  // How many of each card to print: 2 for a combat card unless changed here.
  const [copyOverrides, setCopyOverrides] = useState<Record<number, number>>({})
  const copiesOf = (id: number) => copyOverrides[id] ?? DEFAULT_COPIES
  const setCopies = (id: number, n: number) => setCopyOverrides(prev => ({ ...prev, [id]: Math.max(1, Math.min(MAX_COPIES, n)) }))
  const selectedFactions = useMemo(() => [...new Set(selectedCards.map(c => c.faction_id))], [selectedCards])
  const factionName = (id: number) => factions.data?.find(f => f.id === id)?.name ?? `Faction ${id}`
  const factionOf = useMemo(() => new Map((cards.data ?? []).map(c => [c.id, c.faction_id])), [cards.data])
  const [backAssets, setBackAssets] = useState<Record<number, PrintAsset | undefined>>({})
  const onBack = useCallback((id: number, asset: PrintAsset | null) => setBackAssets(prev => {
    const next = { ...prev }
    if (asset) next[id] = asset; else delete next[id]
    return next
  }), [])
  const backOf = (id: number) => factionMode ? backAssets[id] : statuses[factionOf.get(id) ?? -1]?.backAsset ?? undefined

  const [assets, setAssets] = useState<Record<number, PrintAsset | undefined>>({})
  const onAsset = useCallback((id: number, asset: PrintAsset | null) => setAssets(prev => {
    const next = { ...prev }
    if (asset) next[id] = asset; else delete next[id]
    return next
  }), [])

  // Printed images keep their native 300 dpi size; anything beyond the card size is bleed.
  const sample = Object.values(assets).find(Boolean), sampleW = sample?.width, sampleH = sample?.height
  const imagePx = useMemo(() => sampleW && sampleH ? { width: sampleW, height: sampleH } : { width: mmToPx(settings.cardWidth), height: mmToPx(settings.cardHeight) }, [sampleW, sampleH, settings.cardWidth, settings.cardHeight])
  const imageMm = useMemo(() => sampleW && sampleH ? { width: sampleW / PRINT_DPI * 25.4, height: sampleH / PRINT_DPI * 25.4 } : undefined, [sampleW, sampleH])
  const grid = gridFor(settings, imageMm)
  const beside = settings.includeBacks && settings.backsBeside && !factionMode
  const perPage = beside ? pairsPerRow(grid.cols) * grid.rows : grid.perPage
  const [pages, setPages] = useState<Pages>([])
  const printIds = factionMode ? sortedFactions.filter(f => fSelected.has(f.id)).map(f => f.id) : allCards.flatMap(c => Array.from({ length: copyOverrides[c.id] ?? DEFAULT_COPIES }, () => c.id))
  const idsKey = `${mode}:${printIds.join(',')}`
  useEffect(() => {
    const list = idsKey.slice(idsKey.indexOf(':') + 1)
    const ids = list ? list.split(',').map(Number) : []
    // Card ids and faction ids are different namespaces, so switching mode starts afresh.
    setPages(prev => reconcile(idsKey.startsWith('faction') === prevMode.current ? prev : [], ids, perPage)); prevMode.current = idsKey.startsWith('faction')
  }, [idsKey, perPage])
  const prevMode = useRef(false)
  const [dragging, setDragging] = useState<Slot | null>(null)
  const drop = (to: Slot) => { if (dragging) setPages(prev => swapSlots(prev, dragging, to)); setDragging(null) }

  const placed = pages.flat().filter((id): id is number => id !== null)
  const placedFactions = [...new Set(placed.map(id => factionMode ? id : factionOf.get(id)!))]
  const useBacks = settings.includeBacks && placed.some(id => backOf(id))
  const reverseSheets = useBacks && !beside
  const backsPending = settings.includeBacks && (factionMode ? placed.some(id => !backAssets[id]) : placedFactions.some(f => statuses[f]?.back === 'loading' || !statuses[f]))
  const ready = placed.length > 0 && placed.every(id => assets[id]) && !backsPending
  const [error, setError] = useState<string | null>(null)

  function download() {
    setError(null)
    try {
      const pt = (v: number) => v * MM_PT, stroke = strokeFor(settings), g = grid
      const guides = (cards: (number | null)[]): PdfOp[] => cutGuides(g, settings, cards).map(l => ({ type: 'line', x1: pt(l.x1), y1: pt(l.y1), x2: pt(l.x2), y2: pt(l.y2), stroke }))
      const image = (asset: PrintAsset, slot: number): PdfOp => {
        const r = slotRect(g, settings, slot)
        return { type: 'image', image: asset, x: pt(r.img.x), y: pt(r.img.y), w: pt(r.img.w), h: pt(r.img.h), clip: { x: pt(r.clip.x), y: pt(r.clip.y), w: pt(r.clip.w), h: pt(r.clip.h) } }
      }
      const out: PdfOp[][] = []
      for (const page of pages) {
        if (page.every(id => id === null)) continue
        const front: PdfOp[] = [], reverse: PdfOp[] = []
        if (beside) {
          const sheet = besideSlots(page, g.cols, g.rows)
          sheet.forEach((cell, slot) => {
            if (!cell) return
            const asset = cell.back ? backOf(cell.id) : assets[cell.id]
            if (asset) front.push(image(asset, slot))
          })
          if (settings.cutLines) front.push(...guides(sheet.map(cell => cell?.id ?? null)))
          out.push(front)
          continue
        }
        page.forEach((id, slot) => {
          if (id === null) return
          front.push(image(assets[id]!, slot))
          const back = reverseSheets ? backOf(id) : undefined
          if (back) reverse.push(image(back, backSlot(slot, g.cols, g.rows, settings.flip, settings.orientation)))
        })
        if (settings.cutLines) front.push(...guides(page))
        if (reverseSheets && settings.cutLines && settings.cutLinesOnBacks) reverse.push(...guides(mirrorPage(page, g.cols, g.rows, settings.flip, settings.orientation)))
        out.push(front); if (reverseSheets) out.push(reverse)
      }
      const blob = buildPdf(pt(g.page.width), pt(g.page.height), out)
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = `${placedFactions.length === 1 ? factionName(placedFactions[0]) : 'cards'} print.pdf`.replace(/[\\/:*?"<>|]/g, '-')
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the PDF.') }
  }

  const setNum = (key: keyof PrintSettings) => (v: number) => update({ [key]: v })
  const queryError = [factions, cards].find(q => q.isError)?.error ?? layout.error
  const missingTemplate = selectedFactions.filter(f => statuses[f]?.template === 'missing'), missingBack = settings.includeBacks ? selectedFactions.filter(f => statuses[f]?.back === 'none') : []
  const backError = selectedFactions.map(f => statuses[f]?.error).find(Boolean)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="m-0 font-display text-2xl text-accent-300">Print</h1>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-sm text-ink/60">{placed.length} card{placed.length === 1 ? '' : 's'} · {pages.length} sheet{pages.length === 1 ? '' : 's'}{reverseSheets ? ' + backs' : ''}</span>
        <Button variant="primary" disabled={!ready} onClick={download}>{placed.length && !ready ? 'Rendering…' : 'Download PDF'}</Button>
      </div>
    </div>
    {queryError && <div role="alert" className="text-danger">{queryError.message}</div>}
    {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
    {backError && <p role="alert" className="m-0 text-sm text-danger">{backError}</p>}
    {missingTemplate.length > 0 && <p className="m-0 text-sm text-ink/60">No combat template chosen for {missingTemplate.map(factionName).join(', ')}, so their cards are left out. <Link to="/assemble" className="text-accent underline">Choose one in the Library</Link>.</p>}
    {missingBack.length > 0 && <p className="m-0 text-sm text-ink/60">No card back chosen for {missingBack.map(factionName).join(', ')}; their backs are left blank. <Link to="/assemble" className="text-accent underline">Choose one in the Library</Link>.</p>}
    {grid.perPage === 0 && <p role="alert" className="m-0 text-sm text-danger">A {settings.cardWidth} × {settings.cardHeight} mm card does not fit on the page with these margins.</p>}

    <div className="grid items-start gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
      <div className="space-y-4">
        <Group title="Cards">
          <div role="tablist" aria-label="What to print" className="inline-flex overflow-hidden rounded-md border border-divider text-sm">
            {([['cards', 'Cards'], ['faction', 'Faction cards']] as const).map(([value, label]) => <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)}
              className={`cursor-pointer border-0 px-3 py-1.5 ${mode === value ? 'bg-accent/15 text-accent' : 'bg-transparent text-ink/60 hover:text-ink'}`}>{label}</button>)}
          </div>
          {factionMode && <>
            <div className="flex items-center gap-2 text-sm">
              <Button onClick={() => setFSelected(new Set(sortedFactions.map(f => f.id)))}>Select all</Button>
              <Button onClick={() => setFSelected(new Set())}>None</Button>
              <span className="ml-auto text-xs text-ink/50">{fSelected.size} selected</span>
            </div>
            <ul className="m-0 max-h-[32rem] list-none space-y-0.5 overflow-y-auto p-0">
              {sortedFactions.map(f => <li key={f.id}><label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-surface">
                <input type="checkbox" checked={fSelected.has(f.id)} onChange={() => toggleFaction(f.id)} className="accent-[var(--color-accent)]" /><span className="truncate">{f.name}</span>
                <Link to={`/assemble/faction-card?faction=${f.id}`} className="ml-auto flex-none text-xs text-accent no-underline hover:underline" onClick={e => e.stopPropagation()}>Edit</Link>
              </label></li>)}
              {!sortedFactions.length && <li className="text-sm text-ink/50">{factions.isPending ? 'Loading…' : 'No factions yet.'}</li>}
            </ul>
            <p className="m-0 text-xs text-ink/50">Faction cards are cut at 258 × 170 mm and printed with 5 mm of bleed (268 × 180 mm), landscape, one per sheet, with their back on the next page.</p>
          </>}
          {!factionMode && <>
          <div className="flex flex-wrap gap-1" role="group" aria-label="Card types">
            {LIBRARY_TABS.map(t => <button key={t.category} type="button" aria-pressed={categories.has(t.category)}
              onClick={() => setCategories(prev => { const next = new Set(prev); if (!next.delete(t.category)) next.add(t.category); return next })}
              className={`cursor-pointer rounded border px-2.5 py-1 text-xs ${categories.has(t.category) ? 'border-accent bg-accent/15 text-accent-300' : 'border-divider bg-transparent text-ink/60'}`}>{t.label}</button>)}
          </div>
          <input type="search" aria-label="Search factions and cards" placeholder="Search faction or card…" value={query} onChange={e => setQuery(e.target.value)} className={inputClass} />
          <div className="flex items-center gap-2 text-sm">
            <Button onClick={() => setMany(shownIds, true)}>Select all</Button>
            <Button onClick={() => setMany(shownIds, false)}>None</Button>
            <span className="ml-auto text-xs text-ink/50">{selectedCards.length} selected</span>
          </div>
          <ul className="m-0 max-h-[32rem] list-none space-y-1 overflow-y-auto p-0">
            {groups.map(({ faction, cards: list }) => {
              const ids = list.filter(printable).map(c => c.id), count = ids.filter(id => selected.has(id)).length
              const expanded = !!q || open.has(faction.id)
              return <li key={faction.id} className="rounded border border-divider/60">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <input type="checkbox" aria-label={`Select all ${faction.name} cards`} disabled={!ids.length} checked={ids.length > 0 && count === ids.length}
                    ref={el => { if (el) el.indeterminate = count > 0 && count < ids.length }} onChange={() => setMany(ids, count < ids.length)} className="accent-[var(--color-accent)]" />
                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(prev => { const next = new Set(prev); if (!next.delete(faction.id)) next.add(faction.id); return next })}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left text-sm text-ink">
                    <span aria-hidden="true" className="w-3 flex-none text-ink/50">{expanded ? '▾' : '▸'}</span>
                    <span className="truncate font-medium">{faction.name}</span>
                    <span className="ml-auto flex-none text-xs text-ink/45">{count}/{list.length}</span>
                  </button>
                </div>
                {expanded && <ul className="m-0 list-none space-y-0.5 border-t border-divider/60 p-1">
                  {list.map(c => <li key={c.id} className="flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-surface"><label className={`flex min-w-0 flex-1 items-center gap-2 py-0.5 text-sm ${printable(c) ? 'cursor-pointer' : 'opacity-45'}`}>
                    <input type="checkbox" disabled={!printable(c)} checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--color-accent)]" />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto flex-none text-xs text-ink/45">{c.category === 'combat' ? c.starting ? 'Start' : `L${c.level}` : 'rendering soon'}</span>
                  </label>
                  {printable(c) && <span role="group" aria-label={`Copies of ${c.name}`} className={`inline-flex flex-none items-center ${selected.has(c.id) ? '' : 'opacity-50'}`}>
                    <button type="button" aria-label={`Fewer copies of ${c.name}`} disabled={copiesOf(c.id) <= 1} onClick={() => setCopies(c.id, copiesOf(c.id) - 1)} className="grid h-6 w-6 cursor-pointer place-items-center rounded-l border border-divider bg-surface p-0 text-sm leading-none text-ink/80 hover:border-accent/60 disabled:cursor-default disabled:opacity-35">−</button>
                    <span aria-label={`Copies of ${c.name}: ${copiesOf(c.id)}`} className="grid h-6 min-w-7 place-items-center border-y border-divider bg-bg px-1 font-mono text-xs tabular-nums text-ink">{copiesOf(c.id)}</span>
                    <button type="button" aria-label={`More copies of ${c.name}`} disabled={copiesOf(c.id) >= MAX_COPIES} onClick={() => setCopies(c.id, copiesOf(c.id) + 1)} className="grid h-6 w-6 cursor-pointer place-items-center rounded-r border border-divider bg-surface p-0 text-sm leading-none text-ink/80 hover:border-accent/60 disabled:cursor-default disabled:opacity-35">+</button>
                  </span>}</li>)}
                </ul>}
              </li>
            })}
            {!groups.length && <li className="text-sm text-ink/50">{cards.isPending || factions.isPending ? 'Loading…' : 'Nothing matches.'}</li>}
          </ul>
          </>}
        </Group>
        <Group title="Page">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Orientation">{id => <select id={id} className={selectClass} value={settings.orientation} disabled={factionMode} onChange={e => update({ orientation: e.target.value as PrintSettings['orientation'] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>}</Field>
            <NumberField label="Cut width (mm)" value={settings.cardWidth} min={10} step={0.5} disabled={factionMode} onChange={setNum('cardWidth')} />
            <NumberField label="Cut height (mm)" value={settings.cardHeight} min={10} step={0.5} disabled={factionMode} onChange={setNum('cardHeight')} />
            <NumberField label="Gap (mm)" value={settings.gap} step={0.5} disabled={settings.evenSpacing} onChange={setNum('gap')} />
            <NumberField label="Min margin (mm)" value={settings.margin} step={0.5} onChange={setNum('margin')} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.trimBleed} onChange={e => update({ trimBleed: e.target.checked })} className="accent-[var(--color-accent)]" />Trim bleed to fit more cards per sheet</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.evenSpacing} onChange={e => update({ evenSpacing: e.target.checked })} className="accent-[var(--color-accent)]" />Space cards evenly on the sheet</label>
          <p className="m-0 text-xs text-ink/50">Cards print at their native 300 dpi size{imageMm ? ` (${imageMm.width.toFixed(1)} × ${imageMm.height.toFixed(1)} mm)` : ''}. Anything beyond the card size is bleed, outside the cutting guides{settings.trimBleed ? ` (${grid.bleedX.toFixed(1)} × ${grid.bleedY.toFixed(1)} mm kept per side)` : ''}.</p>
          <p className="m-0 text-xs text-ink/50">{beside ? `${pairsPerRow(grid.cols)} × ${grid.rows} = ${perPage} cards (front and back) per sheet.` : `${grid.cols} × ${grid.rows} = ${grid.perPage} cards per sheet.`}</p>
        </Group>
        <Group title="Backs">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.includeBacks} onChange={e => update({ includeBacks: e.target.checked })} className="accent-[var(--color-accent)]" />Print the back of each card</label>
          <Field label="Place backs">{id => <select id={id} className={selectClass} value={beside ? 'beside' : 'reverse'} disabled={!settings.includeBacks || factionMode} onChange={e => update({ backsBeside: e.target.value === 'beside' })}><option value="reverse">On the reverse of the sheet (two-sided)</option><option value="beside">Next to each front (one side)</option></select>}</Field>
          <Field label="Flip the paper on its">{id => <select id={id} className={selectClass} value={settings.flip} disabled={beside} onChange={e => update({ flip: e.target.value as PrintSettings['flip'] })}><option value="long">Long edge (most printers)</option><option value="short">Short edge</option></select>}</Field>
          <p className="m-0 text-xs text-ink/50">{beside ? 'Each back is printed right of its front on the same side; fold or glue them after cutting.' : 'Backs are placed mirrored, so each lines up behind its front when the sheet is turned over.'}</p>
        </Group>
        <Group title="Cutting lines">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.cutLines} onChange={e => update({ cutLines: e.target.checked })} className="accent-[var(--color-accent)]" />Draw cutting lines around each card</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.guidesToEdge} disabled={!settings.cutLines} onChange={e => update({ guidesToEdge: e.target.checked })} className="accent-[var(--color-accent)]" />Extend guides to the sheet edge</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.cutLinesOnBacks} disabled={!settings.cutLines || beside} onChange={e => update({ cutLinesOnBacks: e.target.checked })} className="accent-[var(--color-accent)]" />Also on back pages</label>
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Width (px)" value={settings.lineWidth} min={0.25} step={0.25} onChange={setNum('lineWidth')} />
            <Field label="Color">{id => <input id={id} type="color" value={settings.lineColor} onChange={e => update({ lineColor: e.target.value })} className="h-9 w-full cursor-pointer rounded-md border border-divider bg-bg p-0.5" />}</Field>
            <Field label="Style">{id => <select id={id} className={selectClass} value={settings.lineStyle} onChange={e => update({ lineStyle: e.target.value as PrintSettings['lineStyle'] })}><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="solid">Solid</option></select>}</Field>
          </div>
          <Button onClick={reset}>Reset print settings</Button>
        </Group>
      </div>

      <section aria-label="Preview" className="min-w-0 space-y-3">
        <div className="flex items-center gap-3">
          <h2 className="m-0 font-display text-lg text-accent-300">Preview</h2>
          <span className="text-xs text-ink/50">Drag cards to rearrange them; backs follow.</span>
          {pages.length > 0 && <Button className="ml-auto" onClick={() => setPages(prev => reflow(prev, perPage))}>Close gaps</Button>}
        </div>
        {!pages.length && <p className="text-sm text-ink/60">Select cards to see the print layout.</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-5">
          {pages.map((page, p) => <div key={p} className="contents">
            {beside ? (() => {
              const sheet = besideSlots(page, grid.cols, grid.rows), pair = (slot: number, then: (i: number) => void) => { const i = pairOfSlot(slot, grid.cols); if (i !== null) then(i) }
              return <Sheet title={`Sheet ${p + 1}`} settings={settings} grid={grid} cards={sheet.map(c => c?.id ?? null)} sides={sheet.map(c => !!c?.back)} assets={assets} back={backOf}
                drag={{ onStart: slot => pair(slot, i => setDragging({ page: p, slot: i })), onDrop: slot => pair(slot, i => drop({ page: p, slot: i })) }} />
            })() : <Sheet title={`Sheet ${p + 1} — front`} settings={settings} grid={grid} cards={page} assets={assets}
              drag={{ onStart: slot => setDragging({ page: p, slot }), onDrop: slot => drop({ page: p, slot }) }} />}
            {reverseSheets && <Sheet title={`Sheet ${p + 1} — back (after flipping)`} settings={settings} grid={grid} assets={assets} back={backOf}
              cards={mirrorPage(page, grid.cols, grid.rows, settings.flip, settings.orientation)} />}
          </div>)}
        </div>
      </section>
    </div>
    {!factionMode && selectedFactions.map(f => <FactionRenderer key={f} factionId={f} imagePx={imagePx} onStatus={onStatus} />)}
    {!factionMode && allCards.map(c => <CardRenderer key={c.id} card={c} template={layout} onAsset={onAsset} />)}
    {factionMode && printIds.map(id => <FactionCardRenderer key={id} factionId={id} onFront={onAsset} onBack={onBack} />)}
  </div>
}
