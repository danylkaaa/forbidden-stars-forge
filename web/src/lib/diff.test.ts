import { sideBySideDiff } from './diff'

test('identical strings are unchanged', () => {
  const d = sideBySideDiff('same text', 'same text')
  expect(d.changed).toBe(false)
  expect(d.left.every((t) => t.type === 'same')).toBe(true)
  expect(d.right.every((t) => t.type === 'same')).toBe(true)
})

test('word replacement shows remove on left, add on right', () => {
  const d = sideBySideDiff('old grim word', 'new grim word')
  expect(d.changed).toBe(true)
  expect(d.left.some((t) => t.type === 'remove' && t.text.includes('old'))).toBe(true)
  expect(d.left.some((t) => t.type === 'add')).toBe(false)
  expect(d.right.some((t) => t.type === 'add' && t.text.includes('new'))).toBe(true)
  expect(d.right.some((t) => t.type === 'remove')).toBe(false)
})

test('empty before means everything added', () => {
  const d = sideBySideDiff('', 'brand new')
  expect(d.changed).toBe(true)
  expect(d.right.some((t) => t.type === 'add')).toBe(true)
  expect(d.left.filter((t) => t.text !== '').every((t) => t.type !== 'add')).toBe(true)
})
