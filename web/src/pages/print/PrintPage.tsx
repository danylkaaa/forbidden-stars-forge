import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
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
import { backSlot, mmToPx, cutGuides, gridFor, PRINT_DPI, type Grid, mirrorPage, MM_PT, reconcile, reflow, slotRect, strokeFor, swapSlots, usePrintSettings, type Pages, type PrintSettings } from './layout'
import { canvasAsset, useBackAsset, type PrintAsset } from './assets'

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
  const { asset, error } = useBackAsset(back.image?.url, back.image?.logoUrl, back.image?.logoScale, imagePx)
  const templateState = template.isPending ? 'loading' : template.image ? 'ok' : 'missing'
  const backState = back.isPending ? 'loading' : !back.image ? 'none' : error ? 'error' : asset ? 'ready' : 'loading'
  useEffect(() => { onStatus(factionId, { template: templateState, back: backState, backAsset: asset, error }) }, [factionId, templateState, backState, asset, error, onStatus])
  useEffect(() => () => onStatus(factionId, null), [factionId, onStatus])
  return null
}

type Slot = { page: number; slot: number }
function Sheet({ title, settings, grid: g, cards, assets, back, drag }: {
  title: string; settings: PrintSettings; grid: Grid
  cards: (number | null)[]; assets: Record<number, PrintAsset | undefined>; back?: (id: number) => PrintAsset | undefined
  drag?: { onStart: (slot: number) => void; onDrop: (slot: number) => void }
}) {
  const { width, height } = g.page
  const stroke = strokeFor(settings), toMm = (pt: number) => pt / MM_PT
  const lines = settings.cutLines && (!back || settings.cutLinesOnBacks)
  return <figure className="m-0 w-64 flex-none">
    <div className="relative w-full overflow-hidden rounded-sm bg-white shadow-[0_6px_18px_rgba(0,0,0,0.55)]" style={{ aspectRatio: `${width} / ${height}` }}>
      {cards.map((id, slot) => {
        const r = slotRect(g, settings, slot)
        const url = id === null ? null : back ? back(id)?.url : assets[id]?.url
        const pct = (v: number, total: number) => `${v / total * 100}%`
        return <div key={slot} data-slot={slot} className={`absolute overflow-hidden ${drag ? 'outline-1 -outline-offset-1 outline-dashed outline-black/15' : ''}`}
          style={{ left: pct(r.clip.x, width), top: pct(r.clip.y, height), width: pct(r.clip.w, width), height: pct(r.clip.h, height) }}
          onDragOver={drag ? e => e.preventDefault() : undefined} onDrop={drag ? e => { e.preventDefault(); drag.onDrop(slot) } : undefined}>
          {id !== null && (url
            ? <img src={url} alt="" draggable={!!drag} onDragStart={drag ? e => { e.dataTransfer.effectAllowed = 'move'; drag.onStart(slot) } : undefined}
              className={`absolute max-w-none object-fill ${drag ? 'cursor-grab active:cursor-grabbing' : ''}`}
              style={{ left: pct(r.img.x - r.clip.x, r.clip.w), top: pct(r.img.y - r.clip.y, r.clip.h), width: pct(r.img.w, r.clip.w), height: pct(r.img.h, r.clip.h) }} />
            : back ? null : <div className="grid h-full w-full place-items-center bg-black/10 text-[8px] text-black/50">…</div>)}
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

export default function PrintPage() {
  const factions = useFactions()
  const { settings, update, reset } = usePrintSettings()
  const cards = useCards('', ''), layout = useTemplateLayout()

  const [categories, setCategories] = useState<Set<Category>>(new Set(['combat']))
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Set<number>>(new Set())
  const printable = (c: Card) => c.category === 'combat'
  const q = query.trim().toLowerCase()
  // Factions with at least one card to show; a faction-name match shows all its cards.
  const groups = useMemo(() => [...(factions.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })).map(faction => {
    const mine = (cards.data ?? []).filter(c => c.faction_id === faction.id && categories.has(c.category))
      .sort((a, b) => (a.category === 'combat' && b.category === 'combat' ? a.level - b.level : 0) || a.name.localeCompare(b.name))
    return { faction, cards: !q || faction.name.toLowerCase().includes(q) ? mine : mine.filter(c => c.name.toLowerCase().includes(q)) }
  }).filter(g => g.cards.length), [factions.data, cards.data, categories, q])
  const [selected, setSelected] = useState<Set<number>>(new Set())
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
  const selectedFactions = useMemo(() => [...new Set(selectedCards.map(c => c.faction_id))], [selectedCards])
  const factionName = (id: number) => factions.data?.find(f => f.id === id)?.name ?? `Faction ${id}`
  const factionOf = useMemo(() => new Map((cards.data ?? []).map(c => [c.id, c.faction_id])), [cards.data])
  const backOf = (id: number) => statuses[factionOf.get(id) ?? -1]?.backAsset ?? undefined

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
  const [pages, setPages] = useState<Pages>([])
  const idsKey = allCards.map(c => c.id).join(',')
  useEffect(() => {
    const ids = idsKey ? idsKey.split(',').map(Number) : []
    setPages(prev => reconcile(prev, ids, grid.perPage))
  }, [idsKey, grid.perPage])
  const [dragging, setDragging] = useState<Slot | null>(null)
  const drop = (to: Slot) => { if (dragging) setPages(prev => swapSlots(prev, dragging, to)); setDragging(null) }

  const placed = pages.flat().filter((id): id is number => id !== null)
  const placedFactions = [...new Set(placed.map(id => factionOf.get(id)!))]
  const useBacks = settings.includeBacks && placed.some(id => backOf(id))
  const backsPending = settings.includeBacks && placedFactions.some(f => statuses[f]?.back === 'loading' || !statuses[f])
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
        page.forEach((id, slot) => {
          if (id === null) return
          front.push(image(assets[id]!, slot))
          const back = useBacks ? backOf(id) : undefined
          if (back) reverse.push(image(back, backSlot(slot, g.cols, g.rows, settings.flip, settings.orientation)))
        })
        if (settings.cutLines) front.push(...guides(page))
        if (useBacks && settings.cutLines && settings.cutLinesOnBacks) reverse.push(...guides(mirrorPage(page, g.cols, g.rows, settings.flip, settings.orientation)))
        out.push(front); if (useBacks) out.push(reverse)
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
        <span className="text-sm text-ink/60">{placed.length} card{placed.length === 1 ? '' : 's'} · {pages.length} sheet{pages.length === 1 ? '' : 's'}{useBacks ? ' + backs' : ''}</span>
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
                  {list.map(c => <li key={c.id}><label className={`flex items-center gap-2 rounded px-1.5 py-1 text-sm ${printable(c) ? 'cursor-pointer hover:bg-surface' : 'opacity-45'}`}>
                    <input type="checkbox" disabled={!printable(c)} checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-[var(--color-accent)]" />
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto flex-none text-xs text-ink/45">{c.category === 'combat' ? `L${c.level}` : 'rendering soon'}</span>
                  </label></li>)}
                </ul>}
              </li>
            })}
            {!groups.length && <li className="text-sm text-ink/50">{cards.isPending || factions.isPending ? 'Loading…' : 'Nothing matches.'}</li>}
          </ul>
        </Group>
        <Group title="Page">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Paper">{id => <select id={id} className={selectClass} value={settings.paper} onChange={e => update({ paper: e.target.value as PrintSettings['paper'] })}><option value="a4">A4</option><option value="letter">Letter</option></select>}</Field>
            <Field label="Orientation">{id => <select id={id} className={selectClass} value={settings.orientation} onChange={e => update({ orientation: e.target.value as PrintSettings['orientation'] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>}</Field>
            <NumberField label="Cut width (mm)" value={settings.cardWidth} min={10} step={0.5} onChange={setNum('cardWidth')} />
            <NumberField label="Cut height (mm)" value={settings.cardHeight} min={10} step={0.5} onChange={setNum('cardHeight')} />
            <NumberField label="Gap (mm)" value={settings.gap} step={0.5} disabled={settings.evenSpacing} onChange={setNum('gap')} />
            <NumberField label="Min margin (mm)" value={settings.margin} step={0.5} onChange={setNum('margin')} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.trimBleed} onChange={e => update({ trimBleed: e.target.checked })} className="accent-[var(--color-accent)]" />Trim bleed to fit more cards per sheet</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.evenSpacing} onChange={e => update({ evenSpacing: e.target.checked })} className="accent-[var(--color-accent)]" />Space cards evenly on the sheet</label>
          <p className="m-0 text-xs text-ink/50">Cards print at their native 300 dpi size{imageMm ? ` (${imageMm.width.toFixed(1)} × ${imageMm.height.toFixed(1)} mm)` : ''}. Anything beyond the card size is bleed, outside the cutting guides{settings.trimBleed ? ` (${grid.bleedX.toFixed(1)} × ${grid.bleedY.toFixed(1)} mm kept per side)` : ''}.</p>
          <p className="m-0 text-xs text-ink/50">{grid.cols} × {grid.rows} = {grid.perPage} cards per sheet.</p>
        </Group>
        <Group title="Double-sided">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.includeBacks} onChange={e => update({ includeBacks: e.target.checked })} className="accent-[var(--color-accent)]" />Add a back page after each sheet</label>
          <Field label="Flip the paper on its">{id => <select id={id} className={selectClass} value={settings.flip} onChange={e => update({ flip: e.target.value as PrintSettings['flip'] })}><option value="long">Long edge (most printers)</option><option value="short">Short edge</option></select>}</Field>
          <p className="m-0 text-xs text-ink/50">Backs are placed mirrored, so each lines up behind its front when the sheet is turned over.</p>
        </Group>
        <Group title="Cutting lines">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.cutLines} onChange={e => update({ cutLines: e.target.checked })} className="accent-[var(--color-accent)]" />Draw cutting lines around each card</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.guidesToEdge} disabled={!settings.cutLines} onChange={e => update({ guidesToEdge: e.target.checked })} className="accent-[var(--color-accent)]" />Extend guides to the sheet edge</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={settings.cutLinesOnBacks} disabled={!settings.cutLines} onChange={e => update({ cutLinesOnBacks: e.target.checked })} className="accent-[var(--color-accent)]" />Also on back pages</label>
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
          {pages.length > 0 && <Button className="ml-auto" onClick={() => setPages(prev => reflow(prev, grid.perPage))}>Close gaps</Button>}
        </div>
        {!pages.length && <p className="text-sm text-ink/60">Select cards to see the print layout.</p>}
        <div className="flex flex-wrap gap-x-6 gap-y-5">
          {pages.map((page, p) => <div key={p} className="contents">
            <Sheet title={`Sheet ${p + 1} — front`} settings={settings} grid={grid} cards={page} assets={assets}
              drag={{ onStart: slot => setDragging({ page: p, slot }), onDrop: slot => drop({ page: p, slot }) }} />
            {useBacks && <Sheet title={`Sheet ${p + 1} — back (after flipping)`} settings={settings} grid={grid} assets={assets} back={backOf}
              cards={mirrorPage(page, grid.cols, grid.rows, settings.flip, settings.orientation)} />}
          </div>)}
        </div>
      </section>
    </div>
    {selectedFactions.map(f => <FactionRenderer key={f} factionId={f} imagePx={imagePx} onStatus={onStatus} />)}
    {allCards.map(c => <CardRenderer key={c.id} card={c} template={layout} onAsset={onAsset} />)}
  </div>
}
