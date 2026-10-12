import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveAssemblyTemplate, useAssemblyTemplates } from './api'
import type { Category } from '../cards/model'

// Read logo settings independently of the assigned image: candidates use the
// same faction logo without replacing the faction's selected back.
export function useBackLogo(factionId?: number, category: Category = 'combat') {
  const templates = useAssemblyTemplates()
  const template = templates.data?.find(t => t.faction_id === factionId && t.category === category && t.side === 'back')
  const [draft, setDraft] = useState<{ key: string; scale: number } | null>(null)
  const key = `${factionId}:${category}:${template?.logo_url}:${template?.logo_scale}`
  const scale = draft?.key === key ? draft.scale : template?.logo_scale ?? 0.5
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: async () => {
      if (!template) return
      return saveAssemblyTemplate({ faction_id: template.faction_id, category, side: 'back', image_key: template.image_key, logo_scale: scale })
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assembly-templates'] }),
  })
  return { logoUrl: template?.logo_url, scale, setScale: (value: number) => { save.reset(); setDraft({ key, scale: value }) }, save, changed: scale !== (template?.logo_scale ?? 0.5) }
}

