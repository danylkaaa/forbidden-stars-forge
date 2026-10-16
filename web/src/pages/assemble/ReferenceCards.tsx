import { IMAGE_ACCEPT } from '../../lib/imageUpload'
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { deleteReferenceCard, uploadReferenceCard, useReferenceCards, type ReferenceCard, type ReferenceCategory, type Side } from './api'
import { ReferenceOverlayControls } from './ReferenceOverlay'
import { useReferenceOverlay } from './referenceOverlayStore'

const LABEL: Record<ReferenceCategory, string> = { combat: 'combat', schema: 'event', upgrade: 'upgrade', faction: 'faction' }

function useReferenceMutations(category: ReferenceCategory, side: Side) {
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['reference-cards'] })
  const upload = useMutation({ mutationFn: (file: File) => uploadReferenceCard(category, file, side), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: number) => deleteReferenceCard(id), onSuccess: refresh })
  return { upload, remove }
}

function FullSize({ card, onClose }: { card: ReferenceCard; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])
  return createPortal(<div role="dialog" aria-label={`Reference ${card.name}`} className="fixed inset-0 z-40 grid cursor-zoom-out place-items-center bg-black/85 p-4 backdrop-blur-sm" onClick={onClose}>
    <div className="flex max-h-full flex-col items-center gap-2">
      <img src={card.url} alt={card.name} className="max-h-[88vh] max-w-[92vw] rounded-lg object-contain shadow-[0_12px_48px_rgba(0,0,0,0.8)]" />
      <Button onClick={onClose}>Close</Button>
    </div>
  </div>, document.body)
}

// A compact reference for one card template side, for its form: a small
// thumbnail of the picture, a button to upload another, and the controls to
// lay it over the preview.
export function ReferenceField({ category, side }: { category: ReferenceCategory; side: Side }) {
  const { cards, isError, error } = useReferenceCards(category, side)
  const chosen = useReferenceOverlay(s => s.chosen[`${category}:${side}`])
  const shown = cards.find(c => c.id === chosen) ?? cards[0]
  const { upload, remove } = useReferenceMutations(category, side)
  const [open, setOpen] = useState(false)
  const failure = upload.error ?? remove.error ?? (isError ? error : null)
  return <div role="group" aria-label={`Reference ${side}`} className="space-y-1.5">
    <div className="flex items-center gap-3">
      {shown
        ? <button type="button" aria-label={`Open reference ${shown.name}`} onClick={() => setOpen(true)} className="block h-16 w-12 shrink-0 cursor-zoom-in overflow-hidden rounded border border-divider bg-black/30 p-0 hover:border-accent">
          <img src={shown.url} alt={shown.name} className="block h-full w-full object-contain" /></button>
        : <span className="grid h-16 w-12 shrink-0 place-items-center rounded border border-dashed border-divider text-[10px] text-ink/40">none</span>}
      <div className="min-w-0 space-y-1">
        <p className="m-0 truncate text-xs text-ink/70" title={shown?.name}>Reference {LABEL[category]} {side}{shown ? `: ${shown.name}` : ''}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider hover:border-accent/60 ${upload.isPending ? 'pointer-events-none opacity-45' : ''}`}>
            {upload.isPending ? 'Uploading…' : shown ? 'Add reference' : 'Upload reference'}
            <input type="file" accept={IMAGE_ACCEPT} className="sr-only" aria-label={`Upload reference ${side}`} disabled={upload.isPending}
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) upload.mutate(f) }} />
          </label>
          {shown && <button type="button" aria-label={`Remove reference ${shown.name}`} disabled={remove.isPending} onClick={() => remove.mutate(shown.id)} className="cursor-pointer border-0 bg-transparent p-0 text-[11px] text-ink/60 underline hover:text-danger">Remove</button>}
        </div>
      </div>
    </div>
    <ReferenceOverlayControls category={category} side={side} />
    {failure && <p role="alert" className="m-0 text-xs text-danger">{failure.message}</p>}
    {open && shown && <FullSize card={shown} onClose={() => setOpen(false)} />}
  </div>
}

// Every reference of a card type, front and back, to browse and manage.
export function ReferenceCards({ category, compact = false }: { category: ReferenceCategory; compact?: boolean }) {
  const { cards } = useReferenceCards(category)
  const [open, setOpen] = useState<ReferenceCard | null>(null)
  const queryClient = useQueryClient()
  const remove = useMutation({ mutationFn: (id: number) => deleteReferenceCard(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reference-cards'] }) })
  const front = useReferenceMutations(category, 'front'), back = useReferenceMutations(category, 'back')
  const failure = front.upload.error ?? back.upload.error ?? remove.error
  return <section aria-label="Reference cards" className="space-y-2">
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="m-0 font-display text-sm font-semibold text-accent-300">Reference {LABEL[category]} cards</h2>
      {([['front', front], ['back', back]] as const).map(([side, m]) => <label key={side} className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-3 py-1.5 text-xs font-semibold uppercase tracking-wider hover:border-accent/60 ${m.upload.isPending ? 'pointer-events-none opacity-45' : ''}`}>
        {m.upload.isPending ? 'Uploading…' : `Upload ${side}`}
        <input type="file" accept={IMAGE_ACCEPT} multiple className="sr-only" aria-label={`Upload reference card ${side}`} disabled={m.upload.isPending}
          onChange={e => { const files = [...e.target.files ?? []]; e.target.value = ''; files.forEach(f => m.upload.mutate(f)) }} />
      </label>)}
    </div>
    {!cards.length && <p className="m-0 text-xs text-ink/55">No reference cards yet. Upload pictures of real {LABEL[category]} cards (front and back) to compare against.</p>}
    <div className={`grid gap-2 ${compact ? 'grid-cols-3' : 'grid-cols-[repeat(auto-fill,minmax(110px,1fr))]'}`}>
      {cards.map(card => <figure key={card.id} className="group/ref relative m-0">
        <button type="button" aria-label={`Open reference ${card.name}`} onClick={() => setOpen(card)} className="block w-full cursor-zoom-in overflow-hidden rounded border border-divider bg-black/30 p-0 hover:border-accent">
          <img src={card.url} alt={card.name} loading="lazy" className="block aspect-[3/4] w-full object-contain" />
        </button>
        <figcaption className="truncate px-0.5 pt-0.5 text-[11px] text-ink/60" title={card.name}>{card.side} · {card.name}</figcaption>
        <button type="button" aria-label={`Remove reference ${card.name}`} disabled={remove.isPending} onClick={() => remove.mutate(card.id)}
          className="absolute right-1 top-1 grid h-6 w-6 cursor-pointer place-items-center rounded border border-white/20 bg-black/60 p-0 text-xs text-ink/80 opacity-0 hover:border-danger hover:text-danger focus-visible:opacity-100 group-hover/ref:opacity-100 [@media(hover:none)]:opacity-100">✕</button>
      </figure>)}
    </div>
    {failure && <p role="alert" className="m-0 text-sm text-danger">{failure.message}</p>}
    {open && <FullSize card={open} onClose={() => setOpen(null)} />}
  </section>
}
