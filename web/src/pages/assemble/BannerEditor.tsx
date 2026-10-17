import { IMAGE_ACCEPT } from '../../lib/imageUpload'
import { ColorInput } from '../../components/ColorInput'
import { useEffect, useId, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Group } from '../../components/Group'
import { DEFAULT_BANNER, removeNebulaPicture, saveFactionBanner, saveNebula, useNebula, uploadNebulaPicture, useFactionBanner, useFactionColor, useNebulaPicture, type BannerSettings } from './api'
import { useNebulaPlacementDraft } from './useNebulaPlacementDraft'
import { useNebulaDraft } from './useNebulaDraft'
import { renderBanner } from './backDecor'
import { ElementPicker } from './ElementPicker'
import { useLibraryImages } from './library'
import { useFactionLogos } from './logos'

const SIZE = { width: 612, height: 828 }

// A short slider: its name, the slider, and its current value (with what it is a share of, when it is one).
export function Slider({ label, hint, value, min, max, step = 1, shown, onChange }: { label: string; hint?: string; value: number; min: number; max: number; step?: number; shown: string; onChange: (value: number) => void }) {
  const id = useId()
  return <div className="grid grid-cols-[5rem_minmax(0,14rem)_auto] items-center gap-x-3 text-sm">
    <label htmlFor={id} className="text-ink/80">{label}</label>
    <input id={id} type="range" min={min} max={max} step={step} value={value} className="w-full accent-[var(--color-accent)]" onChange={e => onChange(Number(e.target.value))} />
    <span className="whitespace-nowrap text-xs text-ink/60"><span className="font-mono text-ink/80">{shown}</span>{hint ? ` ${hint}` : ''}</span>
  </div>
}

// Assembles a faction's banner: the logo's size inside the frame, and the ornament over the
// frame's edges (chosen or uploaded; its place and size). Combat and upgrade backs draw the
// assembled banner at the size set on their card template, so everything here scales with it.
export function BannerEditor({ factionId }: { factionId: number }) {
  const saved = useFactionBanner(factionId)
  const [draft, setDraft] = useState<BannerSettings | null>(null)
  const banner = draft ?? saved
  const change = (patch: Partial<BannerSettings>) => { save.reset(); setDraft({ ...banner, ...patch }) }
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async () => {
      await saveFactionBanner(factionId, banner)
      if (placement.draft) await placement.save.mutateAsync()
      if (nebulaDraft.draft) await nebulaDraft.save.mutateAsync()
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['faction-banners'] }); setDraft(null) },
  })
  const logoUrl = useFactionLogos().data?.find(l => l.faction_id === factionId)?.url
  // One nebula for the banner on combat and upgrade backs: the colour and brightness are set below it in the nebula
  // section, its picture is shared by every faction, and its position and turn are this faction's.
  const nebulaDraft = useNebulaDraft(factionId), factionColor = useFactionColor(factionId)
  const picture = useNebulaPicture('combat'), placement = useNebulaPlacementDraft(factionId, 'combat')
  // Whether cards with no chosen template are drawn on the nebula; saved at once.
  const savedNebula = useNebula(factionId)
  const asTemplate = useMutation({
    mutationFn: (on: boolean) => saveNebula(factionId, { ...savedNebula, as_template: on }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nebulas'] }),
  })
  const [moves, setMoves] = useState<'element' | 'nebula'>('element')
  const picturing = useMutation({
    mutationFn: (file: File | null) => file ? uploadNebulaPicture('combat', file) : removeNebulaPicture('combat'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['nebula-pictures'] }),
  })
  const images = useLibraryImages()
  const element = banner.element_key ? images.data.find(i => i.key === banner.element_key) : undefined
  const [picking, setPicking] = useState(false)
  // The banner as it will look, redrawn as it is edited.
  const [preview, setPreview] = useState('')
  useEffect(() => {
    let cancelled = false
    renderBanner(SIZE, { ...nebulaDraft.value, color: nebulaDraft.value.color || factionColor }, picture, placement.value, { logoUrl, logoScale: banner.logo_scale, elementUrl: element?.url, elementPlace: { x: banner.element_x, y: banner.element_y, scale: banner.element_scale } })
      .then(canvas => { if (!cancelled) setPreview(canvas.toDataURL('image/jpeg', 0.9)) }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nebulaDraft.value, factionColor, picture, placement.value.x, placement.value.y, placement.value.rotation, logoUrl, banner.logo_scale, element?.url, banner.element_x, banner.element_y, banner.element_scale])
  const drag = useRef<{ x: number; y: number } | null>(null)
  const dirty = (!!draft && JSON.stringify(draft) !== JSON.stringify(saved)) || !!placement.draft || !!nebulaDraft.draft
  const moveElement = !!element && moves === 'element'
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return <div className="flex flex-wrap gap-5 pt-3">
    <div className="w-full shrink-0 sm:w-[min(460px,calc((100vh_-_150px)*0.739))]">
      <div className={`relative touch-none select-none overflow-hidden rounded-lg ring-1 ring-divider cursor-grab active:cursor-grabbing`} aria-label="Banner preview"
        onPointerDown={e => { if (e.button !== 0) return; e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY } }}
        onPointerMove={e => {
          const d = drag.current, box = e.currentTarget.getBoundingClientRect()
          if (!d || !box.width) return
          if (!moveElement) { placement.change({ x: placement.value.x + (e.clientX - d.x) / box.width, y: placement.value.y + (e.clientY - d.y) / box.height }); drag.current = { x: e.clientX, y: e.clientY }; return }
          // Offsets are shares of the frame, which is about as wide as the card and 0.6 of its height.
          change({ element_x: Math.round(Math.max(-1, Math.min(1, banner.element_x + (e.clientX - d.x) / box.width)) * 1000) / 1000, element_y: Math.round(Math.max(-1, Math.min(1, banner.element_y + (e.clientY - d.y) / box.height / 0.6)) * 1000) / 1000 })
          drag.current = { x: e.clientX, y: e.clientY }
        }}
        onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
        {preview ? <img src={preview} alt="Banner" draggable={false} className="block aspect-[612/828] w-full object-cover" /> : <div className="aspect-[612/828] w-full bg-black/30" />}
      </div>
    </div>
    <div className="min-w-64 max-w-xl flex-1 space-y-4">
      <Group title="Logo">
        <Slider label="Size" hint="of the banner's width" value={Math.round(banner.logo_scale * 100)} min={5} max={100} shown={pct(banner.logo_scale)}
          onChange={v => change({ logo_scale: v / 100 })} />
        {!logoUrl && <p className="m-0 text-xs text-ink/60">This faction has no logo yet; upload it above.</p>}
      </Group>

      <Group title="Element">
        <div className="flex flex-wrap items-center gap-3">
          {element && <img src={element.url} alt="Banner element" className="h-12 max-w-40 rounded border border-divider bg-black/30 object-contain" />}
          <Button onClick={() => setPicking(true)}>{element ? 'Change element' : 'Choose element'}</Button>
          {element && <Button onClick={() => change({ element_key: '' })}>Remove element</Button>}
        </div>
        {element ? <>
          <p className="m-0 text-xs text-ink/60">Drag the preview to move the element, or use the sliders.</p>
          <Slider label="Across" hint="of the banner" value={Math.round(banner.element_x * 100)} min={-50} max={50} shown={pct(banner.element_x)}
            onChange={v => change({ element_x: v / 100 })} />
          <Slider label="Down" hint="of the banner" value={Math.round(banner.element_y * 100)} min={-30} max={30} shown={pct(banner.element_y)}
            onChange={v => change({ element_y: v / 100 })} />
          <Slider label="Size" hint="of the banner's width" value={Math.round(banner.element_scale * 100)} min={10} max={100} shown={pct(banner.element_scale)}
            onChange={v => change({ element_scale: v / 100 })} />
          <div><Button onClick={() => change({ element_x: DEFAULT_BANNER.element_x, element_y: DEFAULT_BANNER.element_y, element_scale: DEFAULT_BANNER.element_scale })}>Reset element position</Button></div>
        </> : <p className="m-0 text-xs text-ink/60">No element chosen.</p>}
      </Group>

      <Group title="Nebula">
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">Colour
            <ColorInput aria-label="Nebula colour" value={nebulaDraft.value.color || factionColor || '#6a3a8a'} onChange={color => nebulaDraft.change({ color })} className="h-8 w-12 cursor-pointer" /></label>
          {nebulaDraft.value.color ? <Button onClick={() => nebulaDraft.change({ color: '' })}>Use faction colour</Button> : <span className="text-xs text-ink/50">The faction's colour</span>}
        </div>
        <Slider label="Brightness" value={Math.round(nebulaDraft.value.density * 100)} min={20} max={200} step={5} shown={`${Math.round(nebulaDraft.value.density * 100)}%`}
          onChange={v => nebulaDraft.change({ density: v / 100 })} />
        <Slider label="Rotation" value={Math.round(placement.value.rotation)} min={-180} max={180} shown={`${Math.round(placement.value.rotation)}°`}
          onChange={v => placement.change({ rotation: v })} />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
          {element && <div role="tablist" aria-label="Drag moves" className="inline-flex overflow-hidden rounded-md border border-divider">
            {([['Element', 'element'], ['Nebula', 'nebula']] as const).map(([name, value]) => <button key={value} type="button" role="tab" aria-selected={moves === value} onClick={() => setMoves(value)}
              className={`cursor-pointer border-0 px-3 py-1 ${moves === value ? 'bg-accent/15 text-accent' : 'bg-transparent text-ink/60 hover:text-ink'}`}>{name}</button>)}
          </div>}
          <span className="text-xs text-ink/60">{element ? 'Choose what dragging the preview moves.' : 'Drag the preview to move the nebula.'}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Button onClick={placement.randomize}>Randomize nebula</Button>
          <label className={`cursor-pointer text-accent underline ${picturing.isPending ? 'pointer-events-none opacity-45' : ''}`}>{picture ? 'Replace nebula picture' : 'Upload nebula picture'}
            <input type="file" accept={IMAGE_ACCEPT} aria-label="Upload nebula picture" className="sr-only" disabled={picturing.isPending}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) picturing.mutate(f) }} /></label>
          {picture && <button type="button" disabled={picturing.isPending} onClick={() => picturing.mutate(null)} className="cursor-pointer border-0 bg-transparent p-0 text-ink/60 underline">Use the default picture</button>}
        </div>
        <p className="m-0 text-xs text-ink/50">The picture is shared by every faction (it is recoloured for each); its position and rotation are this faction's.</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!savedNebula.as_template} disabled={asTemplate.isPending} onChange={e => asTemplate.mutate(e.target.checked)} className="accent-[var(--color-accent)]" />Use the nebula as the card template where none is chosen</label>
        {asTemplate.isError && <p role="alert" className="m-0 text-sm text-danger">{asTemplate.error.message}</p>}
        {picturing.isError && <p role="alert" className="m-0 text-sm text-danger">{picturing.error.message}</p>}
      </Group>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save banner'}</Button>
        <Button disabled={!dirty || save.isPending} onClick={() => { save.reset(); setDraft(null); placement.discard(); nebulaDraft.discard() }}>Discard</Button>
      </div>
      {save.isSuccess && !draft && <p role="status" className="m-0 text-sm text-success">Banner saved.</p>}
      {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
      <p className="m-0 text-xs text-ink/60">The banner is the frame with this faction's nebula, the logo inside it and the element over its edges (shown at the top and, turned over, at the bottom). It is used on the combat and upgrade card backs, at the banner size of each card template, with the logo and element scaling along.</p>
    </div>
    {picking && <ElementPicker title="Choose banner element" factionId={factionId} elementTypeName="back element" selectedKey={banner.element_key} aspect="816 / 300" onSelect={key => { change({ element_key: key }); setPicking(false) }} onClose={() => setPicking(false)} />}
  </div>
}
