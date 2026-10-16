import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { inputClass, selectClass } from '../../components/Field'
import { useCardTypes } from '../card-types/api'
import { useFactions } from '../factions/api'
import { useLibraryImages } from './library'
import { UploadImageButton } from './UploadImageButton'

// Picks the image for an element from the whole library: any faction's, of any image type. It starts on this
// faction's images of the element type; the filters widen or narrow it. `aspect` is the shape of the preview tiles.
export function ElementPicker({ title, factionId, elementTypeName, selectedKey, aspect, onSelect, onClose }: {
  title: string; factionId: number; elementTypeName: string; selectedKey: string; aspect: string
  onSelect: (key: string) => void; onClose: () => void
}) {
  const images = useLibraryImages(), types = useCardTypes(), factions = useFactions()
  const elementType = types.data?.find(t => t.name === elementTypeName)
  const [faction, setFaction] = useState<string>(String(factionId)) // a faction id or 'all'
  const [type, setType] = useState<string>('element') // 'element' (this element's type), 'all' or a type id
  const [query, setQuery] = useState('')
  const [favorites, setFavorites] = useState(false)
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => images.data.filter(i =>
    (faction === 'all' || i.factionId === Number(faction))
    && (type === 'all' || i.cardTypeId === (type === 'element' ? elementType?.id : Number(type)))
    && (!favorites || i.favorite)
    && (!q || i.name.toLowerCase().includes(q))), [images.data, faction, type, favorites, q, elementType?.id])
  const factionName = (id: number) => factions.data?.find(f => f.id === id)?.name ?? `Faction ${id}`
  const typeName = (id: number) => types.data?.find(t => t.id === id)?.name ?? `Type ${id}`
  const filtered = faction !== String(factionId) || type !== 'element' || favorites || q !== ''
  return <Dialog title={title} width="min(1000px,100%)" onBackdropClick={onClose} titleExtra={<Button onClick={onClose}>Close</Button>}>
    <div className="flex flex-wrap items-center gap-2">
      <UploadImageButton factionId={factionId} cardTypeId={elementType?.id} onUploaded={onSelect} />
      <select aria-label="Faction" value={faction} onChange={e => setFaction(e.target.value)} className={`${selectClass} w-auto`}>
        <option value="all">All factions</option>
        {[...(factions.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </select>
      <select aria-label="Image type" value={type} onChange={e => setType(e.target.value)} className={`${selectClass} w-auto`}>
        <option value="element">{elementTypeName} images</option>
        <option value="all">All image types</option>
        {(types.data ?? []).filter(t => t.id !== elementType?.id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <input type="search" aria-label="Search images" placeholder="Search by name…" value={query} onChange={e => setQuery(e.target.value)} className={`${inputClass} w-48`} />
      <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" checked={favorites} onChange={e => setFavorites(e.target.checked)} className="accent-[var(--color-accent)]" />Favorites</label>
      {filtered && <button type="button" onClick={() => { setFaction(String(factionId)); setType('element'); setQuery(''); setFavorites(false) }} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-accent underline">Reset filters</button>}
      <span className="ml-auto text-xs text-ink/50">{shown.length} image{shown.length === 1 ? '' : 's'}</span>
    </div>
    {!images.isPending && !shown.length && <p className="m-0 text-sm text-ink/60">
      Nothing matches. {elementType && <Link to={`/faction-lab?faction=${factionId}&card_type=${elementType.id}`} className="text-accent underline">Generate one in AI Lab</Link>} (the “{elementTypeName}” image type), widen the filters or upload your own.</p>}
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {shown.map(image => <button key={image.key} type="button" aria-pressed={selectedKey === image.key} aria-label={`Use ${image.name} as element`}
        onClick={() => onSelect(image.key)}
        className={`min-w-0 cursor-pointer overflow-hidden rounded-md border-2 bg-bg p-0 text-left ${selectedKey === image.key ? 'border-accent ring-2 ring-accent/40' : 'border-divider hover:border-accent/60'}`}>
        <img loading="lazy" src={image.url} alt="" style={{ aspectRatio: aspect }} className="block w-full bg-[#00ff41]/20 object-contain" />
        <span className="block truncate px-2 pt-1 text-xs" title={image.name}>{image.name}</span>
        <span className="block truncate px-2 pb-1.5 text-[10px] text-ink/50">{factionName(image.factionId)} · {typeName(image.cardTypeId)}</span>
      </button>)}
    </div>
  </Dialog>
}
