import { useFactions } from '../factions/api'
import { useAssembly } from './state'

// The faction the library works on: the chosen one, else the first.
export function useSelectedFactionId() {
  const factions = useFactions(), chosen = useAssembly(s => s.factionId)
  return (factions.data?.some(f => f.id === chosen) ? chosen : null) ?? factions.data?.[0]?.id ?? null
}
