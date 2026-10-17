import { useFactionColor } from './api'
import { useFactionLogos } from './logos'
import { BannerEditor } from './BannerEditor'
import { EventElementEditor } from './EventElementEditor'
import { ColorField, LogoCell } from './FactionIdentity'
import { TemplateAdjust } from './TemplateAdjust'
import { useFactions } from '../factions/api'

const heading = 'm-0 border-b border-divider pb-1.5 font-display text-lg text-accent-300'

// Faction-wide settings: its logo (used on every card back), its colour, and
// its banner (with its nebula) and the element on its event cards. Front templates are chosen with the gear button, backs on each
// card type's back page.
export function FactionConfigPanel({ factionId }: { factionId: number }) {
  const faction = useFactions().data?.find(f => f.id === factionId)
  const logo = useFactionLogos().data?.find(l => l.faction_id === factionId)?.url
  const color = useFactionColor(factionId)
  return <div className="space-y-5">
    <section aria-label="Faction logo" className="space-y-3">
      <h2 className={heading}>Logo</h2>
      <LogoCell factionId={factionId} name={faction?.name ?? 'faction'} url={logo} />
      <p className="m-0 text-xs text-ink/60">Drawn in the banner on combat and upgrade backs, on event backs, and in the badge of starting cards.</p>
    </section>
    <section aria-label="Faction colour" className="space-y-3">
      <h2 className={heading}>Colour</h2>
      <ColorField key={`${factionId}-${color}`} factionId={factionId} color={color} />
      <p className="m-0 text-xs text-ink/60">Shown beside the faction name in lists, and the default colour of its nebula.</p>
    </section>
    <section aria-label="Card images" className="space-y-3">
      <h2 className={heading}>Card images</h2>
      <p className="m-0 text-xs text-ink/60">Brightness, colour, levels and more for the image chosen for each card type. Cards are made from the corrected image, on screen and in print. The card back image is shared by combat and event backs.</p>
      <div className="space-y-4">
        <TemplateAdjust key={`${factionId}-combat-front`} factionId={factionId} category="combat" side="front" label="Combat card front" />
        <TemplateAdjust key={`${factionId}-schema-front`} factionId={factionId} category="schema" side="front" label="Event card front" />
        <TemplateAdjust key={`${factionId}-combat-back`} factionId={factionId} category="combat" side="back" label="Card back" />
      </div>
    </section>
    <section aria-label="Banner" className="space-y-3">
      <h2 className={heading}>Banner</h2>
      <BannerEditor key={factionId} factionId={factionId} />
    </section>
    <section aria-label="Event card element" className="space-y-3">
      <h2 className={heading}>Event card element</h2>
      <EventElementEditor key={factionId} factionId={factionId} />
    </section>
  </div>
}
