import { SearchableSelect } from '../../components/SearchableSelect'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field, selectClass } from '../../components/Field'
import { useFactions } from '../factions/api'
import { CardCanvas } from './CardCanvas'
import { PlacementFields } from './LayerControls'
import { usePreviewTemplate, useTemplateLayout } from './library'
import { useFactionLogos } from './logos'
import { DEMO_COMBAT, LAYER_LABELS, resourceBox, defaultLayout, type Layer, type Layout, type Placement } from './model'
import type { RenderInput } from './render'
import { useAssembly } from './state'
import { useRenderedCard } from './useCardView'
import { undoShortcut, useUndoable } from './useUndoable'
import { useDemoArtwork } from './demoArtwork'

const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const CARD_SIZE = { width: 816, height: 1104 }
// Icons in the demo card's resource column.
const stackCount = DEMO_COMBAT.guns + DEMO_COMBAT.shields + DEMO_COMBAT.eagles
const round = (n: number) => Math.round(n * 10) / 10
// The editor that last received a pointer or focus owns Cmd+Z, so several
// open editors don't all undo at once.
let activeEditor = ''
const isRules = (layer: Layer): layer is 'upper_text' | 'lower_text' => layer === 'upper_text' || layer === 'lower_text'

export type Composed = { layout: Layout; overlayUrls: string[] }
type Props = {
  id: string; label: string; saved: Partial<Layout>; initialLevel: number; note: string; resetLabel: string
  // Layers editable at a preview level, and the full preview for a draft.
  layersFor: (level: number) => Layer[]
  compose: (draft: Partial<Layout>, level: number, base: Layout) => Composed
  onSave: (draft: Partial<Layout>) => Promise<unknown>
}

// Drag-and-drop layer positions on a demo card of the chosen faction, with
// undo/redo. Used for card type text positions and subtype overlay positions.
export function PositionEditor({ id: editorId, label, saved, initialLevel, note, resetLabel, layersFor, compose, onSave }: Props) {
  const demoArtwork = useDemoArtwork()
  const factions = useFactions(), logos = useFactionLogos()
  const [factionId, setFactionId] = useState(() => useAssembly.getState().factionId)
  const previewFaction = factionId ?? factions.data?.[0]?.id ?? null
  const [level, setLevel] = useState(initialLevel)
  const [price, setPrice] = useState(DEMO_COMBAT.resource_cost)
  const history = useUndoable<Partial<Layout>>(saved)
  const draft = history.value
  const root = useRef<HTMLDivElement>(null), container = useRef<HTMLDivElement>(null)
  const drag = useRef<{ layer: Layer; mode: 'move' | 'resize'; x: number; y: number; start: Placement } | null>(null)
  const { undo, redo } = history
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (activeEditor === editorId) undoShortcut(e, container.current, undo, redo) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [editorId, undo, redo])
  const layers = layersFor(level)
  const [layerChoice, setLayer] = useState<Layer>(layers[0])
  const layer = layers.includes(layerChoice) ? layerChoice : layers[0]
  const template = usePreviewTemplate(previewFaction, 'combat')
  const templateLayout = useTemplateLayout()
  const { layout, overlayUrls } = useMemo(() => compose(draft, level, templateLayout.layout), [compose, draft, level, templateLayout.layout])
  const logoUrl = logos.data?.find(l => l.faction_id === previewFaction)?.url ?? null
  const input = useMemo<RenderInput | null>(() => !template.isPending && (templateLayout.ready || !template.image)
    ? { card: { ...DEMO_COMBAT, level, resource_cost: price }, layout, imageUrl: template.image?.url ?? BLANK, overlayUrl: null, overlayUrls, logoUrl, artworkUrl: demoArtwork, outputSize: CARD_SIZE }
    : null, [template.isPending, templateLayout.ready, template.image, layout, level, price, overlayUrls, logoUrl, demoArtwork])
  const { result, error } = useRenderedCard(input)
  const save = useMutation({ mutationFn: () => onSave(draft) })
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  // Rules text sits where the renderer actually put it (automatic vertical position).
  const shown = (key: Layer) => isRules(key) ? result?.textPositions[key] ?? layout[key] : layout[key]
  const p = shown(layer)
  // Moving rules text vertically turns off its automatic position.
  const patchLayer = (d: Partial<Layout>, key: Layer, patch: Partial<Placement>) => ({ ...d, [key]: { ...layout[key], ...d[key], ...patch, ...(isRules(key) && 'y' in patch ? { autoY: false } : {}) } })
  const move = (patch: Partial<Placement>) => { save.reset(); history.set(d => patchLayer(d, layer, patch)) }
  function startDrag(e: React.PointerEvent, key: Layer, mode: 'move' | 'resize') {
    if (e.button !== 0) return
    e.preventDefault(); e.stopPropagation()
    e.currentTarget.setPointerCapture?.(e.pointerId)
    setLayer(key); save.reset(); history.begin()
    drag.current = { layer: key, mode, x: e.clientX, y: e.clientY, start: shown(key) }
  }
  function onDrag(e: React.PointerEvent) {
    const d = drag.current, box = root.current?.getBoundingClientRect()
    if (!d || !box?.width || !box.height) return
    const dx = (e.clientX - d.x) / box.width * 100, dy = (e.clientY - d.y) / box.height * 100
    history.replace(v => patchLayer(v, d.layer, d.mode === 'move'
      ? { x: round(d.start.x + dx), y: round(d.start.y + dy) }
      : { width: round(Math.max(1, d.start.width + dx)), height: round(Math.max(1, d.start.height + dy)) }))
  }
  const endDrag = () => { drag.current = null }
  return <div ref={container} className="flex flex-wrap gap-4 border-t border-divider pt-4"
    onPointerDownCapture={() => { activeEditor = editorId }} onFocusCapture={() => { activeEditor = editorId }}>
    <div className="w-full shrink-0 sm:w-[min(560px,calc((100vh_-_160px)*0.739))]">
      <div ref={root} className="relative select-none">
        {result
          ? <CardCanvas result={result} aria-label={`${label} position preview`} className="block h-auto w-full" />
          : <div className="grid aspect-[3/4] place-items-center rounded border border-divider text-xs text-ink/50">{error || 'Rendering…'}</div>}
        {result && layers.map(key => { const b = key === 'resources' ? resourceBox(layout[key], stackCount, CARD_SIZE) : shown(key), selected = key === layer
          return <div key={key} role="button" tabIndex={-1} aria-label={`Drag ${LAYER_LABELS[key]}`} title={LAYER_LABELS[key]}
            onPointerDown={e => startDrag(e, key, 'move')} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            className={`absolute cursor-move touch-none border ${selected ? 'z-10 border-accent bg-accent/10' : 'border-dashed border-white/40 hover:border-accent/70'}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.width}%`, height: `${b.height}%` }}>
            {selected && key !== 'resources' && <span aria-label={`Resize ${LAYER_LABELS[key]}`} role="button" tabIndex={-1}
              onPointerDown={e => startDrag(e, key, 'resize')} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
              className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize touch-none rounded-sm border border-bg bg-accent" />}
          </div> })}
      </div>
      <p className="mt-1 text-[11px] text-ink/50">{template.image
        ? <>Template: {template.image.name}{template.chosen ? '' : ' (newest image of this faction; choose one with the Library settings)'}.</>
        : 'This faction has no generated images yet, so the preview has no template.'}</p>
      <p className="mt-1 text-[11px] text-ink/50">Drag a box to move it, its corner to resize (resource icons resize with Icon size). ⌘Z / Ctrl+Z undoes, ⇧⌘Z redoes.</p>
    </div>
    <div className="min-w-64 flex-1 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Field label="Preview faction">{id => <SearchableSelect id={id} className={selectClass} value={previewFaction ?? ''} onChange={e => setFactionId(Number(e.target.value) || null)}>
          {factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </SearchableSelect>}</Field>
        <Field label="Preview level">{id => <SearchableSelect id={id} className={selectClass} value={level} onChange={e => setLevel(Number(e.target.value))}>
          {[0, 1, 2, 3].map(l => <option key={l} value={l}>{l}</option>)}
        </SearchableSelect>}</Field>
        <Field label="Preview price">{id => <SearchableSelect id={id} className={selectClass} value={price} disabled={level === 0} title={level === 0 ? 'Level 0 cards have no resource price' : undefined} onChange={e => setPrice(Number(e.target.value))}>
          {Array.from({ length: 13 }, (_, n) => <option key={n} value={n}>{n}</option>)}
        </SearchableSelect>}</Field>
      </div>
      <Field label="Layer">{id => <SearchableSelect id={id} className={selectClass} value={layer} onChange={e => setLayer(e.target.value as Layer)}>
        {layers.map(key => <option key={key} value={key}>{LAYER_LABELS[key]}</option>)}
      </SearchableSelect>}</Field>
      {isRules(layer) && <label className="flex items-center gap-2 text-xs text-ink/70"><input type="checkbox" checked={layout[layer].autoY ?? layout[layer].y === defaultLayout()[layer].y} onChange={e => move({ autoY: e.target.checked })} />Automatic vertical position (centred in its panel)</label>}
      <PlacementFields layer={layer} p={p} move={move} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save positions'}</Button>
        <Button disabled={!history.canUndo} onClick={history.undo}>Undo</Button>
        <Button disabled={!history.canRedo} onClick={history.redo}>Redo</Button>
        <Button disabled={!dirty || save.isPending} onClick={() => { save.reset(); history.set(saved) }}>Discard</Button>
        <Button disabled={save.isPending} onClick={() => { save.reset(); history.set({}) }}>{resetLabel}</Button>
      </div>
      {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
      {save.isSuccess && !dirty && <p role="status" className="m-0 text-sm text-success">Positions saved.</p>}
      <p className="m-0 text-xs text-ink/50">{note}</p>
    </div>
  </div>
}
