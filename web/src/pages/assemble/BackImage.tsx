import type { Category } from '../cards/model'
import { useBackOverlayScale, useDrawnNebula, useFactionBanner, useNebulaPicture, useNebulaPlacement } from './api'
import { useDecoratedBack, type ElementPlace, type NebulaPlacement, type NebulaSettings } from './backDecor'

// `nebula`, `placement`, `overlayScale` and `elementPlace` override the saved ones, to preview edits.
// On combat and upgrade backs the banner (assembled in the faction's settings) is drawn at the card
// template's size, and `scale` is the logo's share of the banner.
export function BackImage({ url, logoUrl, scale = 0.5, alt = '', category, factionId, nebula, placement, overlayScale, elementUrl, elementPlace }: { url: string; logoUrl?: string; scale?: number; alt?: string; category?: Category; factionId?: number; nebula?: NebulaSettings; placement?: NebulaPlacement; overlayScale?: number; elementUrl?: string; elementPlace?: ElementPlace }) {
  // The banner is one for combat and upgrade backs, with one nebula (its picture and position).
  const nebulaCategory = category === 'upgrade' ? 'combat' : category
  const saved = useDrawnNebula(factionId), templateScale = useBackOverlayScale(category), picture = useNebulaPicture(nebulaCategory), savedPlacement = useNebulaPlacement(factionId, nebulaCategory)
  const banner = useFactionBanner(factionId)
  const size = overlayScale ?? templateScale
  const place = elementPlace ?? { x: banner.element_x, y: banner.element_y, scale: banner.element_scale }
  // Event and upgrade backs carry symmetrical decoration, drawn with the logo.
  // An event back may have its own nebula brightness; the faction's applies where it has none.
  const shownPlacement = placement ?? savedPlacement
  const base = nebula ?? saved
  const lit = category === 'schema' && shownPlacement.brightness ? { ...base, density: shownPlacement.brightness } : base
  const decorated = useDecoratedBack(url, logoUrl, scale, category, lit, size, picture, shownPlacement, elementUrl, place)
  return <div className="relative aspect-[816/1104] w-full overflow-hidden">
    <img draggable={false} src={decorated ?? url} alt={alt} className="block h-full w-full object-cover" />
    {logoUrl && !decorated && <img draggable={false} src={logoUrl} alt="Card back logo" className="pointer-events-none absolute left-1/2 top-1/2 -translate-y-1/2 -translate-x-1/2 object-contain"
      style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }} />}
  </div>
}
