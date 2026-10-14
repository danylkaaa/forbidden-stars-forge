import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import type { Card } from '../cards/model'
import { useTemplate, useTemplateLayout } from '../assemble/library'
import { useCardRenderInput, useRenderedCard } from '../assemble/useCardView'

// Renders one library card off-screen and reports its canvas, or null if it
// cannot be rendered (deleted, or its faction has no template for its type).
export function CardProbe({ cardId, onImage }: { cardId: number; onImage: (id: number, canvas: HTMLCanvasElement | null | undefined) => void }) {
  const query = useQuery({ queryKey: ['cards', 'one', String(cardId)], queryFn: () => apiGet<Card>(`/api/cards/${cardId}`) })
  const card = query.data
  const template = useTemplate(card?.faction_id ?? null, card?.category ?? 'combat')
  const layout = useTemplateLayout(card?.category ?? 'combat')
  const { input } = useCardRenderInput(card, template.image, layout)
  const { result, error } = useRenderedCard(input)
  const unavailable = query.isError || (!!card && !template.isPending && !template.image)
  useEffect(() => {
    if (result) onImage(cardId, result.canvas)
    else if (unavailable || error) onImage(cardId, null)
    return () => onImage(cardId, undefined)
  }, [cardId, result, unavailable, error, onImage])
  return null
}

