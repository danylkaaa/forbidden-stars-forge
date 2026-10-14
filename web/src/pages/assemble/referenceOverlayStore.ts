import { create } from 'zustand'
import type { ReferenceCategory } from './api'
import type { Side } from './api'

// A reference picture laid over a card preview, for checking the template
// against a real card. One switch and one opacity for every preview; each
// card type and side remembers which reference it shows.
export const useReferenceOverlay = create<{
  on: boolean; opacity: number; chosen: Record<string, number>
  setOn: (on: boolean) => void; setOpacity: (opacity: number) => void; choose: (category: ReferenceCategory, side: Side, id: number) => void
}>(set => ({
  on: false, opacity: 0.5, chosen: {},
  setOn: on => set({ on }), setOpacity: opacity => set({ opacity }),
  choose: (category, side, id) => set(s => ({ chosen: { ...s.chosen, [`${category}:${side}`]: id } })),
}))
