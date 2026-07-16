import { createDraftFormStore, isDraftDirty } from './draftForm'

type D = { name: string; description: string }

function freshStore() {
  return createDraftFormStore<D>(`test:draft:${Math.random()}`)
}

test('open sets snapshot; not dirty', () => {
  const use = freshStore()
  use.getState().open('7', { name: 'A', description: 'x' })
  expect(isDraftDirty(use.getState())).toBe(false)
  expect(use.getState().draft).toEqual({ name: 'A', description: 'x' })
})

test('setField dirties; discard reverts', () => {
  const use = freshStore()
  use.getState().open('7', { name: 'A', description: 'x' })
  use.getState().setField('description', 'y')
  expect(isDraftDirty(use.getState())).toBe(true)
  use.getState().discard()
  expect(isDraftDirty(use.getState())).toBe(false)
  expect(use.getState().draft?.description).toBe('x')
})

test('markSaved resets baseline', () => {
  const use = freshStore()
  use.getState().open('7', { name: 'A', description: 'x' })
  use.getState().setField('name', 'B')
  use.getState().markSaved({ name: 'B', description: 'x' })
  expect(isDraftDirty(use.getState())).toBe(false)
  expect(use.getState().persisted?.name).toBe('B')
})

test('draft persists to localStorage and is restored by open with same entityKey', () => {
  const key = `test:draft:${Math.random()}`
  const a = createDraftFormStore<D>(key)
  a.getState().open('42', { name: 'A', description: 'x' })
  a.getState().setField('description', 'edited')

  const b = createDraftFormStore<D>(key) // simulates reload
  b.getState().open('42', { name: 'A', description: 'x' })
  expect(b.getState().draft?.description).toBe('edited')
  expect(isDraftDirty(b.getState())).toBe(true)
})

test('open with different entityKey ignores stored draft', () => {
  const key = `test:draft:${Math.random()}`
  const a = createDraftFormStore<D>(key)
  a.getState().open('42', { name: 'A', description: 'x' })
  a.getState().setField('description', 'edited')

  const b = createDraftFormStore<D>(key)
  b.getState().open('43', { name: 'B', description: 'z' })
  expect(b.getState().draft).toEqual({ name: 'B', description: 'z' })
})

test('close clears state and storage', () => {
  const key = `test:draft:${Math.random()}`
  const a = createDraftFormStore<D>(key)
  a.getState().open('42', { name: 'A', description: 'x' })
  a.getState().setField('name', 'B')
  a.getState().close()
  expect(a.getState().draft).toBeNull()

  const b = createDraftFormStore<D>(key)
  b.getState().open('42', { name: 'A', description: 'x' })
  expect(b.getState().draft?.name).toBe('A') // nothing restored
})
