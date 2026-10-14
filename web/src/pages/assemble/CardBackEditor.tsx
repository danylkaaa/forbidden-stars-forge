import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { DEFAULT_UPGRADE_FRAME, backOverlayScale, saveCardTypeLayout, useCardTypeLayouts, type CardTypeLayout } from './api'
import { BackImage } from './BackImage'
import { usePreviewTemplate, useTemplate } from './library'
import { usePreviewFaction } from './usePreviewFaction'
import { ReferenceOverlay } from './ReferenceOverlay'
import { ReferenceField } from './ReferenceCards'

const LABEL = { combat: 'Combat', schema: 'Event', upgrade: 'Upgrade' }

// General settings of a card type's back, the same for every faction: the size
// of the banner on combat and upgrade backs (the frame with the logo and the
// ornament; the faction assembles it in its settings, and its logo and ornament
// scale with it) or of the hexagon on event backs.
export function CardBackEditor({ category = 'combat' }: { category?: 'combat' | 'schema' | 'upgrade' }) {
  const queryClient = useQueryClient()
  const layouts = useCardTypeLayouts()
  const { factionId: previewFaction } = usePreviewFaction()
  const back = useTemplate(previewFaction, category, 'back'), fallback = usePreviewTemplate(previewFaction, category)
  const image = back.image ?? fallback.image
  const what = category === 'schema' ? 'Hexagon' : 'Banner', byDefault = category === 'upgrade' ? DEFAULT_UPGRADE_FRAME : 1
  const saved = backOverlayScale(layouts.data, category)
  const [draft, setDraft] = useState<number | null>(null)
  const scale = draft ?? saved
  const save = useMutation({
    mutationFn: async () => {
      const current = layouts.data?.find(l => l.category === category)?.layout ?? {}
      return saveCardTypeLayout(category, { ...current, back: { ...current.back, overlay_scale: scale } })
    },
    onSuccess: row => { setDraft(null); queryClient.setQueryData<CardTypeLayout[]>(['card-type-layouts'], old => [...(old ?? []).filter(l => l.category !== category), row]) },
  })
  const change = (value: number) => { save.reset(); setDraft(value) }
  if (layouts.isPending) return <p role="status" className="text-sm text-ink/60">Loading layout…</p>
  if (layouts.isError) return <p role="alert" className="text-sm text-danger">{layouts.error.message}</p>
  return <div className="flex flex-wrap gap-5 border-t border-divider pt-4">
    <div className="w-full shrink-0 sm:w-[min(560px,calc((100vh_-_160px)*0.739))]">
      {image
        ? <div className="relative"><BackImage category={category} factionId={previewFaction ?? undefined} url={image.url} logoUrl={image.logoUrl} scale={image.logoScale} overlayScale={category === 'schema' ? scale : undefined} elementUrl={category === 'schema' ? undefined : image.elementUrl} alt={`${LABEL[category]} back preview`} /><ReferenceOverlay category={category} side="back" /></div>
        : <div className="grid aspect-[816/1104] place-items-center rounded border border-divider p-2 text-center text-xs text-ink/50">This faction has no images yet, so the preview has no back.</div>}
    </div>
    <div className="min-w-64 flex-1 space-y-3">
      <Field label={`${what} size (${Math.round(scale * 100)}%)`}>{id => <input id={id} type="range" min="20" max="150" step="1" value={Math.round(scale * 100)}
        onChange={e => change(Number(e.target.value) / 100)} className="w-full accent-[var(--color-accent)]" />}</Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={draft === null || draft === saved || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save back'}</Button>
        <Button disabled={save.isPending || scale === byDefault} onClick={() => change(byDefault)}>Reset {what.toLowerCase()} to {Math.round(byDefault * 100)}%</Button>
      </div>
      {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
      {save.isSuccess && draft === null && <p role="status" className="m-0 text-sm text-success">Back saved.</p>}
      <p className="m-0 text-xs text-ink/50">{category === 'schema'
        ? 'The hexagon size is the same for every faction. Event backs use the combat back image, with the faction logo inside a pressed-in hexagon; each faction sets its own logo size on its back page.'
        : 'The banner size is the same for every faction. Each faction assembles its banner (logo inside the frame, ornament over its edges) in its settings in the Library; the logo and the ornament scale with the banner.'}</p>
      <ReferenceField category={category} side="back" />
    </div>
  </div>
}
