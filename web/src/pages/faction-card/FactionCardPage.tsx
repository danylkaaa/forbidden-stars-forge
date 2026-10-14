import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { SafeAreaLines, SafeAreaToggle } from '../../components/SafeArea'
import { Field, inputClass, selectClass } from '../../components/Field'
import { useCards } from '../cards/api'
import { SearchableSelect } from '../../components/SearchableSelect'
import { CategoryTabs } from '../assemble/CategoryTabs'
import { FactionSelect } from '../assemble/FactionSelect'
import { useLibraryImages } from '../assemble/library'
import { useAssembly } from '../assemble/state'
import { CardCanvas } from '../assemble/CardCanvas'
import { useCardTypes } from '../card-types/api'
import { useFactions } from '../factions/api'
import { useFactionCardLayout, type FactionCardLayout } from './layout'
import { useFactionLogoUrl } from './useFactionCardCanvases'
import { useCardImages } from './useCardImages'
import { deleteAsset, saveFactionCard, uploadAsset, useFactionCard, useFactionCardDefaults, type AssetRef } from './api'
import { CARD_SIZE, DEFAULT_ICONS, FACTION_CARD_CUT_MM, UNIT_SLOTS, assetKeys, downloadName, initialCardIds, normalizeData, type FactionCardData, type ForcesIcon, type InitialRow, type SlotKey, type UnitStats } from './model'
import { pngBlob, renderFactionCard, unitIconRect, type FactionCardResult, type Side } from './render'
import { BUNDLED_ICONS } from './bundled'
import { UnitModelDialog } from './UnitModelDialog'
import { UnitModelThumb } from './UnitModelThumb'
import { UnitSummary } from './UnitSummary'

const panel = 'space-y-3 rounded-lg border border-divider bg-surface p-4'
const byKey = (assets: AssetRef[] | undefined) => Object.fromEntries((assets ?? []).map(a => [a.key, a.url]))
const STAT_FIELDS = [['dice', 'Dice'], ['health', 'Health'], ['morale', 'Morale'], ['cost', 'Price'], ['forge', 'Forge'], ['tech', 'Tech']] as const
const toNumber = (text: string) => Math.max(0, Math.floor(Number(text) || 0))

type Draft = { data: FactionCardData; front: string; back: string; color: string }

function useRenderedFace(side: Side, draft: Draft | null, assets: Record<string, string>, defaults: Record<string, string>, backgroundUrl: string | null, layout: FactionCardLayout, logoUrl: string | null, cardImages: Record<number, HTMLCanvasElement>) {
  const [result, setResult] = useState<FactionCardResult | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!draft) return
    let cancelled = false
    const timer = window.setTimeout(() => renderFactionCard({ side, data: draft.data, unitColor: draft.color, backgroundUrl, assets, defaults, layout, logoUrl, cardImages })
      .then(r => { if (!cancelled) { setResult(r); setError('') } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not render the card.') }), 120)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [side, draft, assets, defaults, backgroundUrl, layout, logoUrl, cardImages])
  return { result, error }
}

function AssetPicker({ label, url, onPick, onRemove, disabled, builtIn }: { label: string; url?: string; onPick: (file: File) => void; onRemove: () => void; disabled?: boolean; builtIn?: string }) {
  return <div className="flex items-center gap-2">
    <div className="grid h-12 w-16 shrink-0 place-items-center overflow-hidden rounded border border-divider bg-black/30 text-[10px] text-ink/45">
      {url ?? builtIn ? <img src={url ?? builtIn} alt="" className={`h-full w-full ${builtIn && !url ? 'object-contain' : 'object-cover'}`} /> : 'none'}</div>
    <label className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:border-accent/60 ${disabled ? 'pointer-events-none opacity-45' : ''}`}>{url ? 'Replace' : builtIn ? 'Override' : 'Upload'}
      <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={label} disabled={disabled} onChange={e => { const f = e.target.files?.[0]; if (f) onPick(f); e.target.value = '' }} /></label>
    {url && <Button disabled={disabled} onClick={onRemove}>Remove</Button>}
  </div>
}

export default function FactionCardPage() {
  const factions = useFactions(), state = useAssembly(), queryClient = useQueryClient()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const requested = Number(params.get('faction'))
  const factionId = (factions.data?.some(f => f.id === requested) ? requested : null) ?? (factions.data?.some(f => f.id === state.factionId) ? state.factionId : null) ?? factions.data?.[0]?.id ?? null
  const faction = factions.data?.find(f => f.id === factionId)
  const { layout } = useFactionCardLayout()
  const logoUrl = useFactionLogoUrl(factionId)
  const [openSlot, setOpenSlot] = useState<SlotKey | null>(null)
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
  const cardTypes = useCardTypes()
  const options = useMemo(() => images.data.filter(i => i.factionId === factionId), [images.data, factionId])
  // Images made with the faction card types (Faction Lab) come first in each picker.
  const typeName = (cardTypeId: number) => cardTypes.data?.find(t => t.id === cardTypeId)?.name ?? ''
  const sortedFor = (s: Side) => [...options].sort((a, b) => Number(typeName(b.cardTypeId) === (s === 'front' ? 'faction card' : 'faction card back')) - Number(typeName(a.cardTypeId) === (s === 'front' ? 'faction card' : 'faction card back')))
  const [side, setSide] = useState<Side>('front')
  const background = options.find(i => i.key === (side === 'front' ? draft?.front : draft?.back))?.url ?? null
  const frontInput = useMemo(() => ({ side: 'front' as const, data: draft?.data as FactionCardData, unitColor: draft?.color ?? '', backgroundUrl: options.find(i => i.key === draft?.front)?.url ?? null, assets, defaults, layout, logoUrl }), [draft, options, assets, defaults, layout, logoUrl])
  const { result, error } = useRenderedFace(side, draft, assets, defaults, background, layout, logoUrl, cards.images)

  const save = useMutation({
    mutationFn: () => saveFactionCard(factionId!, { data: draft!.data, front_image_key: draft!.front, back_image_key: draft!.back, unit_color: draft!.color }),
    onSuccess: saved => { queryClient.setQueryData(['faction-card', factionId], saved); void queryClient.invalidateQueries({ queryKey: ['faction-cards'] }); loaded.current = `${factionId}:${saved.updated_at}` },
  })
  const upload = useMutation({ mutationFn: ({ id, key, file }: { id: number; key: string; file: File }) => uploadAsset(id, key, file),
    onSuccess: (_, v) => queryClient.invalidateQueries({ queryKey: v.id ? ['faction-card', v.id] : ['faction-card-defaults'] }) })
  const remove = useMutation({ mutationFn: ({ id, key }: { id: number; key: string }) => deleteAsset(id, key),
    onSuccess: (_, v) => queryClient.invalidateQueries({ queryKey: v.id ? ['faction-card', v.id] : ['faction-card-defaults'] }) })
  const [downloadError, setDownloadError] = useState('')
  async function download() {
    if (!result || !faction) return
    setDownloadError('')
    try {
      const url = URL.createObjectURL(await pngBlob(result.canvas))
      const link = document.createElement('a'); link.href = url; link.download = downloadName(faction.name, side)
      document.body.append(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (e) { setDownloadError(e instanceof Error ? e.message : 'Download failed.') }
  }

  const edit = (patch: Partial<FactionCardData>) => { save.reset(); setDraft(d => d && { ...d, data: { ...d.data, ...patch } }) }
  const setUnit = (slot: SlotKey, patch: Partial<UnitStats>) => edit({ units: { ...draft!.data.units, [slot]: { ...draft!.data.units[slot], ...patch } } })
  const setRow = (i: number, patch: Partial<InitialRow>) => edit({ initial: draft!.data.initial.map((r, n) => n === i ? { ...r, ...patch } : r) })
  const forcesChoices: { value: ForcesIcon; label: string }[] = [...UNIT_SLOTS.map(s => ({ value: s.key as ForcesIcon, label: draft?.data.units[s.key].name || s.label })), { value: 'city', label: 'City' }, { value: 'factory', label: 'Factory' }, { value: 'reinforcement', label: 'Reinforcement token' }, { value: 'materiel', label: 'Materiel' }, { value: 'card', label: 'A library card…' }]
  const busy = upload.isPending || remove.isPending
  const failure = upload.error ?? remove.error

  const factionCards = useCards(factionId ? String(factionId) : '', '')
  if (factions.isPending) return <p role="status" className="text-sm text-ink/60">Loading…</p>
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <Link to="/assemble" className="text-sm text-accent no-underline hover:underline">← Library</Link>
      <h1 className="m-0 font-display text-2xl text-accent-300">Faction card</h1>
      <FactionSelect factions={factions.data ?? []} value={factionId} onChange={id => state.select({ factionId: id })} />
      <div className="ml-auto flex flex-wrap gap-2">
        <Button disabled={!result} onClick={() => void download()}>Download {side} PNG</Button>
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
    {draft && openSlot && <UnitModelDialog factionId={factionId!} slot={openSlot} label={draft.data.units[openSlot].name || openSlot} unit={draft.data.units[openSlot]} onUnitChange={patch => setUnit(openSlot, patch)} stlUrl={assets[assetKeys.model(openSlot)]} iconUrl={assets[assetKeys.icon(openSlot)]}
      orientation={draft.data.models[openSlot]} color={draft.color} cardInput={frontInput} onChange={o => edit({ models: { ...draft.data.models, [openSlot]: o } })} onClose={() => setOpenSlot(null)} />}
    {draft && <div className="grid items-start gap-5 xl:grid-cols-[minmax(320px,1.3fr)_minmax(360px,1fr)]">
      <section aria-label="Card preview" className="space-y-3 xl:sticky xl:top-5">
        <div role="tablist" aria-label="Card side" className="inline-flex overflow-hidden rounded-md border border-divider text-sm">
          {(['front', 'back'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={side === value} onClick={() => setSide(value)}
            className={`cursor-pointer border-0 px-4 py-1.5 capitalize ${side === value ? 'bg-accent/15 text-accent' : 'bg-transparent text-ink/60 hover:text-ink'}`}>{value}</button>)}
        </div>
        <div className="flex min-h-60 items-center justify-center rounded-lg border border-divider bg-black/30 p-2">
          {result ? <div className="relative w-full"><CardCanvas result={result} aria-label={`Faction card ${side}`} className="block h-auto max-h-[80vh] w-full" /><SafeAreaLines px={result.canvas} cutMm={FACTION_CARD_CUT_MM} />
            {side === 'front' && UNIT_SLOTS.filter(s => s.key !== 'bastion').map(({ key, label }) => { const r = unitIconRect(key, layout)
              return <button key={key} type="button" aria-label={`Edit ${draft.data.units[key].name || label} model`} title="Click to edit this unit's model" onClick={() => setOpenSlot(key)}
                className="absolute cursor-pointer rounded-full border border-transparent bg-transparent p-0 hover:border-accent hover:bg-accent/10"
                style={{ left: `${r.x / CARD_SIZE.width * 100}%`, top: `${r.y / CARD_SIZE.height * 100}%`, width: `${r.w / CARD_SIZE.width * 100}%`, height: `${r.h / CARD_SIZE.height * 100}%` }} />
            })}</div> : <p role="status" className="p-6 text-sm text-ink/60">{error || 'Rendering card…'}</p>}
        </div>
        {error && result && <p role="alert" className="m-0 text-xs text-danger">{error}</p>}
        {!!result?.warnings.length && <div role="status" className="space-y-1 text-xs text-warn">{result.warnings.map(w => <p key={w} className="m-0">{w}</p>)}</div>}
        <SafeAreaToggle />
        <p className="m-0 text-xs text-ink/55">258 × 170 mm cut plus 5 mm bleed on every edge = 268 × 180 mm, {CARD_SIZE.width} × {CARD_SIZE.height} px at 300 dpi per side. Fits A4 landscape.</p>
      </section>

      <div className="space-y-5">
        <section aria-label="Templates" className={panel}>
          <h2 className="m-0 font-display text-accent-300">Generated front and back</h2>
          {(['front', 'back'] as const).map(s => <Field key={s} label={`${s === 'front' ? 'Front' : 'Back'} image`}>{id => <SearchableSelect id={id} className={selectClass} value={s === 'front' ? draft.front : draft.back}
            onChange={e => { save.reset(); setDraft(d => d && { ...d, [s === 'front' ? 'front' : 'back']: e.target.value }) }}>
            <option value="">None</option>
            {sortedFor(s).map(i => <option key={i.key} value={i.key}>{i.name} ({typeName(i.cardTypeId) || i.source})</option>)}
          </SearchableSelect>}</Field>)}
          {!options.length && <p className="m-0 text-xs text-ink/60">No generated images for this faction yet. Generate the front with the “faction card” type and the back with “faction card back” in <Link to={`/faction-lab?faction=${factionId}`} className="text-accent underline">Faction Lab</Link>.</p>}
        </section>

        {side === 'front' && <section aria-label="Faction text" className={panel}>
          <h2 className="m-0 font-display text-accent-300">Front text</h2>
          <Field label="Title">{id => <input id={id} className={inputClass} value={draft.data.title} onChange={e => edit({ title: e.target.value })} />}</Field>
          <Field label="Subtitle">{id => <input id={id} className={inputClass} value={draft.data.subtitle} onChange={e => edit({ subtitle: e.target.value })} />}</Field>
          <Field label="Faction text">{id => <textarea id={id} rows={5} className={inputClass} value={draft.data.text} onChange={e => edit({ text: e.target.value })} />}</Field>
          <p className="m-0 text-xs text-ink/55">Wrap a lead-in in **double asterisks** to make it bold, e.g. **Starkest Terror:** When you resolve…</p>
        </section>}

        {side === 'front' && <section aria-label="Units" className={panel}>
          <h2 className="m-0 font-display text-accent-300">Units</h2>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Faction unit colour">{id => <input id={id} type="color" className="h-9 w-16 cursor-pointer rounded border border-divider bg-bg" value={draft.color} onChange={e => { save.reset(); setDraft(d => d && { ...d, color: e.target.value }) }} />}</Field>
            <p className="m-0 max-w-sm pb-1 text-xs text-ink/55">Every model is painted in this colour. Open a unit and click its model to upload an STL, pose it, or use your own PNG instead.</p>
          </div>
          {([['city', 'City', draft.data.city_cost, 'city_cost'], ['factory', 'Factory', draft.data.factory_cost, 'factory_cost']] as const).map(([key, label, cost, field]) =>
            <details key={key} className="rounded border border-divider px-3 py-2">
              <summary className="cursor-pointer"><UnitSummary name={label} type="Structure" icons={defaults} cost={cost} /></summary>
              <div className="mt-3 flex items-end gap-3">
                <div className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-divider bg-black/30 p-1"><img src={defaults[key] ?? BUNDLED_ICONS[key]} alt={`${label} icon`} className="h-full w-full object-contain" /></div>
                <div className="w-32"><Field label={`${label} price`}>{id => <input id={id} type="number" min={0} className={inputClass} value={cost} onChange={e => edit({ [field]: toNumber(e.target.value) })} />}</Field></div>
              </div>
            </details>)}
          {UNIT_SLOTS.map(({ key, label }) => { const u = draft.data.units[key]
            return <details key={key} className="rounded border border-divider px-3 py-2">
              <summary className="cursor-pointer"><UnitSummary name={u.name} type={label} icons={defaults} cost={u.cost} dice={u.dice} health={u.health} morale={u.morale} /></summary>
              <div className="mt-3 space-y-2">
              <div className="flex gap-3">
                {key === 'bastion'
                  ? <div title="The bastion uses the shared structure icon" className="grid h-20 w-20 shrink-0 place-items-center overflow-hidden rounded-md border border-divider bg-black/30 p-1"><img src={defaults.bastion ?? BUNDLED_ICONS.bastion} alt="Bastion icon" className="h-full w-full object-contain" /></div>
                  : <UnitModelThumb label={u.name || label} stlUrl={assets[assetKeys.model(key)]} iconUrl={assets[assetKeys.icon(key)]}
                  orientation={draft.data.models[key]} color={draft.color} onOpen={() => setOpenSlot(key)} />}
                <div className="min-w-0 flex-1"><Field label={`${label} name`}>{id => <input id={id} className={inputClass} value={u.name} onChange={e => setUnit(key, { name: e.target.value })} />}</Field></div>
              </div>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {STAT_FIELDS.map(([stat, name]) => <Field key={stat} label={`${label} ${name.toLowerCase()}`}>{id => stat === 'tech'
                  ? <select id={id} className={selectClass} value={u.tech ?? ''} onChange={e => setUnit(key, { tech: e.target.value === '' ? null : Number(e.target.value) })}><option value="">—</option>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}</select>
                  : <input id={id} type="number" min={0} className={inputClass} value={u[stat]} onChange={e => setUnit(key, { [stat]: toNumber(e.target.value) })} />}</Field>)}
              </div>
              </div>
            </details> })}
        </section>}


        {side === 'back' && <section aria-label="Back text" className={panel}>
          <h2 className="m-0 font-display text-accent-300">Back</h2>
          <Field label="Story text">{id => <textarea id={id} rows={6} className={inputClass} value={draft.data.back_text} onChange={e => edit({ back_text: e.target.value })} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Signature">{id => <input id={id} className={inputClass} value={draft.data.signature} onChange={e => edit({ signature: e.target.value })} />}</Field>
            <Field label="Signature title">{id => <input id={id} className={inputClass} value={draft.data.signature_title} onChange={e => edit({ signature_title: e.target.value })} />}</Field>
          </div>
          <div><span className="mb-1 block text-xs text-ink/70">Portrait</span>
            <AssetPicker label="Portrait image" url={assets[assetKeys.portrait]} disabled={busy} onPick={file => upload.mutate({ id: factionId!, key: assetKeys.portrait, file })} onRemove={() => remove.mutate({ id: factionId!, key: assetKeys.portrait })} /></div>
        </section>}

        {side === 'back' && <section aria-label="Initial forces" className={panel}>
          <h2 className="m-0 font-display text-accent-300">Initial forces</h2>
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
        </section>}

        {side === 'back' && <section aria-label="Objectives" className={panel}>
          <h2 className="m-0 font-display text-accent-300">Objectives</h2>
          {draft.data.objectives.map((o, i) => <fieldset key={i} className="space-y-2 rounded border border-divider p-2">
            <legend className="px-1 text-xs text-ink/60">Objective {i + 1}</legend>
            <Field label={`Objective ${i + 1} name`}>{id => <input id={id} className={inputClass} value={o.name} onChange={e => edit({ objectives: draft.data.objectives.map((x, n) => n === i ? { ...x, name: e.target.value } : x) })} />}</Field>
            <Field label={`Objective ${i + 1} text`}>{id => <textarea id={id} rows={2} className={inputClass} value={o.text} onChange={e => edit({ objectives: draft.data.objectives.map((x, n) => n === i ? { ...x, text: e.target.value } : x) })} />}</Field>
            <AssetPicker label={`Objective ${i + 1} image`} url={assets[assetKeys.objective(i)]} disabled={busy} onPick={file => upload.mutate({ id: factionId!, key: assetKeys.objective(i), file })} onRemove={() => remove.mutate({ id: factionId!, key: assetKeys.objective(i) })} />
          </fieldset>)}
        </section>}

        <details className={panel}>
          <summary className="cursor-pointer font-display text-accent-300">Shared icons (all factions)</summary>
          <p className="text-xs text-ink/55">Structures, stat icons, forge and tech badge come with the app; upload one to override it.</p>
          <div className="space-y-2">{DEFAULT_ICONS.map(({ key, label }) => <div key={key}><span className="mb-1 block text-xs text-ink/70">{label}</span>
            <AssetPicker label={`${label} icon`} url={defaults[key]} builtIn={BUNDLED_ICONS[key]} disabled={busy} onPick={file => upload.mutate({ id: 0, key, file })} onRemove={() => remove.mutate({ id: 0, key })} /></div>)}</div>
        </details>
      </div>
    </div>}
  </div>
}
