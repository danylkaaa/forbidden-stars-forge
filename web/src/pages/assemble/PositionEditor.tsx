import { SearchableSelect } from '../../components/SearchableSelect'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { SafeAreaLines } from '../../components/SafeArea'
import { useCutMm } from '../print/layout'
import { Field, selectClass } from '../../components/Field'
import { StepperInput } from '../../components/StepperInput'
import { usePreviewFaction } from './usePreviewFaction'
import { useOverlayAdjust } from './overlays'
import { ReferenceOverlay } from './ReferenceOverlay'
import { ReferenceField } from './ReferenceCards'
import { CardCanvas } from './CardCanvas'
import { PlacementFields } from './LayerControls'
import { usePreviewTemplate, useTemplateLayout } from './library'
import { useFactionLogos } from './logos'
import { DEMO_COMBAT, DEMO_SCHEMA, DEMO_UPGRADE, assemblyLayout, layerLabel, resourceBox, defaultLayout, type Layer, type Layout, type Placement } from './model'
import { ACTION_LABELS, orderLabel, UPGRADE_TYPES, type Category, type UpgradeType } from '../cards/model'
import type { RenderInput } from './render'
import { useRenderedCard } from './useCardView'
import { undoShortcut, useUndoable } from './useUndoable'
import { useDemoArtwork } from './demoArtwork'

const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
const CARD_SIZE = { width: 816, height: 1104 }
// Icons in the demo card's resource column.
const round = (n: number) => Math.round(n * 10) / 10
// The editor that last received a pointer or focus owns Cmd+Z, so several
// open editors don't all undo at once.
let activeEditor = ''
const isRules = (layer: Layer): layer is 'upper_text' | 'lower_text' => layer === 'upper_text' || layer === 'lower_text'

type Props = {
  id: string; category?: Category; label: string; saved: Partial<Layout>; initialLevel: number; note: string; resetLabel: string
  // Layers editable for the previewed kind of card (combat: starting or advanced) and level.
  layersFor: (level: number, starting: boolean) => Layer[]
  onSave: (draft: Partial<Layout>) => Promise<unknown>
}

// Drag-and-drop layer positions on a demo card of the chosen faction, with
// undo/redo. Used for the positions of everything on a card type.
export function PositionEditor({ id: editorId, category = 'combat', label, saved, initialLevel, note, resetLabel, layersFor, onSave }: Props) {
  const demoArtwork = useDemoArtwork()
  const logos = useFactionLogos()
  const { factionId: previewFaction } = usePreviewFaction()
  const [level, setLevel] = useState(initialLevel)
  // Combat cards come in two kinds, each with its own ribbon: starting (the faction logo) and advanced (a level and a price).
  const [starting, setStarting] = useState(false)
  const upgrade = category === 'upgrade', schema = category === 'schema'
  const cutMm = useCutMm()
  const [action, setAction] = useState(DEMO_SCHEMA.action), [kind, setKind] = useState<'schema' | 'tactic'>(DEMO_SCHEMA.subtype)
  const [price, setPrice] = useState(upgrade ? DEMO_UPGRADE.resource_cost : DEMO_COMBAT.resource_cost)
  const [order, setOrder] = useState<UpgradeType>(DEMO_UPGRADE.upgrade_type)
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
  const combat = category === 'combat', isStarting = combat && starting, shownLevel = isStarting ? 0 : level
  const layers = layersFor(shownLevel, isStarting)
  const [layerChoice, setLayer] = useState<Layer>(layers[0])
  const layer = layers.includes(layerChoice) ? layerChoice : layers[0]
  const template = usePreviewTemplate(previewFaction, category)
  const templateLayout = useTemplateLayout(category)
  const layout = useMemo(() => assemblyLayout(draft, category), [draft, category])
  const logoUrl = logos.data?.find(l => l.faction_id === previewFaction)?.url ?? null
  const overlayAdjust = useOverlayAdjust(previewFaction)
  const input = useMemo<RenderInput | null>(() => !template.isPending && (templateLayout.ready || !template.image)
    ? { card: schema ? { ...DEMO_SCHEMA, action, subtype: kind } : upgrade ? { ...DEMO_UPGRADE, level, resource_cost: price, upgrade_type: order } : { ...DEMO_COMBAT, level: shownLevel, starting: isStarting, resource_cost: price }, layout, imageUrl: template.image?.url ?? BLANK, logoUrl, artworkUrl: demoArtwork, overlayAdjust, outputSize: CARD_SIZE }
    : null, [template.isPending, templateLayout.ready, template.image, layout, level, shownLevel, isStarting, price, order, upgrade, schema, action, kind, logoUrl, demoArtwork, overlayAdjust])
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
        {result && <SafeAreaLines px={result.canvas} cutMm={cutMm} />}
        {result && <ReferenceOverlay category={category} side="front" cardWidth={result.canvas.width} />}
        {result && layers.map(key => { const b = key === 'resources' ? resourceBox(layout[key]) : shown(key), selected = key === layer
          return <div key={key} role="button" tabIndex={-1} aria-label={`Drag ${layerLabel(key, category)}`} title={layerLabel(key, category)}
            onPointerDown={e => startDrag(e, key, 'move')} onPointerMove={onDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag}
            className={`absolute cursor-move touch-none border ${selected ? 'z-10 border-accent bg-accent/10' : 'border-dashed border-white/40 hover:border-accent/70'}`}
            style={{ left: `${b.x}%`, top: `${b.y}%`, width: `${b.width}%`, height: `${b.height}%` }}>
            {selected && key !== 'resources' && <span aria-label={`Resize ${layerLabel(key, category)}`} role="button" tabIndex={-1}
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
      <div className={`grid gap-3 ${schema ? 'grid-cols-3' : upgrade ? 'grid-cols-2' : 'grid-cols-3'}`}>
        {schema && <>
          <Field label="Preview kind">{id => <SearchableSelect id={id} className={selectClass} value={kind} onChange={e => setKind(e.target.value as 'schema' | 'tactic')}>
            <option value="schema">Scheme</option><option value="tactic">Tactic</option>
          </SearchableSelect>}</Field>
          <Field label="Preview action">{id => <SearchableSelect id={id} className={selectClass} value={action} onChange={e => setAction(e.target.value as typeof action)}>
            {Object.entries(ACTION_LABELS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </SearchableSelect>}</Field>
        </>}
        {combat && <div role="tablist" aria-label="Card kind" className="col-span-full inline-flex w-fit overflow-hidden rounded-md border border-divider text-sm">
          {([['Advanced', false], ['Starting', true]] as const).map(([name, value]) => <button key={name} type="button" role="tab" aria-selected={starting === value} onClick={() => setStarting(value)}
            className={`cursor-pointer border-0 px-4 py-1.5 ${starting === value ? 'bg-accent/15 text-accent' : 'bg-transparent text-ink/60 hover:text-ink'}`}>{name}</button>)}
        </div>}
        {!schema && !isStarting && <Field label="Preview level">{id => <StepperInput id={id} label="Preview level" value={level} min={0} max={3} onChange={setLevel} />}</Field>}
        {upgrade && <Field label="Preview order">{id => <SearchableSelect id={id} className={selectClass} value={order} onChange={e => setOrder(e.target.value as UpgradeType)}>
          {UPGRADE_TYPES.map(t => <option key={t} value={t}>{orderLabel(t)}</option>)}
        </SearchableSelect>}</Field>}
        {!schema && <Field label="Preview price">{id => <StepperInput id={id} label="Preview price" value={price} min={0} max={12} disabled={isStarting} title={isStarting ? 'Starting cards have no resource price' : undefined} onChange={setPrice} />}</Field>}
      </div>
      <Field label="Layer">{id => <SearchableSelect id={id} className={selectClass} value={layer} onChange={e => setLayer(e.target.value as Layer)}>
        {layers.map(key => <option key={key} value={key}>{layerLabel(key, category)}</option>)}
      </SearchableSelect>}</Field>
      {isRules(layer) && category === 'combat' && <label className="flex items-center gap-2 text-xs text-ink/70"><input type="checkbox" checked={layout[layer].autoY ?? layout[layer].y === defaultLayout(category)[layer].y} onChange={e => move({ autoY: e.target.checked })} />Automatic vertical position (centred in its panel)</label>}
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
      <ReferenceField category={category} side="front" />
    </div>
  </div>
}
