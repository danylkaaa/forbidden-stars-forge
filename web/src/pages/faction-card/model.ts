// Faction card: one per faction. 258 × 170 mm cut size plus 5 mm of bleed on
// every edge = 268 × 180 mm, 3165 × 2126 px at 300 dpi per side.
export const FACTION_CARD_CUT_MM = { width: 258, height: 170 } as const
export const FACTION_CARD_BLEED_MM = 5
export const CARD_SIZE = { width: 3165, height: 2126 } as const

// A unit icon is rendered with a field of view this many times wider than the model needs, and drawn this much bigger.
export const MODEL_FIELD = 1.7

// Every faction has the same seven unit rows; only names, stats and models differ.
export const UNIT_SLOTS = [
  { key: 'bastion', label: 'Bastion', structure: true },
  { key: 'infantry', label: 'Infantry' },
  { key: 'ships', label: 'Light ships' },
  { key: 'elite', label: 'Elite infantry' },
  { key: 'fighter', label: 'Fighters' },
  { key: 'capital', label: 'Capital ships' },
  { key: 'champion', label: 'Champions' },
] as const
export type SlotKey = typeof UNIT_SLOTS[number]['key']

export type UnitStats = { name: string; dice: number; health: number; morale: number; cost: number; forge: number; tech: number | null }
// How a unit's STL is posed for its icon. Angles are degrees; scale 1 fits the model in the icon.
// `detail` is the strength of dark crease lines drawn where the surface bends;
// `relief` boosts fine surface relief that ordinary lighting leaves flat.
// The drop shadow and outline are fractions of the icon size; the light is a
// directional light (angles in degrees) plus ambient light.
export type Orientation = { rx: number; ry: number; rz: number; scale: number; x: number; y: number; shadow: number; shadowBlur: number; shadowX: number; shadowY: number; outline: number; innerShadow: number; innerShadowSize: number; contrast: number; lightAzimuth: number; lightElevation: number; lightPower: number; lightAmbient: number; detail: number; relief: number }
export const DEFAULT_ORIENTATION: Orientation = { rx: -90, ry: 0, rz: 0, scale: 1, x: 0, y: 0, shadow: 0.45, shadowBlur: 0.04, shadowX: 0.01, shadowY: 0.03, outline: 0.012, innerShadow: 0, innerShadowSize: 0.03, contrast: 1, lightAzimuth: -35, lightElevation: 50, lightPower: 2.8, lightAmbient: 0.18, detail: 0.6, relief: 0.8 }
// Drop shadow, inner shadow (darkening along the inside of the edge), contrast
// and outline are set once for the whole faction card (every unit
// icon shares them); they override whatever a unit's own pose holds.
export type ModelStyle = Pick<Orientation, 'shadow' | 'shadowBlur' | 'shadowX' | 'shadowY' | 'outline' | 'innerShadow' | 'innerShadowSize' | 'contrast'>
export const DEFAULT_MODEL_STYLE: ModelStyle = { shadow: DEFAULT_ORIENTATION.shadow, shadowBlur: DEFAULT_ORIENTATION.shadowBlur, shadowX: DEFAULT_ORIENTATION.shadowX, shadowY: DEFAULT_ORIENTATION.shadowY, outline: DEFAULT_ORIENTATION.outline, innerShadow: DEFAULT_ORIENTATION.innerShadow, innerShadowSize: DEFAULT_ORIENTATION.innerShadowSize, contrast: DEFAULT_ORIENTATION.contrast }
// Poses saved before the shadow existed get the default shadow.
export const withDefaults = (o: Partial<Orientation> | undefined): Orientation => ({ ...DEFAULT_ORIENTATION, ...o })
// A row of the back's initial forces: a unit slot, a structure, reinforcements, materiel or a library card.
export type ForcesIcon = SlotKey | 'city' | 'factory' | 'reinforcement' | 'forge_token' | 'materiel' | 'card'
// `card_id` is the library card shown when the icon is 'card' (e.g. an order upgrade).
export type InitialRow = { icon: ForcesIcon; count: number; label: string; card_id?: number }
export type Objective = { name: string; text: string }

export type FactionCardData = {
  title: string; subtitle: string; text: string
  back_text: string; signature: string; signature_title: string
  // The card's primary colour (#rrggbb); every panel colour is derived from it. Empty = the faction's unit colour.
  theme: string
  // Optional overrides of two derived colours (#rrggbb, empty = derived from the theme): the light panels' colour and the objective picture frames' solid border.
  panel_color: string; frame_color: string; light_color: string // light_color turns the light bars' hue
  city_cost: number; factory_cost: number
  units: Record<SlotKey, UnitStats>
  models: Partial<Record<SlotKey, Partial<Orientation>>>
  initial: InitialRow[]
  objectives: Objective[]
}

const unit = (name: string, cost: number, dice: number, health: number, morale: number, tech: number | null, forge = 0): UnitStats => ({ name, cost, dice, health, morale, tech, forge })
export function defaultData(factionName = ''): FactionCardData {
  return {
    title: factionName.toUpperCase(), subtitle: '', text: '',
    back_text: '', signature: '', signature_title: '', theme: '', panel_color: '', frame_color: '', light_color: '',
    city_cost: 3, factory_cost: 2,
    units: {
      bastion: unit('Bastion', 2, 2, 3, 2, null), infantry: unit('Infantry', 2, 2, 2, 1, 0), ships: unit('Light ships', 2, 2, 2, 2, 0),
      elite: unit('Elite infantry', 3, 3, 3, 2, 1), fighter: unit('Fighters', 4, 4, 3, 3, 2),
      capital: unit('Capital ships', 5, 4, 5, 4, 2, 1), champion: unit('Champions', 5, 3, 6, 3, 3, 1),
    },
    models: {},
    initial: [
      { icon: 'infantry', count: 3, label: 'Infantry' }, { icon: 'elite', count: 2, label: 'Elite infantry' },
      { icon: 'capital', count: 1, label: 'Capital ship' },
      { icon: 'materiel', count: 6, label: 'Materiel' },
    ],
    objectives: Array.from({ length: 6 }, () => ({ name: '', text: '' })),
  }
}

// Fills whatever a stored card lacks (new fields, a card never saved).
export function normalizeData(raw: unknown, factionName = ''): FactionCardData {
  const base = defaultData(factionName), r = (raw && typeof raw === 'object' ? raw : {}) as Partial<FactionCardData>
  const units = Object.fromEntries(UNIT_SLOTS.map(({ key }) => [key, { ...base.units[key], ...r.units?.[key] }])) as Record<SlotKey, UnitStats>
  return {
    ...base, ...r, units,
    models: r.models ?? {},
    theme: typeof r.theme === 'string' ? r.theme : '',
    panel_color: typeof r.panel_color === 'string' ? r.panel_color : '', frame_color: typeof r.frame_color === 'string' ? r.frame_color : '', light_color: typeof r.light_color === 'string' ? r.light_color : '',
    // Cache tokens were removed from the initial forces.
    initial: Array.isArray(r.initial) ? r.initial.filter(row => (row.icon as string) !== 'cache') : base.initial,
    objectives: base.objectives.map((o, i) => ({ ...o, ...r.objectives?.[i] })),
  }
}

export const assetKeys = {
  model: (slot: SlotKey) => `stl-${slot}`, icon: (slot: SlotKey) => `icon-${slot}`,
  objective: (n: number) => `objective-${n + 1}`, portrait: 'portrait',
}
// Shared icons for every faction (stored under faction 0). Until uploaded the
// card draws a plain placeholder.
export const DEFAULT_ICONS = [
  { key: 'city', label: 'City' }, { key: 'factory', label: 'Factory' }, { key: 'bastion', label: 'Bastion' },
  { key: 'gear', label: 'Materiel (gear)' },
  { key: 'forge', label: 'Forge requirement' }, { key: 'tech', label: 'Tech level badge' },
  { key: 'reinforce', label: 'Reinforcement token' }, { key: 'forge-token', label: 'Forge token' }, { key: 'dice', label: 'Dice (power)' }, { key: 'health', label: 'Health' }, { key: 'morale', label: 'Morale' },
] as const
export type DefaultIconKey = typeof DEFAULT_ICONS[number]['key']

// Library cards the initial forces show.
export const initialCardIds = (data: FactionCardData) => data.initial.flatMap(r => r.icon === 'card' && r.card_id ? [r.card_id] : [])

export const downloadName = (faction: string, side: 'front' | 'back') => `${faction.trim().replace(/[\\/:*?"<>|]/g, '-') || 'faction'} faction card ${side}.png`

// The picked front or back image: 'upload' is a file uploaded for this card
// (stored as the `front-image` / `back-image` asset), anything else a generated
// library image by key.
export const UPLOADED_IMAGE = 'upload'
export function backgroundUrl(key: string, side: 'front' | 'back', assets: Record<string, string>, library: { key: string; url: string }[]): string | null {
  if (key === UPLOADED_IMAGE) return assets[`${side}-image`] ?? null
  return library.find(i => i.key === key)?.url ?? null
}
