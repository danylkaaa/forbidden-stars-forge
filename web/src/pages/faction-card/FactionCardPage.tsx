import { IMAGE_ACCEPT } from '../../lib/imageUpload'
import { ColorInput } from '../../components/ColorInput'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { SafeAreaLines } from '../../components/SafeArea'
import { Field, inputClass, selectClass } from '../../components/Field'
import { useCards } from '../cards/api'
import { SearchableSelect } from '../../components/SearchableSelect'
import { CategoryTabs } from '../assemble/CategoryTabs'
import { useLibraryImages } from '../assemble/library'
import { useAssembly } from '../assemble/state'
import { CardCanvas } from '../assemble/CardCanvas'
import { ReferenceOverlay } from '../assemble/ReferenceOverlay'
import { ReferenceField } from '../assemble/ReferenceCards'
import { ImagePickerField } from '../assemble/ImagePicker'
import { useFactions } from '../factions/api'
import { useFactionCardLayout, type FactionCardLayout } from './layout'
import { useFactionLogoUrl } from './useFactionCardCanvases'
import { useCardImages } from './useCardImages'
import { deleteAsset, saveFactionCard, uploadAsset, useFactionCard, useFactionCardDefaults, type AssetRef } from './api'
import { CARD_SIZE, DEFAULT_ICONS, FACTION_CARD_CUT_MM, UNIT_SLOTS, assetKeys, backgroundUrl, downloadName, initialCardIds, normalizeData, type FactionCardData, type ForcesIcon, type InitialRow, type SlotKey, type UnitStats } from './model'
import { pngBlob, renderFactionCard, structurePriceBox, unitRowBox, type FactionCardResult, type Side } from './render'
import { BUNDLED_ICONS } from './bundled'
import { THEME_PRESETS, themeColor } from './design/theme'
import { StructureDialog, UnitModelDialog } from './UnitModelDialog'

const panel = 'space-y-3 rounded-lg border border-divider bg-surface p-4'
const byKey = (assets: AssetRef[] | undefined) => Object.fromEntries((assets ?? []).map(a => [a.key, a.url]))
const toNumber = (text: string) => Math.max(0, Math.floor(Number(text) || 0))

type Draft = { data: FactionCardData; front: string; back: string; color: string }

// Both sides of the card, redrawn on the next frame after any change at half
// size (previews only), so editing feels immediate; only the newest request counts.
function useRenderedFaces(draft: Draft | null, assets: Record<string, string>, defaults: Record<string, string>, backgrounds: { front: string | null; back: string | null }, layout: FactionCardLayout, logoUrl: string | null, cardImages: Record<number, HTMLCanvasElement>) {
  const [faces, setFaces] = useState<{ front: FactionCardResult | null; back: FactionCardResult | null; error: string }>({ front: null, back: null, error: '' })
  useEffect(() => {
    if (!draft) return
    let cancelled = false
    const frame = requestAnimationFrame(() => {
      const make = (side: Side) => renderFactionCard({ side, data: draft.data, unitColor: draft.color, backgroundUrl: backgrounds[side], assets, defaults, layout, logoUrl, cardImages, scale: 0.5 })
      Promise.all([make('front'), make('back')]).then(([front, back]) => { if (!cancelled) setFaces({ front, back, error: '' }) })
        .catch(e => { if (!cancelled) setFaces(f => ({ ...f, error: e instanceof Error ? e.message : 'Could not render the card.' })) })
    })
    return () => { cancelled = true; cancelAnimationFrame(frame) }
  }, [draft, assets, defaults, backgrounds, layout, logoUrl, cardImages])
  return faces
}

// A collapsible group of fields.
function Section({ title, label, open, children }: { title: string; label?: string; open?: boolean; children: ReactNode }) {
  return <details open={open} aria-label={label ?? title} className={panel}>
    <summary className="cursor-pointer font-display text-accent-300">{title}</summary>
    <div className="mt-3 space-y-3">{children}</div>
  </details>
}

function AssetPicker({ label, url, onPick, onRemove, disabled, builtIn }: { label: string; url?: string; onPick: (file: File) => void; onRemove: () => void; disabled?: boolean; builtIn?: string }) {
  return <div className="flex items-center gap-2">
    <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded border border-divider bg-black/30 text-[10px] text-ink/45">
      {url ?? builtIn ? <img src={url ?? builtIn} alt="" className={`h-full w-full ${builtIn && !url ? 'object-contain' : 'object-cover'}`} /> : 'none'}</div>
    <label className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:border-accent/60 ${disabled ? 'pointer-events-none opacity-45' : ''}`}>{url ? 'Replace' : builtIn ? 'Override' : 'Upload'}
      <input type="file" accept={IMAGE_ACCEPT} className="sr-only" aria-label={label} disabled={disabled} onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} /></label>
    {url && <Button disabled={disabled} onClick={onRemove}>Remove</Button>}
  </div>
}

// `only` opens one side's own editor page: just that side's preview and fields.
export default function FactionCardPage({ only }: { only?: Side } = {}) {
  const factions = useFactions(), state = useAssembly(), queryClient = useQueryClient()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const requested = Number(params.get('faction'))
  const factionId = (factions.data?.some(f => f.id === requested) ? requested : null) ?? (factions.data?.some(f => f.id === state.factionId) ? state.factionId : null) ?? factions.data?.[0]?.id ?? null
  const faction = factions.data?.find(f => f.id === factionId)
  const { layout } = useFactionCardLayout()
  const logoUrl = useFactionLogoUrl(factionId)
  const [openSlot, setOpenSlot] = useState<SlotKey | 'city' | 'factory' | null>(null)
  const [cardIds, setCardIds] = useState<number[]>([])
  const cards = useCardImages(cardIds)
  const record = useFactionCard(factionId), defaultIcons = useFactionCardDefaults(), images = useLibraryImages()
  const [draft, setDraft] = useState<Draft | null>(null)
  const loaded = useRef('')
  useEffect(() => {
    if (!record.data || !faction) return
    const key = `${factionId}:${record.data.updated_at}`
    if (loaded.current === key) return
    loaded.current = key
    setDraft({ data: normalizeData(record.data.data, faction.name), front: record.data.front_image_key, back: record.data.back_image_key, color: record.data.unit_color })
  }, [record.data, faction, factionId])
  const saved = useMemo(() => record.data && faction ? JSON.stringify({ data: normalizeData(record.data.data, faction.name), front: record.data.front_image_key, back: record.data.back_image_key, color: record.data.unit_color }) : '', [record.data, faction])
  const wanted = draft ? initialCardIds(draft.data).join(',') : ''
  useEffect(() => setCardIds(wanted ? wanted.split(',').map(Number) : []), [wanted])
  const dirty = !!draft && JSON.stringify(draft) !== saved
  const assets = useMemo(() => byKey(record.data?.assets), [record.data?.assets])
  const defaults = useMemo(() => byKey(defaultIcons.data), [defaultIcons.data])
  const options = useMemo(() => images.data.filter(i => i.factionId === factionId), [images.data, factionId])
  const backgrounds = useMemo(() => ({ front: backgroundUrl(draft?.front ?? '', 'front', assets, images.data), back: backgroundUrl(draft?.back ?? '', 'back', assets, images.data) }), [draft?.front, draft?.back, assets, images.data])
  const frontInput = useMemo(() => ({ side: 'front' as const, data: draft?.data as FactionCardData, unitColor: draft?.color ?? '', backgroundUrl: backgrounds.front, assets, defaults, layout, logoUrl }), [draft, backgrounds, assets, defaults, layout, logoUrl])
  const faces = useRenderedFaces(draft, assets, defaults, backgrounds, layout, logoUrl, cards.images)

  const save = useMutation({
    mutationFn: () => saveFactionCard(factionId!, { data: draft!.data, front_image_key: draft!.front, back_image_key: draft!.back, unit_color: draft!.color }),
    onSuccess: saved => { queryClient.setQueryData(['faction-card', factionId], saved); void queryClient.invalidateQueries({ queryKey: ['faction-cards'] }); loaded.current = `${factionId}:${saved.updated_at}` },
  })
  const upload = useMutation({ mutationFn: ({ id, key, file }: { id: number; key: string; file: File }) => uploadAsset(id, key, file),
    onSuccess: (_, v) => queryClient.invalidateQueries({ queryKey: v.id ? ['faction-card', v.id] : ['faction-card-defaults'] }) })
  const remove = useMutation({ mutationFn: ({ id, key }: { id: number; key: string }) => deleteAsset(id, key),
    onSuccess: (_, v) => queryClient.invalidateQueries({ queryKey: v.id ? ['faction-card', v.id] : ['faction-card-defaults'] }) })
  const [downloadError, setDownloadError] = useState('')
  // Downloads render at full size (the previews are half size).
  async function download(side: Side) {
    if (!draft || !faction) return
    setDownloadError('')
    try {
      const full = await renderFactionCard({ side, data: draft.data, unitColor: draft.color, backgroundUrl: backgrounds[side], assets, defaults, layout, logoUrl, cardImages: cards.images })
      const url = URL.createObjectURL(await pngBlob(full.canvas))
      const link = document.createElement('a'); link.href = url; link.download = downloadName(faction.name, side)
      document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setDownloadError(e instanceof Error ? e.message : 'Download failed.') }
  }

  const edit = (patch: Partial<FactionCardData>) => { save.reset(); setDraft(d => d && { ...d, data: { ...d.data, ...patch } }) }
  const setUnit = (slot: SlotKey, patch: Partial<UnitStats>) => edit({ units: { ...draft!.data.units, [slot]: { ...draft!.data.units[slot], ...patch } } })
  const setRow = (i: number, patch: Partial<InitialRow>) => edit({ initial: draft!.data.initial.map((r, n) => n === i ? { ...r, ...patch } : r) })
  const forcesChoices: { value: ForcesIcon; label: string }[] = [...UNIT_SLOTS.map(s => ({ value: s.key as ForcesIcon, label: draft?.data.units[s.key].name || s.label })), { value: 'city', label: 'City' }, { value: 'factory', label: 'Factory' }, { value: 'reinforcement', label: 'Reinforcement token' }, { value: 'forge_token', label: 'Forge token' }, { value: 'materiel', label: 'Materiel' }, { value: 'card', label: 'A library card…' }]
  const busy = upload.isPending || remove.isPending
  const failure = upload.error ?? remove.error

  const factionCards = useCards(factionId ? String(factionId) : '', '')
  if (factions.isPending) return <p role="status" className="text-sm text-ink/60">Loading…</p>
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <Link to={only ? `/assemble/faction-card?faction=${factionId}` : '/assemble'} className="text-sm text-accent no-underline hover:underline">{only ? '← Faction card' : '← Library'}</Link>
      <h1 className="m-0 font-display text-2xl text-accent-300">{only ? `Faction card ${only}` : 'Faction card'}</h1>
      {factions.data?.find(f => f.id === factionId) && <span className="font-mono text-xs uppercase tracking-[0.18em] text-ink/60">{factions.data.find(f => f.id === factionId)!.dlc} / <span className="text-ink">{factions.data.find(f => f.id === factionId)!.name}</span></span>}
      <div className="ml-auto flex flex-wrap gap-2">
        {only !== 'back' && <Button disabled={!faces.front} onClick={() => void download('front')}>Download front PNG</Button>}
        {only !== 'front' && <Button disabled={!faces.back} onClick={() => void download('back')}>Download back PNG</Button>}
        <Button disabled={!dirty || save.isPending} onClick={() => { save.reset(); loaded.current = ''; record.refetch() }}>Discard changes</Button>
        <Button variant="primary" disabled={!dirty || save.isPending || !draft} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save'}</Button>
      </div>
    </div>
    <CategoryTabs value={null} onChange={c => { state.select({ category: c }); navigate('/assemble') }} faction={{ active: true, onSelect: () => {} }} />
    {!factions.data?.length && <p className="text-sm text-ink/60"><Link to="/factions?mode=library" className="text-accent underline">Create a faction</Link> first.</p>}
    {record.isError && <p role="alert" className="text-danger">{record.error.message}</p>}
    {save.isError && <p role="alert" className="text-danger">{save.error.message}</p>}
    {failure && <p role="alert" className="text-danger">{failure.message}</p>}
    {downloadError && <p role="alert" className="text-danger">{downloadError}</p>}
    {save.isSuccess && !dirty && <p role="status" className="text-success">Saved.</p>}
    {cards.probes}
    {draft && openSlot && openSlot !== 'city' && openSlot !== 'factory' && <UnitModelDialog factionId={factionId!} slot={openSlot} label={draft.data.units[openSlot].name || openSlot} unit={draft.data.units[openSlot]} onUnitChange={patch => setUnit(openSlot, patch)} style={layout.modelStyle}
      stlUrl={assets[assetKeys.model(openSlot)]} iconUrl={assets[assetKeys.icon(openSlot)]}
      orientation={draft.data.models[openSlot]} color={draft.color} cardInput={frontInput} onChange={o => edit({ models: { ...draft.data.models, [openSlot]: o } })} onClose={() => setOpenSlot(null)} />}
    {draft && (openSlot === 'city' || openSlot === 'factory') && <StructureDialog label={openSlot === 'city' ? 'City' : 'Factory'} cost={openSlot === 'city' ? draft.data.city_cost : draft.data.factory_cost}
      onCost={n => edit(openSlot === 'city' ? { city_cost: n } : { factory_cost: n })} onClose={() => setOpenSlot(null)} />}
    {draft && <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,1.3fr)_minmax(360px,1fr)]">
      <section aria-label="Card preview" className="space-y-2 xl:sticky xl:top-3">
        {(['front', 'back'] as const).filter(side => !only || side === only).map(side => { const result = faces[side]
          return <div key={side} className="rounded-lg border border-divider bg-black/30 p-2">
            <div className="relative mx-auto" style={{ width: 'min(100%, calc((100vh - 200px) / 2 * 1.4888))', aspectRatio: `${CARD_SIZE.width} / ${CARD_SIZE.height}` }}>
              {result ? <>
                <CardCanvas result={result} aria-label={`Faction card ${side}`} className="block h-full w-full" />
                {side === 'back' && !only && <Link to={`/assemble/faction-card/back?faction=${factionId}`} aria-label="Edit card back" title="Edit card back" className="absolute inset-0 rounded border border-transparent hover:border-accent hover:bg-accent/10" />}
                <SafeAreaLines px={CARD_SIZE} cutMm={FACTION_CARD_CUT_MM} />
                <ReferenceOverlay category="faction" side={side} />
                {side === 'front' && UNIT_SLOTS.map(({ key, label }) => { const r = unitRowBox(key, layout, draft.data)
                  return <button key={key} type="button" aria-label={`Edit ${draft.data.units[key].name || label}`} title={`Edit ${draft.data.units[key].name || label}`} onClick={() => setOpenSlot(key)}
                    className="absolute cursor-pointer rounded border border-transparent bg-transparent p-0 hover:border-accent hover:bg-accent/10"
                    style={{ left: `${r.x / CARD_SIZE.width * 100}%`, top: `${r.y / CARD_SIZE.height * 100}%`, width: `${r.w / CARD_SIZE.width * 100}%`, height: `${r.h / CARD_SIZE.height * 100}%` }} />
                })}
                {side === 'front' && (['city', 'factory'] as const).map(key => { const b = structurePriceBox(key, layout, draft.data)
                  return <button key={key} type="button" aria-label={`Edit ${key}`} title={`Edit the ${key} price`} onClick={() => setOpenSlot(key)}
                    className="absolute cursor-pointer rounded border border-transparent bg-transparent p-0 hover:border-accent hover:bg-accent/10"
                    style={{ left: `${b.x / CARD_SIZE.width * 100}%`, top: `${b.y / CARD_SIZE.height * 100}%`, width: `${b.w / CARD_SIZE.width * 100}%`, height: `${b.h / CARD_SIZE.height * 100}%` }} />
                })}
              </> : <p role="status" className="absolute inset-0 grid place-items-center text-sm text-ink/60">{faces.error || 'Rendering card…'}</p>}
            </div>
            <div className="mt-2"><ReferenceField category="faction" side={side} /></div>
            {!!result?.warnings.length && <div role="status" className="mt-1 space-y-1 text-xs text-warn">{result.warnings.map(w => <p key={w} className="m-0">{w}</p>)}</div>}
          </div>
        })}
        {faces.error && (faces.front || faces.back) && <p role="alert" className="m-0 text-xs text-danger">{faces.error}</p>}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-xs text-ink/55">258 × 170 mm cut + 5 mm bleed = 268 × 180 mm, {CARD_SIZE.width} × {CARD_SIZE.height} px per side (previews are half size). Fits A4 landscape.</span>
        </div>
      </section>

      <div className="space-y-3">
        <Section title="Generated front and back" label="Templates" open>
          {(['front', 'back'] as const).filter(s => !only || s === only).map(s => <ImagePickerField key={s} label={`${s === 'front' ? 'Front' : 'Back'} image`} title={`Choose the ${s} image`} factionId={factionId} preferredType={s === 'front' ? 'faction card' : 'faction card back'}
            selectedKey={s === 'front' ? draft.front : draft.back} onSelect={key => { save.reset(); setDraft(d => d && { ...d, [s]: key }) }}
            upload={{ url: assets[`${s}-image`], pending: upload.isPending, onPick: file => upload.mutate({ id: factionId!, key: `${s}-image`, file }) }} />)}
          {!options.length && <p className="m-0 text-xs text-ink/60">No generated images for this faction yet. Generate the front with the “faction card” type and the back with “faction card back” in <Link to={`/faction-lab?faction=${factionId}`} className="text-accent underline">AI Lab</Link>, or upload your own.</p>}
        </Section>

        <Section title="Card colour" label="Card colour" open>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Theme colour">{id => <ColorInput id={id} className="h-9 w-16 cursor-pointer rounded border border-divider bg-bg" value={themeColor(draft.data.theme, draft.color)} onChange={theme => edit({ theme })} />}</Field>
            <Button disabled={!draft.data.theme} onClick={() => edit({ theme: '' })}>Use the unit colour</Button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Theme presets">{THEME_PRESETS.map(p => <button key={p.name} type="button" aria-label={`${p.name} theme`} title={p.name} onClick={() => edit({ theme: p.color })}
            className="h-7 w-10 cursor-pointer rounded border-2 border-divider p-0 hover:border-accent" style={{ background: p.color }} />)}</div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Panel colour">{id => <ColorInput id={id} className="h-9 w-16 cursor-pointer rounded border border-divider bg-bg" value={draft.data.panel_color || '#efe4d8'} onChange={panel_color => edit({ panel_color })} />}</Field>
            <Button disabled={!draft.data.panel_color} onClick={() => edit({ panel_color: '' })}>Use the theme for panels</Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Picture frame colour (objectives)">{id => <ColorInput id={id} className="h-9 w-16 cursor-pointer rounded border border-divider bg-bg" value={draft.data.frame_color || '#b9a99a'} onChange={frame_color => edit({ frame_color })} />}</Field>
            <Button disabled={!draft.data.frame_color} onClick={() => edit({ frame_color: '' })}>Use the theme for frames</Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Light bar colour">{id => <ColorInput id={id} className="h-9 w-16 cursor-pointer rounded border border-divider bg-bg" value={draft.data.light_color || themeColor(draft.data.theme, draft.color)} onChange={light_color => edit({ light_color })} />}</Field>
            <Button disabled={!draft.data.light_color} onClick={() => edit({ light_color: '' })}>Use the theme for light bars</Button>
          </div>
          <p className="m-0 text-xs text-ink/55">Panels, outlines, corner squares and light bars on both sides take their colour from this one colour. Until you pick one the faction's unit colour is used.</p>
        </Section>

        {only !== 'back' && <Section title="Front text" label="Faction text" open>
          <Field label="Title">{id => <input id={id} className={inputClass} value={draft.data.title} onChange={e => edit({ title: e.target.value })} />}</Field>
          <Field label="Subtitle">{id => <input id={id} className={inputClass} value={draft.data.subtitle} onChange={e => edit({ subtitle: e.target.value })} />}</Field>
          <Field label="Faction text">{id => <textarea id={id} rows={5} className={inputClass} value={draft.data.text} onChange={e => edit({ text: e.target.value })} />}</Field>
          <p className="m-0 text-xs text-ink/55">Wrap a lead-in in **double asterisks** to make it bold, e.g. **Starkest Terror:** When you resolve…</p>
        
        </Section>}

        {only !== 'back' && <Section title="Units" label="Units">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Faction unit colour">{id => <ColorInput id={id} className="h-9 w-16 cursor-pointer rounded border border-divider bg-bg" value={draft.color} onChange={color => { save.reset(); setDraft(d => d && { ...d, color }) }} />}</Field>
          </div>
          <p className="m-0 text-xs text-ink/55">Every model is painted in this colour. To change a unit's name, numbers or model, click it on the front preview; click the city or the factory to change its price. Model shadow and outline are shared by all factions: set them on <Link to="/card-templates" className="text-accent underline">Card Types → Faction card</Link>.</p>
        </Section>}

        {only !== 'front' && <Section title="Back text" label="Back text">
          <Field label="Story text">{id => <textarea id={id} rows={6} className={inputClass} value={draft.data.back_text} onChange={e => edit({ back_text: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signature">{id => <input id={id} className={inputClass} value={draft.data.signature} onChange={e => edit({ signature: e.target.value })} />}</Field>
            <Field label="Signature title">{id => <input id={id} className={inputClass} value={draft.data.signature_title} onChange={e => edit({ signature_title: e.target.value })} />}</Field>
          </div>
          <div><span className="mb-1 block text-xs text-ink/70">Portrait</span>
            <AssetPicker label="Portrait image" url={assets[assetKeys.portrait]} disabled={busy} onPick={file => upload.mutate({ id: factionId!, key: assetKeys.portrait, file })} onRemove={() => remove.mutate({ id: factionId!, key: assetKeys.portrait })} /></div>
        
        </Section>}

        {only !== 'front' && <Section title="Initial forces" label="Initial forces">
          {draft.data.initial.map((row, i) => <div key={i} className="space-y-2"><div className="grid grid-cols-[4rem_1fr_1fr_auto] items-end gap-2">
            <Field label="Count">{id => <input id={id} type="number" min={0} className={inputClass} value={row.count} onChange={e => setRow(i, { count: toNumber(e.target.value) })} />}</Field>
            <Field label="Icon">{id => <select id={id} className={selectClass} value={row.icon} onChange={e => { const icon = e.target.value as ForcesIcon, c = forcesChoices.find(x => x.value === icon); setRow(i, { icon, ...(icon === 'card' ? {} : { label: c?.label ?? row.label, card_id: undefined }) }) }}>{forcesChoices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}</select>}</Field>
            <Field label="Label">{id => <input id={id} className={inputClass} value={row.label} onChange={e => setRow(i, { label: e.target.value })} />}</Field>
            <Button aria-label={`Remove row ${i + 1}`} onClick={() => edit({ initial: draft.data.initial.filter((_, n) => n !== i) })}>×</Button>
          </div>
          {row.icon === 'card' && <Field label={`Row ${i + 1} card`}>{id => <SearchableSelect id={id} className={selectClass} value={row.card_id ?? 0} onChange={e => { const card = factionCards.data?.find(c => c.id === Number(e.target.value)); setRow(i, { card_id: card?.id, ...(card ? { label: card.name } : {}) }) }}>
            <option value={0}>Choose a card…</option>
            {factionCards.data?.filter(c => c.faction_id === factionId).map(c => <option key={c.id} value={c.id}>{c.name} ({c.category === 'schema' ? 'event' : c.category})</option>)}
          </SearchableSelect>}</Field>}
          </div>)}
          {draft.data.initial.length < 8 && <Button onClick={() => edit({ initial: [...draft.data.initial, { icon: 'materiel', count: 1, label: 'Materiel' }] })}>Add row</Button>}
        
        </Section>}

        {only !== 'front' && <Section title="Objectives" label="Objectives">
          {draft.data.objectives.map((o, i) => <fieldset key={i} className="space-y-2 rounded border border-divider p-2">
            <legend className="px-1 text-xs text-ink/60">Objective {i + 1}</legend>
            <Field label={`Objective ${i + 1} name`}>{id => <input id={id} className={inputClass} value={o.name} onChange={e => edit({ objectives: draft.data.objectives.map((x, n) => n === i ? { ...x, name: e.target.value } : x) })} />}</Field>
            <Field label={`Objective ${i + 1} text`}>{id => <textarea id={id} rows={2} className={inputClass} value={o.text} onChange={e => edit({ objectives: draft.data.objectives.map((x, n) => n === i ? { ...x, text: e.target.value } : x) })} />}</Field>
            <AssetPicker label={`Objective ${i + 1} image`} url={assets[assetKeys.objective(i)]} disabled={busy} onPick={file => upload.mutate({ id: factionId!, key: assetKeys.objective(i), file })} onRemove={() => remove.mutate({ id: factionId!, key: assetKeys.objective(i) })} />
          </fieldset>)}
        
        </Section>}

        {only !== 'back' && <Section title="Shared icons (all factions)" label="Shared icons">
          <p className="text-xs text-ink/55">Structures, stat icons, forge and tech badge come with the app; upload one to override it.</p>
          <div className="space-y-2">{DEFAULT_ICONS.map(({ key, label }) => <div key={key}><span className="mb-1 block text-xs text-ink/70">{label}</span>
            <AssetPicker label={`${label} icon`} url={defaults[key]} builtIn={BUNDLED_ICONS[key]} disabled={busy} onPick={file => upload.mutate({ id: 0, key, file })} onRemove={() => remove.mutate({ id: 0, key })} /></div>)}</div>
        
        </Section>}
      </div>
    </div>}
  </div>
}
