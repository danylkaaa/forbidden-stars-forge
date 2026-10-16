import { LayeredImage } from '../../components/PreviewLayers'
import { CARD_IMAGE_PX } from '../../components/safeAreaStore'
import { SafeAreaLines } from '../../components/SafeArea'
import { useCutMm } from '../print/layout'
import { usePreviewLayers } from '../../lib/previewLayers'
import type { Category } from '../cards/model'
import { BackImage } from './BackImage'
import { useFactionBanner } from './api'
import { useLibraryImages } from './library'
import { useFactionLogos } from './logos'

// A generated back as a finished card back: the faction's banner (frame with its
// nebula, logo and ornament) over it; the template mask can be laid on top, and parts switched off.
// `inline` fits it into the height of its parent box (the lab's result panel) instead of the window.
export function BackFlatPreview({ factionId, category = 'combat', src, alt, maskSrc, inline = false }: {
  factionId: number; category?: Category; src: string; alt: string; maskSrc?: string | null; inline?: boolean
}) {
  const banner = useFactionBanner(factionId), images = useLibraryImages()
  const logoUrl = useFactionLogos().data?.find(l => l.faction_id === factionId)?.url
  const elementUrl = banner.element_key ? images.data.find(i => i.key === banner.element_key)?.url : undefined
  const { mask, maskOpacity, overlay } = usePreviewLayers()
  const cutMm = useCutMm()
  if (!overlay) return inline
    ? <div className="h-full w-full"><LayeredImage src={src} alt={alt} maskSrc={maskSrc} fit="contain" /></div>
    : <LayeredImage src={src} alt={alt} maskSrc={maskSrc} fit="natural" imgClassName="max-h-[80vh] max-w-full rounded-md object-contain" />
  return <div className={`relative mx-auto aspect-[816/1104] overflow-hidden rounded-md shadow-[0_16px_40px_rgba(0,0,0,0.65)] ${inline ? 'h-full max-w-full' : 'max-h-[80vh] w-[min(100%,calc(80vh*0.739))]'}`}>
    <BackImage category={category} factionId={factionId} url={src} logoUrl={logoUrl} scale={banner.logo_scale} elementUrl={elementUrl} alt={alt} />
    <SafeAreaLines px={CARD_IMAGE_PX} cutMm={cutMm} />
    {maskSrc && mask && <img src={maskSrc} alt="" data-testid="mask" className="pointer-events-none absolute inset-0 h-full w-full object-contain" style={{ opacity: maskOpacity }} />}
  </div>
}
