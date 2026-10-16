import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useCards } from '../pages/cards/api'
import { useFactionColors } from '../pages/assemble/api'
import { useFactionLogos } from '../pages/assemble/logos'
import { useAssembly } from '../pages/assemble/state'
import { useSelectedFactionId } from '../pages/assemble/selectedFaction'
import { DLC_VALUES } from '../pages/factions/dlc'
import { useFactions, type Faction } from '../pages/factions/api'

// Each expansion's marker colour.
const DLC_COLOR: Record<string, string> = { 'Galaxy in Flames': '#2ee62e', 'Symphony of War': '#a64dff', 'Darkest Dawn': '#ffffff' }
const FALLBACK = '#8a8a8a'

function Diamond({ color }: { color: string }) {
  return <span aria-hidden="true" className="grid size-5 flex-none place-items-center rounded-full bg-black/40"><span className="size-2.5 rotate-45 rounded-[2px]" style={{ background: color }} /></span>
}

// The faction's logo in a circle, or its colour when it has no logo yet.
function Dot({ color, logo }: { color: string; logo?: string }) {
  return <span aria-hidden="true" className="grid size-5 flex-none place-items-center overflow-hidden rounded-full border border-white/15 bg-black/40">
    {logo ? <img src={logo} alt="" className="size-full object-contain p-px" /> : <span className="size-3 rounded-full" style={{ background: color }} />}
  </span>
}

// The factions by expansion, as the library's faction selector: a circle with the logo (or colour), the name and how
// many cards the faction has. The chosen faction is marked.
export function FactionTree() {
  const factions = useFactions(), cards = useCards('', ''), logos = useFactionLogos(), colors = useFactionColors()
  const selected = useSelectedFactionId()
  const navigate = useNavigate(), location = useLocation()
  const counts = useMemo(() => { const m = new Map<number, number>(); for (const c of cards.data ?? []) m.set(c.faction_id, (m.get(c.faction_id) ?? 0) + 1); return m }, [cards.data])
  const groups = useMemo(() => {
    const byDlc = new Map<string, Faction[]>()
    for (const f of [...(factions.data ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))) byDlc.set(f.dlc, [...(byDlc.get(f.dlc) ?? []), f])
    const known: string[] = [...DLC_VALUES]
    return [...known.filter(d => byDlc.has(d)), ...[...byDlc.keys()].filter(d => !known.includes(d))].map(dlc => ({ dlc, factions: byDlc.get(dlc)! }))
  }, [factions.data])
  // Groups the user opened or closed by hand; otherwise only the group of the chosen faction is open.
  const [manual, setManual] = useState<Record<string, boolean>>({})
  const holdsSelected = (g: { factions: Faction[] }) => g.factions.some(f => f.id === selected)
  const open = (g: { dlc: string; factions: Faction[] }) => manual[g.dlc] ?? holdsSelected(g)
  const choose = (id: number) => {
    useAssembly.getState().select({ factionId: id })
    if (!location.pathname.startsWith('/assemble')) navigate('/assemble')
  }
  if (!groups.length) return null
  return <nav aria-label="Factions" className="flex min-h-0 flex-col gap-1 overflow-y-auto">
    <div className="px-3 pb-1 font-mono text-[10px] uppercase tracking-[0.18em] text-phosphor/70">Factions</div>
    {groups.map(group => {
      const expanded = open(group)
      return <div key={group.dlc}>
        <button type="button" aria-expanded={expanded} onClick={() => setManual(m => ({ ...m, [group.dlc]: !expanded }))}
          className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 px-2 py-1.5 text-left font-display text-[13px] tracking-wide ${holdsSelected(group) ? 'bg-white/5 text-ink' : 'bg-transparent text-ink/70 hover:text-ink'}`}>
          <Diamond color={DLC_COLOR[group.dlc] ?? FALLBACK} />
          <span className="min-w-0 flex-1 truncate">{group.dlc || 'Other'}</span>
          <span aria-hidden="true" className="text-xs text-ink/50">{expanded ? '⌄' : '›'}</span>
        </button>
        {expanded && <ul className="m-0 mt-0.5 mb-1 flex list-none flex-col gap-0.5 p-0 pl-3">
          {group.factions.map(f => {
            const on = f.id === selected
            return <li key={f.id}><button type="button" aria-current={on ? 'true' : undefined} onClick={() => choose(f.id)}
              className={`flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 border-l-2 px-2 py-1.5 text-left text-[13px] ${on ? 'border-l-accent bg-white/10 font-semibold text-ink' : 'border-l-transparent bg-transparent text-ink/65 hover:bg-white/5 hover:text-ink'}`}>
              <Dot color={colors.data?.find(c => c.faction_id === f.id)?.color || FALLBACK} logo={logos.data?.find(l => l.faction_id === f.id)?.url} />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="font-mono text-[11px] text-ink/45">{counts.get(f.id) ?? 0}</span>
            </button></li>
          })}
        </ul>}
      </div>
    })}
  </nav>
}
