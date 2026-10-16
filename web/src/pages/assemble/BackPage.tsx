import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { BackImage } from './BackImage'
import { Field, selectClass } from '../../components/Field'
import { SearchableSelect } from '../../components/SearchableSelect'
import { useFactions } from '../factions/api'
import { useCardTypes } from '../card-types/api'
import { saveAssemblyTemplate, saveNebulaPlacement, useAssemblyTemplates, type AssemblyTemplate } from './api'
import { LIBRARY_TABS } from './model'
import { backTypeName, labLink, matchesCategory, useLibraryImages, useTemplate } from './library'
import { UPGRADE_BACK_KEY } from './upgradeBack'
import { UploadImageButton } from './UploadImageButton'
import { useAssembly } from './state'
import { useFactionLogos } from './logos'
import { BackLogoEditor } from './BackLogoEditor'
import { FactionNebulaSection } from './NebulaEditor'
import { Group } from '../../components/Group'
import { ReferenceOverlay } from './ReferenceOverlay'
import { ReferenceField } from './ReferenceCards'
import { useNebulaPlacementDraft } from './useNebulaPlacementDraft'

// One card type's back for one faction, on its own page: the back image, the
// size of the faction's banner on it (combat, upgrade) or of the logo (event),
// and the nebula. The banner itself is assembled in the faction's settings.
export default function BackPage() {
  const { tab } = useParams()
  const [params, setParams] = useSearchParams()
  const type = LIBRARY_TABS.find(t => t.slug === tab)
  const factions = useFactions(), types = useCardTypes(), templates = useAssemblyTemplates(), images = useLibraryImages()
  const stored = useAssembly(s => s.factionId)
  const factionParam = Number(params.get('faction'))
  const factionId = [factionParam, stored].find(id => factions.data?.some(f => f.id === id)) ?? factions.data?.[0]?.id ?? null
  useEffect(() => { if (factionId && factionId !== factionParam) setParams({ faction: String(factionId) }, { replace: true }) }, [factionId, factionParam, setParams])
  const factionLogo = useFactionLogos().data?.find(l => l.faction_id === factionId)?.url
  const [picking, setPicking] = useState(false)
  const [live, setLive] = useState<{ key: string; scale: number } | null>(null)
  const resolved = useTemplate(factionId, type?.category ?? 'combat', 'back')
  const queryClient = useQueryClient()
  const save = useMutation({ mutationFn: saveAssemblyTemplate, onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assembly-templates'] }) })
  const saveAll = useMutation({
    mutationFn: async () => {
      // Position and turn of the nebula (and, on an event back, the logo's size) are this faction's, for this card type.
      await saveNebulaPlacement(factionId ?? 0, category, { ...placement.value, ...(bannered ? {} : { logo_scale: logoScale }) })
    },
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['nebula-placements'] }); placement.discard(); setLive(null) },
  })
  const placement = useNebulaPlacementDraft(factionId ?? 0, type?.category ?? 'combat')
  const drag = useRef<{ x: number; y: number } | null>(null)
  if (!type) return <p className="text-danger">Unknown card type. <Link to="/assemble" className="text-accent underline">Back to the library</Link>.</p>
  const category = type.category, isUpgrade = category === 'upgrade'
  // Combat and event backs are one image; the upgrade back is the same texture for every faction.
  const imageCategory = category === 'schema' ? 'combat' : category
  const row = templates.data?.find(t => t.faction_id === factionId && t.category === imageCategory && t.side === 'back')
  const selected = isUpgrade ? UPGRADE_BACK_KEY : row?.image_key ?? ''
  const selectedImage = resolved.image
  const bannered = category !== 'schema'
  const logoKey = `${factionId}-${category}`, savedScale = resolved.image?.logoScale ?? 0.5
  const logoScale = live?.key === logoKey ? live.scale : savedScale
  const dirty = (!bannered && logoScale !== savedScale) || !!placement.draft
  const nebulaHere = !!selectedImage && !bannered
  const backType = types.data?.find(t => t.name === backTypeName(category))
  const options = images.data.filter(i => i.factionId === factionId && matchesCategory(types.data?.find(t => t.id === i.cardTypeId), imageCategory, 'back'))
  const choose = (t: AssemblyTemplate) => { save.reset(); save.mutate({ ...t, category: imageCategory }, { onSuccess: () => setPicking(false) }) }
  const back = `/assemble?faction=${factionId}&tab=${type.slug}`
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3">
      <Link to={back} className="text-sm text-accent no-underline hover:underline">← {type.label} cards</Link>
      <h1 className="m-0 font-display text-2xl text-accent-300">{type.label} card back</h1>
      {!bannered && <div className="ml-auto flex items-center gap-2">
        {saveAll.isSuccess && !dirty && <span role="status" className="text-sm text-success">Saved.</span>}
        <Button disabled={!dirty || saveAll.isPending} onClick={() => { saveAll.reset(); setLive(null); placement.discard() }}>Discard</Button>
        <Button variant="primary" disabled={!dirty || saveAll.isPending} onClick={() => saveAll.mutate()}>{saveAll.isPending ? 'Saving…' : 'Save'}</Button>
      </div>}
      <div className={`w-64 ${bannered ? 'ml-auto' : ''}`}><Field label="Faction">{id => <SearchableSelect id={id} className={selectClass} value={factionId ?? ''} onChange={e => { const next = Number(e.target.value) || null; useAssembly.getState().select({ factionId: next }); if (next) setParams({ faction: String(next) }, { replace: true }) }}>
        {factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </SearchableSelect>}</Field></div>
    </div>
    {factionId && <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,420px)_1fr]">
      <section aria-label="Back preview" className="lg:sticky lg:top-3">
        <div className={`relative touch-none select-none overflow-hidden rounded-lg shadow-[0_6px_18px_rgba(0,0,0,0.55)] ring-1 ring-divider ${nebulaHere ? 'cursor-grab active:cursor-grabbing' : ''}`}
          onPointerDown={e => { if (!nebulaHere || e.button !== 0) return; e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY } }}
          onPointerMove={e => {
            const d = drag.current, box = e.currentTarget.getBoundingClientRect()
            if (!d || !box.width) return
            placement.change({ x: placement.value.x + (e.clientX - d.x) / box.width, y: placement.value.y + (e.clientY - d.y) / box.height })
            drag.current = { x: e.clientX, y: e.clientY }
          }}
          onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          {selectedImage
            ? <BackImage category={category} factionId={factionId} url={selectedImage.url} logoUrl={factionLogo} scale={bannered ? resolved.image?.logoScale : logoScale} placement={placement.value} elementUrl={bannered ? resolved.image?.elementUrl : undefined} alt={`${type.label} back preview`} />
            : <div className="grid aspect-[816/1104] place-items-center bg-[radial-gradient(circle,#3a2a20,#120c09)] p-3 text-center text-sm text-ink/55">No back image chosen.</div>}
          {selectedImage && <ReferenceOverlay category={category} side="back" />}
        </div>
      </section>
      <div className="min-w-0 space-y-5">
        <Group title="Back image">
          {isUpgrade
            ? <p className="m-0 text-sm text-ink/70">The upgrade back uses one texture for every faction (<code>src/images/upgrades/upgrade-back.png</code>). It differs by the logo, the nebula in the frame and its colour.</p>
            : <>
              {category === 'schema' && <p className="m-0 text-sm text-ink/70">Event backs use the same image as the combat back. Changing it here changes both.</p>}
              <div className="flex flex-wrap items-center gap-3 text-sm text-ink/60">
                <Button variant="primary" onClick={() => setPicking(true)}>{selected ? 'Change back image' : 'Choose back image'}</Button>
                {selected && <Button disabled={save.isPending} onClick={() => choose({ faction_id: factionId, category, side: 'back', image_key: '' })}>Clear choice</Button>}
                {selectedImage && <Link to={labLink(selectedImage)} className="text-accent underline">Edit selected image in AI Lab</Link>}
              </div>
              {selectedImage && <p className="m-0 text-sm text-ink/70">{selectedImage.name}</p>}
              {backType && <p className="m-0 text-sm text-ink/60">Backs are generated in AI Lab with the “{backType.name}” card type. <Link to={`/faction-lab?faction=${factionId}&card_type=${backType.id}`} className="text-accent underline">Generate a back</Link>.</p>}
            </>}
          {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
          {saveAll.isError && <p role="alert" className="m-0 text-sm text-danger">{saveAll.error.message}</p>}
        </Group>
        {!bannered && <Group title="Logo size">
            {selectedImage
              ? <BackLogoEditor scale={logoScale} logoUrl={factionLogo} onScale={scale => { saveAll.reset(); setLive({ key: logoKey, scale }) }} />
              : <p className="m-0 text-sm text-ink/60">Choose a back image to set the logo size.</p>}
          </Group>}
        {bannered
          ? <Group title="Banner">
            <p className="m-0 text-sm text-ink/70">The banner on this back (the frame with its nebula, the logo and the ornament) is assembled in <Link to={`/assemble?faction=${factionId}&tab=config`} className="text-accent underline">this faction's settings</Link> and sized on the card template. Nothing about it is edited here.</p>
          </Group>
          : <Group title="Nebula">
            <FactionNebulaSection key={`${factionId}-${category}`} factionId={factionId} scope={category} placement={placement} />
          </Group>}
        <Group title="Reference">
          <ReferenceField category={category} side="back" />
        </Group>
      </div>
    </div>}
    {picking && factionId && <Dialog title={`Choose ${type.label.toLowerCase()} back`} width="min(1000px,100%)" onBackdropClick={() => setPicking(false)} titleExtra={<Button onClick={() => setPicking(false)}>Close</Button>}>
      <UploadImageButton factionId={factionId} cardTypeId={types.data?.find(t => matchesCategory(t, imageCategory, 'back'))?.id} disabled={save.isPending}
        onUploaded={key => choose({ faction_id: factionId, category, side: 'back', image_key: key })} />
      {!images.isPending && !options.length && <p className="m-0 text-sm text-ink/60">No {type.label.toLowerCase()} back images for this faction yet. {backType && <Link to={`/faction-lab?faction=${factionId}&card_type=${backType.id}`} className="text-accent underline">Generate one in AI Lab</Link>}.</p>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {options.map(image => <button key={image.key} type="button" aria-pressed={selected === image.key} aria-label={`Use ${image.name} as back`} disabled={save.isPending}
          onClick={() => choose({ faction_id: factionId, category, side: 'back', image_key: image.key })}
          className={`min-w-0 cursor-pointer overflow-hidden rounded-md border-2 bg-bg p-0 text-left ${selected === image.key ? 'border-accent ring-2 ring-accent/40' : 'border-divider hover:border-accent/60'}`}>
          <img loading="lazy" src={image.url} alt="" className="block aspect-[816/1104] w-full object-cover" />
          <span className="block truncate px-2 pt-1 text-xs" title={image.name}>{image.name}</span>
          <span className="block px-2 pb-1.5 text-[10px] text-ink/50">{image.source}</span>
        </button>)}
      </div>
    </Dialog>}
  </div>
}
