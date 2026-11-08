import { useEffect, useMemo, useState } from 'react'
import { useLibraryImages } from '../assemble/library'
import { useFactionLogos } from '../assemble/logos'
import { useFactions } from '../factions/api'
import { useFactionCard, useFactionCardDefaults, type AssetRef } from './api'
import { useFactionCardLayout } from './layout'
import { useCardImages } from './useCardImages'
import { backgroundUrl, initialCardIds, normalizeData, plateUrl } from './model'
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
  const front = backgroundUrl(record.data?.front_image_key ?? '', 'front', assets, images.data)
  const back = backgroundUrl(record.data?.back_image_key ?? '', 'back', assets, images.data)
  const plate = data ? plateUrl(data.plate, assets, images.data) : null
  const cards = useCardImages(data ? initialCardIds(data) : [])
  const ready = !!data && !defaults.isPending && !images.isPending && !layoutQuery.isPending && !cards.pending
  const color = record.data?.unit_color ?? ''
  useEffect(() => {
    if (!ready || !data) return
    let cancelled = false
    // Both sides share the front's background; over it the front's plate or the back image.
    const make = (side: 'front' | 'back', over: string | null) => renderFactionCard({ side, data, unitColor: color, backgroundUrl: front, plateUrl: over, assets, defaults: shared, layout, logoUrl, cardImages: cards.images })
    Promise.all([make('front', plate), make('back', back)]).then(([f, b]) => { if (!cancelled) setState({ front: f.canvas, back: b.canvas, error: '' }) })
      .catch(e => { if (!cancelled) setState({ front: null, back: null, error: e instanceof Error ? e.message : 'Could not render the faction card.' }) })
    return () => { cancelled = true }
  }, [ready, data, color, assets, shared, front, back, plate, layout, logoUrl, cards.images])
  return { ...state, probes: cards.probes, hasFront: !!front, hasBack: !!back, loading: record.isPending || !faction }
}

// One side of a faction's saved card drawn with a freshly generated picture, at half size, as an object URL; null
// while it renders or when `imageUrl` is null. The picture is the front's plate or the back image, over the card's
// saved background. `layersOnly` draws just the background and the picture; `bare` just the picture, on a
// transparent card (to place another picture, like its template, the same way).
export function useFactionCardOver(factionId: number, side: 'front' | 'back', imageUrl: string | null, layersOnly = false, bare = false) {
  const faction = useFactions().data?.find(f => f.id === factionId)
  const layoutQuery = useFactionCardLayout(), layout = layoutQuery.layout
  const logoUrl = useFactionLogoUrl(factionId)
  const record = useFactionCard(factionId), defaults = useFactionCardDefaults(), images = useLibraryImages()
  const [state, setState] = useState<{ url: string | null; error: string }>({ url: null, error: '' })
  const data = useMemo(() => record.data && faction ? normalizeData(record.data.data, faction.name) : null, [record.data, faction])
  const assets = useMemo(() => byKey(record.data?.assets), [record.data?.assets])
  const shared = useMemo(() => byKey(defaults.data), [defaults.data])
  const cards = useCardImages(data ? initialCardIds(data) : [])
  const front = backgroundUrl(record.data?.front_image_key ?? '', 'front', assets, images.data)
  const ready = !!imageUrl && !!data && !defaults.isPending && !layoutQuery.isPending && !cards.pending && !images.isPending
  const color = record.data?.unit_color ?? ''
  useEffect(() => {
    if (!ready || !data) return
    let cancelled = false, url: string | null = null
    renderFactionCard({ side, data, unitColor: color, backgroundUrl: front, plateUrl: imageUrl, layersOnly, bare, assets, defaults: shared, layout, logoUrl, cardImages: cards.images, scale: 0.5 })
      .then(r => new Promise<Blob | null>(resolve => r.canvas.toBlob(resolve, 'image/png')))
      .then(blob => {
        if (cancelled || !blob) return
        url = URL.createObjectURL(blob)
        setState({ url, error: '' })
      })
      .catch(e => { if (!cancelled) setState({ url: null, error: e instanceof Error ? e.message : 'Could not render the faction card.' }) })
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url) }
  }, [ready, side, data, color, imageUrl, front, layersOnly, bare, assets, shared, layout, logoUrl, cards.images])
  return { url: ready ? state.url : null, error: state.error, pending: ready && !state.url && !state.error }
}
