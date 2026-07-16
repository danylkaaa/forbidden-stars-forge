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
    <div className="max-w-5xl overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60">
            <th className="px-4 py-3.5 font-medium">Name</th>
            <th className="px-4 py-3.5 font-medium">DLC</th>
            <th className="px-4 py-3.5 font-medium">Description</th>
            <th className="px-4 py-3.5 font-medium">Updated</th>
            <th className="px-4 py-3.5" />
          </tr>
        </thead>
        <tbody>
          {factions.map((f) => (
            <tr key={f.id} className="border-t border-ink/8 hover:bg-ink/4">
              <td className="whitespace-nowrap px-4 py-3 font-medium">{f.name}</td>
              <td className="px-4 py-3"><DlcTag dlc={f.dlc} /></td>
              <td className="max-w-80 px-4 py-3 text-ink/70">{truncate(f.description, 78)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-[13px] text-ink/50">{f.updated_at}</td>
              <td className="whitespace-nowrap px-4 py-3 text-right">
                <span className="inline-flex gap-1.5">
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
