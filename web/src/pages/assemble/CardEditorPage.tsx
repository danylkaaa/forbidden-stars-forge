import { SearchableSelect } from '../../components/SearchableSelect'
import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { DiffPanel } from '../../components/DiffPanel'
import { Field, inputClass, selectClass } from '../../components/Field'
import { apiGet } from '../../lib/api'
import { createCard, updateCard } from '../cards/api'
import { ACTION_LABELS, CATEGORIES, newDraft, UPGRADE_TYPES, type Card, type CardInput, type Category } from '../cards/model'
import { draftInput } from '../cards/validation'
import { useFactions } from '../factions/api'
import { emptyAssembly, layoutWithTitleScale, saveAssembly, uploadArtwork, type Assembly } from './api'
import { defaultArtwork, panArtwork, zoomArtwork, type ArtworkTransform } from './artwork'
import { artWindow, downloadName, LAYER_LABELS, LIBRARY_TABS } from './model'
import { pngBlob } from './render'
import { useAssembly } from './state'
import { labLink, useTemplate, useTemplateLayout } from './library'
import { levelSubtypeName } from './subtypes'
import { undoShortcut } from './useUndoable'
import { useCardDraft, useCardRenderInput, useRenderedCard } from './useCardView'
import { CardCanvas } from './CardCanvas'
import { SymbolPicker } from './SymbolPicker'
import { Preview3DButton } from './Card3DViewer'
import { PositionNumber } from './LayerControls'

const panel = 'space-y-4 rounded-lg border border-divider bg-surface p-4'
const NUMBER_FIELDS = [['resource_cost', 'Resource price'], ['guns', 'Guns'], ['shields', 'Shields'], ['eagles', 'Morale / eagles']] as const

export default function CardEditorPage({ newFactionId, newCategory = 'combat', onCategoryChange }: { newFactionId?: string; newCategory?: Category; onCategoryChange?: (category: Category, factionId: string) => void } = {}) {
  const creating = newFactionId !== undefined
  const { id: routeId = '' } = useParams()
  const id = creating ? '-1' : routeId
  const navigate = useNavigate()
  const factions = useFactions()
  const [newSource] = useState<Card>(() => ({ ...draftInput(newDraft(newCategory, newFactionId ?? '')) as CardInput, id: -1, created_at: '', updated_at: '' }))
  const [localAssembly, setLocalAssembly] = useState(emptyAssembly)
  const [artworkFile, setArtworkFile] = useState<File | null>(null)
  useEffect(() => {
    if (!creating) return
    useAssembly.getState().clearEdits(id); useAssembly.getState().clearTransform(id); useAssembly.getState().clearLogoScale(id); useAssembly.getState().clearTitleScale(id)
    return () => { useAssembly.getState().clearEdits(id); useAssembly.getState().clearTransform(id); useAssembly.getState().clearLogoScale(id); useAssembly.getState().clearTitleScale(id) }
  }, [creating, id])
  useEffect(() => {
    if (!creating) return
    if (!artworkFile) { setLocalAssembly(a => ({ ...a, image_key: '', image_url: '' })); return }
    const url = URL.createObjectURL(artworkFile)
    setLocalAssembly(a => ({ ...a, image_key: 'upload', image_url: url }))
    return () => URL.revokeObjectURL(url)
  }, [creating, artworkFile])
  const createdArtworkError = (useLocation().state as { artworkError?: string } | null)?.artworkError
  const queryClient = useQueryClient()
  const cardQuery = useQuery({ queryKey: ['cards', 'one', id], enabled: !creating, queryFn: () => apiGet<Card>(`/api/cards/${id}`) })
  const source = creating ? newSource : cardQuery.data
  const state = useAssembly()
  const { saved, draft, issues, card, dirty } = useCardDraft(source, creating ? 'New card' : '')
  const factionId = Number(draft?.faction_id) || null
  const category = source?.category ?? newCategory
  const upgrade = category === 'upgrade', schema = category === 'schema', framed = upgrade || schema
  const ART_WINDOW = artWindow(category)
  const template = useTemplate(factionId, category)
  const templateLayout = useTemplateLayout(category)
  const back = useTemplate(factionId, category, 'back')
  const { input, assembly, logoScale, titleScale, transform, subtypes, subtype: activeSubtype } = useCardRenderInput(source, template.image, templateLayout, creating ? localAssembly : undefined)
  const { result, error: renderError, rendering, retry } = useRenderedCard(input)
  const [downloadError, setDownloadError] = useState('')
  const drag = useRef<{ x: number; y: number; transform: ArtworkTransform } | null>(null)
  const preview = useRef<HTMLCanvasElement | null>(null)
  const textTarget = useRef<{ key: string; element: HTMLInputElement | HTMLTextAreaElement } | null>(null)
  const firstText = useRef<HTMLTextAreaElement>(null), firstTextKey = framed ? 'text' : 'upper_text'
  const logoScaleDirty = state.logoScales[id] !== undefined
  const titleScaleDirty = state.titleScales[id] !== undefined
  const transformDirty = !!state.transforms[id]
  const hasArtwork = !!assembly.data?.image_url
  // The artwork moves only while selected: click it on the preview (or use
  // the Artwork panel button). Enter (or a click elsewhere) keeps the move,
  // Esc puts the artwork back where it was when selected.
  const [artSelected, setArtSelected] = useState(false)
  const movable = hasArtwork && artSelected
  const previewBox = useRef<HTMLDivElement>(null), artworkPanel = useRef<HTMLElement>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (creating && draft) {
        const created = await createCard(draftInput(draft) as CardInput)
        let artworkError = ''
        try {
          const uploaded = artworkFile ? await uploadArtwork(String(created.id), artworkFile) : emptyAssembly()
          const assembled = await saveAssembly(String(created.id), { ...uploaded, subtype_id: localAssembly.subtype_id, logo_scale: logoScale, transform, layout: layoutWithTitleScale(localAssembly.layout, titleScale) })
          queryClient.setQueryData(['card-assembly', String(created.id)], assembled)
        } catch (e) {
          artworkError = e instanceof Error ? e.message : 'Artwork or position could not be saved.'
          // Keep the chosen position available for saving from the editor.
          useAssembly.getState().transform(String(created.id), transform)
          useAssembly.getState().logoScale(String(created.id), logoScale); useAssembly.getState().titleScale(String(created.id), titleScale)
        }
        queryClient.setQueryData(['cards', 'one', String(created.id)], created)
        useAssembly.getState().select({ factionId: created.faction_id, category: created.category })
        navigate(`/assemble/cards/${created.id}`, { state: artworkError ? { artworkError } : undefined })
        return
      }
      if (dirty && card && source) {
        const updated = await updateCard(source.id, card)
        queryClient.setQueryData(['cards', 'one', id], updated)
        useAssembly.getState().clearEdits(id)
      }
      if ((transformDirty || logoScaleDirty || titleScaleDirty) && assembly.data) {
        const value = { ...assembly.data, transform, logo_scale: logoScale }
        queryClient.setQueryData(['card-assembly', id], await saveAssembly(id, { ...value, layout: layoutWithTitleScale(assembly.data.layout, titleScale) }))
        useAssembly.getState().clearTransform(id)
        useAssembly.getState().clearLogoScale(id)
        useAssembly.getState().clearTitleScale(id)
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['cards'] }),
  })
  const artwork = useMutation({
    mutationFn: async (file: File | null) => {
      if (creating) {
        setArtworkFile(file)
        const next = { ...localAssembly, transform: defaultArtwork(), ...(!file ? { image_key: '', image_url: '' } : {}) }
        setLocalAssembly(next)
        return next
      }
      return file ? uploadArtwork(id, file) : saveAssembly(id, { ...(assembly.data as Assembly), image_key: '', transform: defaultArtwork() })
    },
    onSuccess: saved => { if (!creating) queryClient.setQueryData(['card-assembly', id], saved); useAssembly.getState().clearTransform(id) },
  })

  const subtype = useMutation({
    mutationFn: async (subtypeId: number) => {
      const value = { ...(assembly.data as Assembly), subtype_id: subtypeId }
      if (creating) { setLocalAssembly(value); return value }
      return saveAssembly(id, value)
    },
    onSuccess: saved => { if (!creating) queryClient.setQueryData(['card-assembly', id], saved) },
  })

  // Undo history for artwork position (text fields keep the browser's own
  // undo). Each drag or wheel burst is one step.
  type Snapshot = { transform?: ArtworkTransform }
  const undoStack = useRef<Snapshot[]>([]), redoStack = useRef<Snapshot[]>([]), lastRecord = useRef(0)
  const [, bumpHistory] = useState(0)
  const snapshot = (): Snapshot => ({ transform: useAssembly.getState().transforms[id] })
  function record(coalesceMs = 0) {
    const now = Date.now()
    if (coalesceMs && now - lastRecord.current < coalesceMs) { lastRecord.current = now; return }
    lastRecord.current = coalesceMs ? now : 0
    undoStack.current.push(snapshot()); redoStack.current = []; bumpHistory(n => n + 1)
  }
  function restore(snap: Snapshot) {
    const transforms = { ...useAssembly.getState().transforms }
    if (snap.transform) transforms[id] = snap.transform; else delete transforms[id]
    save.reset(); useAssembly.setState({ transforms }); bumpHistory(n => n + 1)
  }
  function undo() { const snap = undoStack.current.pop(); if (snap) { redoStack.current.push(snapshot()); restore(snap) } }
  function redo() { const snap = redoStack.current.pop(); if (snap) { undoStack.current.push(snapshot()); restore(snap) } }

  // One selection is one move session: confirming leaves a single undo step.
  const artSession = useRef<{ undoLength: number; start: Snapshot } | null>(null)
  function selectArtwork() { artSession.current = { undoLength: undoStack.current.length, start: snapshot() }; setArtSelected(true) }
  function confirmArtwork() {
    const session = artSession.current
    if (session && undoStack.current.length > session.undoLength) { undoStack.current.length = session.undoLength; undoStack.current.push(session.start); redoStack.current = [] }
    artSession.current = null; setArtSelected(false); bumpHistory(n => n + 1)
  }
  function cancelArtwork() {
    const session = artSession.current
    if (session) {
      undoStack.current.length = session.undoLength
      const transforms = { ...useAssembly.getState().transforms }
      if (session.start.transform) transforms[id] = session.start.transform; else delete transforms[id]
      save.reset(); useAssembly.setState({ transforms })
    }
    artSession.current = null; setArtSelected(false); bumpHistory(n => n + 1)
  }
  const artKeys = useRef({ confirmArtwork, cancelArtwork })
  artKeys.current = { confirmArtwork, cancelArtwork }
  useEffect(() => {
    if (!movable) return
    const away = (e: PointerEvent) => { const t = e.target as Node; if (!previewBox.current?.contains(t) && !artworkPanel.current?.contains(t)) artKeys.current.confirmArtwork() }
    const keys = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); artKeys.current.confirmArtwork() }
      else if (e.key === 'Escape') { e.preventDefault(); artKeys.current.cancelArtwork() }
    }
    document.addEventListener('pointerdown', away); window.addEventListener('keydown', keys)
    return () => { document.removeEventListener('pointerdown', away); window.removeEventListener('keydown', keys) }
  }, [movable])
  useEffect(() => {
    const key = (e: KeyboardEvent) => undoShortcut(e, null, undo, redo)
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  })

  function setTransform(next: ArtworkTransform, step = true) { if (step) record(); save.reset(); state.transform(id, next) }
  // Wheel zoom keeps the artwork point under the cursor fixed; offsets are
  // measured from the artwork window's centre.
  useEffect(() => {
    const canvas = preview.current
    if (!canvas || !movable) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return
      const px = (e.clientX - rect.left) / rect.width * 100 - (ART_WINDOW.x + ART_WINDOW.width / 2)
      const py = (e.clientY - rect.top) / rect.height * 100 - (ART_WINDOW.y + ART_WINDOW.height / 2)
      record(400); setTransform(zoomArtwork(transform, transform.scale * Math.exp(-e.deltaY * .001), px, py), false)
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  })

  function edit(field: string, value: string) { save.reset(); state.edit(id, field, value) }
  function insertSymbol(token: string) {
    if (!draft) return
    const target = textTarget.current?.element.isConnected ? textTarget.current : firstText.current ? { key: firstTextKey, element: firstText.current } : null
    if (!target) return
    const text = draft[target.key]
    const start = target.element.selectionStart ?? text.length, end = target.element.selectionEnd ?? start
    edit(target.key, text.slice(0, start) + token + text.slice(end))
    requestAnimationFrame(() => { target.element.focus(); target.element.setSelectionRange(start + token.length, start + token.length) })
  }
  function discard() {
    save.reset(); state.clearEdits(id); state.clearTransform(id); state.clearLogoScale(id); state.clearTitleScale(id)
    if (creating) { setArtworkFile(null); setLocalAssembly(emptyAssembly()) }
  }
  async function download() {
    if (!result || !card) return
    setDownloadError('')
    try {
      const url = URL.createObjectURL(await pngBlob(result.canvas))
      const link = document.createElement('a'); link.href = url; link.download = downloadName(card.name)
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setDownloadError(e instanceof Error ? e.message : 'Download failed.') }
  }

  if (!creating && cardQuery.isError) return <div role="alert" className="text-danger">{cardQuery.error.message} <Link to="/assemble" className="text-accent underline">Back to library</Link></div>
  if (!source || !draft || !saved) return <p role="status" className="text-sm text-ink/60">Loading card…</p>

  const anyDirty = creating || dirty || transformDirty || logoScaleDirty || titleScaleDirty
  const busy = save.isPending || artwork.isPending || subtype.isPending
  const categorySubtypes = subtypes.data?.filter(st => st.category === source.category) ?? []
  const queryError = [assembly, ...template.queries].find(q => q.isError)?.error ?? templateLayout.error
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Link to="/assemble" className="text-sm text-accent no-underline hover:underline">← Library</Link>
        <h1 className="m-0 font-display text-2xl text-accent-300">{creating ? 'New card' : draft.name || 'Untitled card'}</h1>
      </div>
      <div className="flex flex-wrap gap-2">
        {template.image && <Link to={labLink(template.image)} className="inline-flex items-center rounded-md border border-divider px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-ink no-underline hover:border-accent/60">Edit template in Faction Lab</Link>}
        <Button title="Undo position change (⌘Z)" disabled={!undoStack.current.length} onClick={undo}>Undo</Button>
        <Button title="Redo (⇧⌘Z)" disabled={!redoStack.current.length} onClick={redo}>Redo</Button>
        <Button disabled={!anyDirty || busy} onClick={discard}>Discard changes</Button>
        <Button disabled={!result || rendering} onClick={() => void download()}>Download PNG</Button>
        <Button variant="primary" disabled={!anyDirty || !!issues.length || busy} onClick={() => save.mutate()}>{save.isPending ? creating ? 'Creating…' : 'Saving…' : creating ? 'Create card' : 'Save'}</Button>
      </div>
    </div>
    {queryError && <p role="alert" className="text-danger">{queryError.message}</p>}
    {save.isError && <p role="alert" className="text-danger">{save.error.message}</p>}
    {subtype.isError && <p role="alert" className="text-danger">{subtype.error.message}</p>}
    {createdArtworkError && !save.isSuccess && !artwork.isSuccess && <p role="alert" className="text-danger">The card was created, but its artwork or position could not be saved: {createdArtworkError}. Retry below.</p>}
    {artwork.isError && <p role="alert" className="text-danger">{artwork.error.message}</p>}
    {downloadError && <p role="alert" className="text-danger">{downloadError}</p>}
    {save.isSuccess && <p role="status" className="text-success">Saved.</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,1.2fr)_minmax(300px,1fr)]">
      <section aria-label="Card preview" className="space-y-3 lg:sticky lg:top-5">
        <div className="flex min-h-80 items-center justify-center rounded-lg border border-divider bg-black/30 p-3">
          <div ref={previewBox} className={result ? 'relative' : 'contents'}>
          <CardCanvas result={result} canvasRef={preview} aria-label="Assembled card" style={{ touchAction: movable ? 'none' : undefined, cursor: movable ? 'grab' : hasArtwork ? 'pointer' : undefined }}
            onPointerDown={e => {
              if (!hasArtwork || e.button !== 0) return
              if (!artSelected) {
                const rect = e.currentTarget.getBoundingClientRect(), x = (e.clientX - rect.left) / rect.width * 100, y = (e.clientY - rect.top) / rect.height * 100
                if (x >= ART_WINDOW.x && y >= ART_WINDOW.y && x <= ART_WINDOW.x + ART_WINDOW.width && y <= ART_WINDOW.y + ART_WINDOW.height) selectArtwork()
                return
              }
              e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); record(); drag.current = { x: e.clientX, y: e.clientY, transform }
            }}
            onPointerMove={e => { const start = drag.current; if (!start) return; const rect = e.currentTarget.getBoundingClientRect(); if (!rect.width || !rect.height) return; setTransform(panArtwork(start.transform, (e.clientX - start.x) / rect.width * 100, (e.clientY - start.y) / rect.height * 100), false) }}
            onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }}
            className={result ? 'block h-auto max-h-[85vh] max-w-full' : 'hidden'} />
          {result && !movable && <Preview3DButton title={draft.name || 'Card'} canvas={result.canvas} back={back.image?.url ?? null} backLogoUrl={back.image?.logoUrl} backLogoScale={back.image?.logoScale} className="absolute right-2 top-2 z-10" />}
          {result && movable && <div aria-hidden="true" className="pointer-events-none absolute border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
            style={{ left: `${ART_WINDOW.x}%`, top: `${ART_WINDOW.y}%`, width: `${ART_WINDOW.width}%`, height: `${ART_WINDOW.height}%` }}>
            <span className="absolute left-1 top-1 rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-accent-100">Drag to move · scroll to zoom · Enter applies · Esc cancels</span>
          </div>}
          </div>
          {!result && <p role="status" className="p-6 text-center text-sm text-ink/60">
            {renderError || (issues.length ? 'Fix the card fields to update the preview.' : !template.isPending && !template.image ? `No ${upgrade ? 'upgrade' : schema ? 'event' : 'combat'} template chosen for this faction. Pick one with the settings button in the library.` : 'Rendering card…')}
          </p>}
        </div>
        {renderError && <Button onClick={retry}>Retry rendering</Button>}
        {!!result?.warnings.length && <div role="status" className="space-y-1 text-xs text-warn">{result.warnings.map(w => <p key={w} className="m-0">{w}</p>)}</div>}
        {!template.image && !template.isPending && <Link to="/assemble" className="text-sm text-accent underline">Choose a template in the library</Link>}
      </section>

      <div className="space-y-5">
        <section aria-label="Card text" className={panel}>
          <h2 className="m-0 font-display text-accent-300">Card</h2>
          {creating && <div className="grid grid-cols-2 gap-3">
            <Field label="Faction">{fid => <select id={fid} className={selectClass} value={draft.faction_id} onChange={e => edit('faction_id', e.target.value)}>
              <option value="">Choose a faction…</option>
              {factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>}</Field>
            <Field label="Type">{fid => <select id={fid} className={selectClass} value={category} onChange={e => onCategoryChange?.(e.target.value as Category, draft.faction_id)}>
              {CATEGORIES.map(category => <option key={category} value={category}>{LIBRARY_TABS.find(t => t.category === category)!.label}</option>)}
            </select>}</Field>
          </div>}
          <Field label="Subtype">{fid => <SearchableSelect id={fid} className={selectClass} value={assembly.data?.subtype_id ?? 0} disabled={busy || !assembly.data}
            onChange={e => subtype.mutate(Number(e.target.value))}>
            <option value={0}>{source.category === 'combat' ? `Automatic by level (${levelSubtypeName(Number(draft.level) || 0)})` : 'None (card type overlay)'}</option>
            {categorySubtypes.map(st => <option key={st.id} value={st.id}>{st.name} · {st.overlays.length} overlay{st.overlays.length === 1 ? '' : 's'}</option>)}
          </SearchableSelect>}</Field>
          {activeSubtype && !activeSubtype.overlays.length && <p className="m-0 text-xs text-ink/60">“{activeSubtype.name}” has no overlays yet, so the card type overlay is used. <Link to="/subtypes" className="text-accent underline">Upload overlays</Link>.</p>}
          {!subtypes.isPending && !categorySubtypes.length && <p className="m-0 text-xs text-ink/60"><Link to="/subtypes" className="text-accent underline">Create a subtype</Link> to give this card its own overlays.</p>}
          <Field label="Title">{fid => <input id={fid} autoFocus={creating} className={inputClass} value={draft.name} onFocus={e => { textTarget.current = { key: 'name', element: e.currentTarget } }} onChange={e => edit('name', e.target.value)} />}</Field>
          <Field label={`Title size (${Math.round(titleScale * 100)}%)`}>{fid => <input id={fid} type="range" min={0.3} max={2} step={0.01} value={titleScale} disabled={busy} className="w-full"
            onChange={e => { save.reset(); state.titleScale(id, Number(e.target.value)) }} />}</Field>
          {titleScale !== 1 && <Button disabled={busy} onClick={() => { save.reset(); state.titleScale(id, 1) }}>Reset title size</Button>}
          {schema && <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">{fid => <SearchableSelect id={fid} className={selectClass} value={draft.subtype} onChange={e => edit('subtype', e.target.value)}>{['schema', 'tactic'].map(t => <option key={t} value={t}>{t === 'schema' ? 'Scheme' : 'Tactic'}</option>)}</SearchableSelect>}</Field>
            <Field label="Action">{fid => <SearchableSelect id={fid} className={selectClass} value={draft.action} onChange={e => edit('action', e.target.value)}>{Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SearchableSelect>}</Field>
          </div>}
          {upgrade && <Field label="Order">{fid => <SearchableSelect id={fid} className={selectClass} value={draft.upgrade_type} onChange={e => edit('upgrade_type', e.target.value)}>{UPGRADE_TYPES.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</SearchableSelect>}</Field>}
          {!schema && <div className={`grid grid-cols-2 gap-3 ${upgrade ? 'sm:grid-cols-2' : 'sm:grid-cols-5'}`}>
            <Field label="Level">{fid => <SearchableSelect id={fid} className={selectClass} value={draft.level} onChange={e => edit('level', e.target.value)}>{['0', '1', '2', '3'].map(l => <option key={l}>{l}</option>)}</SearchableSelect>}</Field>
            {(upgrade ? NUMBER_FIELDS.slice(0, 1) : NUMBER_FIELDS).map(([key, label]) => <Field key={key} label={label}>{fid => <input id={fid} type="number" min={0} step={1} className={inputClass} value={draft[key]} onChange={e => edit(key, e.target.value)}
              disabled={!upgrade && key === 'resource_cost' && draft.level === '0'} title={!upgrade && key === 'resource_cost' && draft.level === '0' ? 'Level 0 cards have no resource price' : undefined} />}</Field>)}
          </div>}
          {(framed ? ['text'] as const : ['upper_text', 'lower_text'] as const).map(key => <Field key={key} label={key === 'text' ? 'Text' : LAYER_LABELS[key]}>{fid => <textarea id={fid} rows={4} ref={key === firstTextKey ? firstText : undefined} onFocus={e => { textTarget.current = { key, element: e.currentTarget } }} className={inputClass} value={draft[key]} onChange={e => edit(key, e.target.value)} />}</Field>)}
          <SymbolPicker insert={insertSymbol} disabled={busy} />
          <p className="m-0 text-xs text-ink/60">(B), (S), (M), (D) insert boltgun, shield, morale, and dice icons; [B], [S] boxed boltgun and shield (morale is never boxed). **Italic text** is supported. {creating ? 'Artwork and position are saved when you create the card.' : 'Unsaved edits are kept in this browser.'}</p>
          {!!issues.length && <div role="alert" className="text-xs text-danger">{issues.map(i => <p key={i.field} className="m-0">{i.field}: {i.message}</p>)}</div>}
          {!creating && dirty && <details className="text-sm"><summary className="cursor-pointer text-accent">Show changes since save</summary><DiffPanel
            simpleRows={(schema ? ['subtype', 'action'] : upgrade ? ['upgrade_type', 'level', 'resource_cost'] : ['level', 'resource_cost', 'guns', 'shields', 'eagles']).filter(key => saved[key] !== draft[key]).map(key => ({ field: key, before: saved[key], after: draft[key] }))}
            textDiffs={(framed ? ['name', 'text'] as const : ['name', 'upper_text', 'lower_text'] as const).map(key => ({ field: key === 'text' ? 'Text' : LAYER_LABELS[key], before: saved[key], after: draft[key] }))} /></details>}
        </section>

        {(framed || draft.level === '0') && <section aria-label="C0 faction logo" className={panel}>
          <h2 className="m-0 font-display text-accent-300">{framed ? 'Faction logo' : 'C0 faction logo'}</h2>
          <Field label={`Logo scale (${Math.round(logoScale * 100)}%)`}>{fid => <input id={fid} type="range" min={0.1} max={3} step={0.01} value={logoScale} disabled={busy} className="w-full"
            onChange={e => { save.reset(); state.logoScale(id, Number(e.target.value)) }} />}</Field>
          <Button disabled={busy || logoScale === 1} onClick={() => { save.reset(); state.logoScale(id, 1) }}>Reset logo scale</Button>
          <p className="m-0 text-xs text-ink/60">Resizes this card’s faction logo around the center of its badge. {creating ? 'Saved when you create the card.' : 'Click Save to keep the size.'}</p>
        </section>}

        {!upgrade && <section ref={artworkPanel} aria-label="Artwork" data-undo-scope className={panel}>
          <h2 className="m-0 font-display text-accent-300">Artwork</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-3.5 py-2 text-xs font-semibold uppercase tracking-wider hover:border-accent/60 ${busy ? 'pointer-events-none opacity-45' : ''}`}>
              {hasArtwork ? 'Replace artwork' : 'Add artwork'}
              <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Artwork file (PNG / JPEG)" disabled={busy}
                onChange={e => { const file = e.target.files?.[0]; if (file) artwork.mutate(file); e.target.value = '' }} />
            </label>
            {hasArtwork && <Button disabled={busy} onClick={() => artwork.mutate(null)}>Remove artwork</Button>}
            {artwork.isPending && <span role="status" className="text-xs text-ink/60">Updating artwork…</span>}
          </div>
          {hasArtwork ? <>
            <div className="flex flex-wrap items-center gap-2">
              {artSelected
                ? <><Button variant="primary" onClick={confirmArtwork}>Apply (Enter)</Button><Button onClick={cancelArtwork}>Cancel (Esc)</Button></>
                : <Button onClick={selectArtwork}>Select artwork to move</Button>}
              <span className="text-xs text-ink/60">Or click the artwork on the preview. While selected, drag to move and scroll to zoom.</span>
            </div>
            <Field label={`Scale (${Math.round(transform.scale * 100)}%)`}>{fid => <input id={fid} type="range" min={0.1} max={5} step={0.01} value={transform.scale} className="w-full" onChange={e => setTransform(zoomArtwork(transform, Number(e.target.value)))} />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Offset X (%)">{fid => <PositionNumber id={fid} value={transform.x} min={-200} max={200} onChange={x => setTransform({ ...transform, x })} />}</Field>
              <Field label="Offset Y (%)">{fid => <PositionNumber id={fid} value={transform.y} min={-200} max={200} onChange={y => setTransform({ ...transform, y })} />}</Field>
            </div>
            <Button onClick={() => setTransform(defaultArtwork())}>Reset position</Button>
          </> : <p className="m-0 text-xs text-ink/60">Upload a PNG or JPEG (up to 20 MiB). It is placed in the frame’s open art area.</p>}
        </section>}

      </div>
    </div>
  </div>
}
