import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import type { CardType } from '../card-types/api'
import { saveAssemblyTemplate, saveFactionBanner, useAssemblyTemplates, useFactionBanner } from '../assemble/api'
import { defaultTarget } from './defaultTarget'

// Makes the shown image the faction's default for its image type: the card template, the card back or the banner element.
export function UseForFactionButton({ factionId, cardType, generationId }: { factionId: number; cardType: CardType; generationId: number }) {
  const queryClient = useQueryClient()
  const templates = useAssemblyTemplates()
  const banner = useFactionBanner(factionId)
  const target = defaultTarget(cardType)
  const key = `test-${generationId}`
  const current = !target ? false : target.kind === 'element'
    ? banner.element_key === key
    : templates.data?.some(t => t.faction_id === factionId && t.category === target.category && (t.side ?? 'front') === target.side && t.image_key === key) ?? false
  const apply = useMutation({
    mutationFn: async () => {
      if (!target) return
      if (target.kind === 'element') await saveFactionBanner(factionId, { ...banner, element_key: key })
      else await saveAssemblyTemplate({ faction_id: factionId, category: target.category, side: target.side, image_key: key })
    },
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['assembly-templates'] }), queryClient.invalidateQueries({ queryKey: ['faction-banners'] })]),
  })
  if (!target) return null
  return <>
    <Button type="button" disabled={current || apply.isPending} title={`Use this image as ${target.what} of this faction`} onClick={() => apply.mutate()}>
      {current ? 'Used for faction ✓' : apply.isPending ? 'Saving…' : 'Use for faction'}
    </Button>
    {apply.isError && <span role="alert" className="text-xs text-danger">{apply.error.message}</span>}
  </>
}
