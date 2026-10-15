import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { inputClass } from '../../components/Field'
import { useCardTypes } from '../card-types/api'
import { useFactions } from '../factions/api'
import { labLink, useLibraryImages, type LibraryImage } from './library'

// `upload` lets the user supply their own image instead (its key is 'upload').
type Upload = { url?: string; pending?: boolean; onPick: (file: File) => void }
type PickerProps = { selectedKey: string; onSelect: (key: string) => void; factionId: number | null; title: string; preferredType?: string; upload?: Upload }

// Choose a generated image (Faction Lab) in a popup: filtered to the
// faction by default (untick to see every faction), searchable by name, type or
// faction. The selected image can be opened in Faction Lab from the field.
export function ImagePickerDialog({ selectedKey, onSelect, factionId, title, preferredType, upload, onClose }: PickerProps & { onClose: () => void }) {
  const images = useLibraryImages(), factions = useFactions(), types = useCardTypes()
  const [mine, setMine] = useState(factionId !== null)
  const [query, setQuery] = useState('')
  const factionName = (id: number) => factions.data?.find(f => f.id === id)?.name ?? `Faction ${id}`
  const typeName = (id: number) => types.data?.find(t => t.id === id)?.name ?? ''
  const q = query.trim().toLowerCase()
  const shown = useMemo(() => images.data
    .filter(i => (!mine || i.factionId === factionId) && (!q || [i.name, i.source, typeName(i.cardTypeId), factionName(i.factionId)].some(t => t.toLowerCase().includes(q))))
    .sort((a, b) => Number(typeName(b.cardTypeId) === preferredType) - Number(typeName(a.cardTypeId) === preferredType)),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [images.data, mine, factionId, q, preferredType, types.data, factions.data])
  return <Dialog title={title} width="min(1000px,100%)" onBackdropClick={onClose} titleExtra={<Button onClick={onClose}>Close</Button>}>
    <div className="flex flex-wrap items-center gap-3">
      <input type="search" aria-label="Search images" autoFocus placeholder="Search by name, type or faction…" value={query} onChange={e => setQuery(e.target.value)} className={`${inputClass} max-w-sm`} />
      {factionId !== null && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} className="accent-[var(--color-accent)]" />Only {factionName(factionId)}</label>}
      <div className="ml-auto flex items-center gap-2">
        {upload && <label className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-3.5 py-2 text-xs font-semibold uppercase tracking-wider hover:border-accent/60 ${upload.pending ? 'pointer-events-none opacity-45' : ''}`}>{upload.pending ? 'Uploading…' : 'Upload image'}
          <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label="Upload an image" disabled={upload.pending} onChange={e => { const f = e.target.files?.[0]; if (f) { upload.onPick(f); onSelect('upload') } e.target.value = '' }} /></label>}
        <Button disabled={!selectedKey} onClick={() => onSelect('')}>Use no image</Button>
      </div>
    </div>
    {images.isPending && <p role="status" className="m-0 text-sm text-ink/60">Loading images…</p>}
    {!images.isPending && !shown.length && <p className="m-0 text-sm text-ink/60">No images match.{mine ? ' Untick the faction filter to see other factions’ images.' : ''}</p>}
    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
      {shown.map(i => <button key={i.key} type="button" aria-label={`Use ${i.name}`} aria-pressed={i.key === selectedKey} onClick={() => onSelect(i.key)}
        className={`flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-md border-2 bg-bg p-0 text-left ${i.key === selectedKey ? 'border-accent ring-2 ring-accent/40' : 'border-divider hover:border-accent/60'}`}>
        <img src={i.url} alt="" loading="lazy" className="aspect-[3/2] w-full bg-black/30 object-contain" />
        <span className="block truncate px-2 pt-1 text-xs" title={i.name}>{i.name}</span>
        <span className="block px-2 pb-1.5 text-[10px] text-ink/50">{[typeName(i.cardTypeId) || i.source, !mine && factionName(i.factionId)].filter(Boolean).join(' · ')}</span>
      </button>)}
    </div>
  </Dialog>
}

export type ImagePickerImage = LibraryImage
// A field showing the chosen generated image, with a button that opens the picker.
export function ImagePickerField({ label, ...props }: PickerProps & { label: string }) {
  const [open, setOpen] = useState(false)
  const images = useLibraryImages()
  const uploaded = props.selectedKey === 'upload'
  const selected = images.data.find(i => i.key === props.selectedKey)
  const thumb = uploaded ? props.upload?.url : selected?.url
  return <div className="space-y-1">
    <span className="block text-xs text-ink/70">{label}</span>
    <div className="flex items-center gap-3 rounded-md border border-divider bg-bg p-2">
      <button type="button" aria-label={`Choose ${label.toLowerCase()}`} onClick={() => setOpen(true)}
        className="grid h-16 w-24 shrink-0 cursor-pointer place-items-center overflow-hidden rounded border border-divider bg-black/30 p-0 text-xl text-ink/50 hover:border-accent">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-contain" /> : '+'}
      </button>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="m-0 truncate text-sm" title={selected?.name}>{uploaded ? 'Uploaded image' : selected?.name ?? (props.selectedKey ? 'The chosen image no longer exists' : 'No image chosen')}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <button type="button" onClick={() => setOpen(true)} className="cursor-pointer border-0 bg-transparent p-0 text-accent hover:underline">{selected || uploaded ? 'Change' : 'Choose'}</button>
          {props.selectedKey && <button type="button" onClick={() => props.onSelect('')} className="cursor-pointer border-0 bg-transparent p-0 text-accent hover:underline">Clear</button>}
          {selected && <Link to={labLink(selected)} className="text-accent no-underline hover:underline">Edit in Faction Lab</Link>}
        </div>
      </div>
    </div>
    {open && <ImagePickerDialog {...props} onSelect={key => { props.onSelect(key); setOpen(false) }} onClose={() => setOpen(false)} />}
  </div>
}
