import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import type { CardType } from '../card-types/api'
import { saveAssemblyTemplate, saveFactionBanner, saveFactionEventElement, useAssemblyTemplates, useFactionBanner, useFactionEventElement } from '../assemble/api'
import { defaultTarget } from './defaultTarget'
import { saveFactionCard, useFactionCard } from '../faction-card/api'
import type { FactionCardData } from '../faction-card/model'

// Makes the shown image the faction's default for its image type: the card template, the card back, the banner element,
// the event card element or the faction card's front background.
export function UseForFactionButton({ factionId, cardType, generationId }: { factionId: number; cardType: CardType; generationId: number }) {
  const queryClient = useQueryClient()
  const templates = useAssemblyTemplates()
  const banner = useFactionBanner(factionId), eventElement = useFactionEventElement(factionId)
  const target = defaultTarget(cardType)
  const factionCard = useFactionCard(target?.kind === 'faction-card' ? factionId : null)
  const key = `test-${generationId}`
  const current = !target ? false : target.kind === 'element'
    ? banner.element_key === key
    : target.kind === 'event-element'
    ? eventElement.element_key === key
    : target.kind === 'faction-card'
    ? factionCard.data?.front_image_key === key
    : templates.data?.some(t => t.faction_id === factionId && t.category === target.category && (t.side ?? 'front') === target.side && t.image_key === key) ?? false
  const apply = useMutation({
    mutationFn: async () => {
      if (!target) return
      if (target.kind === 'element') await saveFactionBanner(factionId, { ...banner, element_key: key })
      else if (target.kind === 'event-element') await saveFactionEventElement(factionId, { ...eventElement, element_key: key })
      else if (target.kind === 'faction-card') {
        const card = factionCard.data
        if (!card) throw new Error('The faction card is still loading.')
        await saveFactionCard(factionId, { data: card.data as FactionCardData, front_image_key: key, back_image_key: card.back_image_key, unit_color: card.unit_color })
      }
      else await saveAssemblyTemplate({ faction_id: factionId, category: target.category, side: target.side, image_key: key })
    },
    onSuccess: () => Promise.all([queryClient.invalidateQueries({ queryKey: ['assembly-templates'] }), queryClient.invalidateQueries({ queryKey: ['faction-banners'] }), queryClient.invalidateQueries({ queryKey: ['faction-event-elements'] }), queryClient.invalidateQueries({ queryKey: ['faction-card', factionId] })]),
  })
  if (!target) return null
  return <>
    <Button type="button" disabled={current || apply.isPending} title={`Use this image as ${target.what} of this faction`} onClick={() => apply.mutate()}>
      {current ? 'Used for faction ✓' : apply.isPending ? 'Saving…' : 'Use for faction'}
    </Button>
    {apply.isError && <span role="alert" className="text-xs text-danger">{apply.error.message}</span>}
  </>
}
