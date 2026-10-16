import type { CardType } from '../card-types/api'
import { CATEGORIES, type Category } from '../cards/model'
import type { Side } from '../assemble/api'
import { LIBRARY_TABS } from '../assemble/model'
import { matchesCategory } from '../assemble/library'

export type Target = { kind: 'template'; category: Category; side: Side; what: string } | { kind: 'element'; what: string } | { kind: 'event-element'; what: string }

// What a finished image of this image type becomes when it is made the faction's default.
export function defaultTarget(type: CardType): Target | null {
  if (type.name === 'card back') return { kind: 'template', category: 'combat', side: 'back', what: 'the combat and event card back' }
  if (type.name === 'back element') return { kind: 'element', what: 'the banner element' }
  if (type.name === 'event element') return { kind: 'event-element', what: 'the event card element' }
  const category = CATEGORIES.find(c => matchesCategory(type, c, 'front'))
  return category ? { kind: 'template', category, side: 'front', what: `the ${LIBRARY_TABS.find(t => t.category === category)!.label.toLowerCase()} card template` } : null
}
