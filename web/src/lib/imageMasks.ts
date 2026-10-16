import { useQuery } from '@tanstack/react-query'
import { apiGet, ApiError } from './api'

// A generated image can carry a hiding mask: what it covers is cut out of the image when a card is made from it, so the
// artwork beneath shows through. These are the images that have one and when it last changed.
export type ImageMaskRow = { generation_id: number; updated_at: string }

export function useImageMasks() {
  return useQuery({ queryKey: ['image-masks'], queryFn: () => apiGet<ImageMaskRow[]>('/api/image-masks') })
}

// The image's address with its mask applied (the server cuts the hidden parts out), or the plain address without one.
// The mask's time keeps the browser from showing an older version.
export function maskedImageUrl(url: string, generationId: number | undefined, masks: ImageMaskRow[] | undefined) {
  const mask = generationId === undefined ? undefined : masks?.find(m => m.generation_id === generationId)
  return mask ? `${url}?mask=${encodeURIComponent(mask.updated_at)}` : url
}

async function check(res: Response) {
  if (res.ok) return
  let message = `HTTP ${res.status}`
  try { const body = (await res.json()) as { error?: string }; if (body.error) message = body.error } catch { /* keep the status */ }
  throw new ApiError(res.status, message)
}

export async function saveImageMask(generationId: number, png: Blob) {
  await check(await fetch(`/api/generations/${generationId}/mask`, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: png }))
}

export async function deleteImageMask(generationId: number) {
  await check(await fetch(`/api/generations/${generationId}/mask`, { method: 'DELETE' }))
}

// The saved mask as an image address, or null when there is none.
export async function imageMaskExists(generationId: number) {
  const res = await fetch(`/api/generations/${generationId}/mask`, { method: 'HEAD' })
  return res.ok
}
