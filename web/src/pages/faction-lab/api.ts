import { useQuery } from '@tanstack/react-query'
import { apiSend } from '../../lib/api'
import type { CtFields, LabFields } from './store'

// Assembles the image prompt from unsaved faction fields and card type text
// (server-side, so it's exactly what Faction Lab would send).
export function useAssembledPrompt(cardTypeId: number | null, name: string, fields: LabFields | null, ct: CtFields | null) {
  return useQuery({
    queryKey: ['assemble', cardTypeId, name, fields, ct],
    queryFn: () => apiSend<{ prompt: string; has_file: boolean }>('POST', '/api/generate/assemble', {
      card_type_id: cardTypeId, name, ...fields,
      ...(ct ? { card_type_description: ct.description, card_type_constraints: ct.constraints } : {}),
    }),
    enabled: cardTypeId !== null && fields !== null,
    placeholderData: (prev) => prev, // no flicker while typing
  })
}
