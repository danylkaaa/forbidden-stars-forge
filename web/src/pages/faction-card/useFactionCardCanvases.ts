import { useEffect, useMemo, useState } from 'react'
import { useLibraryImages } from '../assemble/library'
import { useFactionLogos } from '../assemble/logos'
import { useFactions } from '../factions/api'
import { useFactionCard, useFactionCardDefaults, type AssetRef } from './api'
import { useFactionCardLayout } from './layout'
import { useCardImages } from './useCardImages'
import { initialCardIds, normalizeData } from './model'
import { renderFactionCard } from './render'

// The faction's logo (uploaded on Library → Factions), if it has one.
export function useFactionLogoUrl(factionId: number | null) {
  const logos = useFactionLogos()
  return logos.data?.find(l => l.faction_id === factionId)?.url ?? null
}

const byKey = (assets: AssetRef[] | undefined) => Object.fromEntries((assets ?? []).map(a => [a.key, a.url]))

// A faction's saved card, both sides rendered at full size (for printing).
export function useFactionCardCanvases(factionId: number) {
  const faction = useFactions().data?.find(f => f.id === factionId)
  const layoutQuery = useFactionCardLayout(), layout = layoutQuery.layout
  const logoUrl = useFactionLogoUrl(factionId)
  const record = useFactionCard(factionId), defaults = useFactionCardDefaults(), images = useLibraryImages()
  const [state, setState] = useState<{ front: HTMLCanvasElement | null; back: HTMLCanvasElement | null; error: string }>({ front: null, back: null, error: '' })
  const data = useMemo(() => record.data && faction ? normalizeData(record.data.data, faction.name) : null, [record.data, faction])
  const assets = useMemo(() => byKey(record.data?.assets), [record.data?.assets])
  const shared = useMemo(() => byKey(defaults.data), [defaults.data])
  const front = images.data.find(i => i.key === record.data?.front_image_key)?.url ?? null
  const back = images.data.find(i => i.key === record.data?.back_image_key)?.url ?? null
  const cards = useCardImages(data ? initialCardIds(data) : [])
  const ready = !!data && !defaults.isPending && !images.isPending && !layoutQuery.isPending && !cards.pending
  const color = record.data?.unit_color ?? ''
  useEffect(() => {
    if (!ready || !data) return
    let cancelled = false
    const make = (side: 'front' | 'back', backgroundUrl: string | null) => renderFactionCard({ side, data, unitColor: color, backgroundUrl, assets, defaults: shared, layout, logoUrl, cardImages: cards.images })
    Promise.all([make('front', front), make('back', back)]).then(([f, b]) => { if (!cancelled) setState({ front: f.canvas, back: b.canvas, error: '' }) })
      .catch(e => { if (!cancelled) setState({ front: null, back: null, error: e instanceof Error ? e.message : 'Could not render the faction card.' }) })
    return () => { cancelled = true }
  }, [ready, data, color, assets, shared, front, back, layout, logoUrl, cards.images])
  return { ...state, probes: cards.probes, hasFront: !!front, hasBack: !!back, loading: record.isPending || !faction }
}
