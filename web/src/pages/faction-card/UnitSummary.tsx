import { BUNDLED_ICONS } from './bundled'

const GEAR = <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path fill="currentColor" d="M12 1l2 3 3.5-.8.8 3.5 3 2-1.6 3.1 1.6 3.1-3 2-.8 3.5L14 20l-2 3-2-3-3.5.8-.8-3.5-3-2L4.3 12 2.7 8.9l3-2 .8-3.5L10 4zm0 7a4 4 0 100 8 4 4 0 000-8z" fillRule="evenodd" /></svg>
const STATS = [
  { key: 'cost', title: 'Materials', color: 'text-green-400' },
  { key: 'dice', title: 'Dice', color: 'text-blue-400' },
  { key: 'health', title: 'Skulls (health)', color: 'text-red-400' },
  { key: 'morale', title: 'Eagles (morale)', color: 'text-orange-400' },
] as const

// One line for an accordion title: NAME (type) then the unit's numbers, each
// with a small icon and its colour.
export function UnitSummary({ name, type, icons, ...values }: { name: string; type: string; icons: Record<string, string | undefined>; cost: number; dice?: number; health?: number; morale?: number }) {
  return <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 align-middle">
    <span className="font-semibold uppercase text-ink">{name || type}</span>
    <span className="text-xs text-ink/55">({type})</span>
    {STATS.map(({ key, title, color }) => values[key] === undefined ? null
      : <span key={key} title={title} className={`inline-flex items-center gap-1 rounded bg-white/8 px-1.5 py-0.5 font-mono text-xs ${color}`}>
        {key === 'cost' ? GEAR : <img src={icons[key] ?? BUNDLED_ICONS[key === 'dice' ? 'dice' : key]} alt="" className="h-3.5 w-3.5 object-contain" style={{ filter: 'brightness(1.9) saturate(1.3)' }} />}
        <span aria-label={`${title}: ${values[key]}`}>{values[key]}</span>
      </span>)}
  </span>
}
