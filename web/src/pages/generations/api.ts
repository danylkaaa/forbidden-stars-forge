import type { ImageRef } from '../../lib/favorites'

// One image on the Assets page, from Faction Lab, or uploaded.
export type GalleryEntry = {
  key: string
  name: string
  favorite: boolean
  ref: ImageRef
  parentName: string // set for area edits
  editInstruction: string
  compareSrc: string | null // image it was edited from
  origin: 'generated' | 'uploaded' // made by the image model, or uploaded by you
  factionId: number
  cardTypeId: number
  mode: 'draft' | 'final'
  model: string
  imageUrl: string
  costUsd: number
  createdAt: string
}

export type GalleryFilters = {
  q: string // matched against the image name
  favorites: boolean
  dlcs: string[]
  factionIds: number[]
  cardTypeIds: number[]
  origins: GalleryEntry['origin'][]
  modes: GalleryEntry['mode'][]
}

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : [])
const ids = (v: string | null) => list(v).map(Number).filter((n) => Number.isInteger(n) && n > 0)

// Filters live in the URL (?q=…&fav=1&faction=1,2&card_type=3&dlc=…&mode=…)
// so Factions / Card Templates can link here with them prefilled.
export function parseFilters(p: URLSearchParams): GalleryFilters {
  return {
    q: p.get('q') ?? '',
    favorites: p.get('fav') === '1',
    dlcs: list(p.get('dlc')),
    factionIds: ids(p.get('faction')),
    cardTypeIds: ids(p.get('card_type')),
    origins: list(p.get('origin')).filter((o): o is 'generated' | 'uploaded' => o === 'generated' || o === 'uploaded'),
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
  if (f.origins.length) p.set('origin', f.origins.join(','))
  if (f.modes.length) p.set('mode', f.modes.join(','))
  return p
}

export function generationsLink(filters: Partial<GalleryFilters>): string {
  const p = filtersToParams({ q: '', favorites: false, dlcs: [], factionIds: [], cardTypeIds: [], origins: [], modes: [], ...filters })
  const q = p.toString()
  return q ? `/generations?${q}` : '/generations'
}

// The prompt the server stores on an uploaded image, so it can tell it from a generated one.
export const UPLOADED_PROMPT = '(uploaded)'
