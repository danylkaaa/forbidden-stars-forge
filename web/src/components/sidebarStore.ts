import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Whether the section sidebar is hidden, to give the page more room. Remembered per browser.
export const useSidebarHidden = create<{ hidden: boolean; toggle: () => void }>()(persist(set => ({ hidden: false, toggle: () => set(s => ({ hidden: !s.hidden })) }), { name: 'card-forge-sidebar-hidden' }))
