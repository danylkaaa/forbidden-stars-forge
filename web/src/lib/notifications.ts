import { create } from 'zustand'

// An app-wide notice for a finished generation. It closes by itself after `NOTICE_MS`.
export const NOTICE_MS = 5000
export type Notice = { id: number; generationId: number; factionId: number; cardTypeId: number; name: string; durationMs: number; costUsd: number; failed: boolean; error: string }

type State = {
  notices: Notice[]
  notify: (n: Omit<Notice, 'id'>) => void
  dismiss: (id: number) => void
}

let next = 1
export const useNotices = create<State>()((set) => ({
  notices: [],
  // A generation is announced once: a repeat of the same one replaces the older notice.
  notify: (n) => set((s) => ({ notices: [{ ...n, id: next++ }, ...s.notices.filter((x) => x.generationId !== n.generationId)] })),
  dismiss: (id) => set((s) => ({ notices: s.notices.filter((n) => n.id !== id) })),
}))

// Where a notice leads: the generation in AI Lab, selected.
export const noticeLink = (n: Notice) => `/faction-lab?faction=${n.factionId}&card_type=${n.cardTypeId}&generation=${n.generationId}`
