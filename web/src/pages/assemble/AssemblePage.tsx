import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { DiffPanel } from '../../components/DiffPanel'
import { Button } from '../../components/Button'
import { Field, inputClass, selectClass } from '../../components/Field'
import { useCards, updateCard } from '../cards/api'
import { cardDraft, type Card } from '../cards/model'
import { draftInput, validateCard } from '../cards/validation'
import { useFactions } from '../factions/api'
import { useCardTypes, overlayUrl } from '../card-types/api'
import { useGenerations, generationImageUrl } from '../test-generation/api'
import { useDoneBatchItems } from '../generations/api'
import { batchItemImageUrl } from '../batches/api'
import { defaultLayout, assemblyLayout, downloadName, LAYERS, LAYER_LABELS, RESOURCE_TOKENS, ICON_STYLE_LABELS, type CombatCard, type Layer, type Placement, type IconStyle, type ResourceLayer } from './model'
import { pngBlob, renderCard } from './render'
import { useAssembly } from './state'
import { SymbolPicker } from './SymbolPicker'
import { useCardAssembly, saveAssembly, uploadArtwork, layoutScopeKey, useSharedLayout, saveSharedLayout, type LayoutScope, emptyAssembly, type Assembly } from './api'
import { defaultArtwork, panArtwork, zoomArtwork, type ArtworkTransform } from './artwork'

function PositionNumber({ id, value, min, max, onChange }: { id: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(String(value))
  useEffect(() => setText(String(value)), [value])
  const number = Number(text.replace(',', '.'))
  const valid = text.trim() !== '' && Number.isFinite(number) && number >= min && number <= max
  return <input id={id} inputMode="decimal" className={inputClass} value={text} aria-invalid={!valid}
    onChange={e => {
      const next = e.target.value; setText(next)
      const n = Number(next.replace(',', '.'))
      if (next.trim() && Number.isFinite(n) && n >= min && n <= max) onChange(n)
    }} onBlur={() => setText(String(valid ? number : value))} />
}

export default function AssemblePage() {
  const cards = useCards('', 'combat'), factions = useFactions(), types = useCardTypes(), generations = useGenerations(), batches = useDoneBatchItems()
  const state = useAssembly()
  const assemblyQuery = useCardAssembly(state.cardId)
  const config = useMemo(() => state.assemblies[state.cardId] ?? assemblyQuery.data ?? emptyAssembly(), [state.assemblies, state.cardId, assemblyQuery.data])
  const queryClient = useQueryClient()
  const [factionFilter, setFactionFilter] = useState('')
  const [search, setSearch] = useState('')
  const [layer, setLayer] = useState<Layer>('upper_text')
  const [result, setResult] = useState<Awaited<ReturnType<typeof renderCard>> | null>(null)
  const [renderError, setRenderError] = useState('')
  const [downloadError, setDownloadError] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [retry, setRetry] = useState(0)
  const [rendering, setRendering] = useState(false)
  const [editingArtwork, setEditingArtwork] = useState(false)
  const drag = useRef<{ id: string; x: number; y: number; transform: ArtworkTransform } | null>(null)
  const preview = useRef<HTMLCanvasElement>(null)
  const textTarget = useRef<{ key: string; element: HTMLInputElement | HTMLTextAreaElement } | null>(null)
  const upperText = useRef<HTMLTextAreaElement>(null)
  const sourceCard = cards.data?.find(c => String(c.id) === state.cardId && c.category === 'combat') as CombatCard | undefined
  const draft = useMemo(() => sourceCard ? { ...cardDraft(sourceCard), ...state.edits[state.cardId] } : null, [sourceCard, state.edits, state.cardId])
  const issues = useMemo(() => draft ? validateCard(draftInput(draft), factions.data?.map(f => f.id) ?? []) : [], [draft, factions.data])
  const card = useMemo(() => draft && !issues.length ? draftInput(draft) as CombatCard : null, [draft, issues])
  const dirty = !!sourceCard && !!draft && Object.entries(cardDraft(sourceCard)).some(([key, value]) => draft[key] !== value)
  const images = useMemo(() => [
    ...(generations.data ?? []).flatMap(g => { const url = generationImageUrl(g); return url ? [{ key: `test-${g.id}`, name: g.name || `Generation #${g.id}`, factionId: g.faction_id, cardTypeId: g.card_type_id, url, createdAt: g.created_at, source: 'Lab' }] : [] }),
    ...(batches.data ?? []).flatMap(b => { const url = batchItemImageUrl(b.batch_id, b); return url ? [{ key: `batch-${b.id}`, name: b.name || `Batch image #${b.id}`, factionId: b.faction_id, cardTypeId: b.card_type_id, url, createdAt: b.completed_at, source: 'Batch' }] : [] }),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [generations.data, batches.data])
  const selectedImage = images.find(i => i.key === config.image_key)
  const overlayType = types.data?.find(t => String(t.id) === (config.overlay_id === 'auto' ? String(selectedImage?.cardTypeId) : config.overlay_id))
  const overlay = overlayType ? overlayUrl(overlayType) : null
  const scope: LayoutScope | null = sourceCard && config.image_key ? { template_key: config.image_key === 'upload' ? `upload:${new URLSearchParams(config.image_url.split('?')[1]).get('v') ?? ''}` : config.image_key, faction_id: sourceCard.faction_id, card_type_id: overlayType?.id ?? selectedImage?.cardTypeId ?? 0 } : null
  const scopeKey = layoutScopeKey(scope)
  const sharedLayout = useSharedLayout(scope)
  const layout = useMemo(() => state.layouts[scopeKey] ?? assemblyLayout(sharedLayout.data?.layout ?? {}), [state.layouts, scopeKey, sharedLayout.data])
  const filteredImages = images.filter(i => (!factionFilter || String(i.factionId) === factionFilter) && i.name.toLowerCase().includes(search.toLowerCase()))
  const selectedCards = cards.data?.filter(c => !factionFilter || String(c.faction_id) === factionFilter) ?? []
  const imageUrl = config.image_url || selectedImage?.url
  const outputSize = useMemo(() => config.image_key === 'upload' ? { width: 1140, height: 1480 } : undefined, [config.image_key])
  const ready = !types.isPending && !types.isError && !cards.isError && !factions.isError && !assemblyQuery.isPending && !assemblyQuery.isError && !!scope && !sharedLayout.isPending && !sharedLayout.isError
  useEffect(() => {
    let cancelled = false
    setRenderError(''); setRendering(!!card && !!imageUrl && ready)
    if (!card || !imageUrl) setResult(null)
    if (card && imageUrl && ready) renderCard({ card, layout, imageUrl, overlayUrl: overlay, artwork: config.transform, outputSize }).then(value => {
      if (!cancelled) { setResult(value); setRendering(false) }
    }).catch(error => { if (!cancelled) { setResult(null); setRendering(false); setRenderError(error instanceof Error ? error.message : 'Could not render card.') } })
    return () => { cancelled = true }
  }, [card, layout, imageUrl, overlay, ready, retry, config.transform, outputSize])
  useEffect(() => {
    if (!result || !preview.current) return
    preview.current.width = result.canvas.width; preview.current.height = result.canvas.height
    preview.current.getContext('2d')?.drawImage(result.canvas, 0, 0)
  }, [result])
  const save = useMutation({
    mutationFn: ({ id, value }: { id: number; value: CombatCard }) => updateCard(id, value),
    onSuccess: saved => {
      state.clearEdits(String(saved.id))
      queryClient.setQueriesData<Card[]>({ queryKey: ['cards'] }, old => old?.map(c => c.id === saved.id ? saved : c))
      void queryClient.invalidateQueries({ queryKey: ['cards'] })
    },
  })
  const assemblySave = useMutation({
    mutationFn: async ({ id, value, scope }: { id: string; value: Assembly; scope: LayoutScope; draftRef?: Assembly; layoutRef?: typeof layout }) => { const saved = await saveAssembly(id, { ...value, layout: {} }); const shared = await saveSharedLayout(scope, value.layout as typeof layout); return { saved, shared } },
    onSuccess: ({ saved, shared }, vars) => {
      queryClient.setQueryData(['card-assembly', vars.id], saved)
      queryClient.setQueryData(['assembly-layout', layoutScopeKey(vars.scope)], shared)
      const current = useAssembly.getState()
      if (current.assemblies[vars.id] === vars.draftRef) current.clearAssembly(vars.id)
      if (current.layouts[layoutScopeKey(vars.scope)] === vars.layoutRef) current.clearLayout(layoutScopeKey(vars.scope))
    },
  })
  const upload = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File; config: Assembly }) => uploadArtwork(id, file),
    onSuccess: (saved, vars) => {
      queryClient.setQueryData(['card-assembly', vars.id], saved)
      state.assembly(vars.id, { ...vars.config, ...saved, overlay_id: vars.config.overlay_id, layout: vars.config.layout })
    },
  })
  function changeAssembly(patch: Partial<Assembly>) { assemblySave.reset(); state.assembly(state.cardId, { ...config, ...patch }) }
  useEffect(() => { setEditingArtwork(false); setResult(null); drag.current = null }, [state.cardId])
  useEffect(() => {
    const canvas = preview.current
    if (!canvas || !editingArtwork) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return
      const transform = zoomArtwork(config.transform, config.transform.scale * Math.exp(-e.deltaY * .001), (e.clientX - rect.left) / rect.width * 100 - 50, (e.clientY - rect.top) / rect.height * 100 - 50)
      state.assembly(state.cardId, { ...config, transform }); assemblySave.reset()
    }
    canvas.addEventListener('wheel', wheel, { passive: false })
    return () => canvas.removeEventListener('wheel', wheel)
  }, [editingArtwork, config, state, assemblySave])
  function edit(field: string, value: string) { save.reset(); state.edit(state.cardId, field, value) }
  function insertSymbol(token: string) {
    if (!draft) return
    const target = textTarget.current?.element.isConnected ? textTarget.current : upperText.current ? { key: 'upper_text', element: upperText.current } : null
    if (!target) return
    const text = draft[target.key]
    const start = target.element.selectionStart ?? text.length, end = target.element.selectionEnd ?? start
    const inserted = token
    edit(target.key, text.slice(0, start) + inserted + text.slice(end))
    requestAnimationFrame(() => { target.element.focus(); target.element.setSelectionRange(start + inserted.length, start + inserted.length) })
  }
  async function download() {
    if (!result || !card) return
    setDownloading(true); setDownloadError('')
    try {
      const url = URL.createObjectURL(await pngBlob(result.canvas))
      const link = document.createElement('a'); link.href = url; link.download = downloadName(card.name)
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (error) { setDownloadError(error instanceof Error ? error.message : 'Download failed.') }
    finally { setDownloading(false) }
  }
  const queries = [cards, factions, types, generations, batches, assemblyQuery, ...(scope ? [sharedLayout] : [])]
  const queryError = queries.find(q => q.isError)?.error
  const rulesLayer = layer === 'upper_text' || layer === 'lower_text' ? layer : null
  const p = rulesLayer ? result?.textPositions[rulesLayer] ?? layout[layer] : layout[layer]
  const move = (patch: Partial<Placement>) => { if (!scope || sharedLayout.isPending) return; assemblySave.reset(); state.position(scopeKey, layer, patch, layout) }
  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="font-display text-2xl text-accent-300">Assemble</h1><p className="text-sm text-ink/60">Build a battle card from artwork, an overlay, and your card text.</p></div>
      <div className="flex flex-wrap gap-2"><Button disabled={!sourceCard || !config.image_key || !scope || sharedLayout.isPending || assemblySave.isPending || upload.isPending || assemblyQuery.isPending} onClick={() => scope && assemblySave.mutate({ id: state.cardId, scope, value: { ...config, layout, overlay_id: config.overlay_id === 'auto' ? String(overlayType?.id ?? 'none') : config.overlay_id }, draftRef: state.assemblies[state.cardId], layoutRef: state.layouts[scopeKey] })}>{assemblySave.isPending ? 'Saving…' : 'Save assembly'}</Button>
      <Button variant="primary" disabled={!result || rendering || !ready || !card || !imageUrl || downloading} onClick={() => void download()}>{downloading ? 'Exporting…' : 'Download PNG'}</Button></div>
    </div>
    {queryError && <div role="alert" className="text-danger">{queryError.message} <Button onClick={() => { queries.forEach(q => void q.refetch()) }}>Retry loading</Button></div>}
    {assemblySave.isSuccess && <p role="status" className="text-success">Assembly saved to database.</p>}
    {(assemblySave.isError || upload.isError) && <p role="alert" className="text-danger">{assemblySave.error?.message ?? upload.error?.message}</p>}
    {downloadError && <p role="alert" className="text-danger">{downloadError}</p>}
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(200px,.85fr)_minmax(240px,1.1fr)_minmax(240px,1fr)]">
      <section aria-label="Artwork and overlay" className="space-y-4 rounded-lg border border-divider bg-surface p-4">
        <h2 className="font-display text-accent-300">1. Choose artwork</h2>
        <Field label="Faction filter">{id => <select id={id} className={selectClass} value={factionFilter} onChange={e => setFactionFilter(e.target.value)}><option value="">All factions</option>{factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select>}</Field>
        <Field label="Combat card">{id => <select id={id} className={selectClass} value={state.cardId} onChange={e => { save.reset(); state.select({ cardId: e.target.value }) }}><option value="">Choose a card…</option>{(sourceCard && !selectedCards.includes(sourceCard) ? [sourceCard, ...selectedCards] : selectedCards).map(c => <option key={c.id} value={c.id}>{c.name} — {factions.data?.find(f => f.id === c.faction_id)?.name ?? 'Faction'}</option>)}</select>}</Field>
        {!cards.isPending && !cards.data?.length && <p className="text-sm text-ink/60"><Link className="text-accent underline" to="/cards">Create a combat card</Link> to add text and resources.</p>}
        <Field label="Overlay">{id => <select id={id} className={selectClass} value={config.overlay_id} disabled={!sourceCard || assemblyQuery.isPending} onChange={e => changeAssembly({ overlay_id: e.target.value })}><option value="auto">From selected image's card type</option><option value="none">No overlay</option>{types.data?.filter(t => t.overlay_path).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}</Field>
        {selectedImage && !overlay && config.overlay_id !== 'none' && <p className="text-sm text-warn">No overlay available. Upload one under <Link to="/card-types?mode=library" className="underline">Card Types</Link> or choose another overlay.</p>}
        <Field label="Upload artwork (PNG / JPEG)">{id => <input id={id} type="file" accept="image/png,image/jpeg" disabled={!sourceCard || assemblyQuery.isPending || upload.isPending} className={inputClass} onChange={e => { const file = e.target.files?.[0]; if (file && sourceCard) upload.mutate({ id: state.cardId, file, config: { ...config, layout } }); e.target.value = '' }} />}</Field>
        {upload.isPending && <p role="status" className="text-xs">Uploading artwork…</p>}
        {config.image_key === 'upload' && <p className="text-xs text-ink/60">Using this card's uploaded artwork.</p>}
        <Field label="Find generated image">{id => <input id={id} className={inputClass} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search image names" />}</Field>
        {selectedImage && <p className="text-xs text-ink/60">Selected: {selectedImage.name}</p>}
        {sourceCard && selectedImage && sourceCard.faction_id !== selectedImage.factionId && <p className="text-sm text-warn">Artwork and card belong to different factions.</p>}
        <div className="grid max-h-[540px] grid-cols-2 gap-2 overflow-auto">
          {filteredImages.map(i => <button type="button" key={i.key} aria-label={`Choose image ${i.name}`} disabled={!sourceCard || assemblyQuery.isPending} aria-pressed={config.image_key === i.key} onClick={() => changeAssembly({ image_key: i.key, image_url: '', transform: defaultArtwork() })} className={`overflow-hidden rounded border text-left ${config.image_key === i.key ? 'border-accent ring-1 ring-accent' : 'border-divider hover:border-accent/60'}`}><img loading="lazy" src={i.url} alt="" className="aspect-[3/4] w-full object-cover" /><span className="block truncate px-2 pt-1 text-xs" title={i.name}>{i.name}</span><span className="block px-2 pb-1 text-[10px] text-ink/50">{i.source} · {types.data?.find(t => t.id === i.cardTypeId)?.name}</span></button>)}
        </div>
        {!generations.isPending && !batches.isPending && !filteredImages.length && <p className="text-sm text-ink/60">No finished images match. <Link to="/generations" className="text-accent underline">Open Generations</Link>.</p>}
      </section>
      <section aria-label="Card preview" className="space-y-3 lg:sticky lg:top-5">
        <div className="flex items-center justify-between"><h2 className="font-display text-accent-300">2. Preview</h2>{result && <span className="font-mono text-xs text-ink/50">{result.canvas.width} × {result.canvas.height} px</span>}</div>
        <div className="flex min-h-80 items-center justify-center rounded-lg border border-divider bg-black/30 p-3">
          <canvas ref={preview} aria-label="Assembled battle card" tabIndex={editingArtwork ? 0 : undefined} style={{ touchAction: editingArtwork ? 'none' : undefined, cursor: editingArtwork ? 'grab' : undefined }}
            onPointerDown={e => { if (!editingArtwork || e.button !== 0) return; e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { id: state.cardId, x: e.clientX, y: e.clientY, transform: config.transform } }}
            onPointerMove={e => { const start = drag.current; if (!start || start.id !== state.cardId) return; const rect = e.currentTarget.getBoundingClientRect(); if (!rect.width || !rect.height) return; changeAssembly({ transform: panArtwork(start.transform, (e.clientX - start.x) / rect.width * 100, (e.clientY - start.y) / rect.height * 100) }) }}
            onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }} onLostPointerCapture={() => { drag.current = null }} className={result ? 'block h-auto max-h-[85vh] max-w-full' : 'hidden'} />
          {!result && <p role="status" className="p-6 text-center text-sm text-ink/60">{renderError ? renderError : issues.length ? 'Fix the card fields to update the preview.' : !card || !imageUrl ? 'Choose a combat card and artwork.' : !ready ? 'Waiting for card and overlay data…' : 'Rendering card…'}</p>}
        </div>
        {sourceCard && imageUrl && <div className="space-y-2 rounded border border-divider p-3">
          <Button aria-pressed={editingArtwork} disabled={!result} onClick={() => setEditingArtwork(v => !v)}>{editingArtwork ? 'Finish artwork editing' : 'Edit artwork with mouse'}</Button>
          <p className="text-xs text-ink/60">Drag the preview to move artwork. Scroll over it to zoom around the cursor. Overlay and text stay fixed.</p>
          <Field label="Artwork scale">{id => <input id={id} type="range" min={0.1} max={5} step={0.01} value={config.transform.scale} className="w-full" onChange={e => changeAssembly({ transform: zoomArtwork(config.transform, Number(e.target.value)) })} />}</Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Artwork X (%)">{id => <PositionNumber id={id} value={config.transform.x} min={-200} max={200} onChange={x => changeAssembly({ transform: { ...config.transform, x } })} />}</Field><Field label="Artwork Y (%)">{id => <PositionNumber id={id} value={config.transform.y} min={-200} max={200} onChange={y => changeAssembly({ transform: { ...config.transform, y } })} />}</Field></div>
          <div className="flex justify-between text-xs"><span>{Math.round(config.transform.scale * 100)}% scale</span><Button onClick={() => changeAssembly({ transform: defaultArtwork() })}>Reset artwork</Button></div>
        </div>}
        {rendering && result && <p role="status" className="text-xs text-ink/50">Updating preview…</p>}
        {renderError && <Button onClick={() => setRetry(n => n + 1)}>Retry rendering</Button>}
        {!!result?.warnings.length && <div role="status" className="space-y-1 text-xs text-warn">{result.warnings.map(w => <p key={w}>{w}</p>)}</div>}
        <p className="text-xs text-ink/50">Parchment panels resize to fit wrapped rules text. PNG exports at the overlay's original resolution, or 1140 × 1480 for uploads without an overlay.</p>
      </section>
      <section aria-label="Text and layout editor" className="space-y-4 rounded-lg border border-divider bg-surface p-4">
        <h2 className="font-display text-accent-300">3. Edit text & positions</h2>
        {scope && <p className="text-xs text-ink/60">Shared layout: {selectedImage?.name ?? 'Uploaded template'} · {factions.data?.find(f => f.id === scope.faction_id)?.name} · {types.data?.find(t => t.id === scope.card_type_id)?.name ?? 'No card type'}</p>}
        {!draft ? <p className="text-sm text-ink/60">Choose a combat card to edit its content.</p> : <>
          <Field label="Title">{id => <input id={id} className={inputClass} value={draft.name} onFocus={e => { textTarget.current = { key: 'name', element: e.currentTarget } }} onChange={e => edit('name', e.target.value)} disabled={save.isPending} />}</Field>
          <div className="grid grid-cols-2 gap-3">{['level', 'resource_cost', 'guns', 'shields', 'eagles'].map(key => <Field key={key} label={key === 'eagles' ? 'Morale / eagles' : key === 'resource_cost' ? 'Resource price' : key[0].toUpperCase() + key.slice(1)}>{id => <input id={id} type="number" min={0} max={key === 'level' ? 3 : undefined} step={1} className={inputClass} value={draft[key]} onChange={e => edit(key, e.target.value)} disabled={save.isPending} />}</Field>)}</div>
          {(['upper_text', 'lower_text'] as const).map(key => <Field key={key} label={LAYER_LABELS[key]}>{id => <textarea id={id} rows={4} ref={key === 'upper_text' ? upperText : undefined} onFocus={e => { textTarget.current = { key, element: e.currentTarget } }} className={inputClass} value={draft[key]} onChange={e => edit(key, e.target.value)} disabled={save.isPending} />}</Field>)}
          <SymbolPicker insert={insertSymbol} disabled={save.isPending} />
          <p className="text-xs text-ink/60">Use (B), (S), (M) for non-boxed icons; [B], [S], [M] for boxed icons. **Italic text** is supported. Drafts are remembered in this browser. Save assembly stores artwork per card and shares positions across the selected template, faction, and card type.</p>
          {!!issues.length && <div role="alert" className="text-xs text-danger">{issues.map(i => <p key={i.field}>{i.field}: {i.message}</p>)}</div>}
          {dirty && sourceCard && <details className="text-sm"><summary className="cursor-pointer text-accent">Show changes since save</summary><DiffPanel
            simpleRows={['level', 'resource_cost', 'guns', 'shields', 'eagles'].filter(key => cardDraft(sourceCard)[key] !== draft[key]).map(key => ({ field: key, before: cardDraft(sourceCard)[key], after: draft[key] }))}
            textDiffs={['name', 'upper_text', 'lower_text'].map(key => ({ field: LAYER_LABELS[key as Layer], before: cardDraft(sourceCard)[key], after: draft[key] }))} /></details>}
          <div className="flex flex-wrap gap-2"><Button variant="primary" disabled={!dirty || !!issues.length || save.isPending} onClick={() => { if (sourceCard && card) save.mutate({ id: sourceCard.id, value: card }) }}>{save.isPending ? 'Saving…' : 'Save to card'}</Button><Button disabled={!dirty || save.isPending} onClick={() => { state.clearEdits(state.cardId); save.reset() }}>Discard text edits</Button></div>
          {save.isError && <p role="alert" className="text-sm text-danger">{save.error.message}</p>}{save.isSuccess && <p role="status" className="text-sm text-success">Card saved to database.</p>}
          <div className="space-y-3 border-t border-divider pt-4">
            <Field label="Position controls for">{id => <select id={id} className={selectClass} value={layer} onChange={e => setLayer(e.target.value as Layer)}>{LAYERS.map(key => <option key={key} value={key}>{LAYER_LABELS[key]}</option>)}</select>}</Field>
            {rulesLayer && <label className="flex items-center gap-2 text-xs text-ink/70"><input type="checkbox" checked={layout[rulesLayer].autoY ?? layout[rulesLayer].y === defaultLayout()[rulesLayer].y} onChange={e => move({ autoY: e.target.checked })} />Automatic vertical position</label>}
            <p className="text-xs text-ink/50">X / width are % of card width. Y / height / size are % of card height. X and Y set the text area's start. Alignment positions text within that area.</p>
            <div className="grid grid-cols-2 gap-3">{(['x', 'y', 'width', 'height', 'size', 'lineHeight'] as const).map(key => <Field key={key} label={{ x: 'Start X (%)', y: 'Start Y (%)', width: 'Box width (%)', height: 'Box height (%)', size: 'Font size (%)', lineHeight: 'Line spacing' }[key]}>{id => <PositionNumber key={`${state.cardId}-${layer}-${key}`} id={id} value={p[key]} min={key === 'x' || key === 'y' ? -100 : 0.1} max={key === 'lineHeight' ? 5 : 200} onChange={n => move({ [key]: n })} />}</Field>)}</div>
            {(['guns', 'shields', 'eagles'].includes(layer)) && <Field label="Icon style">{id => <select id={id} className={selectClass} value={p.iconStyle === 'badge' || !p.iconStyle ? (layer === 'eagles' ? 'box_outline' : 'circle') : p.iconStyle} onChange={e => move({ iconStyle: e.target.value as IconStyle })}>{['plain', ...Object.keys(RESOURCE_TOKENS[layer as ResourceLayer])].map(style => <option key={style} value={style}>{ICON_STYLE_LABELS[style as IconStyle]}</option>)}</select>}</Field>}
            <Field label="Text alignment">{id => <select id={id} className={selectClass} value={p.align ?? 'left'} onChange={e => move({ align: e.target.value as Placement['align'] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select>}</Field>
            <Field label="Font">{id => <select id={id} className={selectClass} value={p.font ?? 'rules'} onChange={e => move({ font: e.target.value as Placement['font'] })}><option value="rules">Forbidden Stars (rules)</option><option value="event">Event</option><option value="headline">Headline</option></select>}</Field>
            <Field label="Text / icon color">{id => <input id={id} type="color" value={p.color} onChange={e => move({ color: e.target.value })} className="h-9 w-full rounded border border-divider bg-bg" />}</Field>
            <Button onClick={() => state.resetLayout(scopeKey)}>Reset positions to reference layout</Button>
          </div>
        </>}
      </section>
    </div>
  </div>
}
