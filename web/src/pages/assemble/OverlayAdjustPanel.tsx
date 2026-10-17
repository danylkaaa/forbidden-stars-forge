import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Category } from '../cards/model'
import { Button } from '../../components/Button'
import { fullAdjust, isNeutralAdjust, type ArtworkAdjust } from './artwork'
import { ArtworkAdjustPanel } from './ArtworkAdjustPanel'
import { TemplateAdjust } from './TemplateAdjust'
import { OVERLAYS, overlayAdjustKey, saveOverlayAdjust, useOverlayAdjust, type OverlayAdjustments, type OverlayId } from './overlays'

type Row = { faction_id: number; overlay: OverlayId; adjust: ArtworkAdjust }
// Cards are redrawn at full size, so they follow the sliders after a short rest.
const CARDS_DELAY = 250
const same = (a?: ArtworkAdjust, b?: ArtworkAdjust) => (isNeutralAdjust(a) && isNeutralAdjust(b)) || JSON.stringify(fullAdjust(a)) === JSON.stringify(fullAdjust(b))

// Tone and colour of each overlay layer drawn on this kind of card. The setting is the faction's, per overlay: it
// changes every card of the faction that draws the overlay, not just this card. A change shows on the cards in this
// browser at once and goes to the server only on Save.
export function OverlayAdjustPanel({ factionId, category }: { factionId: number; category: Category }) {
  const current = useOverlayAdjust(factionId)
  const queryClient = useQueryClient()
  // What the server has for each overlay: the values when this opened, then whatever was last saved.
  const saved = useRef<OverlayAdjustments>(current)
  const [, rerender] = useState(0)
  // What the sliders show right away; the cards catch up after a rest.
  const [drafts, setDrafts] = useState<OverlayAdjustments>({})
  const timers = useRef(new Map<OverlayId, ReturnType<typeof setTimeout>>())
  useEffect(() => { const t = timers.current; return () => t.forEach(clearTimeout) }, [])
  const save = useMutation({
    mutationFn: ({ overlay, adjust }: { overlay: OverlayId; adjust: ArtworkAdjust | undefined }) => saveOverlayAdjust(factionId, overlay, isNeutralAdjust(adjust) ? null : adjust!),
    onSuccess: (_, { overlay, adjust }) => { saved.current = { ...saved.current, [overlay]: adjust }; rerender(n => n + 1); return queryClient.invalidateQueries({ queryKey: overlayAdjustKey }) },
  })
  if (category === 'upgrade') return null // its frame is the same bundled picture for every faction
  const show = (overlay: OverlayId, adjust: ArtworkAdjust | undefined, at = 0) => {
    save.reset()
    clearTimeout(timers.current.get(overlay))
    setDrafts(d => ({ ...d, [overlay]: adjust }))
    timers.current.set(overlay, setTimeout(() => push(overlay, adjust), at))
  }
  const push = (overlay: OverlayId, adjust: ArtworkAdjust | undefined) => {
    queryClient.setQueryData<Row[]>(overlayAdjustKey, rows => [...(rows ?? []).filter(r => !(r.faction_id === factionId && r.overlay === overlay)), ...(adjust && !isNeutralAdjust(adjust) ? [{ faction_id: factionId, overlay, adjust }] : [])])
  }
  return <section aria-label="Overlay adjustments" className="space-y-2">
    <h3 className="m-0 text-sm font-semibold text-ink">Overlays</h3>
    <p className="m-0 text-xs text-ink/60">Saved for this faction and layer, so every card of the faction that draws it changes. The card background is the image chosen for this card type. Changes are kept only when you press Save.</p>
    <TemplateAdjust key={`${factionId}-${category}`} factionId={factionId} category={category} side="front" label="Card background" preview={false} />
    {OVERLAYS[category].map(o => {
      const shown = o.id in drafts ? drafts[o.id] : current[o.id]
      const dirty = !same(shown, saved.current[o.id])
      return <ArtworkAdjustPanel key={o.id} idPrefix={`overlay-${o.id}`} title={dirty ? `${o.label} (unsaved)` : o.label} adjust={shown} onChange={next => show(o.id, next, CARDS_DELAY)}
        actions={<>
          <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate({ overlay: o.id, adjust: shown })}>{save.isPending && save.variables?.overlay === o.id ? 'Saving…' : `Save ${o.label.toLowerCase()}`}</Button>
          <Button disabled={!dirty || save.isPending} onClick={() => show(o.id, saved.current[o.id])}>Discard</Button>
        </>} />
    })}
    {save.isError && <p role="alert" className="m-0 text-xs text-danger">{save.error.message}</p>}
  </section>
}
