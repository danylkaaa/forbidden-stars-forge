import { useEffect, useState } from 'react'
import { useBackOverlayScale, useDrawnNebula, useFactionBanner, useNebulaPicture, useNebulaPlacement } from '../assemble/api'
import { renderBack } from '../assemble/backDecor'
import type { Category } from '../cards/model'

// A rendered card (or card back) as JPEG bytes for the PDF plus a blob URL
// for the on-screen preview.
export type PrintAsset = { jpeg: Uint8Array; width: number; height: number; url: string }

// `size` resamples to the pixel dimensions the card needs at print resolution.
export async function canvasAsset(source: HTMLCanvasElement, size?: { width: number; height: number }): Promise<PrintAsset> {
  // JPEG has no transparency; the rounded corners print as white paper.
  const flat = document.createElement('canvas'); flat.width = size?.width ?? source.width; flat.height = size?.height ?? source.height
  const ctx = flat.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create a canvas.')
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, flat.width, flat.height); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, flat.width, flat.height)
  const blob = await new Promise<Blob>((resolve, reject) => flat.toBlob(b => b ? resolve(b) : reject(new Error('JPEG export failed.')), 'image/jpeg', 0.95))
  return { jpeg: new Uint8Array(await blob.arrayBuffer()), width: flat.width, height: flat.height, url: URL.createObjectURL(blob) }
}

// Drawn as on the card: with the faction's nebula and, on combat and upgrade backs, its banner.
export function useBackAsset(url: string | undefined, logoUrl: string | undefined, scale: number | undefined, size: { width: number; height: number }, category: Category = 'combat', factionId?: number, elementUrl?: string) {
  const nebulaCategory = category === 'upgrade' ? 'combat' : category
  const overlayScale = useBackOverlayScale(category), picture = useNebulaPicture(nebulaCategory)
  const drawn = useDrawnNebula(factionId), placement = useNebulaPlacement(factionId, nebulaCategory), banner = useFactionBanner(factionId)
  const nebula = category === 'schema' && placement.brightness ? { ...drawn, density: placement.brightness } : drawn
  const [state, setState] = useState<{ asset: PrintAsset | null; error: string }>({ asset: null, error: '' })
  useEffect(() => {
    if (!url) { setState({ asset: null, error: '' }); return }
    let cancelled = false, made: PrintAsset | null = null
    renderBack(url, logoUrl, scale ?? 0.5, category, undefined, nebula, overlayScale, picture, placement, elementUrl, { x: banner.element_x, y: banner.element_y, scale: banner.element_scale }).then(canvas => canvasAsset(canvas, size)).then(asset => {
      if (cancelled) URL.revokeObjectURL(asset.url); else { made = asset; setState({ asset, error: '' }) }
    }).catch(e => { if (!cancelled) setState({ asset: null, error: e instanceof Error ? e.message : 'Could not render the card back.' }) })
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made.url) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, logoUrl, scale, size, category, overlayScale, picture, nebula.color, nebula.density, nebula.seed, placement.x, placement.y, placement.rotation, elementUrl, banner.element_x, banner.element_y, banner.element_scale])
  return state
}
