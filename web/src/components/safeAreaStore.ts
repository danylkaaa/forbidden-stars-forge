import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Whether previews draw the cut and safe-area lines. Shared by every preview.
export const useSafeArea = create<{ show: boolean; set: (show: boolean) => void }>()(persist(set => ({ show: false, set: show => set({ show }) }), { name: 'card-forge-safe-area' }))

export const PRINT_DPI = 300
export const mmToPx = (mm: number) => mm / 25.4 * PRINT_DPI
// Text and important art should stay this far inside the cut line.
export const SAFE_INSET_MM = 3
