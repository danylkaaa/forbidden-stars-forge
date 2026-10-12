import { usePreviewLayers } from '../lib/previewLayers'

// UI for the template-as-mask preview layer; state lives in
// lib/previewLayers so every preview shares it. Card frames are checked
// with the card preview instead (pages/assemble/QuickCardPreview).

const pill = (on: boolean) =>
  `cursor-pointer rounded-full border px-3 py-1 text-xs font-medium ${
    on ? 'border-accent bg-accent-900 text-accent' : 'border-divider bg-surface text-ink'
  }`

// Toggle buttons (+ mask opacity slider) for whichever layers exist.
export function LayerControls({ maskSrc }: { maskSrc?: string | null }) {
  const { mask, maskOpacity, set } = usePreviewLayers()
  if (!maskSrc) return null
  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
      {maskSrc && (
        <button type="button" aria-pressed={mask} onClick={() => set({ mask: !mask })} className={pill(mask)}>
          Mask {mask ? 'on' : 'off'}
        </button>
      )}
      {maskSrc && mask && (
        <label className="flex items-center gap-1.5 text-xs text-ink/60">
          <input type="range" min={0} max={100} step={5} value={Math.round(maskOpacity * 100)}
            aria-label="Mask opacity"
            onChange={(e) => set({ maskOpacity: Number(e.target.value) / 100 })}
            className="w-24 accent-[var(--color-accent)]" />
          <span className="w-8 tabular-nums">{Math.round(maskOpacity * 100)}%</span>
        </label>
      )}
    </div>
  )
}

// The image with the enabled layers stacked on it.
// fit="natural": the image sizes itself (lightbox); layers stretch over it.
// fit="contain": fills its parent box; every layer is object-contain'ed in
// the same box, so same-aspect layers stay aligned at any size.
export function LayeredImage({
  src, alt, maskSrc, fit, imgClassName = '',
}: {
  src: string
  alt: string
  maskSrc?: string | null
  fit: 'natural' | 'contain'
  imgClassName?: string
}) {
  const { mask, maskOpacity } = usePreviewLayers()
  const layer = fit === 'contain'
    ? 'pointer-events-none absolute inset-0 h-full w-full object-contain'
    : 'pointer-events-none absolute inset-0 h-full w-full rounded-md'
  return (
    <div className={fit === 'contain' ? 'relative h-full w-full' : 'relative'}>
      <img src={src} alt={alt}
        className={fit === 'contain' ? `absolute inset-0 h-full w-full object-contain ${imgClassName}` : `block ${imgClassName}`} />
      {maskSrc && mask && (
        <img src={maskSrc} alt="" data-testid="mask" className={layer} style={{ opacity: maskOpacity }} />
      )}
    </div>
  )
}
