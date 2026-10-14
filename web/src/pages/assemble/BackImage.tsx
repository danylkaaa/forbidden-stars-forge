import type { Category } from '../cards/model'
import { useBackOverlayScale, useNebula, useNebulaPicture } from './api'
import { useDecoratedBack, type NebulaSettings } from './backDecor'

// `nebula` overrides the faction's saved nebula, to preview edits.
export function BackImage({ url, logoUrl, scale = 0.5, alt = '', category, factionId, nebula, overlayScale }: { url: string; logoUrl?: string; scale?: number; alt?: string; category?: Category; factionId?: number; nebula?: NebulaSettings; overlayScale?: number }) {
  const saved = useNebula(factionId), savedScale = useBackOverlayScale(category), picture = useNebulaPicture(category)
  // Event and upgrade backs carry symmetrical decoration, drawn with the logo.
  const decorated = useDecoratedBack(url, logoUrl, scale, category, nebula ?? saved, overlayScale ?? savedScale, picture)
  return <div className="relative aspect-[816/1104] w-full overflow-hidden">
    <img draggable={false} src={decorated ?? url} alt={alt} className="block h-full w-full object-cover" />
    {logoUrl && !decorated && <img draggable={false} src={logoUrl} alt="Card back logo" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
      style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }} />}
  </div>
}
