import { useMemo } from 'react'
import { useFactionEventElement, type EventElementSettings } from './api'
import { useLibraryImages } from './library'
import type { EventElementInput } from './eventElementPlace'

// The faction's event element ready to draw (its picture and place), or undefined when it has none.
// `draft` stands in for the saved settings while they are being edited.
export function useEventElementInput(factionId: number | null | undefined, draft?: EventElementSettings): EventElementInput | undefined {
  const saved = useFactionEventElement(factionId), images = useLibraryImages()
  const settings = draft ?? saved
  const url = settings.element_key ? images.data.find(i => i.key === settings.element_key)?.url : undefined
  return useMemo(() => url ? { url, x: settings.element_x, y: settings.element_y, scale: settings.element_scale } : undefined, [url, settings.element_x, settings.element_y, settings.element_scale])
}
