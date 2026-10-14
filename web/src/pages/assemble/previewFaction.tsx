import { FactionSelect } from './FactionSelect'
import { useAssembly } from './state'
import { usePreviewFaction } from './usePreviewFaction'

// The picker in the navigation bar. It is only shown where previews are drawn
// for a chosen faction, never on a faction's own library or editor pages.
export function PreviewFactionNav() {
  const { factionId, factions } = usePreviewFaction()
  if (!factions.length) return null
  return <div className="flex items-center gap-2 text-xs text-ink/70">
    <span className="hidden whitespace-nowrap sm:inline">Preview faction</span>
    <FactionSelect compact factions={factions} value={factionId} onChange={id => useAssembly.getState().select({ factionId: id })} />
  </div>
}
