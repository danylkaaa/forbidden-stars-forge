import { expect, test } from 'vitest'
import { joinPrompt, splitPrompt } from './promptSections'

const prompt = 'Intro line.\n\n## Description\nA card.\n\n## Faction\nTau\n\n## Rendering\n- Photorealistic.\n\nFront note.'

test('the prompt is cut into its intro, its sections and the front image note', () => {
  expect(splitPrompt(prompt).map((p) => p.key)).toEqual(['intro', 'Description', 'Faction', 'Rendering', 'front-reference'])
})

test('switched-off parts are left out of what is sent', () => {
  const parts = splitPrompt(prompt)
  expect(joinPrompt(parts, new Set())).toBe(prompt)
  expect(joinPrompt(parts, new Set(['Faction', 'front-reference']))).toBe('Intro line.\n\n## Description\nA card.\n\n## Rendering\n- Photorealistic.')
})
