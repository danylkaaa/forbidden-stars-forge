import { Link } from 'react-router'
import { useCards } from '../cards/api'
import { useFactions } from '../factions/api'
import { DlcTag } from '../factions/DlcTag'
import { LIBRARY_TABS, libraryLink } from './model'
import { useSavedFactionCards } from '../faction-card/api'
import { useFactionLogos } from './logos'
import { useFactionColors } from './api'

// Library-mode Factions: deck progress per faction. Prompt editing lives on
// the generation-mode Factions page.
export default function LibraryFactionsPage() {
  const factions = useFactions(), cards = useCards('', ''), logos = useFactionLogos(), savedCards = useSavedFactionCards(), colors = useFactionColors()
  const count = (factionId: number, category: string) => cards.data?.filter(c => c.faction_id === factionId && c.category === category).length ?? 0
  const expectedTotal = LIBRARY_TABS.reduce((n, t) => n + t.expected, 0)
  const error = factions.error ?? cards.error
  return <div>
    <div className="mb-5">
      <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Factions</h1>
      <p className="m-0 text-sm text-ink/60">Cards per faction and type. Each deck needs {LIBRARY_TABS.map(t => `${t.expected} ${t.label.toLowerCase()}`).join(', ')}.</p>
    </div>
    {(factions.isPending || cards.isPending) && <p className="text-ink/60">Loading…</p>}
    {error && <p role="alert" className="text-danger">Failed to load: {error.message}</p>}
    {factions.data && cards.data && <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60">
            <th className="w-16 px-4 py-3.5 font-medium">Logo</th>
            <th className="px-4 py-3.5 font-medium">Faction</th>
            <th className="px-4 py-3.5 font-medium">Colour</th>
            <th className="px-4 py-3.5 font-medium">DLC</th>
            {LIBRARY_TABS.map(t => <th key={t.category} className="px-4 py-3.5 text-right font-medium">{t.label}</th>)}
            <th className="px-4 py-3.5 text-right font-medium">Faction card</th>
            <th className="px-4 py-3.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {factions.data.map(f => {
            const editLink = `/assemble?faction=${f.id}&tab=config`, logo = logos.data?.find(l => l.faction_id === f.id)?.url, color = colors.data?.find(c => c.faction_id === f.id)?.color
            const total = LIBRARY_TABS.reduce((n, t) => n + count(f.id, t.category), 0)
            return <tr key={f.id} className="border-t border-ink/8 hover:bg-ink/4">
              <td className="px-4 py-2"><Link to={editLink} aria-label={`Edit ${f.name} logo`} className="grid h-10 w-10 place-items-center overflow-hidden rounded border border-divider bg-black/40 no-underline hover:border-accent">
                {logo ? <img src={logo} alt={`${f.name} logo`} className="max-h-full max-w-full object-contain" /> : <span className="text-ink/30">—</span>}</Link></td>
              <td className="whitespace-nowrap px-4 py-3 font-medium"><Link to={editLink} className="text-ink no-underline hover:text-accent hover:underline">{f.name}</Link></td>
              <td className="px-4 py-3"><Link to={editLink} aria-label={`Edit ${f.name} colour`} title={color || 'No colour set'} className="block h-8 w-20 rounded border border-divider no-underline hover:border-accent"
                style={color ? { background: color } : undefined}>{!color && <span className="grid h-full place-items-center text-xs text-ink/30">—</span>}</Link></td>
              <td className="whitespace-nowrap px-4 py-3 text-[11px]"><DlcTag dlc={f.dlc} /></td>
              {LIBRARY_TABS.map(t => {
                const n = count(f.id, t.category)
                const tone = n === t.expected ? 'text-success' : n > t.expected ? 'text-danger' : n ? 'text-warn' : 'text-ink/45'
                return <td key={t.category} className="whitespace-nowrap px-4 py-3 text-right font-mono">
                  <Link to={libraryLink(f.id, t.category)} aria-label={`${f.name} ${t.label}: ${n} of ${t.expected}`} className={`${tone} no-underline hover:underline`}>
                    {n}<span className="text-ink/40"> / {t.expected}</span>
                  </Link>
                </td>
              })}
              <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                {(() => { const n = savedCards.data?.includes(f.id) ? 1 : 0
                  return <Link to={`/assemble/faction-card?faction=${f.id}`} aria-label={`${f.name} faction card: ${n} of 1`} className={`${n ? 'text-success' : 'text-ink/45'} no-underline hover:underline`}>{n}<span className="text-ink/40"> / 1</span></Link> })()}
              </td>
              <td className={`whitespace-nowrap px-4 py-3 text-right font-mono ${total === expectedTotal ? 'text-success' : 'text-ink/70'}`}>{total}<span className="text-ink/40"> / {expectedTotal}</span></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>}
  </div>
}
