import { useFactions } from '../factions/api'
import { useAssembly } from './state'

// The faction every preview on the Card Templates page is drawn for: chosen in
// the navigation bar, falling back to the first faction.
export function usePreviewFaction() {
  const factions = useFactions()
  const stored = useAssembly(s => s.factionId)
  const id = factions.data?.some(f => f.id === stored) ? stored : factions.data?.[0]?.id ?? null
  return { factionId: id, factions: factions.data ?? [] }
}
