import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { SafeAreaLines } from '../../components/SafeArea'
import { CardCanvas } from '../assemble/CardCanvas'
import { ReferenceOverlay } from '../assemble/ReferenceOverlay'
import { ReferenceField } from '../assemble/ReferenceCards'
import { useLibraryImages } from '../assemble/library'
import { usePreviewFaction } from '../assemble/usePreviewFaction'
import { undoShortcut, useUndoable } from '../assemble/useUndoable'
import { useFactions } from '../factions/api'
import { useFactionCard, useFactionCardDefaults, type AssetRef } from './api'
import { ELEMENTS, TITLE_ALIGNED, elementBox, mergeLayout, saveFactionCardLayout, useFactionCardLayout, type ElementKey, type ElementLayout, type SavedLayout, type Side } from './layout'
import { useCardImages } from './useCardImages'
import { CARD_SIZE, FACTION_CARD_CUT_MM, backgroundUrl, plateUrl, initialCardIds, normalizeData, resolveTextStyles } from './model'
import { TextStyleFields } from './TextStyleFields'
import { CardLens, MagnifierButton, useMagnifier } from './CardLens'
import { Field, inputClass } from '../../components/Field'
import { ModelStyleControls } from './ModelStyleControls'
import { renderFactionCard, type FactionCardResult } from './render'
import { useFactionLogoUrl } from './useFactionCardCanvases'

type Draft = SavedLayout
const byKey = (assets: AssetRef[] | undefined) => Object.fromEntries((assets ?? []).map(a => [a.key, a.url]))
const round = (n: number) => Math.round(n * 100) / 100
const SAMPLE = {
  text: '**Starkest Terror:** When you resolve a dominate order, you may rout 1 Stormtrooper in the active system to rout 1 unit of command level 2 or less on a world in either the active system or an adjacent system.',
  back_text: 'Fools say in their hearts, "There is no Emperor." Their deeds are loathsome and corrupt; not one does what is righteous nor holy.\nAll that have gone astray and alike are perverse. They then have good reason to fear.',
}
// Drag-and-drop positions for the faction card's elements, shared by every
// faction, shown on a faction's real card (sample text fills empty fields).
export function FactionCardLayoutEditor() {
  const queryClient = useQueryClient()
  const factions = useFactions(), images = useLibraryImages(), defaults = useFactionCardDefaults()
  const stored = useFactionCardLayout()
  const { factionId: preview } = usePreviewFaction()
  const faction = factions.data?.find(f => f.id === preview)
  const record = useFactionCard(preview)
  const logoUrl = useFactionLogoUrl(preview)
  const history = useUndoable<Draft>(stored.saved ?? {})
  const draft = history.value, { undo, redo } = history
  const [side, setSide] = useState<Side>('front')
  const [selected, setSelected] = useState<ElementKey>('title')
  const layout = useMemo(() => mergeLayout(draft), [draft])
  const [result, setResult] = useState<FactionCardResult | null>(null)
  const [error, setError] = useState('')
  const root = useRef<HTMLDivElement>(null), container = useRef<HTMLDivElement>(null)
  const drag = useRef<{ key: ElementKey; mode: 'move' | 'resize'; x: number; y: number; start: ElementLayout; titleX: number; box: { w: number; h: number } } | null>(null)

  // The saved layout arrives after the first render.
  const loaded = useRef(false)
  useEffect(() => { if (stored.data && !loaded.current) { loaded.current = true; history.set(stored.saved ?? {}) } }, [stored.data, stored.saved, history])
  useEffect(() => {
    const key = (e: KeyboardEvent) => undoShortcut(e, container.current, undo, redo)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [undo, redo])

  const data = useMemo(() => {
    if (!record.data || !faction) return null
    const d = normalizeData(record.data.data, faction.name)
    return { ...d, text: d.text || SAMPLE.text, back_text: d.back_text || SAMPLE.back_text, signature: d.signature || 'Signature', signature_title: d.signature_title || 'Title' }
  }, [record.data, faction])
  const cards = useCardImages(data ? initialCardIds(data) : [])
  const assets = useMemo(() => byKey(record.data?.assets), [record.data?.assets])
  const shared = useMemo(() => byKey(defaults.data), [defaults.data])
  // Both sides share the front's background; over it the front's plate or the back image.
  const background = backgroundUrl(record.data?.front_image_key ?? '', 'front', assets, images.data)
  const plate = side === 'front' ? (data ? plateUrl(data.plate, assets, images.data) : null) : backgroundUrl(record.data?.back_image_key ?? '', 'back', assets, images.data)
  useEffect(() => {
    if (!data || !record.data) return
    let cancelled = false
    // Drawn on the next frame at half size, so dragging a slider updates the
    // card straight away; only the newest request is kept.
    const frame = requestAnimationFrame(() => renderFactionCard({ side, data, unitColor: record.data!.unit_color, backgroundUrl: background, plateUrl: plate, assets, defaults: shared, layout, logoUrl, cardImages: cards.images, scale: 0.5 })
      .then(r => { if (!cancelled) { setResult(r); setError('') } }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not render the card.') }))
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [side, data, record.data, background, plate, assets, shared, layout, logoUrl, cards.images])

  const save = useMutation({
    mutationFn: () => saveFactionCardLayout(draft),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['faction-card-layout'] }),
  })
  const dirty = JSON.stringify(draft) !== JSON.stringify(stored.saved ?? {})
  const sideElements = ELEMENTS.filter(e => e.side === side)
  if (!sideElements.some(e => e.key === selected)) setSelected(sideElements[0].key)

  function startDrag(e: React.PointerEvent, key: ElementKey, mode: 'move' | 'resize') {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId)
    setSelected(key); save.reset(); history.begin()
    const box = elementBox(key, layout)
    drag.current = { key, mode, x: e.clientX, y: e.clientY, start: layout[key], titleX: layout.title.x, box }
  }
  function onDrag(e: React.PointerEvent) {
    const d = drag.current, rect = root.current?.getBoundingClientRect()
    if (!d || !rect?.width || !rect.height) return
    const dx = (e.clientX - d.x) / rect.width * 100, dy = (e.clientY - d.y) / rect.height * 100
    const spec = ELEMENTS.find(s => s.key === d.key)!
    // A logo's horizontal position follows its heading, the subtitle, text and objective heading follow the title,
    // and the starting forces are centred under their heading, so they only move up and down themselves. Dragging the
    // front logo or one of those sideways moves the title, and so the whole group, across.
    const vertical = d.key === 'logo' || d.key === 'backLogo' || d.key === 'forces' || TITLE_ALIGNED.includes(d.key)
    const group = d.mode === 'move' && (d.key === 'logo' || TITLE_ALIGNED.includes(d.key))
    // A centred box grows on both sides, so its corner follows the pointer when it widens by twice the drag.
    const grow = d.key === 'forces' ? 2 * dx : dx
    const change: Partial<ElementLayout> = d.mode === 'move' ? (vertical ? { y: round(d.start.y + dy) } : { x: round(d.start.x + dx), y: round(d.start.y + dy) })
      : spec.kind === 'group' || spec.kind === 'icon' ? { scale: round(Math.max(0.2, (d.start.scale ?? 1) * (d.box.w + dx) / d.box.w)) }
      : { ...(TITLE_ALIGNED.includes(d.key) ? {} : { w: round(Math.max(1, (d.start.w ?? d.box.w) + grow)) }), ...(d.start.h !== undefined || spec.kind === 'box' || spec.kind === 'image' ? { h: round(Math.max(1, (d.start.h ?? d.box.h) + dy)) } : {}) }
    history.replace(v => ({ ...v, [d.key]: { ...v[d.key], ...change }, ...(group ? { title: { ...v.title, x: round(d.titleX + dx) } } : {}) }))
  }
  const endDrag = () => { drag.current = null }
  const [magnify, setMagnify] = useMagnifier()
  const selectedLabel = ELEMENTS.find(e => e.key === selected)?.label ?? ''

  if (!factions.data?.length) return <p className="text-sm text-ink/60">Create a faction to preview the faction card.</p>
  return <div ref={container} className="flex flex-wrap gap-4 border-t border-divider pt-4">
    {cards.probes}
    <div className="w-full shrink-0 lg:w-[calc(66.667%-0.5rem)]">
      <div className="mb-2 flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Card side" className="inline-flex overflow-hidden rounded-md border border-divider text-sm">
        {(['front', 'back'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={side === value} onClick={() => setSide(value)}
          className={`cursor-pointer border-0 px-4 py-1.5 capitalize ${side === value ? 'bg-accent/15 text-accent' : 'bg-transparent text-ink/60 hover:text-ink'}`}>{value}</button>)}
      </div>
      <MagnifierButton on={magnify} onToggle={() => setMagnify(v => !v)} disabled={!result} />
      </div>
      <CardLens on={magnify} source={result?.canvas ?? null}><div ref={root} className="relative select-none bg-black/30">
        {result ? <CardCanvas result={result} aria-label={`Faction card ${side} position preview`} className="block h-auto w-full" />
          : <div className="grid aspect-[3118/1866] place-items-center rounded border border-divider text-xs text-ink/50">{error || 'Rendering…'}</div>}
        {result && <SafeAreaLines px={CARD_SIZE} cutMm={FACTION_CARD_CUT_MM} />}
        {result && <ReferenceOverlay category="faction" side={side} />}
        {result && sideElements.filter(e => e.kind !== 'style').map(({ key, label }) => { const b = elementBox(key, layout), active = key === selected
          return <div key={key} role="button" tabIndex={-1} aria-label={`Drag ${label}`} title={label}
            onPointerDown={e => startDrag(e, key, 'move')} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            className={`absolute cursor-move touch-none border ${magnify ? 'pointer-events-none' : ''} ${active ? 'z-10 border-accent bg-accent/10' : 'border-dashed border-white/40 hover:border-accent/70'}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.w}%`, height: `${b.h}%` }}>
            {active && <span aria-label={`Resize ${label}`} role="button" tabIndex={-1} onPointerDown={e => startDrag(e, key, 'resize')} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
              className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize touch-none rounded-sm border border-bg bg-accent" />}
          </div> })}
      </div></CardLens>
      <div className="mt-2"><ReferenceField category="faction" side={side} /></div>
      <p className="mt-1 text-[11px] text-ink/50">Drag an area to move it, its corner to resize it (groups scale). ⌘Z / Ctrl+Z undoes, ⇧⌘Z redoes. Empty texts show samples here.</p>
    </div>
    <div className="min-w-64 flex-1 space-y-3">
      <p role="status" aria-label="Selected area" className="m-0 text-sm text-ink/80">Selected: <span className="text-accent">{selectedLabel}</span></p>
      <p className="m-0 text-xs text-ink/55">Click an area on the card to select it, drag it to move it and drag its corner to resize it. Groups (the unit table, starting forces and objectives) scale as a whole.</p>
      <ModelStyleControls open title="Unit shadow, outline and contrast (all factions)" value={layout.modelStyle} onStart={() => history.begin()} onChange={modelStyle => { save.reset(); history.replace(d => ({ ...d, modelStyle })) }} />
      {side === 'front' && <ModelStyleControls open flat title="Structure shadow and outline: city, factory, bastion (all factions)" value={layout.structureStyle} onStart={() => history.begin()} onChange={structureStyle => { save.reset(); history.replace(d => ({ ...d, structureStyle })) }} />}
      <details open className="rounded border border-divider px-3 py-2">
        <summary className="cursor-pointer text-sm text-accent-300">Text size and line spacing on the {side} (all factions)</summary>
        <div className="mt-2"><TextStyleFields side={side} label="Shared text styles" value={layout.textStyles} base={resolveTextStyles()} onChange={textStyles => { save.reset(); history.set(d => ({ ...d, textStyles })) }} /></div>
        <p className="mt-2 mb-0 text-[11px] text-ink/50">Empty fields use the designed size. Each faction can override these on its own card page.</p>
      </details>
      {side === 'back' && <details open className="rounded border border-divider px-3 py-2">
        <summary className="cursor-pointer text-sm text-accent-300">Spacing and sizes (all factions)</summary>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {([['forces', 'gap', "Between a row's two cells", '% of card width'], ['forces', 'rowGap', 'Between starting forces rows', '% of card height'], ['portraitStyle', 'gap', 'Letter to portrait', '% of card width'], ['objectives', 'w', 'Objective text card width', '% of card width'], ['objectives', 'h', 'Objective text card height', '% of card height']] as const).map(([key, field, name, unit]) =>
            <Field key={`${key}-${field}`} label={<>{name} <span className="text-ink/45">({unit})</span></>}>{id => <input id={id} type="number" min={0} step={0.05} className={inputClass} value={layout[key][field] ?? 0}
              onChange={e => { const v = e.target.valueAsNumber; if (!Number.isFinite(v) || v < 0) return; save.reset(); history.set(d => ({ ...d, [key]: { ...d[key], [field]: round(v) } })) }} />}</Field>)}
        </div>
      </details>}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save layout'}</Button>
        <Button disabled={!history.canUndo} onClick={history.undo}>Undo</Button>
        <Button disabled={!history.canRedo} onClick={history.redo}>Redo</Button>
        <Button disabled={!dirty || save.isPending} onClick={() => { save.reset(); history.set(stored.saved ?? {}) }}>Discard</Button>
        <Button disabled={save.isPending} onClick={() => { save.reset(); history.set({}) }}>Reset to reference layout</Button>
      </div>
      {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
      {save.isSuccess && !dirty && <p role="status" className="m-0 text-sm text-success">Layout saved.</p>}
      <p className="m-0 text-xs text-ink/50">Positions apply to every faction's card.</p>
    </div>
  </div>
}
