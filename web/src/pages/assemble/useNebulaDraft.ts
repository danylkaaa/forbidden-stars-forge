import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveNebula, useNebula } from './api'
import type { NebulaSettings } from './backDecor'

// Edits a faction's nebula settings (colour, brightness) as a draft: saved explicitly, discarded freely.
export function useNebulaDraft(factionId: number) {
  const saved = useNebula(factionId)
  const [draft, setDraft] = useState<NebulaSettings | null>(null)
  const value = draft ?? saved
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: () => saveNebula(factionId, value),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['nebulas'] }); setDraft(null) },
  })
  const change = (patch: Partial<NebulaSettings>) => { save.reset(); setDraft({ ...value, ...patch }) }
  const discard = () => { save.reset(); setDraft(null) }
  return { value, draft, save, change, discard }
}
