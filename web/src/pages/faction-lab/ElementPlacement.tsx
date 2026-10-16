import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { DEFAULT_BANNER, DEFAULT_EVENT_ELEMENT, saveFactionBanner, saveFactionEventElement, useFactionBanner, useFactionEventElement } from '../assemble/api'
import { BannerElementPreview } from '../assemble/BannerElementPreview'
import { Slider } from '../assemble/BannerEditor'
import { EventElementPreview } from '../assemble/EventElementPreview'

type Place = { x: number; y: number; scale: number }
const pct = (v: number) => `${Math.round(v * 100)}%`

// A finished element image shown where it will be used: on the faction's event card, or on its card back banner.
// Drag the preview to move it and use the sliders to resize it; "Use for faction" saves the image with this place.
export function ElementPlacement({ kind, factionId, generationId }: { kind: 'event' | 'banner'; factionId: number; generationId: number }) {
  const key = `test-${generationId}`
  const queryClient = useQueryClient()
  const savedEvent = useFactionEventElement(factionId), savedBanner = useFactionBanner(factionId)
  const saved: Place = kind === 'event' ? { x: savedEvent.element_x, y: savedEvent.element_y, scale: savedEvent.element_scale } : { x: savedBanner.element_x, y: savedBanner.element_y, scale: savedBanner.element_scale }
  const savedKey = kind === 'event' ? savedEvent.element_key : savedBanner.element_key
  const [draft, setDraft] = useState<Place | null>(null)
  const place = draft ?? saved
  const home: Place = kind === 'event' ? { x: DEFAULT_EVENT_ELEMENT.element_x, y: DEFAULT_EVENT_ELEMENT.element_y, scale: DEFAULT_EVENT_ELEMENT.element_scale } : { x: DEFAULT_BANNER.element_x, y: DEFAULT_BANNER.element_y, scale: DEFAULT_BANNER.element_scale }
  const change = (patch: Partial<Place>) => { use.reset(); setDraft({ ...place, ...patch }) }
  const use = useMutation({
    mutationFn: () => kind === 'event'
      ? saveFactionEventElement(factionId, { element_key: key, element_x: place.x, element_y: place.y, element_scale: place.scale })
      : saveFactionBanner(factionId, { ...savedBanner, element_key: key, element_x: place.x, element_y: place.y, element_scale: place.scale }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: [kind === 'event' ? 'faction-event-elements' : 'faction-banners'] }); setDraft(null) },
  })
  const current = savedKey === key && !draft
  const eventSettings = { element_key: key, element_x: place.x, element_y: place.y, element_scale: place.scale }
  return <div className="flex min-h-0 flex-1 flex-wrap items-start gap-5 overflow-y-auto">
    <div className="w-full shrink-0 sm:w-[min(420px,calc((100vh_-_220px)*0.739))]">
      {kind === 'event'
        ? <EventElementPreview factionId={factionId} settings={eventSettings} onChange={p => change({ ...(p.element_x !== undefined ? { x: p.element_x } : {}), ...(p.element_y !== undefined ? { y: p.element_y } : {}) })} />
        : <BannerElementPreview factionId={factionId} settings={{ ...savedBanner, ...eventSettings }} onChange={p => change({ ...(p.element_x !== undefined ? { x: p.element_x } : {}), ...(p.element_y !== undefined ? { y: p.element_y } : {}) })} />}
    </div>
    <div className="min-w-60 max-w-md flex-1 space-y-3">
      <p className="m-0 text-xs text-ink/60">{kind === 'event' ? 'How this element looks on an event card.' : 'How this element looks on the card back banner.'} Drag the preview to move it, or use the sliders.</p>
      <Slider label="Across" hint="of the card" value={Math.round(place.x * 100)} min={-50} max={50} shown={pct(place.x)} onChange={v => change({ x: v / 100 })} />
      <Slider label="Down" hint="of the card" value={Math.round(place.y * 100)} min={-30} max={30} shown={pct(place.y)} onChange={v => change({ y: v / 100 })} />
      <Slider label="Size" hint="of the card's width" value={Math.round(place.scale * 100)} min={10} max={100} shown={pct(place.scale)} onChange={v => change({ scale: v / 100 })} />
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={current || use.isPending} onClick={() => use.mutate()}>{current ? 'Used for faction ✓' : use.isPending ? 'Saving…' : 'Use for faction'}</Button>
        <Button disabled={place.x === home.x && place.y === home.y && place.scale === home.scale} onClick={() => change(home)}>Reset position</Button>
      </div>
      {use.isError && <p role="alert" className="m-0 text-sm text-danger">{use.error.message}</p>}
      <p className="m-0 text-xs text-ink/50">The faction uses one element and place for all its {kind === 'event' ? 'event cards' : 'card backs'}; it is also set in the faction's settings.</p>
    </div>
  </div>
}
