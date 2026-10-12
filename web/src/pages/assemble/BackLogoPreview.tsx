import { Button } from '../../components/Button'
import { LayeredImage } from '../../components/PreviewLayers'
import type { Category } from '../cards/model'
import { useBackLogo } from './backLogo'

export function BackLogoScaleControls({ logo }: { logo: ReturnType<typeof useBackLogo> }) {
  if (!logo.logoUrl) return null
  return <div className="flex flex-wrap items-center gap-2 text-xs text-ink" onClick={e => e.stopPropagation()}>
    <label className="flex items-center gap-2">Back logo size
      <input type="range" min={5} max={100} step={1} aria-label="Back logo size" value={Math.round(logo.scale * 100)}
        disabled={logo.save.isPending} onChange={e => logo.setScale(Number(e.target.value) / 100)} className="w-32 accent-[var(--color-accent)]" />
      <span className="w-9 tabular-nums">{Math.round(logo.scale * 100)}%</span>
    </label>
    <Button disabled={!logo.changed || logo.save.isPending} onClick={() => logo.save.mutate()}>Save logo size</Button>
    {logo.save.isSuccess && <span role="status">Saved.</span>}
    {logo.save.isError && <span role="alert" className="text-danger">{logo.save.error.message}</span>}
  </div>
}

export function BackLogoFlatPreview({ factionId, category = 'combat', src, alt, maskSrc, imgClassName }: {
  factionId: number; category?: Category; src: string; alt: string; maskSrc?: string | null; imgClassName?: string
}) {
  const logo = useBackLogo(factionId, category)
  return <div className="flex flex-col items-center gap-2">
    <LayeredImage src={src} alt={alt} maskSrc={maskSrc} fit="natural" imgClassName={imgClassName} logoUrl={logo.logoUrl} logoScale={logo.scale} />
    <BackLogoScaleControls logo={logo} />
  </div>
}
