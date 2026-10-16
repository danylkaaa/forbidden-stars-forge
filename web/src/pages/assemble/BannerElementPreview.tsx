import { useEffect, useRef, useState } from 'react'
import { useFactionColor, useNebulaPicture, type BannerSettings } from './api'
import { renderBanner } from './backDecor'
import { useFactionLogos } from './logos'
import { useLibraryImages } from './library'
import { useNebulaDraft } from './useNebulaDraft'
import { useNebulaPlacementDraft } from './useNebulaPlacementDraft'

const SIZE = { width: 612, height: 828 }
const round = (v: number) => Math.round(Math.max(-1, Math.min(1, v)) * 1000) / 1000

// The faction's card back banner (frame, nebula, logo) with the element at `settings`; drag it to move the element
// (`onChange` gets the new offsets, as shares of the banner).
export function BannerElementPreview({ factionId, settings, onChange }: { factionId: number; settings: BannerSettings; onChange: (patch: Partial<BannerSettings>) => void }) {
  const logoUrl = useFactionLogos().data?.find(l => l.faction_id === factionId)?.url
  const nebula = useNebulaDraft(factionId), factionColor = useFactionColor(factionId)
  const picture = useNebulaPicture('combat'), placement = useNebulaPlacementDraft(factionId, 'combat')
  const images = useLibraryImages()
  const element = settings.element_key ? images.data.find(i => i.key === settings.element_key) : undefined
  const [preview, setPreview] = useState('')
  useEffect(() => {
    let cancelled = false
    renderBanner(SIZE, { ...nebula.value, color: nebula.value.color || factionColor }, picture, placement.value, { logoUrl, logoScale: settings.logo_scale, elementUrl: element?.url, elementPlace: { x: settings.element_x, y: settings.element_y, scale: settings.element_scale } })
      .then(canvas => { if (!cancelled) setPreview(canvas.toDataURL('image/jpeg', 0.9)) }).catch(() => {})
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nebula.value, factionColor, picture, placement.value.x, placement.value.y, placement.value.rotation, logoUrl, settings.logo_scale, element?.url, settings.element_x, settings.element_y, settings.element_scale])
  const drag = useRef<{ x: number; y: number } | null>(null)
  return <div aria-label="Banner preview" className={`relative touch-none select-none overflow-hidden rounded-lg ring-1 ring-divider ${element ? 'cursor-grab active:cursor-grabbing' : ''}`}
    onPointerDown={e => { if (e.button !== 0 || !element) return; e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY } }}
    onPointerMove={e => {
      const d = drag.current, box = e.currentTarget.getBoundingClientRect()
      if (!d || !box.width) return
      // Offsets are shares of the frame, which is about as wide as the card and 0.6 of its height.
      onChange({ element_x: round(settings.element_x + (e.clientX - d.x) / box.width), element_y: round(settings.element_y + (e.clientY - d.y) / box.height / 0.6) })
      drag.current = { x: e.clientX, y: e.clientY }
    }}
    onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
    {preview ? <img src={preview} alt="Banner" draggable={false} className="block aspect-[612/828] w-full object-cover" /> : <div className="aspect-[612/828] w-full bg-black/30" />}
  </div>
}
