import { useEffect, useMemo, useRef, useState } from 'react'
import { useFactions } from '../factions/api'
import { cardDraft, type Card } from '../cards/model'
import { draftInput, validateCard } from '../cards/validation'
import { cardLogoScale, useCardAssembly, useCardLogoScales, type Assembly } from './api'
import { defaultArtwork } from './artwork'
import { useEventElementInput } from './eventElement'
import type { CombatCard, FramedCard } from './model'
import { renderCard, type RenderInput } from './render'
import { useAssembly } from './state'
import { useFactionLogos } from './logos'
import { useOverlayAdjust } from './overlays'
import type { LibraryImage, useTemplateLayout } from './library'

const NO_TRANSFORM = defaultArtwork()
export type RenderResult = Awaited<ReturnType<typeof renderCard>>

// Full-size card renders are heavy, so only a couple run at a time, each started from a fresh turn of the event loop
// (a library with hundreds of cards would otherwise freeze the page). A render whose tile went away while it
// waited is skipped.
const MAX_RENDERS = 2
let rendering = 0
const waiting: (() => void)[] = []
function startNext() {
  while (rendering < MAX_RENDERS && waiting.length) { rendering++; waiting.shift()!() }
}
function queued<T>(job: () => Promise<T>, stale: () => boolean): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    waiting.push(() => {
      setTimeout(() => {
        const done = () => { rendering--; startNext() }
        if (stale()) { done(); resolve(undefined); return }
        job().then(resolve, reject).finally(done)
      }, 0)
    })
    startNext()
  })
}

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
    queued(() => renderCard(input), () => cancelled).then(value => { if (!cancelled && value) { setResult(value); setRendering(false) } })
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
  // The faction logo is the same size on every card of a faction and category.
  const logoScales = useCardLogoScales()
  const logoScale = cardLogoScale(logoScales.data, card?.faction_id, card?.category)
  const localTransform = useAssembly(s => s.transforms[id])
  const transform = localTransform ?? assembly.data?.transform ?? NO_TRANSFORM
  const artworkUrl = card?.category === 'upgrade' ? null : assembly.data?.image_url || null
  const localTitleScale = useAssembly(s => s.titleScales[id])
  const titleScale = localTitleScale ?? assembly.data?.layout?.title_scale ?? 1
  // A card can set the size of its description (the upper text; on combat cards also the unit text) on its own.
  const localDescriptionScale = useAssembly(s => s.descriptionScales?.[id])
  const descriptionScale = localDescriptionScale ?? assembly.data?.layout?.description_scale ?? 1
  const localLowerScale = useAssembly(s => s.lowerScales?.[id])
  const lowerScale = card?.category === 'combat' ? localLowerScale ?? assembly.data?.layout?.lower_scale ?? 1 : 1
  // The size of this card's resource icons, for a card with more of them than the column fits.
  const localResourcesScale = useAssembly(s => s.resourcesScales?.[id])
  const resourcesScale = card?.category === 'combat' ? localResourcesScale ?? assembly.data?.layout?.resources_scale ?? 1 : 1
  const localPadding = useAssembly(s => s.textPaddings?.[id])
  const textPadding = localPadding ?? assembly.data?.layout?.text_padding
  const layout = useMemo(() => {
    let base = template.layout
    if (titleScale !== 1) base = { ...base, name: { ...base.name, size: base.name.size * titleScale } }
    if (descriptionScale !== 1) base = { ...base, upper_text: { ...base.upper_text, size: base.upper_text.size * descriptionScale } }
    if (lowerScale !== 1) base = { ...base, lower_text: { ...base.lower_text, size: base.lower_text.size * lowerScale } }
    if (resourcesScale !== 1) base = { ...base, resources: { ...base.resources, size: base.resources.size * resourcesScale } }
    if (textPadding) base = {
      ...base,
      upper_text: { ...base.upper_text, ...(textPadding.upper_top !== undefined ? { paddingTop: textPadding.upper_top } : {}), ...(textPadding.upper_bottom !== undefined ? { paddingBottom: textPadding.upper_bottom } : {}) },
      lower_text: { ...base.lower_text, ...(textPadding.lower_top !== undefined ? { paddingTop: textPadding.lower_top } : {}), ...(textPadding.lower_bottom !== undefined ? { paddingBottom: textPadding.lower_bottom } : {}) },
    }
    return base
  }, [template.layout, titleScale, descriptionScale, lowerScale, resourcesScale, textPadding])
  const logos = useFactionLogos()
  const logoUrl = logos.data?.find(l => l.faction_id === card?.faction_id)?.url ?? null
  const eventElement = useEventElementInput(card?.category === 'schema' ? card.faction_id : null)
  const overlayAdjust = useOverlayAdjust(card?.faction_id)
  const input = useMemo<RenderInput | null>(() => card && image && template.ready && assembly.data && !logos.isPending
    ? { card, layout, imageUrl: image.url, logoUrl, logoScale, artworkUrl, artwork: transform, eventElement, overlayAdjust }
    : null, [card, image, template.ready, assembly.data, logos.isPending, logoUrl, logoScale, layout, artworkUrl, transform, eventElement, overlayAdjust])
  return { input, assembly, logoScale, titleScale, descriptionScale, lowerScale, resourcesScale, textPadding: textPadding ?? {}, transform, layout, artworkUrl }
}

// True once the element has come near the viewport (and stays true). Without IntersectionObserver it is always true.
export function useNearViewport(margin = '800px') {
  const [near, setNear] = useState(typeof IntersectionObserver === 'undefined')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (near || !el) return
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setNear(true); observer.disconnect() } }, { rootMargin: margin })
    observer.observe(el)
    return () => observer.disconnect()
  }, [near, margin])
  return { near, ref }
}
