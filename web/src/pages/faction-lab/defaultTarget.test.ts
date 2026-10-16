import { expect, test } from 'vitest'
import type { CardType } from '../card-types/api'
import { defaultTarget } from './defaultTarget'

const type = (name: string) => ({ id: 1, name } as CardType)

test('a finished image becomes the faction default for its image type', () => {
  expect(defaultTarget(type('combat'))).toMatchObject({ kind: 'template', category: 'combat', side: 'front' })
  expect(defaultTarget(type('events'))).toMatchObject({ kind: 'template', category: 'schema', side: 'front' })
  expect(defaultTarget(type('upgrade'))).toMatchObject({ kind: 'template', category: 'upgrade', side: 'front' })
  expect(defaultTarget(type('card back'))).toMatchObject({ kind: 'template', category: 'combat', side: 'back' })
  expect(defaultTarget(type('back element'))).toMatchObject({ kind: 'element' })
  expect(defaultTarget(type('event element'))).toMatchObject({ kind: 'event-element' })
  expect(defaultTarget(type('faction card'))).toBeNull()
  expect(defaultTarget(type('faction card back'))).toBeNull()
})
