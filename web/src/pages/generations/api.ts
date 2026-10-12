import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../../lib/api'
import type { ImageRef } from '../../lib/favorites'
import type { BatchItem, BatchMode } from '../batches/api'

// A finished batch item with its batch's mode/model (GET /api/batch-items).
export type GalleryBatchItem = BatchItem & { mode: BatchMode; model: string; completed_at: string }

export function useDoneBatchItems() {
  return useQuery({ queryKey: ['batch-items'], queryFn: () => apiGet<GalleryBatchItem[]>('/api/batch-items') })
}

// One image on the Generations page, from either Test Generation or a batch.
export type GalleryEntry = {
  key: string
  name: string
  favorite: boolean
  ref: ImageRef
  source: 'test' | 'batch'
  factionId: number
  cardTypeId: number
  mode: 'draft' | 'final'
  model: string
  imageUrl: string
  costUsd: number
  createdAt: string
  batchId?: number
}

export type GalleryFilters = {
  q: string // matched against the image name
  favorites: boolean
  dlcs: string[]
  factionIds: number[]
  cardTypeIds: number[]
  sources: GalleryEntry['source'][]
  modes: GalleryEntry['mode'][]
}

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])
const ids = (v: string | null) => list(v).map(Number).filter((n) => Number.isInteger(n) && n > 0)

// Filters live in the URL (?q=…&fav=1&faction=1,2&card_type=3&dlc=…&source=…&mode=…)
// so Factions / Card Types can link here with them prefilled.
export function parseFilters(p: URLSearchParams): GalleryFilters {
  return {
    q: p.get('q') ?? '',
    favorites: p.get('fav') === '1',
    dlcs: list(p.get('dlc')),
    factionIds: ids(p.get('faction')),
    cardTypeIds: ids(p.get('card_type')),
    sources: list(p.get('source')).filter((s): s is 'test' | 'batch' => s === 'test' || s === 'batch'),
    modes: list(p.get('mode')).filter((m): m is 'draft' | 'final' => m === 'draft' || m === 'final'),
  }
}

export function filtersToParams(f: GalleryFilters): URLSearchParams {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.favorites) p.set('fav', '1')
  if (f.dlcs.length) p.set('dlc', f.dlcs.join(','))
  if (f.factionIds.length) p.set('faction', f.factionIds.join(','))
  if (f.cardTypeIds.length) p.set('card_type', f.cardTypeIds.join(','))
  if (f.sources.length) p.set('source', f.sources.join(','))
  if (f.modes.length) p.set('mode', f.modes.join(','))
  return p
}

export function generationsLink(filters: Partial<GalleryFilters>): string {
  const p = filtersToParams({ q: '', favorites: false, dlcs: [], factionIds: [], cardTypeIds: [], sources: [], modes: [], ...filters })
  const q = p.toString()
  return q ? `/generations?${q}` : '/generations'
}
