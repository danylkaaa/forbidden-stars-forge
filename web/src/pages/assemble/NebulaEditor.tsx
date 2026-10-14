import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { Magnifier } from '../../components/Magnifier'
import { removeNebulaPicture, saveNebula, uploadNebulaPicture, useNebula, useNebulaPicture } from './api'
import { BackImage } from './BackImage'
import { nebulaTemplateUrl, type NebulaSettings } from './backDecor'
import { useTemplate } from './library'
import { Card3DViewer } from './Card3DViewer'
import { CubeIcon } from '../../components/icons'
import type { Category } from '../cards/model'
import { useFactions } from '../factions/api'

// Edits a faction's nebula settings as a draft: saved explicitly, discarded freely.
function useNebulaDraft(factionId: number) {
  const saved = useNebula(factionId)
  const [draft, setDraft] = useState<NebulaSettings | null>(null)
  const value = draft ?? saved
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => saveNebula(factionId, value),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['nebulas'] }); setDraft(null) },
  })
  const change = (patch: Partial<NebulaSettings>) => { save.reset(); setDraft({ ...value, ...patch }) }
  const discard = () => { save.reset(); setDraft(null) }
  return { value, draft, save, change, discard }
}
type NebulaDraft = ReturnType<typeof useNebulaDraft>

function NebulaControls({ nebula, colorHint }: { nebula: NebulaDraft; colorHint: string }) {
  const { value, draft, save, change, discard } = nebula
  return <>
    <div className="flex flex-wrap items-center gap-3">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!value.color} onChange={e => change({ color: e.target.checked ? '#6a3a8a' : '' })} />Custom colour</label>
      <input type="color" aria-label="Nebula colour" disabled={!value.color} value={value.color || '#6a3a8a'} onChange={e => change({ color: e.target.value })} className="h-8 w-12 cursor-pointer" />
      {!value.color && <span className="text-xs text-ink/50">{colorHint}</span>}
    </div>
    <div className="flex items-end gap-2">
      <div className="w-40"><Field label="Seed">{id => <input id={id} type="number" min={0} max={2147483647} step={1} value={value.seed}
        onChange={e => change({ seed: Math.min(2147483647, Math.max(0, Math.floor(Number(e.target.value)) || 0)) })}
        className="w-full rounded border border-divider bg-transparent px-2 py-1 text-sm" />}</Field></div>
      <Button onClick={() => change({ seed: Math.floor(Math.random() * 1000000) })}>Randomize</Button>
    </div>
    <Field label={`Brightness (${Math.round(value.density * 100)}%)`}>{id => <input id={id} type="range" min="20" max="200" step="5" value={Math.round(value.density * 100)}
      className="w-full" onChange={e => change({ density: Number(e.target.value) / 100 })} />}</Field>
    <div className="flex gap-2">
      <Button disabled={!draft || save.isPending} onClick={() => save.mutate()}>Save nebula</Button>
      <Button disabled={!draft || save.isPending} onClick={discard}>Discard</Button>
    </div>
    {save.isSuccess && <p role="status" className="m-0 text-sm text-ink/60">Saved.</p>}
    {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
  </>
}


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

// A faction's nebula, tuned in one place and shown three ways: alone, on the
// combat back and on the event back. Saved per faction, so it stays when a
// back image is replaced. The switch is saved at once; the look with the button.
export function FactionNebulaSection({ factionId }: { factionId: number }) {
  const nebula = useNebulaDraft(factionId), factions = useFactions()
  const fallback = factions.data?.find(f => f.id === factionId)?.primary_color ?? ''
  const combatPicture = useNebulaPicture('combat'), eventPicture = useNebulaPicture('schema')
  const combatBack = useTemplate(factionId, 'combat', 'back').image, eventBack = useTemplate(factionId, 'schema', 'back').image
  const queryClient = useQueryClient()
  const toggle = useMutation({
    mutationFn: (on: boolean) => saveNebula(factionId, { ...nebula.value, as_template: on }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nebulas'] }),
  })
  const [plain, setPlain] = useState('')
  useEffect(() => {
    let cancelled = false
    nebulaTemplateUrl(nebula.value, fallback, { width: 612, height: 828 }, combatPicture).then(url => { if (!cancelled) setPlain(url) }).catch(() => {})
    return () => { cancelled = true }
  }, [nebula.value, fallback, combatPicture])
  // Without a chosen back image the nebula itself stands in for it.
  const back = (category: 'combat' | 'schema', image: typeof combatBack) => (image?.url ?? plain)
    ? <BackImage category={category} factionId={factionId} url={image?.url ?? plain} logoUrl={image?.logoUrl} scale={image?.logoScale} nebula={nebula.value} alt={`${category === 'combat' ? 'Combat' : 'Event'} back with nebula`} />
    : null
  return <details open className="rounded-md border border-divider p-3">
    <summary className="cursor-pointer font-display text-sm font-semibold text-accent">Faction nebula</summary>
    <section aria-label="Faction nebula" className="mt-3 flex flex-wrap gap-5">
      <div className="flex flex-wrap gap-3">
        <NebulaTile label="Nebula alone" factionId={factionId} spin={plain ? { front: plain, back: plain } : null}
          render={() => plain ? <img src={plain} alt="Nebula alone" className="block h-full w-full object-cover" /> : null} />
        <NebulaTile label="Combat card back" factionId={factionId} picture={{ category: 'combat', custom: !!combatPicture }} render={() => back('combat', combatBack)}
          spin={combatBack?.url ?? plain ? { front: plain, back: combatBack?.url ?? plain, logoUrl: combatBack?.logoUrl, logoScale: combatBack?.logoScale, category: 'combat' } : null} />
        <NebulaTile label="Event card back" factionId={factionId} picture={{ category: 'schema', custom: !!eventPicture }} render={() => back('schema', eventBack)}
          spin={eventBack?.url ?? plain ? { front: plain, back: eventBack?.url ?? plain, logoUrl: eventBack?.logoUrl, logoScale: eventBack?.logoScale, category: 'schema' } : null} />
      </div>
      <div className="min-w-56 flex-1 space-y-3">
        <NebulaControls nebula={nebula} colorHint="Following the back image's colour (the faction's colour for the nebula alone)" />
        <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={!!nebula.value.as_template} disabled={toggle.isPending} onChange={e => toggle.mutate(e.target.checked)} className="accent-[var(--color-accent)]" />Use nebula as template</label>
        <p className="m-0 text-xs text-ink/60">With this on, the faction's cards of every type without a chosen template are drawn on this nebula.</p>
        {toggle.isError && <p role="alert" className="m-0 text-sm text-danger">{toggle.error.message}</p>}
      </div>
    </section>
  </details>
}
