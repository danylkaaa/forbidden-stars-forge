import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ColorInput } from '../../components/ColorInput'
import { createPortal } from 'react-dom'
import { MagnifierIcon } from '../../components/icons'
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
import { useCardTypes } from '../card-types/api'
import { PAPERS, cardOrder, cutSizeOf, backSlot, besideSlots, pairOfSlot, pairsPerRow, mmToPx, cutGuides, gridFor, PRINT_DPI, type Grid, mirrorPage, MM_PT, reconcile, reflow, slotRect, strokeFor, swapSlots, usePrintSettings, type Pages, type PrintSettings } from './layout'
import { canvasAsset, useBackAsset, type PrintAsset } from './assets'
import { useFactionCardCanvases } from '../faction-card/useFactionCardCanvases'

// A faction card is 258 × 152 mm (264 × 158 mm with 3 mm bleed: 3118 × 1866 px at 300 dpi). It prints on its
// own: its size replaces the page's card size, landscape.

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
function CardRenderer({ card, onAsset }: { card: Card; onAsset: (id: number, asset: PrintAsset | null) => void }) {
  const { image } = useTemplate(card.faction_id, card.category)
  const template = useTemplateLayout(card.category)
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

// What a selected faction has set up for a kind of card: its template and card back.
type FactionStatus = { template: 'loading' | 'missing' | 'ok'; back: 'loading' | 'none' | 'ready' | 'error'; backAsset: PrintAsset | null; error: string }
function FactionRenderer({ factionId, category, imagePx, onStatus }: { factionId: number; category: Category; imagePx: { width: number; height: number }; onStatus: (key: string, status: FactionStatus | null) => void }) {
  const key = groupKey(factionId, category)
  const template = useTemplate(factionId, category), back = useTemplate(factionId, category, 'back')
  const { asset, error } = useBackAsset(back.image?.url, back.image?.logoUrl, back.image?.logoScale, imagePx, category, factionId, back.image?.elementUrl)
  const templateState = template.isPending ? 'loading' : template.image ? 'ok' : 'missing'
  const backState = back.isPending ? 'loading' : !back.image ? 'none' : error ? 'error' : asset ? 'ready' : 'loading'
  useEffect(() => { onStatus(key, { template: templateState, back: backState, backAsset: asset, error }) }, [key, templateState, backState, asset, error, onStatus])
  useEffect(() => () => onStatus(key, null), [key, onStatus])
  return null
}

// Cards of one faction and kind share a template and a card back.
const groupKey = (factionId: number, category: Category) => `${factionId}:${category}`
const KIND_LABEL: Record<Category, string> = { combat: 'combat', schema: 'event', upgrade: 'upgrade' }

type Slot = { page: number; slot: number }
type SheetProps = {
  settings: PrintSettings; grid: Grid
  cards: (number | null)[]; assets: Record<number, PrintAsset | undefined>; back?: (id: number) => PrintAsset | undefined
  sides?: boolean[] // one-sided sheet: which slots show the back of their card
  drag?: { onStart: (slot: number) => void; onDrop: (slot: number) => void }
}
// The sheet's paper with its cards and cutting lines, as wide as its parent.
function SheetFace({ settings, grid: g, cards, assets, back, sides, drag }: SheetProps) {
  const { width, height } = g.page
  const stroke = strokeFor(settings), toMm = (pt: number) => pt / MM_PT
  const lines = settings.cutLines && (!back || !!sides || settings.cutLinesOnBacks)
  return (
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
  )
}

const LENS = 220, ZOOM = 4

function Sheet({ title, magnify, ...face }: SheetProps & { title: string; magnify?: boolean }) {
  const root = useRef<HTMLDivElement>(null)
  const [lens, setLens] = useState<{ x: number; y: number; fx: number; fy: number; w: number; h: number } | null>(null)
  const track = (e: React.PointerEvent) => {
    const box = root.current?.getBoundingClientRect()
    if (!magnify || !box?.width || !box.height || e.pointerType === 'touch') { setLens(null); return }
    setLens({ x: e.clientX, y: e.clientY, fx: (e.clientX - box.left) / box.width, fy: (e.clientY - box.top) / box.height, w: box.width, h: box.height })
  }
  useEffect(() => { if (!magnify) setLens(null) }, [magnify])
  return <figure className="m-0 w-64 flex-none">
    <div ref={root} className={magnify ? 'cursor-zoom-in' : undefined} onPointerMove={track} onPointerEnter={track} onPointerLeave={() => setLens(null)}>
      <SheetFace {...face} drag={magnify ? undefined : face.drag} />
    </div>
    <figcaption className="mt-1.5 text-xs text-ink/60">{title}</figcaption>
    {lens && createPortal(<div aria-hidden="true" data-testid="sheet-lens" className="pointer-events-none fixed z-[100] overflow-hidden rounded-full border-2 border-accent bg-white shadow-[0_6px_24px_rgba(0,0,0,0.7)]"
      style={{ width: LENS, height: LENS, left: lens.x - LENS / 2, top: lens.y - LENS - 16 }}>
      <div className="absolute" style={{ width: lens.w * ZOOM, left: LENS / 2 - lens.fx * lens.w * ZOOM, top: LENS / 2 - lens.fy * lens.h * ZOOM }}>
        <SheetFace {...face} drag={undefined} />
      </div>
    </div>, document.body)}
  </figure>
}

function NumberField({ label, value, onChange, min = 0, step = 1, disabled }: { label: string; value: number; onChange: (v: number) => void; min?: number; step?: number; disabled?: boolean }) {
  return <Field label={label}>{id => <input id={id} type="number" disabled={disabled} min={min} step={step} value={value} className={inputClass}
    onChange={e => { const v = e.target.valueAsNumber; if (Number.isFinite(v) && v >= min) onChange(v) }} />}</Field>
}
const Group = ({ title, children }: { title: string; children: ReactNode }) =>
  <fieldset className="m-0 space-y-3 rounded-md border border-divider p-3"><legend className="px-1 font-display text-sm text-accent-300">{title}</legend>{children}</fieldset>

// A combat card is printed twice unless the user changes it; events and upgrades once.
const MAX_COPIES = 20
const defaultCopies = (c: Card) => c.category === 'combat' ? 2 : 1

export default function PrintPage() {
  const factions = useFactions()
  const { settings: stored, update, reset } = usePrintSettings()
  const [mode, setMode] = useState<'cards' | 'faction'>('cards')
  const factionMode = mode === 'faction'
  const cardTypes = useCardTypes()
  // The cut size comes from the card type: the combat type for cards, the faction card type for faction cards.
  const cut = cutSizeOf(cardTypes.data, factionMode ? 'faction card' : 'combat')
  // A faction card's cutting lines lie on its cut edge, so they measure the finished size; its bleed covers a cut that wanders.
  const baseSettings = useMemo<PrintSettings>(() => ({ ...stored, cardWidth: cut.width, cardHeight: cut.height, ...(factionMode ? { orientation: 'landscape' as const, cutTolerance: 0 } : {}) }), [stored, factionMode, cut.width, cut.height])
  const cards = useCards('', '')

  const [categories, setCategories] = useState<Set<Category>>(new Set(['combat']))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<number>>(new Set())
  const printable = (c: Card) => c.category === 'combat' || c.category === 'schema' || c.category === 'upgrade'
  const q = query.trim().toLowerCase()
  // Factions with at least one card to show; a faction-name match shows all its cards.
  const groups = useMemo(() => [...(factions.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map(faction => {
    const mine = (cards.data ?? []).filter(c => c.faction_id === faction.id && categories.has(c.category))
      .sort(cardOrder)
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
  const [statuses, setStatuses] = useState<Record<string, FactionStatus | undefined>>({})
  const onStatus = useCallback((key: string, status: FactionStatus | null) => setStatuses(prev => {
    const next = { ...prev }
    if (status) next[key] = status; else delete next[key]
    return next
  }), [])
  // Selected cards whose faction has no combat template cannot be rendered.
  // Printed faction by faction (A to Z), each in card order: type, level, name.
  const selectedCards = useMemo(() => {
    const rank = new Map([...(factions.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map((f, i) => [f.id, i]))
    return (cards.data ?? []).filter(c => selected.has(c.id) && printable(c)).sort((a, b) => (rank.get(a.faction_id) ?? 0) - (rank.get(b.faction_id) ?? 0) || cardOrder(a, b))
  }, [cards.data, factions.data, selected])
  const allCards = useMemo(() => selectedCards.filter(c => statuses[groupKey(c.faction_id, c.category)]?.template !== 'missing'), [selectedCards, statuses])
  // How many of each card to print: 2 for a combat card unless changed here.
  const [copyOverrides, setCopyOverrides] = useState<Record<number, number>>({})
  const copiesOf = (c: Card) => copyOverrides[c.id] ?? defaultCopies(c)
  const setCopies = (id: number, n: number) => setCopyOverrides(prev => ({ ...prev, [id]: Math.max(1, Math.min(MAX_COPIES, n)) }))
  // The faction and kind of each selected card: one template and one back per group.
  const selectedGroups = useMemo(() => [...new Map(selectedCards.map(c => [groupKey(c.faction_id, c.category), { factionId: c.faction_id, category: c.category }])).entries()].map(([key, g]) => ({ key, ...g })), [selectedCards])
  const factionName = (id: number) => factions.data?.find(f => f.id === id)?.name ?? `Faction ${id}`
  const factionOf = useMemo(() => new Map((cards.data ?? []).map(c => [c.id, c.faction_id])), [cards.data])
  const groupOf = useMemo(() => new Map((cards.data ?? []).map(c => [c.id, groupKey(c.faction_id, c.category)])), [cards.data])
  const [backAssets, setBackAssets] = useState<Record<number, PrintAsset | undefined>>({})
  const onBack = useCallback((id: number, asset: PrintAsset | null) => setBackAssets(prev => {
    const next = { ...prev }
    if (asset) next[id] = asset; else delete next[id]
    return next
  }), [])
  const backOf = (id: number) => factionMode ? backAssets[id] : statuses[groupOf.get(id) ?? '']?.backAsset ?? undefined

  const [assets, setAssets] = useState<Record<number, PrintAsset | undefined>>({})
  const onAsset = useCallback((id: number, asset: PrintAsset | null) => setAssets(prev => {
    const next = { ...prev }
    if (asset) next[id] = asset; else delete next[id]
    return next
  }), [])

  // Printed images keep their native 300 dpi size; anything beyond the card size is bleed.
  const sample = Object.values(assets).find(Boolean), sampleW = sample?.width, sampleH = sample?.height
  const imagePx = useMemo(() => sampleW && sampleH ? { width: sampleW, height: sampleH } : { width: mmToPx(baseSettings.cardWidth), height: mmToPx(baseSettings.cardHeight) }, [sampleW, sampleH, baseSettings.cardWidth, baseSettings.cardHeight])
  const imageMm = useMemo(() => sampleW && sampleH ? { width: sampleW / PRINT_DPI * 25.4, height: sampleH / PRINT_DPI * 25.4 } : undefined, [sampleW, sampleH])
  // A card with its back side by side needs a sheet two cards wide: when the chosen orientation has no room for
  // the pair but the other one has (A6 portrait, say), the sheet is turned.
  const sideBySide = baseSettings.includeBacks && baseSettings.backsBeside && !factionMode
  const otherOrientation = baseSettings.orientation === 'portrait' ? 'landscape' as const : 'portrait' as const
  const pairs = (o: PrintSettings['orientation']) => { const g = gridFor({ ...baseSettings, orientation: o }, imageMm); return pairsPerRow(g.cols) * g.rows }
  const turned = sideBySide && pairs(baseSettings.orientation) === 0 && pairs(otherOrientation) > 0
  const settings = useMemo<PrintSettings>(() => turned ? { ...baseSettings, orientation: otherOrientation } : baseSettings, [baseSettings, turned, otherOrientation])
  const grid = gridFor(settings, imageMm)
  const beside = sideBySide
  const perPage = beside ? pairsPerRow(grid.cols) * grid.rows : grid.perPage
  const [pages, setPages] = useState<Pages>([])
  const printIds = factionMode ? sortedFactions.filter(f => fSelected.has(f.id)).map(f => f.id) : allCards.flatMap(c => Array.from({ length: copiesOf(c) }, () => c.id))
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
  const placedGroups = [...new Set(placed.map(id => groupOf.get(id)!))]
  const useBacks = settings.includeBacks && placed.some(id => backOf(id))
  const reverseSheets = useBacks && !beside
  const backsPending = settings.includeBacks && (factionMode ? placed.some(id => !backAssets[id]) : placedGroups.some(k => statuses[k]?.back === 'loading' || !statuses[k]))
  const ready = placed.length > 0 && placed.every(id => assets[id]) && !backsPending
  const [error, setError] = useState<string | null>(null)
  // The loupe stays on over the sheets until the next click or Esc.
  const [magnify, setMagnify] = useState(false)
  useEffect(() => {
    if (!magnify) return
    const off = () => setMagnify(false)
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') off() }
    // Capture phase: any click ends it, even on a button that does something else.
    const click = (e: MouseEvent) => { if (!(e.target as Element | null)?.closest('[data-magnifier-toggle]')) off() }
    window.addEventListener('keydown', key); window.addEventListener('click', click, true)
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('click', click, true) }
  }, [magnify])

  // `split` saves the fronts and the backs as two files (two-sided sheets only); sheet N of one is the reverse of sheet N of the other.
  function download(split = false) {
    setError(null)
    try {
      const pt = (v: number) => v * MM_PT, stroke = strokeFor(settings), g = grid
      const guides = (cards: (number | null)[]): PdfOp[] => cutGuides(g, settings, cards).map(l => ({ type: 'line', x1: pt(l.x1), y1: pt(l.y1), x2: pt(l.x2), y2: pt(l.y2), stroke }))
      const image = (asset: PrintAsset, slot: number): PdfOp => {
        const r = slotRect(g, settings, slot)
        return { type: 'image', image: asset, x: pt(r.img.x), y: pt(r.img.y), w: pt(r.img.w), h: pt(r.img.h), clip: { x: pt(r.clip.x), y: pt(r.clip.y), w: pt(r.clip.w), h: pt(r.clip.h) } }
      }
      const out: PdfOp[][] = [], fronts: PdfOp[][] = [], backs: PdfOp[][] = []
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
        out.push(front); fronts.push(front)
        if (reverseSheets) { out.push(reverse); backs.push(reverse) }
      }
      const name = placedFactions.length === 1 ? factionName(placedFactions[0]) : 'cards'
      const save = (sheets: PdfOp[][], file: string) => {
        const url = URL.createObjectURL(buildPdf(pt(g.page.width), pt(g.page.height), sheets)), link = document.createElement('a')
        link.href = url; link.download = `${name} ${file}.pdf`.replace(/[\\/:*?"<>|]/g, '-')
        document.body.append(link); link.click(); link.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
      if (split && reverseSheets) {
        save(fronts, 'fronts')
        // Browsers want a moment between downloads started by one click.
        window.setTimeout(() => save(backs, 'backs'), 300)
      } else save(out, 'print')
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not create the PDF.') }
  }

  const setNum = (key: keyof PrintSettings) => (v: number) => update({ [key]: v })
  const queryError = [factions, cards].find(q => q.isError)?.error ?? undefined
  const groupName = (g: { factionId: number; category: Category }) => `${factionName(g.factionId)} (${KIND_LABEL[g.category]})`
  const missingTemplate = selectedGroups.filter(g => statuses[g.key]?.template === 'missing'), missingBack = settings.includeBacks ? selectedGroups.filter(g => statuses[g.key]?.back === 'none') : []
  const backError = selectedGroups.map(g => statuses[g.key]?.error).find(Boolean)
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="m-0 font-display text-2xl text-accent-300">Print</h1>
      <div className="ml-auto flex items-center gap-2">
        <span className="text-sm text-ink/60">{placed.length} card{placed.length === 1 ? '' : 's'} · {pages.length} sheet{pages.length === 1 ? '' : 's'}{reverseSheets ? ' + backs' : ''}</span>
        <button type="button" data-magnifier-toggle aria-pressed={magnify} disabled={!pages.length} onClick={() => setMagnify(v => !v)}
          title={magnify ? 'Click anywhere or press Esc to stop' : 'Magnify the preview until the next click or Esc'}
          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 ${magnify ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink hover:bg-neutral-800'}`}>
          <MagnifierIcon />Magnifier
        </button>
        <Button variant="primary" disabled={!ready} onClick={() => download()}>{placed.length && !ready ? 'Rendering…' : 'Download PDF'}</Button>
        {reverseSheets && <Button disabled={!ready} onClick={() => download(true)} title="Two files, fronts and backs, to print one after the other. Backs sheet N goes on the back of fronts sheet N.">Download fronts and backs separately</Button>}
      </div>
    </div>
    {queryError && <div role="alert" className="text-danger">{queryError.message}</div>}
    {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
    {backError && <p role="alert" className="m-0 text-sm text-danger">{backError}</p>}
    {missingTemplate.length > 0 && <p className="m-0 text-sm text-ink/60">No template chosen for {missingTemplate.map(groupName).join(', ')}, so their cards are left out. <Link to="/assemble" className="text-accent underline">Choose one in the Library</Link>.</p>}
    {missingBack.length > 0 && <p className="m-0 text-sm text-ink/60">No card back chosen for {missingBack.map(groupName).join(', ')}; their backs are left blank. <Link to="/assemble" className="text-accent underline">Choose one in the Library</Link>.</p>}
    {grid.perPage === 0 && <p role="alert" className="m-0 text-sm text-danger">A {settings.cardWidth} × {settings.cardHeight} mm card does not fit on the page with these margins.</p>}
    {grid.perPage > 0 && beside && pairsPerRow(grid.cols) * grid.rows === 0 && <p role="alert" className="m-0 text-sm text-danger">A card with its back ({settings.cardWidth * 2} × {settings.cardHeight} mm) does not fit on this sheet with these margins. Use a larger sheet or a smaller margin, or print the backs on the reverse of the sheet.</p>}
    {turned && <p role="status" className="m-0 text-sm text-ink/60">A card with its back does not fit {baseSettings.orientation} on this sheet, so it is printed {otherOrientation}.</p>}

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
            <p className="m-0 text-xs text-ink/50">Faction cards are cut at 258 × 152 mm and printed with 3 mm of bleed (264 × 158 mm), landscape, one per sheet, with their back on the next page.</p>
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
                    <span className="ml-auto flex-none text-xs text-ink/45">{c.category === 'combat' ? c.starting ? 'Start' : `L${c.level}` : c.category === 'schema' ? c.subtype === 'tactic' ? 'Tactic' : 'Scheme' : `L${c.level}`}</span>
                  </label>
                  {printable(c) && <span role="group" aria-label={`Copies of ${c.name}`} className={`inline-flex flex-none items-center ${selected.has(c.id) ? '' : 'opacity-50'}`}>
                    <button type="button" aria-label={`Fewer copies of ${c.name}`} disabled={copiesOf(c) <= 1} onClick={() => setCopies(c.id, copiesOf(c) - 1)} className="grid h-6 w-6 cursor-pointer place-items-center rounded-l border border-divider bg-surface p-0 text-sm leading-none text-ink/80 hover:border-accent/60 disabled:cursor-default disabled:opacity-35">−</button>
                    <span aria-label={`Copies of ${c.name}: ${copiesOf(c)}`} className="grid h-6 min-w-7 place-items-center border-y border-divider bg-bg px-1 font-mono text-xs tabular-nums text-ink">{copiesOf(c)}</span>
                    <button type="button" aria-label={`More copies of ${c.name}`} disabled={copiesOf(c) >= MAX_COPIES} onClick={() => setCopies(c.id, copiesOf(c) + 1)} className="grid h-6 w-6 cursor-pointer place-items-center rounded-r border border-divider bg-surface p-0 text-sm leading-none text-ink/80 hover:border-accent/60 disabled:cursor-default disabled:opacity-35">+</button>
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
            <Field label="Page size">{id => <select id={id} className={selectClass} value={settings.paper} onChange={e => update({ paper: e.target.value as PrintSettings['paper'] })}>{Object.entries(PAPERS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}</select>}</Field>
            <Field label="Orientation">{id => <select id={id} className={selectClass} value={settings.orientation} disabled={factionMode} onChange={e => update({ orientation: e.target.value as PrintSettings['orientation'] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>}</Field>
            <NumberField label="Gap (mm)" value={settings.gap} step={0.5} disabled={settings.evenSpacing} onChange={setNum('gap')} />
            <NumberField label="Min margin (mm)" value={settings.margin} step={0.5} onChange={setNum('margin')} />
          </div>
          <p className="m-0 text-sm text-ink/70">Cut size {settings.cardWidth} × {settings.cardHeight} mm, set on the {factionMode ? 'faction card' : 'combat'} <Link to="/card-types" className="text-accent underline">image type</Link>.</p>
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
          {factionMode ? <p className="m-0 text-xs text-ink/50">Faction cards: lines are drawn on the cut edge, {settings.cardWidth} × {settings.cardHeight} mm apart; the {grid.bleedX.toFixed(1)} mm of bleed beyond them covers a cut that wanders.</p> : <>
          <NumberField label="Cut tolerance (% of the card size)" value={settings.cutTolerance} min={0} step={0.5} disabled={!settings.cutLines} onChange={setNum('cutTolerance')} />
          <p className="m-0 text-xs text-ink/50">Lines are drawn outside the card, {settings.cutTolerance}% of its size ({(settings.cardWidth * settings.cutTolerance / 100).toFixed(1)} mm across, {(settings.cardHeight * settings.cutTolerance / 100).toFixed(1)} mm down) away from the cut edge, so a cut that wanders a little still leaves the whole card. Keep it within the bleed.</p></>}
          <div className="grid grid-cols-3 gap-3">
            <NumberField label="Width (px)" value={settings.lineWidth} min={0.25} step={0.25} onChange={setNum('lineWidth')} />
            <Field label="Color">{id => <ColorInput id={id} value={settings.lineColor} onChange={lineColor => update({ lineColor })} className="h-9 w-16 cursor-pointer rounded-md border border-divider bg-bg p-0.5" />}</Field>
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
              return <Sheet magnify={magnify} title={`Sheet ${p + 1}`} settings={settings} grid={grid} cards={sheet.map(c => c?.id ?? null)} sides={sheet.map(c => !!c?.back)} assets={assets} back={backOf}
                drag={{ onStart: slot => pair(slot, i => setDragging({ page: p, slot: i })), onDrop: slot => pair(slot, i => drop({ page: p, slot: i })) }} />
            })() : <Sheet magnify={magnify} title={`Sheet ${p + 1} — front`} settings={settings} grid={grid} cards={page} assets={assets}
              drag={{ onStart: slot => setDragging({ page: p, slot }), onDrop: slot => drop({ page: p, slot }) }} />}
            {reverseSheets && <Sheet magnify={magnify} title={`Sheet ${p + 1} — back (after flipping)`} settings={settings} grid={grid} assets={assets} back={backOf}
              cards={mirrorPage(page, grid.cols, grid.rows, settings.flip, settings.orientation)} />}
          </div>)}
        </div>
      </section>
    </div>
    {!factionMode && selectedGroups.map(g => <FactionRenderer key={g.key} factionId={g.factionId} category={g.category} imagePx={imagePx} onStatus={onStatus} />)}
    {!factionMode && allCards.map(c => <CardRenderer key={c.id} card={c} onAsset={onAsset} />)}
    {factionMode && printIds.map(id => <FactionCardRenderer key={id} factionId={id} onFront={onAsset} onBack={onBack} />)}
  </div>
}
