import { Link } from 'react-router'
import { generationsLink } from '../generations/api'
import { Button } from '../../components/Button'
import { DlcTag } from './DlcTag'
import type { Faction } from './api'

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

export function FactionsTable({
  factions,
  onEdit,
  onHistory,
  onDelete,
}: {
  factions: Faction[]
  onEdit: (f: Faction) => void
  onHistory: (f: Faction) => void
  onDelete: (f: Faction) => void
}) {
  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60">
            <th className="px-4 py-3.5 font-medium">Name</th>
            <th className="px-4 py-3.5 font-medium">DLC</th>
            <th className="px-4 py-3.5 font-medium">Color · Texture</th>
            <th className="px-4 py-3.5 font-medium">Description</th>
            <th className="px-4 py-3.5 font-medium">Updated</th>
            <th className="px-4 py-3.5" />
          </tr>
        </thead>
        <tbody>
          {factions.map((f) => (
            <tr key={f.id} className="border-t border-ink/8 hover:bg-ink/4">
              <td className="whitespace-nowrap px-4 py-3 font-medium">
                <Link to={generationsLink({ factionIds: [f.id] })} title="Show this faction's generations"
                  className="text-ink no-underline hover:text-accent hover:underline">{f.name}</Link>
              </td>
              <td className="px-4 py-3"><DlcTag dlc={f.dlc} /></td>
              <td className="max-w-64 px-4 py-3 text-[13px] text-ink/70">
                {[f.primary_color, f.texture].filter(Boolean).join(' · ') || <span className="text-ink/35">—</span>}
              </td>
              <td className="px-4 py-3 text-ink/70">{truncate(f.description, 220)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-[13px] text-ink/50">{f.updated_at}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <span className="inline-flex gap-1.5">
                  <Link to={`/faction-lab?faction=${f.id}`}
                    className="inline-flex items-center rounded-md border border-divider px-3.5 py-2 text-sm font-medium text-ink no-underline hover:bg-ink/5">
                    Lab
                  </Link>
                  <Button onClick={() => onHistory(f)}>History</Button>
                  <Button onClick={() => onEdit(f)}>Edit</Button>
                  <Button onClick={() => onDelete(f)}>Delete</Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
