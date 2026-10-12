import { SearchableSelect } from '../../components/SearchableSelect'
import { selectClass } from '../../components/Field'
import type { Faction } from '../factions/api'

export function FactionSelect({ factions, value, onChange }: {
  factions: Faction[]
  value: number | null
  onChange: (id: number) => void
}) {
  const options = [...factions].sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  return <div className="w-full sm:w-auto sm:min-w-80 sm:max-w-xl">
    <SearchableSelect aria-label="Faction" value={value ?? ''} disabled={!options.length}
      className={`${selectClass} min-h-10!`} onChange={(e) => onChange(Number(e.target.value))}>
      {options.map((f) => <option key={f.id} value={f.id}>{f.name}{f.dlc ? ` — ${f.dlc}` : ''}</option>)}
    </SearchableSelect>
  </div>
}
