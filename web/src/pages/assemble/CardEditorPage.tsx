import { IMAGE_ACCEPT } from '../../lib/imageUpload'
import { SearchableSelect } from '../../components/SearchableSelect'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { IconButton } from '../../components/IconButton'
import { CheckIcon, CloseIcon, DownloadIcon, MirrorIcon, MoveIcon, ResetPositionIcon, RotateLeftIcon, RotateRightIcon, TrashIcon, UploadIcon } from '../../components/icons'
import { Button } from '../../components/Button'
import { SafeAreaLines } from '../../components/SafeArea'
import { useCutMm } from '../print/layout'
import { DiffPanel } from '../../components/DiffPanel'
import { ReferenceCards, ReferenceField } from './ReferenceCards'
import { ReferenceOverlay } from './ReferenceOverlay'
import { StepperInput } from '../../components/StepperInput'
import { BUNDLED_ICONS } from '../faction-card/bundled'
import { Field, inputClass, selectClass } from '../../components/Field'
import { apiGet } from '../../lib/api'
import { createCard, updateCard, useCards } from '../cards/api'
import { ACTION_LABELS, CATEGORIES, newDraft, orderLabel, UPGRADE_TYPES, type Card, type CardInput, type Category } from '../cards/model'
import { draftInput } from '../cards/validation'
import { useFactions } from '../factions/api'
import { emptyAssembly, layoutWithTitleScale, saveAssembly, uploadArtwork, useSharedLogoScale, type Assembly } from './api'
import { useFileDrag } from '../../lib/useFileDrag'
import { DropImageIcon } from '../../components/icons'
import { ArtworkAdjustPanel } from './ArtworkAdjustPanel'
import { OverlayAdjustPanel } from './OverlayAdjustPanel'
import { ArtworkExtend } from './ArtworkExtend'
import { artworkRect, defaultArtwork, flipArtwork, panArtwork, rotateArtwork, zoomArtwork, type ArtworkTransform } from './artwork'
import { artWindow, downloadName, LAYER_LABELS, LIBRARY_TABS, libraryLink } from './model'
import { pngBlob } from './render'
import { useAssembly } from './state'
import { useImageSize } from './useImageSize'
import { labLink, libraryOrder, useTemplate, useTemplateLayout } from './library'
import { undoShortcut } from './useUndoable'
import { useCardDraft, useCardRenderInput, useRenderedCard } from './useCardView'
import { CardCanvas } from './CardCanvas'
import { SymbolButtons } from './SymbolPicker'
import { Preview3DButton } from './Card3DViewer'

const panel = 'space-y-4 rounded-lg border border-divider bg-surface p-4'
const NUMBER_FIELDS = [['resource_cost', 'Resource price', 'gear'], ['guns', 'Guns', 'dice'], ['shields', 'Shields', 'health'], ['eagles', 'Morale / eagles', 'morale']] as const
// A field name with the icon of what it counts, as on the faction card.
// The icons are dark, so they sit on a light chip to stay visible on the dark panel.
const SHORT_LABELS: Record<string, string> = { resource_cost: 'Price', eagles: 'Morale' }
const iconLabel = (label: string, icon: string, shown = label) => <span className="inline-flex items-center gap-1.5" title={label}><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#ecdfcb]"><img src={BUNDLED_ICONS[icon]} alt="" className="h-3.5 w-3.5 object-contain" /></span>{shown}</span>

// Saves the artwork as uploaded: not moved, scaled, mirrored or adjusted.
async function downloadArtwork(url: string, name: string) {
  const blob = await (await fetch(url)).blob()
  const ext = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[blob.type] ?? 'png'
  const link = document.createElement('a'), href = URL.createObjectURL(blob)
  link.href = href; link.download = `${name} artwork.${ext}`.replace(/[\\/:*?"<>|]/g, '-')
  document.body.append(link); link.click(); link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 1000)
}

export default function CardEditorPage({ newFactionId, newCategory = 'combat', onCategoryChange }: { newFactionId?: string; newCategory?: Category; onCategoryChange?: (category: Category, factionId: string) => void } = {}) {
  const creating = newFactionId !== undefined
  const cutMm = useCutMm()
  const { id: routeId = '' } = useParams()
  const id = creating ? '-1' : routeId
  const navigate = useNavigate()
  const factions = useFactions()
  const [newSource] = useState<Card>(() => ({ ...draftInput(newDraft(newCategory, newFactionId ?? '')) as CardInput, id: -1, created_at: '', updated_at: '' }))
  const [localAssembly, setLocalAssembly] = useState(emptyAssembly)
  const [artworkFile, setArtworkFile] = useState<File | null>(null)
  useEffect(() => {
    if (!creating) return
    useAssembly.getState().clearEdits(id); useAssembly.getState().clearTransform(id); useAssembly.getState().clearLogoScale(id); useAssembly.getState().clearTitleScale(id); useAssembly.getState().clearDescriptionScale(id); useAssembly.getState().clearLowerScale(id)
    return () => { useAssembly.getState().clearEdits(id); useAssembly.getState().clearTransform(id); useAssembly.getState().clearLogoScale(id); useAssembly.getState().clearTitleScale(id); useAssembly.getState().clearDescriptionScale(id); useAssembly.getState().clearLowerScale(id) }
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
  // The neighbours in the library's order, for the Prev / Next buttons.
  const factionCards = useCards(factionId ? String(factionId) : '', '')
  const siblings = useMemo(() => libraryOrder(factionCards.data ?? [], category), [factionCards.data, category])
  const position = siblings.findIndex(c => String(c.id) === id)
  const previous = position > 0 ? siblings[position - 1] : undefined
  const next = position >= 0 ? siblings[position + 1] : undefined
  const template = useTemplate(factionId, category)
  const templateLayout = useTemplateLayout(category)
  const back = useTemplate(factionId, category, 'back')
  const { input, assembly, logoScale, titleScale, descriptionScale, lowerScale, textPadding, transform } = useCardRenderInput(source, template.image, templateLayout, creating ? localAssembly : undefined)
  const { result, error: renderError, rendering, retry } = useRenderedCard(input)
  const [downloadError, setDownloadError] = useState('')
  const drag = useRef<{ x: number; y: number; transform: ArtworkTransform } | null>(null)
  const preview = useRef<HTMLCanvasElement | null>(null)
  const textTarget = useRef<{ key: string; element: HTMLInputElement | HTMLTextAreaElement } | null>(null)
  const firstText = useRef<HTMLTextAreaElement>(null), firstTextKey = framed ? 'text' : 'upper_text'
  const [sharedLogoScale, setSharedLogoScale] = useSharedLogoScale(factionId, category)
  const logoScaleDirty = state.logoScales[id] !== undefined
  const titleScaleDirty = state.titleScales[id] !== undefined
  const descriptionScaleDirty = state.descriptionScales?.[id] !== undefined || state.lowerScales?.[id] !== undefined
  const paddingDirty = state.textPaddings?.[id] !== undefined
  const transformDirty = !!state.transforms[id]
  const hasArtwork = !!assembly.data?.image_url
  // The shape of the artwork area, width / height, on the card as drawn.
  const artRatio = ART_WINDOW.width * (result?.canvas.width ?? 816) / (ART_WINDOW.height * (result?.canvas.height ?? 1104))
  // The artwork moves only while selected: click it on the preview (or use
  // the Artwork panel button). Enter (or a click elsewhere) keeps the move,
  // Esc puts the artwork back where it was when selected.
  const [artSelected, setArtSelected] = useState(false)
  // While image files are dragged over the page, the artwork block and the artwork area of the preview show where to drop them.
  const fileDrag = useFileDrag(!upgrade)
  const [artworkDrag, setArtworkDrag] = useState<'block' | 'area' | null>(null)
  const dropTarget = (where: 'block' | 'area') => ({
    onDragOver: (e: React.DragEvent) => { if (busy || !e.dataTransfer.types.includes('Files')) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setArtworkDrag(where) },
    onDragLeave: (e: React.DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setArtworkDrag(null) },
    onDrop: (e: React.DragEvent) => {
      setArtworkDrag(null)
      if (busy || !e.dataTransfer.files.length) return
      e.preventDefault()
      const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'))
      if (file) artwork.mutate(file)
    },
  })
  const movable = hasArtwork && artSelected
  // While the artwork is selected its own edges are outlined, so you can see where it ends.
  const artSize = useImageSize(movable ? assembly.data?.image_url : null)
  const artEdges = movable && artSize && result ? artworkRect(ART_WINDOW, artSize, result.canvas, transform) : null
  const previewBox = useRef<HTMLDivElement>(null), artworkPanel = useRef<HTMLElement>(null)

  const save = useMutation({
    mutationFn: async () => {
      if (creating && draft) {
        const created = await createCard(draftInput(draft) as CardInput)
        let artworkError = ''
        try {
          const uploaded = artworkFile ? await uploadArtwork(String(created.id), artworkFile) : emptyAssembly()
          const assembled = await saveAssembly(String(created.id), { ...uploaded, logo_scale: logoScale, transform, layout: layoutWithTitleScale(localAssembly.layout, titleScale, textPadding, descriptionScale, lowerScale) })
          queryClient.setQueryData(['card-assembly', String(created.id)], assembled)
        } catch (e) {
          artworkError = e instanceof Error ? e.message : 'Artwork or position could not be saved.'
          // Keep the chosen position available for saving from the editor.
          useAssembly.getState().transform(String(created.id), transform)
          useAssembly.getState().logoScale(String(created.id), logoScale); useAssembly.getState().titleScale(String(created.id), titleScale); useAssembly.getState().descriptionScale(String(created.id), descriptionScale); useAssembly.getState().lowerScale(String(created.id), lowerScale); useAssembly.getState().textPadding(String(created.id), textPadding)
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
      if ((transformDirty || logoScaleDirty || titleScaleDirty || descriptionScaleDirty || paddingDirty) && assembly.data) {
        const value = { ...assembly.data, transform, logo_scale: logoScale }
        queryClient.setQueryData(['card-assembly', id], await saveAssembly(id, { ...value, layout: layoutWithTitleScale(assembly.data.layout, titleScale, textPadding, descriptionScale, lowerScale) }))
        useAssembly.getState().clearTransform(id)
        useAssembly.getState().clearLogoScale(id)
        useAssembly.getState().clearTitleScale(id); useAssembly.getState().clearDescriptionScale(id); useAssembly.getState().clearLowerScale(id)
        useAssembly.getState().clearTextPadding(id)
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
  // Starting cards are level 0 with no price.
  function setStarting(on: boolean) { edit('starting', String(on)); if (on) { edit('level', '0'); edit('resource_cost', '0') } }
  function insertSymbol(token: string) {
    if (!draft) return
    const target = textTarget.current?.element.isConnected ? textTarget.current : firstText.current ? { key: firstTextKey, element: firstText.current } : null
    if (!target) return
    const text = draft[target.key]
    const start = target.element.selectionStart ?? text.length, end = target.element.selectionEnd ?? start
    edit(target.key, text.slice(0, start) + token + text.slice(end))
    requestAnimationFrame(() => { target.element.focus(); target.element.setSelectionRange(start + token.length, start + token.length) })
  }
  // An icon bar over the top-right corner of a text field, shown when the field is pointed at or focused: it inserts at the cursor.
  const withSymbols = (field: ReactNode) => <div className="group/symbols relative">{field}
    <div className="absolute bottom-full right-0 z-[1] pb-1 opacity-0 transition-opacity focus-within:opacity-100 group-focus-within/symbols:opacity-100 group-hover/symbols:opacity-100"><SymbolButtons insert={insertSymbol} disabled={busy} /></div></div>
  function discard() {
    save.reset(); state.clearEdits(id); state.clearTransform(id); state.clearLogoScale(id); state.clearTitleScale(id); state.clearDescriptionScale(id); state.clearLowerScale(id); state.clearTextPadding(id)
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

  const anyDirty = creating || dirty || transformDirty || logoScaleDirty || titleScaleDirty || descriptionScaleDirty || paddingDirty
  const busy = save.isPending || artwork.isPending
  const queryError = [assembly, ...template.queries].find(q => q.isError)?.error ?? templateLayout.error
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-sm text-ink/60">
          <Link to="/assemble" className="text-accent no-underline hover:underline">Library</Link>
          {factionId && <>
            <span aria-hidden="true">›</span>
            <Link to={`/assemble?faction=${factionId}`} className="text-accent no-underline hover:underline">{factions.data?.find(f => f.id === factionId)?.name ?? `Faction ${factionId}`}</Link>
            <span aria-hidden="true">›</span>
            <Link to={libraryLink(factionId, category)} className="text-accent no-underline hover:underline">{LIBRARY_TABS.find(t => t.category === category)?.label}</Link>
          </>}
          <span aria-hidden="true">›</span>
          <span aria-current="page" className="text-ink/80">{creating ? 'New card' : draft.name || 'Untitled card'}</span>
        </nav>
        <h1 className="m-0 font-display text-2xl text-accent-300">{creating ? 'New card' : draft.name || 'Untitled card'}</h1>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {!creating && siblings.length > 1 && <div role="group" aria-label="Neighbouring cards" className="mr-1 inline-flex items-center gap-1.5">
          <Button disabled={!previous} title={previous ? `Previous: ${previous.name}` : 'This is the first card'} onClick={() => previous && navigate(`/assemble/cards/${previous.id}`)}>← Prev</Button>
          <span className="text-xs tabular-nums text-ink/60">{position + 1} / {siblings.length}</span>
          <Button disabled={!next} title={next ? `Next: ${next.name}` : 'This is the last card'} onClick={() => next && navigate(`/assemble/cards/${next.id}`)}>Next →</Button>
        </div>}
        {template.image && <Link to={labLink(template.image)} className="inline-flex items-center rounded-md border border-divider px-3.5 py-2 text-xs font-semibold uppercase tracking-wider text-ink no-underline hover:border-accent/60">Edit template in AI Lab</Link>}
        <Button title="Undo position change (⌘Z)" disabled={!undoStack.current.length} onClick={undo}>Undo</Button>
        <Button title="Redo (⇧⌘Z)" disabled={!redoStack.current.length} onClick={redo}>Redo</Button>
        <Button disabled={!anyDirty || busy} onClick={discard}>Discard changes</Button>
        <Button disabled={!result || rendering} onClick={() => void download()}>Download PNG</Button>
        <Button variant="primary" disabled={!anyDirty || !!issues.length || busy} onClick={() => save.mutate()}>{save.isPending ? creating ? 'Creating…' : 'Saving…' : creating ? 'Create card' : 'Save'}</Button>
      </div>
    </div>
    {queryError && <p role="alert" className="text-danger">{queryError.message}</p>}
    {save.isError && <p role="alert" className="text-danger">{save.error.message}</p>}
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
          {result && <SafeAreaLines px={result.canvas} cutMm={cutMm} />}
          {result && <ReferenceOverlay category={source.category} side="front" />}
          {result && !movable && <Preview3DButton category={category} factionId={factionId ?? undefined} title={draft.name || 'Card'} canvas={result.canvas} back={back.image?.url ?? null} backLogoUrl={back.image?.logoUrl} backLogoScale={back.image?.logoScale} backElementUrl={back.image?.elementUrl} className="absolute right-2 top-2 z-10" />}
          {fileDrag && !upgrade && result && <div data-testid="artwork-drop-area" {...dropTarget('area')}
            className={`absolute z-[7] grid place-items-center border-2 border-dashed transition-colors ${artworkDrag === 'area' ? 'border-accent bg-accent/35 text-accent-100' : 'border-accent/80 bg-black/45 text-accent'}`}
            style={{ left: `${ART_WINDOW.x}%`, top: `${ART_WINDOW.y}%`, width: `${ART_WINDOW.width}%`, height: `${ART_WINDOW.height}%` }}>
            <span className="pointer-events-none flex flex-col items-center gap-1 text-xs font-medium"><DropImageIcon className="h-10 w-10" />{artworkDrag === 'area' ? 'Release to set the artwork' : 'Drop the image here'}</span>
          </div>}
          {artEdges && <div aria-hidden="true" data-testid="artwork-edges" className="pointer-events-none absolute inset-0 z-[4] overflow-hidden">
            <div className="absolute border-2 border-dashed border-white/90 shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" style={{ left: `${artEdges.x}%`, top: `${artEdges.y}%`, width: `${artEdges.width}%`, height: `${artEdges.height}%` }} />
          </div>}
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
          <div className="grid items-end gap-x-4 gap-y-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
            <Field label="Title">{fid => withSymbols(<input id={fid} autoFocus={creating} className={inputClass} value={draft.name} onFocus={e => { textTarget.current = { key: 'name', element: e.currentTarget } }} onChange={e => edit('name', e.target.value)} />)}</Field>
            <Field label={<span className="flex items-center justify-between gap-2">Title size <span className="font-mono text-ink/80">{Math.round(titleScale * 100)}%{titleScale !== 1 && <button type="button" disabled={busy} className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent underline" onClick={() => { save.reset(); state.titleScale(id, 1) }}>reset</button>}</span></span>}>{fid => <input id={fid} type="range" min={0.3} max={2} step={0.01} value={titleScale} disabled={busy} className="h-9 w-full accent-[var(--color-accent)]"
              onChange={e => { save.reset(); state.titleScale(id, Number(e.target.value)) }} />}</Field>
          </div>
          {schema && <div className="grid grid-cols-2 gap-3">
            <Field label="Kind">{fid => <SearchableSelect id={fid} className={selectClass} value={draft.subtype} onChange={e => edit('subtype', e.target.value)}>{['schema', 'tactic'].map(t => <option key={t} value={t}>{t === 'schema' ? 'Scheme' : 'Tactic'}</option>)}</SearchableSelect>}</Field>
            <Field label="Action">{fid => <SearchableSelect id={fid} className={selectClass} value={draft.action} onChange={e => edit('action', e.target.value)}>{Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SearchableSelect>}</Field>
          </div>}
          {upgrade && <Field label="Order">{fid => <SearchableSelect id={fid} className={selectClass} value={draft.upgrade_type} onChange={e => edit('upgrade_type', e.target.value)}>{UPGRADE_TYPES.map(t => <option key={t} value={t}>{orderLabel(t)}</option>)}</SearchableSelect>}</Field>}
          {!schema && <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
            {category === 'combat' && <label className="mr-1 flex cursor-pointer items-center gap-2 self-center text-xs text-ink/70" title="Starting cards have no level requirement or price and show the faction logo instead of a level number.">
              <input type="checkbox" checked={draft.starting === 'true'} onChange={e => setStarting(e.target.checked)} className="accent-[var(--color-accent)]" />Starting card</label>}
            <Field label={iconLabel('Level', 'tech')}>{fid => <div className="w-[4.75rem]"><StepperInput id={fid} label="Level" value={Number(draft.level) || 0} min={0} max={3} disabled={category === 'combat' && draft.starting === 'true'} onChange={n => edit('level', String(n))} /></div>}</Field>
            {(upgrade ? NUMBER_FIELDS.slice(0, 1) : NUMBER_FIELDS).map(([key, label, icon]) => { const locked = !upgrade && key === 'resource_cost' && draft.starting === 'true'
              return <Field key={key} label={iconLabel(label, icon, SHORT_LABELS[key])}>{fid => <div className="w-[4.75rem]"><StepperInput id={fid} label={label} value={Number(draft[key]) || 0} disabled={locked} title={locked ? 'Starting cards have no resource price' : undefined} onChange={n => edit(key, String(n))} /></div>}</Field> })}
          </div>}
          {(upgrade ? ['text', 'limitation'] as const : framed ? ['text'] as const : ['upper_text', 'units', 'unit_text'] as const).map(key => key === 'units'
            ? <Field key={key} label="Unit names (separate with /, shown in italics before the unit text)">{fid => <input id={fid} className={inputClass} placeholder="Skitarii/Light Cruiser" value={draft.units ?? ''} onFocus={e => { textTarget.current = { key, element: e.currentTarget } }} onChange={e => edit('units', e.target.value)} />}</Field>
            : <Field key={key} label={key === 'text' ? 'Text' : key === 'limitation' ? 'Limitation (optional)' : key === 'unit_text' ? 'Unit text' : LAYER_LABELS[key]}>{fid => withSymbols(<textarea id={fid} rows={key === 'limitation' ? 2 : framed ? 3 : 2} ref={key === firstTextKey ? firstText : undefined} onFocus={e => { textTarget.current = { key, element: e.currentTarget } }} className={`${inputClass} resize-y`} value={draft[key] ?? ''} onChange={e => edit(key, e.target.value)} />)}</Field>)}
          {!framed && <div className="grid items-end gap-x-4 gap-y-2 sm:grid-cols-2">
            <Field label={<span className="flex items-center justify-between gap-2">Upper text size <span className="font-mono text-ink/80">{Math.round(descriptionScale * 100)}%{descriptionScale !== 1 && <button type="button" disabled={busy} className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent underline" onClick={() => { save.reset(); state.descriptionScale(id, 1) }}>reset</button>}</span></span>}>{fid => <input id={fid} type="range" min={0.3} max={2} step={0.01} value={descriptionScale} disabled={busy} className="h-9 w-full accent-[var(--color-accent)]"
              onChange={e => { save.reset(); state.descriptionScale(id, Number(e.target.value)) }} />}</Field>
            <Field label={<span className="flex items-center justify-between gap-2">Unit text size <span className="font-mono text-ink/80">{Math.round(lowerScale * 100)}%{lowerScale !== 1 && <button type="button" disabled={busy} className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent underline" onClick={() => { save.reset(); state.lowerScale(id, 1) }}>reset</button>}</span></span>}>{fid => <input id={fid} type="range" min={0.3} max={2} step={0.01} value={lowerScale} disabled={busy} className="h-9 w-full accent-[var(--color-accent)]"
              onChange={e => { save.reset(); state.lowerScale(id, Number(e.target.value)) }} />}</Field>
          </div>}
          {framed && <Field label={<span className="flex items-center justify-between gap-2">Description size <span className="font-mono text-ink/80">{Math.round(descriptionScale * 100)}%{descriptionScale !== 1 && <button type="button" disabled={busy} className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent underline" onClick={() => { save.reset(); state.descriptionScale(id, 1) }}>reset</button>}</span></span>}>{fid => <input id={fid} type="range" min={0.3} max={2} step={0.01} value={descriptionScale} disabled={busy} className="h-9 w-full accent-[var(--color-accent)]"
            onChange={e => { save.reset(); state.descriptionScale(id, Number(e.target.value)) }} />}</Field>}
          {!framed && <details className="rounded-md border border-divider px-3 py-1.5">
            <summary className="cursor-pointer text-sm text-accent">Text margins (this card){Object.keys(textPadding).length > 0 && <span className="ml-2 text-xs text-ink/60">custom</span>}</summary>
            <div className="space-y-2 pb-2 pt-2">
              <p className="m-0 text-xs text-ink/60">Space above and below each text panel, in % of the card's width. Left alone, the card follows the template.</p>
              <div className="flex flex-wrap gap-x-3 gap-y-2">
                {([['Upper top', 'upper_top', 'upper_text', 'paddingTop'], ['Upper bottom', 'upper_bottom', 'upper_text', 'paddingBottom'], ['Lower top', 'lower_top', 'lower_text', 'paddingTop'], ['Lower bottom', 'lower_bottom', 'lower_text', 'paddingBottom']] as const).map(([label, key, layer, side]) => {
                  const inherited = templateLayout.layout[layer][side] ?? 4, own = textPadding[key]
                  return <Field key={key} label={<span className={own !== undefined ? 'text-accent' : ''}>{label}{own !== undefined ? ' (custom)' : ''}</span>}>{fid =>
                    <div className="w-[4.75rem]"><StepperInput id={fid} label={label} value={own ?? inherited} min={0} max={20} disabled={busy} onChange={n => { save.reset(); state.textPadding(id, { ...textPadding, [key]: n }) }} /></div>}</Field>
                })}
              </div>
              {Object.keys(textPadding).length > 0 && <div><Button disabled={busy} onClick={() => { save.reset(); state.textPadding(id, {}) }}>Use the template's margins</Button></div>}
            </div>
          </details>}
          {(framed || draft.starting === 'true') && factionId && <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <label htmlFor="shared-logo-scale" className="text-ink/80">Faction logo size</label>
            <input id="shared-logo-scale" type="range" min={0.2} max={3} step={0.05} value={sharedLogoScale} className="w-32 accent-[var(--color-accent)]" onChange={e => setSharedLogoScale(Number(e.target.value))} />
            <span className="font-mono text-xs text-ink/80">{Math.round(sharedLogoScale * 100)}%</span>
            <span className="text-xs text-ink/60">shared by every {LIBRARY_TABS.find(t => t.category === category)?.label.toLowerCase()} card of this faction</span>
          </div>}
          {!upgrade && <section ref={artworkPanel} aria-label="Artwork" data-undo-scope
            {...dropTarget('block')}
            className={`space-y-2 rounded-md border p-3 transition-colors ${artworkDrag === 'block' ? 'border-accent bg-accent/10' : fileDrag ? 'border-dashed border-accent/70' : 'border-divider'}`}>
            <h3 className="m-0 flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-accent">Artwork{fileDrag && <DropImageIcon className="h-6 w-6" />}</h3>
            <div className="flex flex-wrap items-center gap-2">
              <label title={hasArtwork ? 'Replace artwork' : 'Add artwork'} className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-2.5 py-2 text-ink hover:border-accent/60 hover:text-accent-100 ${busy ? 'pointer-events-none opacity-45' : ''}`}>
                <UploadIcon /><span className="sr-only">{hasArtwork ? 'Replace artwork' : 'Add artwork'}</span>
                <input type="file" accept={IMAGE_ACCEPT} className="sr-only" aria-label="Artwork file (any image)" disabled={busy}
                  onChange={e => { const file = e.target.files?.[0]; if (file) artwork.mutate(file); e.target.value = '' }} />
              </label>
              {hasArtwork && <IconButton label="Download artwork" icon={<DownloadIcon />} disabled={busy} onClick={() => downloadArtwork(assembly.data!.image_url, draft.name || 'card')} />}
              {hasArtwork && <IconButton label="Remove artwork" icon={<TrashIcon />} disabled={busy} onClick={() => artwork.mutate(null)} />}
              {hasArtwork && (artSelected
                ? <><IconButton variant="primary" label="Apply (Enter)" icon={<CheckIcon />} onClick={confirmArtwork} /><IconButton label="Cancel (Esc)" icon={<CloseIcon />} onClick={cancelArtwork} /></>
                : <IconButton label="Move artwork" icon={<MoveIcon />} onClick={selectArtwork} />)}
              {hasArtwork && <IconButton label="Reset position" icon={<ResetPositionIcon />} disabled={transform.scale === 1 && transform.x === 0 && transform.y === 0} onClick={() => setTransform({ ...defaultArtwork(), adjust: transform.adjust, flip: transform.flip, rotate: transform.rotate })} />}
              {hasArtwork && <IconButton label="Mirror" icon={<MirrorIcon />} aria-pressed={!!transform.flip} className={transform.flip ? 'border-accent! text-accent!' : ''} onClick={() => setTransform(flipArtwork(transform))} />}
              {hasArtwork && <IconButton label="Rotate left" icon={<RotateLeftIcon />} onClick={() => setTransform(rotateArtwork(transform, -90))} />}
              {hasArtwork && <IconButton label="Rotate right" icon={<RotateRightIcon />} onClick={() => setTransform(rotateArtwork(transform, 90))} />}
              {artwork.isPending && <span role="status" className="text-xs text-ink/60">Updating artwork…</span>}
            </div>
            <p className="m-0 text-xs text-ink/60">{artworkDrag === 'block' ? 'Drop the image here.' : hasArtwork ? 'Drop another image here to replace it. Click the artwork on the preview, then drag it to move and scroll to zoom.' : 'Drop an image here or use the button (PNG, JPEG, WebP, AVIF …; saved as PNG, up to 20 MiB). It is placed in the frame’s open art area.'}</p>
            {hasArtwork && <ArtworkExtend cardId={id} disabled={creating || busy} ratio={artRatio}
              onDone={saved => { queryClient.setQueryData(['card-assembly', id], saved); state.clearTransform(id) }} />}
            {hasArtwork && <ArtworkAdjustPanel adjust={transform.adjust} onChange={next => { record(400); setTransform({ ...transform, adjust: next }, false) }} />}
          </section>}
          <OverlayAdjustPanel factionId={source.faction_id} category={source.category} />
          <div className="border-t border-divider pt-2">
            <ReferenceField category={source.category} side="front" />
            <details className="mt-1 text-sm"><summary className="cursor-pointer text-accent">All reference cards</summary><div className="mt-2"><ReferenceCards category={source.category} compact /></div></details>
          </div>
          <p className="m-0 text-xs text-ink/60">Point at a text field to insert an icon at the cursor: (B), (S), (D) plain boltgun, shield, dice; [B], [S] boxed; (M) or [M] morale in its box; {'{B}'}, {'{S}'}, {'{M}'} the same without the box. *Italic* (or **italic**) and __bold__ text are supported; combine them like *__this__*. {creating ? 'Artwork and position are saved when you create the card.' : 'Unsaved edits are kept in this browser.'}</p>
          {!!issues.length && <div role="alert" className="text-xs text-danger">{issues.map(i => <p key={i.field} className="m-0">{i.field}: {i.message}</p>)}</div>}
          {!creating && dirty && <details className="text-sm"><summary className="cursor-pointer text-accent">Show changes since save</summary><DiffPanel
            simpleRows={(schema ? ['subtype', 'action'] : upgrade ? ['upgrade_type', 'level', 'resource_cost'] : ['level', 'resource_cost', 'guns', 'shields', 'eagles']).filter(key => saved[key] !== draft[key]).map(key => ({ field: key, before: saved[key], after: draft[key] }))}
            textDiffs={(upgrade ? ['name', 'text', 'limitation'] as const : framed ? ['name', 'text'] as const : ['name', 'upper_text', 'units', 'unit_text'] as const).map(key => ({ field: key === 'text' ? 'Text' : key === 'limitation' ? 'Limitation' : key === 'units' ? 'Unit names' : key === 'unit_text' ? 'Unit text' : LAYER_LABELS[key], before: saved[key] ?? '', after: draft[key] ?? '' }))} /></details>}
        </section>

      </div>
    </div>
  </div>
}
