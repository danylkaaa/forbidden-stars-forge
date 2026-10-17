import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { Category } from '../cards/model'
import { apiGet, apiSend } from '../../lib/api'
import type { ArtworkAdjust } from './artwork'

// The bundled picture layers of a card whose tone and colour a faction can correct. A correction belongs to the faction
// and the overlay, so it applies to every card of the faction that draws the overlay.
export type OverlayId = 'ribbon' | 'background' | 'foreground' | 'bottom' | 'chains' | 'banners'
export type OverlayAdjustments = Partial<Record<OverlayId, ArtworkAdjust>>

export const OVERLAYS: Record<Category, { id: OverlayId; label: string }[]> = {
  combat: [
    { id: 'ribbon', label: 'Ribbon' },
    { id: 'background', label: 'Upper text panel' },
    { id: 'foreground', label: 'Lower text panel' },
    { id: 'bottom', label: 'Bottom border' },
  ],
  schema: [
    { id: 'chains', label: 'Chains' },
    { id: 'banners', label: 'Banners' },
  ],
  upgrade: [],
}

type Row = { faction_id: number; overlay: OverlayId; adjust: ArtworkAdjust }
export const overlayAdjustKey = ['overlay-adjustments'] as const

export function useOverlayAdjustRows() {
  return useQuery({ queryKey: overlayAdjustKey, queryFn: () => apiGet<Row[]>('/api/overlay-adjustments') })
}

// The faction's corrections by overlay. The same object while nothing changed, so cards are not drawn again for nothing.
export function useOverlayAdjust(factionId: number | null | undefined): OverlayAdjustments {
  const rows = useOverlayAdjustRows().data
  const text = JSON.stringify(rows?.filter(r => r.faction_id === factionId).map(r => [r.overlay, r.adjust]) ?? [])
  return useMemo(() => Object.fromEntries(JSON.parse(text) as [OverlayId, ArtworkAdjust][]), [text])
}

export const saveOverlayAdjust = (factionId: number, overlay: OverlayId, adjust: ArtworkAdjust | null) =>
  apiSend<ArtworkAdjust | null>('PUT', `/api/overlay-adjustments/${factionId}/${overlay}`, adjust)
