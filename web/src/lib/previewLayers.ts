import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Preview-only layer drawn over a generated image:
// - mask: the card type's template (the green/white guide sent to OpenAI),
//   at adjustable opacity, to check how the art lines up with it
// Settings are shared by every preview and remembered across reloads.
type LayersState = {
  mask: boolean
  maskOpacity: number // 0..1
  set: (p: Partial<Pick<LayersState, 'mask' | 'maskOpacity'>>) => void
}

export const usePreviewLayers = create<LayersState>()(
  persist(
    (set) => ({ mask: false, maskOpacity: 0.5, set: (p) => set(p) }),
    { name: 'cardforge:preview-layers' },
  ),
)
