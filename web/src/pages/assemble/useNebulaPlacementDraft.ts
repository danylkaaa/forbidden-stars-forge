import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Category } from '../cards/model'
import { saveNebulaPlacement, useNebulaPlacement } from './api'
import type { NebulaPlacement } from './backDecor'

// A card type's nebula position and turn, edited as a draft (dragged on the
// back preview, turned with the slider) and saved explicitly.
export function useNebulaPlacementDraft(factionId: number, category: Category) {
  const saved = useNebulaPlacement(factionId, category)
  const [draft, setDraft] = useState<NebulaPlacement | null>(null)
  const value = draft ?? saved
  const queryClient = useQueryClient()
  const save = useMutation({
    // Brightness 0 follows the faction's.
    mutationFn: () => saveNebulaPlacement(factionId, category, { ...value, brightness: value.brightness ?? 0 }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['nebula-placements'] }); setDraft(null) },
  })
  const clamp = (v: number, limit: number) => Math.min(limit, Math.max(-limit, v))
  const change = (patch: Partial<NebulaPlacement>) => setDraft(d => {
    save.reset()
    const next = { ...(d ?? saved), ...patch }
    return { x: clamp(next.x, 1), y: clamp(next.y, 1), rotation: clamp(next.rotation, 360), brightness: next.brightness }
  })
  const randomize = () => change({ x: Math.round((Math.random() * 0.8 - 0.4) * 100) / 100, y: Math.round((Math.random() * 0.8 - 0.4) * 100) / 100, rotation: Math.round(Math.random() * 360 - 180) })
  const discard = () => { save.reset(); setDraft(null) }
  return { value, draft, save, change, randomize, discard }
}
export type PlacementDraft = ReturnType<typeof useNebulaPlacementDraft>

