import { useEffect, useRef, useState } from 'react'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { useAssemblyTemplates } from '../assemble/api'
import type { Category } from '../cards/model'

export type FrontImageOption = {
  key: string
  libraryKey: string
  name: string
  url: string
  source: 'Lab'
  ref: { kind: 'generation'; id: number }
}

export function FrontImagePicker({ options, selectedKey, onSelect, factionId, frontTypeName, loading, error }: {
  options: FrontImageOption[]
  selectedKey: string
  onSelect: (key: string) => void
  factionId: number | null
  frontTypeName: string
  loading: boolean
  error: boolean
}) {
  const [open, setOpen] = useState(false)
  const templates = useAssemblyTemplates()
  const trigger = useRef<HTMLButtonElement>(null)
  // A card back serves several front types ("combat or events"): any of their assigned fronts counts.
  const categories = frontTypeName.split(' or ').map((n): Category | undefined => n === 'events' ? 'schema' : n === 'combat' || n === 'upgrade' ? n : undefined)
  const assignedKeys = templates.data?.filter((t) => t.faction_id === factionId && categories.includes(t.category) && (t.side ?? 'front') === 'front').map((t) => t.image_key) ?? []
  const sorted = [...options].sort((a, b) => Number(assignedKeys.includes(b.libraryKey)) - Number(assignedKeys.includes(a.libraryKey)))
  const selected = options.find((image) => image.key === selectedKey)
  const close = () => { setOpen(false); trigger.current?.focus() }

  return <div className="flex flex-col gap-2">
    <span className="text-xs text-ink/70">Front image (optional)</span>
    <div className="flex items-center gap-3 rounded-md border border-divider bg-bg p-2">
      <button ref={trigger} type="button" aria-label={selected ? 'Change front image' : 'Choose front image'}
        aria-haspopup="dialog" onClick={() => setOpen(true)}
        className="h-24 w-18 shrink-0 cursor-pointer overflow-hidden rounded border border-divider bg-transparent p-0 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        {selected ? <img src={selected.url} alt="Selected front reference" className="h-full w-full object-contain" /> :
          <span className="flex h-full items-center justify-center border border-dashed border-divider text-2xl text-ink/50" aria-hidden="true">+</span>}
      </button>
      <div className="min-w-0 flex-1">
        <p className="m-0 break-words text-xs text-ink">{selected?.name ?? 'No front reference'}</p>
        {selected ? <button type="button" onClick={() => onSelect('')} className="mt-2 cursor-pointer border-0 bg-transparent p-0 text-xs text-accent">Remove front reference</button> :
          <p className="mt-2 mb-0 text-xs text-ink/55">Click the image placeholder to choose a front.</p>}
      </div>
    </div>
    {open && <FrontImageDialog options={sorted} selectedKey={selectedKey} assignedKeys={assignedKeys}
      loading={loading || templates.isPending} imageError={error} templateError={!!templates.error}
      onSelect={(key) => { onSelect(key); close() }} onClose={close} />}
  </div>
}

function FrontImageDialog({ options, selectedKey, assignedKeys, loading, imageError, templateError, onSelect, onClose }: {
  options: FrontImageOption[]
  selectedKey: string
  assignedKeys: string[]
  loading: boolean
  imageError: boolean
  templateError: boolean
  onSelect: (key: string) => void
  onClose: () => void
}) {
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => { content.current?.querySelector<HTMLButtonElement>('button')?.focus() }, [])

  return <Dialog title="Choose front image" width="min(960px,100%)" onBackdropClick={onClose}>
    <div ref={content} onKeyDown={(e) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
      if (e.key === 'Tab') {
        const buttons = content.current?.querySelectorAll<HTMLButtonElement>('button')
        if (!buttons?.length) return
        const first = buttons[0], last = buttons[buttons.length - 1]
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      }
    }} className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="m-0 text-sm text-ink/60">All matching fronts for this faction. Its currently assigned front appears first.</p>
        <Button type="button" onClick={onClose}>Close</Button>
      </div>
      {loading && <p role="status" className="m-0 text-sm text-ink/60">Loading front images…</p>}
      {imageError && <p role="alert" className="m-0 text-sm text-danger">Could not load all front images.</p>}
      {templateError && <p role="alert" className="m-0 text-sm text-danger">Could not identify the faction’s current front.</p>}
      {!loading && !imageError && options.length === 0 && <p className="m-0 text-sm text-ink/60">No generated fronts for this faction and card type yet.</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3">
        {options.map((image) => {
          const assigned = assignedKeys.includes(image.libraryKey)
          const selected = image.key === selectedKey
          return <button key={image.key} type="button" aria-label={`Use ${image.name}`} aria-pressed={selected}
            onClick={() => onSelect(image.key)}
            className={`flex cursor-pointer flex-col overflow-hidden rounded-md border-2 p-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${assigned || selected ? 'border-accent bg-accent/10' : 'border-divider bg-bg hover:border-accent/60'}`}>
            <img src={image.url} alt={image.name} loading="lazy" className="aspect-[3/4] w-full object-contain" />
            <div className="flex w-full flex-col gap-1.5 p-2.5">
              {assigned && <span className="text-xs font-medium text-accent">Current faction front</span>}
              {selected && <span className="text-xs font-medium text-accent">Selected reference</span>}
              <span className="break-words text-xs text-ink">{image.name}</span>
              <span className="text-[11px] text-ink/50">{image.source}</span>
            </div>
          </button>
        })}
      </div>
      <Button type="button" onClick={() => onSelect('')}>Use no front reference</Button>
    </div>
  </Dialog>
}
