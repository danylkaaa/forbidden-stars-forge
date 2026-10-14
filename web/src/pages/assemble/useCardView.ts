import { useEffect, useMemo, useState } from 'react'
import { useFactions } from '../factions/api'
import { cardDraft, type Card } from '../cards/model'
import { draftInput, validateCard } from '../cards/validation'
import { useCardAssembly, type Assembly } from './api'
import { defaultArtwork } from './artwork'
import { withSubtypeLayout, type CombatCard, type FramedCard } from './model'
import { renderCard, type RenderInput } from './render'
import { useAssembly } from './state'
import { resolveSubtype, useSubtypes } from './subtypes'
import { useFactionLogos } from './logos'
import type { LibraryImage, useTemplateLayout } from './library'

const NO_TRANSFORM = defaultArtwork()
export type RenderResult = Awaited<ReturnType<typeof renderCard>>

// Renders whenever the (memoized) input changes; stale renders are dropped.
export function useRenderedCard(input: RenderInput | null) {
  const [result, setResult] = useState<RenderResult | null>(null)
  const [error, setError] = useState('')
  const [rendering, setRendering] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let cancelled = false
    setError(''); setRendering(!!input)
    if (!input) { setResult(null); return }
    renderCard(input).then(value => { if (!cancelled) { setResult(value); setRendering(false) } })
      .catch(e => { if (!cancelled) { setResult(null); setRendering(false); setError(e instanceof Error ? e.message : 'Could not render card.') } })
    return () => { cancelled = true }
  }, [input, retry])
  return { result, error, rendering, retry: () => setRetry(n => n + 1) }
}

// The card as currently edited: saved values plus this browser's drafts.
export function useCardDraft(source: Card | undefined, placeholderTitle = '') {
  const id = source ? String(source.id) : ''
  const edits = useAssembly(s => s.edits[id])
  const factions = useFactions()
  const saved = useMemo(() => source ? cardDraft(source) : null, [source])
  const draft = useMemo(() => saved ? { ...saved, ...edits } : null, [saved, edits])
  const issues = useMemo(() => draft && factions.data ? validateCard(draftInput(draft), factions.data.map(f => f.id)) : [], [draft, factions.data])
  const card = useMemo(() => draft && factions.data && !issues.some(i => i.field !== 'name' || !placeholderTitle)
    ? draftInput({ ...draft, name: draft.name || placeholderTitle }) as CombatCard | FramedCard : null, [draft, issues, factions.data, placeholderTitle])
  const dirty = !!saved && !!draft && Object.keys(draft).some(key => draft[key] !== saved[key])
  return { id, saved, draft, issues, card, dirty }
}

// Everything renderCard needs for one library card, including unsaved
// artwork transforms and layout edits.
export function useCardRenderInput(source: Card | undefined, image: LibraryImage | undefined, template: ReturnType<typeof useTemplateLayout>, localAssembly?: Assembly) {
  const { id, card } = useCardDraft(source, localAssembly ? 'New card' : '')
  const savedAssembly = useCardAssembly(localAssembly ? '' : id)
  const assembly = { ...savedAssembly, data: localAssembly ?? savedAssembly.data }
  const localLogoScale = useAssembly(s => s.logoScales[id])
  const logoScale = localLogoScale ?? assembly.data?.logo_scale ?? 1
  const localTransform = useAssembly(s => s.transforms[id])
  const transform = localTransform ?? assembly.data?.transform ?? NO_TRANSFORM
  const artworkUrl = card?.category === 'upgrade' ? null : assembly.data?.image_url || null
  const subtypes = useSubtypes()
  const subtype = resolveSubtype(subtypes.data, assembly.data?.subtype_id, card)
  const localTitleScale = useAssembly(s => s.titleScales[id])
  const titleScale = localTitleScale ?? assembly.data?.layout?.title_scale ?? 1
  const layout = useMemo(() => {
    const base = withSubtypeLayout(template.layout, subtype?.layout)
    return titleScale === 1 ? base : { ...base, name: { ...base.name, size: base.name.size * titleScale } }
  }, [template.layout, subtype, titleScale])
  const logos = useFactionLogos()
  const logoUrl = logos.data?.find(l => l.faction_id === card?.faction_id)?.url ?? null
  const input = useMemo<RenderInput | null>(() => card && image && template.ready && assembly.data && !subtypes.isPending && !logos.isPending
    ? { card, layout, imageUrl: image.url, overlayUrl: null, overlayUrls: subtype?.overlays.map(o => o.url) ?? [], logoUrl, logoScale, artworkUrl, artwork: transform }
    : null, [card, image, template.ready, assembly.data, subtypes.isPending, subtype, logos.isPending, logoUrl, logoScale, layout, artworkUrl, transform])
  return { input, assembly, logoScale, titleScale, transform, layout, artworkUrl, subtypes, subtype }
}
