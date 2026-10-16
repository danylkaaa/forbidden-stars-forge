import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Preview-only layer drawn over a generated image:
// - mask: the card type's template (the green/white guide sent to OpenAI),
//   at adjustable opacity, to check how the art lines up with it
// Settings are shared by every preview and remembered across reloads.
// - overlay: what the card type adds over the generated image (the card's text and frame, or a back's
//   banner); off shows the plain image
type LayersState = {
  mask: boolean
  maskOpacity: number // 0..1
  overlay: boolean
  set: (p: Partial<Pick<LayersState, 'mask' | 'maskOpacity' | 'overlay'>>) => void
}

export const usePreviewLayers = create<LayersState>()(
  persist(
    (set) => ({ mask: false, maskOpacity: 0.5, overlay: true, set: (p) => set(p) }),
    { name: 'cardforge:preview-layers' },
  ),
)
