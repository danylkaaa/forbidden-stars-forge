import basic from '../../images/combat/ribbon-basic.png?url'
import advanced from '../../images/combat/ribbon-advanced.png?url'

// The ribbon down the left edge of a combat card, by the card's type: starting
// cards have the plain one with a plate for the faction logo, every other card
// the one with the round badge for its level. Bundled with the app, like the
// upgrade orders' icons.
export const COMBAT_RIBBONS = { basic, advanced } as const
export const combatRibbon = (card: { starting?: boolean }) => card.starting ? COMBAT_RIBBONS.basic : COMBAT_RIBBONS.advanced
