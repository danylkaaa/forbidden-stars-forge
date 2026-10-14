import { useImageSelection } from '../../lib/useImageSelection'
import { SearchableSelect } from '../../components/SearchableSelect'
import { useState } from 'react'
import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/Button'
import { Field, selectClass } from '../../components/Field'
import { useFactions } from '../factions/api'
import { useCardTypes } from '../card-types/api'
import type { Category } from '../cards/model'
import { saveAssemblyTemplate, useAssemblyTemplates, type AssemblyTemplate, type Side } from './api'
import { ART_WINDOW, DEMO_COMBAT, LIBRARY_TABS, type CombatCard } from './model'
import { useDemoArtwork } from './demoArtwork'
import { useAssembledPreview, usePreviewCard } from './previewCard'
import { backTypeName, labLink, matchesCategory, useLibraryImages, type LibraryImage } from './library'
import { CardCanvas } from './CardCanvas'
import { CategoryTabs } from './CategoryTabs'
import { FactionNebulaSection } from './NebulaEditor'
import { BackLogoEditor } from './BackLogoEditor'
import { ImageSelectionCheckbox, ImageSelectionControls } from '../../components/ImageSelection'
import { DeleteImageButton } from '../../components/DeleteImageButton'

function DemoCombat({ image, card }: { image: LibraryImage; card: CombatCard }) {
  const { result, error } = useAssembledPreview(image.url, image.factionId, card)
  if (result) return <CardCanvas result={result} aria-label={`${card.name} on ${image.name}`} className="block h-auto w-full" />
  return <div className="grid aspect-[816/1104] place-items-center p-2 text-center text-xs text-ink/50">{error || 'Rendering…'}</div>
}

// Events and upgrades are not rendered yet: show the frame with demo text.
export function DemoText({ image, title, text, demo = false }: { image?: LibraryImage; title: string; text: string; demo?: boolean }) {
  const artwork = useDemoArtwork()
  return <div className="relative aspect-[3/4] w-full overflow-hidden bg-black/40">
    {demo && <img src={artwork} alt="Demo artwork" className="absolute object-cover"
      style={{ left: `${ART_WINDOW.x}%`, top: `${ART_WINDOW.y}%`, width: `${ART_WINDOW.width}%`, height: `${ART_WINDOW.height}%` }} />}
    {image && <img loading="lazy" src={image.url} alt="" className="absolute inset-0 h-full w-full object-cover" />}
    <div className="absolute inset-x-[8%] top-[5%] truncate rounded bg-black/55 px-2 py-1 text-center font-display text-xs uppercase tracking-wider text-accent-300">{title}</div>
    <p className="absolute inset-x-[8%] bottom-[6%] line-clamp-4 rounded bg-[#e8dcc0]/90 p-2 text-[11px] leading-snug text-[#141510]">{text}</p>
  </div>
}

export function TemplateSettingsDialog({ initialFactionId, initialCategory, initialSide = 'front', onClose }: { initialFactionId: number | null; initialCategory: Category; initialSide?: Side; onClose: () => void }) {
  const factions = useFactions(), types = useCardTypes(), templates = useAssemblyTemplates(), images = useLibraryImages()
  const [factionId, setFactionId] = useState(initialFactionId ?? factions.data?.[0]?.id ?? null)
  const [category, setCategory] = useState<Category>(initialCategory)
  const [side, setSide] = useState<Side>(initialSide)
  // Preview setup: the demo card at a level, or one of the faction's cards.
  const [previewCardId, setPreviewCardId] = useState(0)
  const [previewLevel, setPreviewLevel] = useState(DEMO_COMBAT.level)
  const [favoritesOnly, setFavoritesOnly] = useState(false)
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: saveAssemblyTemplate,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assembly-templates'] }),
  })
  const sideOf = (t: AssemblyTemplate) => t.side ?? 'front'
  const selectedTemplate = templates.data?.find(t => t.faction_id === factionId && t.category === category && sideOf(t) === side)
  const selected = selectedTemplate?.image_key ?? ''
  const { card: previewCard, combat: factionCards } = usePreviewCard(factionId ?? 0, previewCardId, previewLevel)
  const options = images.data
    .filter(i => i.factionId === factionId && (!favoritesOnly || i.favorite))
    .sort((a, b) => Number(matchesCategory(types.data?.find(t => t.id === b.cardTypeId), category, side)) - Number(matchesCategory(types.data?.find(t => t.id === a.cardTypeId), category, side)))
  const imageSelection = useImageSelection(options, JSON.stringify([factionId, category, side, favoritesOnly]))
  const selectedImage = images.data.find(i => i.key === selected)
  const choose = (t: AssemblyTemplate) => { save.reset(); save.mutate(t) }
  const counts = Object.fromEntries(LIBRARY_TABS.map(t => [t.category, templates.data?.some(x => x.faction_id === factionId && x.category === t.category && sideOf(x) === side) ? '✓' : '—']))
  const backType = types.data?.find(t => t.name === backTypeName(category))
  return <Dialog title="Card templates" width="min(1100px,100%)" onBackdropClick={onClose} titleExtra={<Button onClick={onClose}>Close</Button>}>
    <p className="m-0 text-sm text-ink/60">Choose the generated image every card of a faction and card type is assembled on (front), and the back all of them share.</p>
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-64"><Field label="Faction">{id => <SearchableSelect id={id} className={selectClass} value={factionId ?? ''} onChange={e => setFactionId(Number(e.target.value) || null)}>
        {factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </SearchableSelect>}</Field></div>
      {selectedImage && <Link to={labLink(selectedImage)} className="text-sm text-accent underline">Edit selected image in Faction Lab</Link>}
      {selected && <Button disabled={save.isPending || !factionId} onClick={() => factionId && choose({ faction_id: factionId, category, side, image_key: '' })}>Clear choice</Button>}
      <div role="tablist" aria-label="Card side" className="ml-auto inline-flex overflow-hidden rounded-md border border-divider text-sm">
        {(['front', 'back'] as const).map(value => <button key={value} type="button" role="tab" aria-selected={side === value} onClick={() => { save.reset(); setSide(value) }}
          className={`cursor-pointer border-0 px-3 py-1.5 capitalize ${side === value ? 'bg-accent/15 text-accent' : 'bg-transparent text-ink/60 hover:text-ink'}`}>{value}</button>)}
      </div>
    </div>
    {factionId && <FactionNebulaSection key={factionId} factionId={factionId} />}
    <CategoryTabs value={category} onChange={setCategory} badges={counts} />
    {side === 'back' && selectedTemplate && selectedImage && <BackLogoEditor key={`${factionId}-${category}-${selected}-${selectedTemplate.logo_scale}`} template={selectedTemplate} imageUrl={selectedImage.url} />}
    {side === 'back' && !selectedImage && <p className="m-0 text-sm text-ink/60">Choose a back image below to upload a centered logo.</p>}
    <div className="flex flex-wrap items-end gap-3">
      {side === 'front' && category === 'combat' && <>
        <div className="w-64"><Field label="Preview with card">{id => <SearchableSelect id={id} className={selectClass} value={previewCard.id} onChange={e => setPreviewCardId(Number(e.target.value))}>
          <option value={0}>Demo card</option>
          {factionCards.map(c => <option key={c.id} value={c.id}>{c.name} (level {c.level})</option>)}
        </SearchableSelect>}</Field></div>
        <div className="w-28"><Field label="Demo level">{id => <SearchableSelect id={id} className={selectClass} value={previewLevel} disabled={!!previewCardId} onChange={e => setPreviewLevel(Number(e.target.value))}>
          {[0, 1, 2, 3].map(l => <option key={l} value={l}>{l}</option>)}
        </SearchableSelect>}</Field></div>
      </>}
      <label className="flex min-h-9 items-center gap-2 text-sm text-ink/80"><input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} />Favourites only</label>
    </div>
    {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
    {templates.isError && <p role="alert" className="m-0 text-sm text-danger">{templates.error.message}</p>}
    {side === 'back' && factionId && backType && <p className="m-0 text-sm text-ink/60">Backs are generated in Faction Lab with the “{backType.name}” card type (its prompt is prefilled). <Link to={`/faction-lab?faction=${factionId}&card_type=${backType.id}`} className="text-accent underline">Generate a back</Link>.</p>}
    {!images.isPending && !options.length && favoritesOnly && <p className="m-0 text-sm text-ink/60">No favourite images for this faction. Star images in Faction Lab or Generations, or turn off the filter.</p>}
    {!images.isPending && !options.length && !favoritesOnly && <p className="m-0 text-sm text-ink/60">No finished images for this faction yet. <Link to={`/faction-lab?faction=${factionId}`} className="text-accent underline">Generate one in Faction Lab</Link>.</p>}
    <ImageSelectionControls selection={imageSelection} images={options} disabled={save.isPending} />
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {factionId && options.map(image => {
        const type = types.data?.find(t => t.id === image.cardTypeId)
        return <div key={image.key} className="group/image relative flex min-w-0 flex-col overflow-hidden rounded-md border border-divider bg-bg">
          <button type="button" aria-pressed={selected === image.key} aria-label={`Use ${image.name}${side === 'back' ? ' as back' : ''}`} disabled={save.isPending || imageSelection.remove.isPending}
            onClick={() => choose({ faction_id: factionId, category, side, image_key: image.key })}
            className={`block w-full overflow-hidden rounded-md border-2 bg-bg p-0 text-left ${selected === image.key ? 'border-accent ring-2 ring-accent/40' : 'border-divider hover:border-accent/60'}`}>
            {side === 'back'
              ? <img loading="lazy" src={image.url} alt="" className="block aspect-[816/1104] w-full object-cover" />
              : category === 'combat'
              ? <DemoCombat image={image} card={previewCard} />
              : <DemoText demo image={image} title={category === 'schema' ? 'Demo event' : 'Demo upgrade'} text="Choose an area you control. Gain 1 (B) and 1 [S] there." />}
            <span className="block truncate px-2 pt-1 text-xs" title={image.name}>{image.name}</span>
            <span className="block px-2 pb-1.5 text-[10px] text-ink/50">{image.source} · {type?.name ?? 'Unknown type'}{matchesCategory(type, category, side) ? '' : ' · other type'}</span>
          </button>
          <ImageSelectionCheckbox name={image.name} selected={imageSelection.selected.has(image.key)} anySelected={imageSelection.chosen.length > 0}
            disabled={save.isPending || imageSelection.remove.isPending} onToggle={() => imageSelection.toggle(image.key)} />
          <DeleteImageButton overlay target={image.ref} name={image.name} disabled={save.isPending || imageSelection.remove.isPending} />
        </div>
      })}
    </div>
  </Dialog>
}
