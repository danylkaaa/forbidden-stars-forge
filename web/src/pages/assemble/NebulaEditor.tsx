import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { Magnifier } from '../../components/Magnifier'
import { removeNebulaPicture, saveNebula, useFactionColor, uploadNebulaPicture, useNebulaPicture } from './api'
import { useNebulaDraft } from './useNebulaDraft'
import { nebulaTemplateUrl } from './backDecor'
import { useTemplate } from './library'
import { Card3DViewer } from './Card3DViewer'
import { CubeIcon } from '../../components/icons'
import type { Category } from '../cards/model'
import { useFactions } from '../factions/api'
import type { PlacementDraft } from './useNebulaPlacementDraft'

type Spin = { front: string; back: string; logoUrl?: string; logoScale?: number; category?: Category }
// A preview that opens full size on click, with a 3D button beside it.
// `picture` (a card type) makes the tile a drop target for that type's nebula picture.
function NebulaTile({ label, factionId, render, spin, picture }: { label: string; factionId: number; render: () => React.ReactNode; spin: Spin | null; picture?: { category: Category; custom: boolean } }) {
  const [full, setFull] = useState(false), [three, setThree] = useState(false), [over, setOver] = useState(false)
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: (file: File | null) => file ? uploadNebulaPicture(picture!.category, file) : removeNebulaPicture(picture!.category),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nebula-pictures'] }),
  })
  const pick = (file: File | undefined) => { if (file && picture) change.mutate(file) }
  useEffect(() => {
    if (!full) return
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [full])
  const content = render()
  return <figure className="m-0 w-36 shrink-0">
    <div className={`group/nebula relative ${over ? 'ring-2 ring-accent' : ''}`}
      onDragOver={e => { if (picture) { e.preventDefault(); setOver(true) } }} onDragLeave={() => setOver(false)}
      onDrop={e => { if (!picture) return; e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]) }}>
      <Magnifier className="aspect-[816/1104] overflow-hidden rounded bg-black/30"><div role="button" tabIndex={0} aria-label={`${label}, full size`} className="h-full w-full" onClick={() => content && setFull(true)}
        onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && content) { e.preventDefault(); setFull(true) } }}>{content}</div></Magnifier>
      {spin && <button type="button" aria-label={`3D preview of ${label}`} title="3D preview" onClick={() => setThree(true)}
        className="absolute right-1.5 top-1.5 z-10 grid h-8 w-8 cursor-pointer opacity-0 group-hover/nebula:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 place-items-center rounded-md border border-white/20 bg-black/60 text-ink/85 shadow backdrop-blur-sm hover:border-accent hover:text-accent"><CubeIcon /></button>}
    </div>
    <figcaption className="mt-1 text-center text-xs text-ink/60">{label}</figcaption>
    {picture && <div className="mt-1 flex flex-col items-center gap-0.5 text-[11px] text-ink/60">
      <label className="cursor-pointer text-accent underline">{change.isPending ? 'Saving…' : picture.custom ? 'Replace nebula' : 'Upload nebula'}
        <input type="file" accept="image/png,image/jpeg" aria-label={`Upload nebula picture for ${label}`} className="sr-only" disabled={change.isPending}
          onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} /></label>
      {picture.custom && <button type="button" disabled={change.isPending} onClick={() => change.mutate(null)} className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-ink/60 underline">Use default</button>}
      {!picture.custom && <span>or drop an image here</span>}
      {change.isError && <span role="alert" className="text-danger">{change.error.message}</span>}
    </div>}
    {full && createPortal(<div role="dialog" aria-label={`${label}, full size`} className="fixed inset-0 z-40 grid cursor-zoom-out place-items-center bg-black/85 p-4 backdrop-blur-sm" onClick={() => setFull(false)}>
      <div className="w-[min(640px,92vw,calc(92vh*0.739))] overflow-hidden rounded-lg shadow-[0_12px_48px_rgba(0,0,0,0.8)]">{render()}</div>
    </div>, document.body)}
    {three && spin && <Card3DViewer category={spin.category} factionId={factionId} title={label} front={spin.front} back={spin.back} backLogoUrl={spin.logoUrl} backLogoScale={spin.logoScale} initialSide="back" onClose={() => setThree(false)} />}
  </figure>
}

function PlacementControls({ placement, defaultBrightness, brightness }: { placement: PlacementDraft; defaultBrightness: number; brightness: boolean }) {
  const { value, change, randomize } = placement
  const lit = value.brightness || defaultBrightness
  return <>
    <p className="m-0 text-sm text-ink/70">Drag the card preview to move the nebula.</p>
    <Field label={`Rotation (${Math.round(value.rotation)}°)`}>{id => <input id={id} type="range" min="-180" max="180" step="1" value={Math.round(value.rotation)}
      className="w-full" onChange={e => change({ rotation: Number(e.target.value) })} />}</Field>
    {brightness && <>
      <Field label={`Nebula brightness (${Math.round(lit * 100)}%)`}>{id => <input id={id} type="range" min="20" max="200" step="5" value={Math.round(lit * 100)}
        className="w-full" onChange={e => change({ brightness: Number(e.target.value) / 100 })} />}</Field>
      {value.brightness ? <Button onClick={() => change({ brightness: 0 })}>Use the faction's brightness</Button> : <p className="m-0 text-xs text-ink/50">The faction's brightness.</p>}
    </>}
    <Button onClick={randomize}>Randomize</Button>
  </>
}

// A faction's nebula, tuned in one place and shown three ways: alone, on the
// combat back and on the event back. Saved per faction, so it stays when a
// back image is replaced. The switch is saved at once; the look with the button.
// `scope` limits it: the faction alone (with the template switch), or the back of one card type.
export function FactionNebulaSection({ factionId, scope = 'faction', placement }: { factionId: number; scope?: 'faction' | 'combat' | 'schema' | 'upgrade'; placement?: PlacementDraft }) {
  const nebula = useNebulaDraft(factionId), factions = useFactions()
  const factionColor = useFactionColor(factionId), fallback = factionColor || (factions.data?.find(f => f.id === factionId)?.primary_color ?? '')
  const combatPicture = useNebulaPicture('combat'), eventPicture = useNebulaPicture('schema'), upgradePicture = useNebulaPicture('upgrade')
  const scopePicture = scope === 'schema' ? eventPicture : scope === 'upgrade' ? upgradePicture : combatPicture
  const combatBack = useTemplate(factionId, 'combat', 'back').image, eventBack = useTemplate(factionId, 'schema', 'back').image
  const pv = placement?.value
  // The event back may have its own brightness.
  const drawn = useMemo(() => ({ ...nebula.value, color: nebula.value.color || factionColor, density: scope === 'schema' && pv?.brightness ? pv.brightness : nebula.value.density }), [nebula.value, factionColor, scope, pv?.brightness])
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: (on: boolean) => saveNebula(factionId, { ...nebula.value, as_template: on }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nebulas'] }),
  })
  const [plain, setPlain] = useState('')
  useEffect(() => {
    let cancelled = false
    nebulaTemplateUrl(drawn, fallback, { width: 612, height: 828 }, scopePicture, pv).then(url => { if (!cancelled) setPlain(url) }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, fallback, scopePicture, scope, pv?.x, pv?.y, pv?.rotation])
  const plainImage = plain ? <img src={plain} alt={`${scope === 'combat' ? 'Combat' : scope === 'upgrade' ? 'Upgrade' : 'Event'} nebula`} className="block h-full w-full object-cover" /> : null
  return <div>
    <section aria-label={scope === 'faction' ? 'Faction nebula' : 'Back nebula'} className="flex flex-wrap gap-5">
      <div className="flex flex-wrap gap-3">
        {scope === 'faction' && <NebulaTile label="Nebula alone" factionId={factionId} spin={plain ? { front: plain, back: plain } : null}
          render={() => plain ? <img src={plain} alt="Nebula alone" className="block h-full w-full object-cover" /> : null} />}
        {scope === 'combat' && <NebulaTile label="Combat nebula" factionId={factionId} picture={{ category: 'combat', custom: !!combatPicture }} render={() => plainImage}
          spin={combatBack?.url ?? plain ? { front: plain, back: combatBack?.url ?? plain, logoUrl: combatBack?.logoUrl, logoScale: combatBack?.logoScale, category: 'combat' } : null} />}
        {scope === 'upgrade' && <NebulaTile label="Upgrade nebula" factionId={factionId} picture={{ category: 'upgrade', custom: !!upgradePicture }} render={() => plainImage} spin={null} />}
        {scope === 'schema' && <NebulaTile label="Event nebula" factionId={factionId} picture={{ category: 'schema', custom: !!eventPicture }} render={() => plainImage}
          spin={eventBack?.url ?? plain ? { front: plain, back: eventBack?.url ?? plain, logoUrl: eventBack?.logoUrl, logoScale: eventBack?.logoScale, category: 'schema' } : null} />}
      </div>
      <div className="min-w-56 flex-1 space-y-3">
        {scope === 'faction' ? <p className="m-0 text-xs text-ink/60">The nebula's colour and brightness are set in the banner above.</p> : placement && <PlacementControls placement={placement} defaultBrightness={nebula.value.density} brightness={scope === 'schema'} />}
        {scope === 'faction' && <><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!nebula.value.as_template} disabled={toggle.isPending} onChange={e => toggle.mutate(e.target.checked)} className="accent-[var(--color-accent)]" />Use nebula as template</label>
        <p className="m-0 text-xs text-ink/60">With this on, the faction's cards of every type without a chosen template are drawn on this nebula.</p>
        {toggle.isError && <p role="alert" className="m-0 text-sm text-danger">{toggle.error.message}</p>}</>}
        {scope !== 'faction' && <p className="m-0 text-xs text-ink/60">Colour is the faction's (Faction config tab). Position, rotation and the nebula picture are for this card type only.</p>}
      </div>
    </section>
  </div>
}
