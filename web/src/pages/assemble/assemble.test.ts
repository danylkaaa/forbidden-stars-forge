import { textRuns, assemblyLayout, downloadName, NATIVE_SYMBOL_CATALOG, resourceToken } from './model'
import { wrapText } from './render'
import { useAssembly } from './state'

test('explicit resource tokens use verified font glyphs without replacing ordinary punctuation', () => {
  expect(textRuns('Gain 2 [GUN], 1 [MORALE], or [SKULL]. # @ < [UNKNOWN]')).toEqual([
    { text: 'Gain 2 ', icon: false, italic: false }, { text: '#', icon: true, italic: false },
    { text: ', 1 ', icon: false, italic: false }, { text: '<', icon: true, italic: false },
    { text: ', or ', icon: false, italic: false }, { text: '@', icon: true, italic: false },
    { text: '. # @ < [UNKNOWN]', icon: false, italic: false },
  ])
})
test('italic keywords can contain icons', () => {
  expect(textRuns('*Warrior [GUN]*: gain [SKULL]')).toEqual([
    { text: 'Warrior ', icon: false, italic: true }, { text: '#', icon: true, italic: true },
    { text: ': gain ', icon: false, italic: false }, { text: '@', icon: true, italic: false },
  ])
})
test('wrapping measures icons atomically and retains manual paragraph breaks', () => {
  const measure = (r: { text: string; icon: boolean }) => r.icon ? 3 : r.text.length
  const lines = wrapText(textRuns('Gain [GUN]\n\nNext'), 6, measure)
  expect(lines.map(line => line.map(a => a.text).join(''))).toEqual(['Gain ', '#', '', 'Next'])
  expect(lines[1][0].width).toBe(3)
})
test('long unbroken words wrap without shrinking text or dropping characters', () => {
  const lines = wrapText(textRuns('abcdefghij'), 3, r => r.text.length)
  expect(lines.map(line => line.map(a => a.text).join(''))).toEqual(['abc', 'def', 'ghi', 'j'])
})
test('drafts stay independent for each card', () => {
  useAssembly.setState({ edits: {} })
  useAssembly.getState().edit('1', 'upper_text', 'New [GUN]')
  expect(useAssembly.getState().edits['2']).toBeUndefined()
  expect(useAssembly.getState().edits['1'].upper_text).toBe('New [GUN]')
  useAssembly.getState().clearEdits('1')
  expect(useAssembly.getState().edits['1']).toBeUndefined()
})
test('PNG filenames preserve Unicode and sanitize filesystem separators', () => {
  expect(downloadName('  Новая/card:*?  ')).toBe('Новая-card---.png')
  expect(downloadName('')).toBe('battle-card.png')
})

test('all ten native glyphs have distinct explicit tokens, including box variants', () => {
  expect(new Set(NATIVE_SYMBOL_CATALOG.map(s => s.glyph)).size).toBe(10)
  for (const symbol of NATIVE_SYMBOL_CATALOG) {
    expect(textRuns(`[${symbol.token}]`)).toEqual([{ text: symbol.glyph, icon: true, italic: false }])
  }
  expect(textRuns('[GUN_BOX] [SKULL_BOX_OUTLINE] [MORALE_BOX]')).toEqual([
    { text: ']', icon: true, italic: false }, { text: ' ', icon: false, italic: false },
    { text: '{', icon: true, italic: false }, { text: ' ', icon: false, italic: false },
    { text: '>', icon: true, italic: false },
  ])
})
test('resource variants select native glyph tokens and preserve legacy layouts', () => {
  expect(resourceToken('guns', 'box')).toBe('GUN_BOX')
  expect(resourceToken('shields', 'box_outline')).toBe('SKULL_BOX_OUTLINE')
  expect(resourceToken('eagles', 'box')).toBe('MORALE_BOX')
  expect(resourceToken('guns', 'badge')).toBe('GUN')
  expect(resourceToken('shields', undefined)).toBe('SKULL')
  expect(resourceToken('eagles', 'badge')).toBe('MORALE')
})

test('short boxed and non-boxed notation maps each resource independently', () => {
  const cases = [
    ['(B)', '#', false], ['[B]', '}', false], ['(S)', '@', false], ['[S]', '{', false], ['(M)', '<', true], ['[M]', '<', true],
  ] as const
  for (const [token, glyph, unframed] of cases) expect(textRuns(token)).toEqual([
    { text: glyph, icon: true, italic: false, ...(unframed ? { unframed: true } : {}) },
  ])
  expect(textRuns('*Gain (B) and [S]*').filter(r => r.icon)).toEqual([
    { text: '#', icon: true, italic: true }, { text: '{', icon: true, italic: true },
  ])
  expect(textRuns('(ordinary) [UNKNOWN]')).toEqual([{ text: '(ordinary) [UNKNOWN]', icon: false, italic: false }])
})

test('double asterisks italicize text and icons without leaving visible markers', () => {
  expect(textRuns('Before **Warrior (B) [S]** after')).toEqual([
    { text: 'Before ', icon: false, italic: false },
    { text: 'Warrior ', icon: false, italic: true },
    { text: '#', icon: true, italic: true },
    { text: ' ', icon: false, italic: true },
    { text: '{', icon: true, italic: true },
    { text: ' after', icon: false, italic: false },
  ])
  expect(textRuns('**First** / *Second*')).toEqual([
    { text: 'First', icon: false, italic: true },
    { text: ' / ', icon: false, italic: false },
    { text: 'Second', icon: false, italic: true },
  ])
})
test('layouts saved with a separate gun column keep it as the resource stack', () => {
  expect(assemblyLayout({ guns: { x: 14, y: 30 } } as never).resources).toMatchObject({ x: 14, y: 30, iconStyle: 'plain' })
  expect(assemblyLayout({ guns: { x: 14 }, resources: { x: 20 } } as never).resources.x).toBe(20)
})
