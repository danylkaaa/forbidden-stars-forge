import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { SearchableSelect } from '../../components/SearchableSelect'
import { selectClass } from '../../components/Field'
import { useFactions } from '../factions/api'
import { backOverlayScale, saveCardTypeLayout, useCardTypeLayouts, type CardTypeLayout } from './api'
import { BackImage } from './BackImage'
import { usePreviewTemplate, useTemplate } from './library'
import { useAssembly } from './state'

// The combat back overlay is the same artwork for every faction; only its
// size is adjustable, and the setting applies to all factions at once.
export function CardBackEditor() {
  const queryClient = useQueryClient()
  const layouts = useCardTypeLayouts(), factions = useFactions()
  const [factionId, setFactionId] = useState(() => useAssembly.getState().factionId)
  const previewFaction = factionId ?? factions.data?.[0]?.id ?? null
  const back = useTemplate(previewFaction, 'combat', 'back'), fallback = usePreviewTemplate(previewFaction, 'combat')
  const image = back.image ?? fallback.image
  const saved = backOverlayScale(layouts.data, 'combat')
  const [draft, setDraft] = useState<number | null>(null)
  const scale = draft ?? saved
  const save = useMutation({
    mutationFn: async () => {
      const current = layouts.data?.find(l => l.category === 'combat')?.layout ?? {}
      return saveCardTypeLayout('combat', { ...current, back: { ...current.back, overlay_scale: scale } })
    },
    onSuccess: row => { setDraft(null); queryClient.setQueryData<CardTypeLayout[]>(['card-type-layouts'], old => [...(old ?? []).filter(l => l.category !== 'combat'), row]) },
  })
  if (layouts.isPending) return <p role="status" className="text-sm text-ink/60">Loading layout…</p>
  if (layouts.isError) return <p role="alert" className="text-sm text-danger">{layouts.error.message}</p>
  return <div className="flex flex-wrap gap-4 border-t border-divider pt-4">
    <div className="w-48 shrink-0">
      {image
        ? <BackImage category="combat" url={image.url} logoUrl={'logoUrl' in image ? image.logoUrl : undefined} scale={'logoScale' in image ? image.logoScale : undefined} overlayScale={scale} alt="Combat back preview" />
        : <div className="grid aspect-[816/1104] place-items-center rounded border border-divider p-2 text-center text-xs text-ink/50">This faction has no images yet, so the preview has no back.</div>}
    </div>
    <div className="min-w-64 flex-1 space-y-3">
      <Field label="Preview faction">{id => <SearchableSelect id={id} className={selectClass} value={previewFaction ?? ''} onChange={e => setFactionId(Number(e.target.value) || null)}>
        {factions.data?.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
      </SearchableSelect>}</Field>
      <Field label={`Overlay size (${Math.round(scale * 100)}% of card width)`}>{id => <input id={id} type="range" min="20" max="150" step="1" value={Math.round(scale * 100)}
        onChange={e => { save.reset(); setDraft(Number(e.target.value) / 100) }} className="w-full accent-[var(--color-accent)]" />}</Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={draft === null || draft === saved || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save back'}</Button>
        <Button disabled={save.isPending || (draft === null && saved === 1)} onClick={() => { save.reset(); setDraft(1) }}>Reset to 100%</Button>
      </div>
      {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
      {save.isSuccess && draft === null && <p role="status" className="m-0 text-sm text-success">Back saved.</p>}
      <p className="m-0 text-xs text-ink/50">The overlay is centred on every combat card back and is the same for all factions; this size applies to all of them.</p>
    </div>
  </div>
}
