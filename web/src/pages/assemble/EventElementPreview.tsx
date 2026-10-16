import { useMemo, useRef } from 'react'
import { CardCanvas } from './CardCanvas'
import { usePreviewTemplate } from './library'
import { DEMO_SCHEMA } from './model'
import { useAssembledPreview } from './previewCard'
import type { EventElementSettings } from './api'

const round = (v: number, limit: number) => Math.round(Math.max(-limit, Math.min(limit, v)) * 1000) / 1000

// A demo event card made with the faction's template and the element at `settings`; drag the card to move the
// element (`onChange` gets the new offsets, as shares of the card).
export function EventElementPreview({ factionId, settings, onChange }: { factionId: number; settings: EventElementSettings; onChange: (patch: Partial<EventElementSettings>) => void }) {
  const template = usePreviewTemplate(factionId, 'schema')
  // A stable card: a new object each render would restart the rendering each time.
  const card = useMemo(() => ({ ...DEMO_SCHEMA, faction_id: factionId }), [factionId])
  const { result, error } = useAssembledPreview(template.image?.url ?? null, factionId, card, settings)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const movable = !!settings.element_key
  return <div aria-label="Event card preview" className={`relative touch-none select-none overflow-hidden rounded-lg ring-1 ring-divider ${movable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    onPointerDown={e => { if (e.button !== 0 || !movable) return; e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY } }}
    onPointerMove={e => {
      const d = drag.current, box = e.currentTarget.getBoundingClientRect()
      if (!d || !box.width || !box.height) return
      onChange({ element_x: round(settings.element_x + (e.clientX - d.x) / box.width, 1), element_y: round(settings.element_y + (e.clientY - d.y) / box.height, 1) })
      drag.current = { x: e.clientX, y: e.clientY }
    }}
    onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
    {result
      ? <CardCanvas result={result} aria-label="Event card with the element" className="block w-full" />
      : <div className="grid aspect-[816/1110] w-full place-items-center bg-black/30 p-4 text-center text-sm text-ink/60">{template.isPending ? 'Loading…' : !template.image ? 'This faction has no event template yet. Choose one in the Library.' : error || 'Rendering card…'}</div>}
  </div>
}
