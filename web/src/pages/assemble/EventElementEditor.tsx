import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Group } from '../../components/Group'
import { DEFAULT_EVENT_ELEMENT, saveFactionEventElement, useFactionEventElement, type EventElementSettings } from './api'
import { Slider } from './BannerEditor'
import { ElementPicker } from './ElementPicker'
import { EventElementPreview } from './EventElementPreview'
import { useLibraryImages } from './library'

// The ornament on this faction's event cards, on the strip between the tactic/scheme banner and the text
// panel: chosen or uploaded, with its place and size, shown on a demo event card made with the faction's template.
export function EventElementEditor({ factionId }: { factionId: number }) {
  const saved = useFactionEventElement(factionId)
  const [draft, setDraft] = useState<EventElementSettings | null>(null)
  const settings = draft ?? saved
  const change = (patch: Partial<EventElementSettings>) => { save.reset(); setDraft({ ...settings, ...patch }) }
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => saveFactionEventElement(factionId, settings),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['faction-event-elements'] }); setDraft(null) },
  })
  const images = useLibraryImages()
  const element = settings.element_key ? images.data.find(i => i.key === settings.element_key) : undefined
  const [picking, setPicking] = useState(false)
  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved)
  const pct = (v: number) => `${Math.round(v * 100)}%`
  return <div className="flex flex-wrap gap-5 pt-3">
    <div className="w-full shrink-0 sm:w-[min(460px,calc((100vh_-_150px)*0.739))]">
      <EventElementPreview factionId={factionId} settings={settings} onChange={change} />
    </div>
    <div className="min-w-64 max-w-xl flex-1 space-y-4">
      <Group title="Element">
        <div className="flex flex-wrap items-center gap-3">
          {element && <img src={element.url} alt="Event element" className="h-12 max-w-40 rounded border border-divider bg-black/30 object-contain" />}
          <Button onClick={() => setPicking(true)}>{element ? 'Change element' : 'Choose element'}</Button>
          {element && <Button onClick={() => change({ element_key: '' })}>Remove element</Button>}
        </div>
        {element ? <>
          <p className="m-0 text-xs text-ink/60">Drag the preview to move the element, or use the sliders.</p>
          <Slider label="Across" hint="of the card" value={Math.round(settings.element_x * 100)} min={-50} max={50} shown={pct(settings.element_x)} onChange={v => change({ element_x: v / 100 })} />
          <Slider label="Down" hint="of the card" value={Math.round(settings.element_y * 100)} min={-30} max={30} shown={pct(settings.element_y)} onChange={v => change({ element_y: v / 100 })} />
          <Slider label="Size" hint="of the card's width" value={Math.round(settings.element_scale * 100)} min={10} max={100} shown={pct(settings.element_scale)} onChange={v => change({ element_scale: v / 100 })} />
          <div><Button onClick={() => change({ element_x: DEFAULT_EVENT_ELEMENT.element_x, element_y: DEFAULT_EVENT_ELEMENT.element_y, element_scale: DEFAULT_EVENT_ELEMENT.element_scale })}>Reset element position</Button></div>
        </> : <p className="m-0 text-xs text-ink/60">No element chosen.</p>}
      </Group>
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : 'Save element'}</Button>
        <Button disabled={!dirty || save.isPending} onClick={() => { save.reset(); setDraft(null) }}>Discard</Button>
      </div>
      {save.isSuccess && !draft && <p role="status" className="m-0 text-sm text-success">Element saved.</p>}
      {save.isError && <p role="alert" className="m-0 text-sm text-danger">{save.error.message}</p>}
      <p className="m-0 text-xs text-ink/60">The element is drawn on every event card of this faction, over the banners and under the icons and text.</p>
    </div>
    {picking && <ElementPicker title="Choose event element" factionId={factionId} elementTypeName="event element" selectedKey={settings.element_key} aspect="816 / 240" onSelect={key => { change({ element_key: key }); setPicking(false) }} onClose={() => setPicking(false)} />}
  </div>
}
