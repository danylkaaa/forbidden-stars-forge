import { renderCard } from './render'
import { defaultLayout, type CombatCard } from './model'

const ctx = { drawImage: vi.fn(), fillText: vi.fn(), measureText: vi.fn((text: string) => ({ width: text.length * 10, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 5 })), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), font: '', fillStyle: '' }
const card: CombatCard = { id: 1, faction_id: 1, category: 'combat', name: 'Title', level: 0, resource_cost: 2, guns: 0, shields: 0, eagles: 0, upper_text: 'upper (B)', lower_text: 'lower [M]', created_at: '', updated_at: '' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Image', class {
    naturalWidth = 816; naturalHeight = 1104
    onload?: () => void
    url = ''
    set src(value: string) { this.url = value; if (value.includes('background')) { this.naturalWidth = 759; this.naturalHeight = 379 } else if (value.includes('foreground')) { this.naturalWidth = 759; this.naturalHeight = 300 } else if (value.includes('bottom')) { this.naturalWidth = 454; this.naturalHeight = 18 }; queueMicrotask(() => this.onload?.()) }
  })
  vi.stubGlobal('FontFace', class { async load() { return this } })
  Object.defineProperty(document, 'fonts', { configurable: true, value: { add: vi.fn() } })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D)
})
afterEach(() => vi.unstubAllGlobals())

test('all combat textures cover the full output width', async () => {
  await renderCard({ card, layout: defaultLayout(), imageUrl: 'art', overlayUrl: 'frame' })
  const textures = ctx.drawImage.mock.calls.slice(2)
  expect(textures).toHaveLength(3)
  for (const call of textures) { expect(call[1]).toBe(0); expect(call[3]).toBe(816) }
})
test('alignment, fonts and colours are fixed even when an old layout overrides them', async () => {
  const layout = defaultLayout()
  layout.upper_text = { ...layout.upper_text, align: 'center', font: 'headline', color: '#ff0000' }
  await renderCard({ card, layout, imageUrl: 'art', overlayUrl: 'frame' })
  const upper = ctx.fillText.mock.calls.find(call => call[0] === 'upper')!
  expect(upper[1]).toBeCloseTo(layout.upper_text.x * 816 / 100)
  expect(ctx.font).not.toContain('CardHeadline, CardEvent, serif') // last painted text is rules text
  expect(ctx.fillStyle).not.toBe('#ff0000')
})
// Texture decoration (759 px wide textures scaled to the 816 px card).
const scale = 816 / 759, bgBorder = 21 * scale, barTop = 6 * scale, barBottom = 18 * scale
test('rules text is left aligned and centred in the visible parchment of each panel', async () => {
  const layout = defaultLayout()
  await renderCard({ card, layout, imageUrl: 'art', overlayUrl: 'frame' })
  expect(ctx.fillText.mock.calls.find(call => call[0] === 'upper')![1]).toBeCloseTo(layout.upper_text.x * 816 / 100)
  expect(ctx.fillText.mock.calls.find(call => call[0] === 'lower')![1]).toBeCloseTo(layout.lower_text.x * 816 / 100)
  const textures = ctx.drawImage.mock.calls.slice(2)
  const backgroundY = textures[0][2] as number, foregroundY = textures[1][2] as number, bottomY = textures[2][2] as number
  // Mocked glyph bounds: ascent 20, descent 5 around each baseline.
  const upperBaseline = ctx.fillText.mock.calls.find(call => call[0] === 'upper')![2] as number
  const lowerBaseline = ctx.fillText.mock.calls.find(call => call[0] === 'lower')![2] as number
  expect(upperBaseline - 20 - (backgroundY + bgBorder)).toBeCloseTo(foregroundY + barTop - (upperBaseline + 5))
  expect(lowerBaseline - 20 - (foregroundY + barBottom)).toBeCloseTo(bottomY - (lowerBaseline + 5))
})
test('card artwork is the bottom layer, under the template and the overlay stack', async () => {
  await renderCard({ card, layout: defaultLayout(), imageUrl: 'art', overlayUrl: 'frame', overlayUrls: ['sub-a', 'sub-b'], artworkUrl: 'illustration' })
  const sources = ctx.drawImage.mock.calls.slice(0, 4).map(call => (call[0] as { url?: string }).url)
  expect(sources).toEqual(['illustration', 'art', 'sub-a', 'sub-b'])
})
test('level 0 cards draw the faction logo last, in place of the level number', async () => {
  await renderCard({ card, layout: defaultLayout(), imageUrl: 'art', overlayUrl: 'frame', logoUrl: 'logo' })
  expect((ctx.drawImage.mock.calls.at(-1)![0] as { url?: string }).url).toBe('logo')
  expect(ctx.fillText.mock.calls.some(call => call[0] === '0')).toBe(false)
  vi.clearAllMocks()
  await renderCard({ card: { ...card, level: 2 }, layout: defaultLayout(), imageUrl: 'art', overlayUrl: 'frame', logoUrl: 'logo' })
  expect(ctx.drawImage.mock.calls.some(call => (call[0] as { url?: string }).url === 'logo')).toBe(false)
  expect(ctx.fillText.mock.calls.some(call => call[0] === '2')).toBe(true)
})
test('guns, shields and morale share one stacked column in that order', async () => {
  const layout = defaultLayout()
  await renderCard({ card: { ...card, guns: 2, shields: 1, eagles: 1 }, layout, imageUrl: 'art', overlayUrl: 'frame' })
  const icons = ctx.fillText.mock.calls.filter(call => ['}', '{', '<'].includes(call[0] as string) && call[1] === layout.resources.x * 816 / 100)
  expect(icons.map(call => call[0])).toEqual(['}', '}', '{', '<'])
  const step = layout.resources.size * 1104 / 100 * layout.resources.lineHeight
  const ys = icons.map(call => call[2] as number)
  for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeCloseTo(step)
})
test('level 0 cards have no level or resource price, even without a logo', async () => {
  await renderCard({ card: { ...card, resource_cost: 7 }, layout: defaultLayout(), imageUrl: 'art', overlayUrl: 'frame' })
  expect(ctx.fillText.mock.calls.some(call => call[0] === '7' || call[0] === '0')).toBe(false)
  vi.clearAllMocks()
  await renderCard({ card: { ...card, level: 1, resource_cost: 7 }, layout: defaultLayout(), imageUrl: 'art', overlayUrl: 'frame' })
  expect(ctx.fillText.mock.calls.some(call => call[0] === '7')).toBe(true)
})


test('C0 logo scale changes size around the badge center with the same aspect ratio', async () => {
  const layout = defaultLayout()
  await renderCard({ card, layout, imageUrl: 'art', overlayUrl: 'frame', logoUrl: 'logo', logoScale: 1 })
  const normal = ctx.drawImage.mock.calls.at(-1)!.slice(1) as number[]
  await renderCard({ card, layout, imageUrl: 'art', overlayUrl: 'frame', logoUrl: 'logo', logoScale: 1.75 })
  const scaled = ctx.drawImage.mock.calls.at(-1)!.slice(1) as number[]
  expect(scaled[2]).toBeCloseTo(normal[2] * 1.75)
  expect(scaled[3]).toBeCloseTo(normal[3] * 1.75)
  expect(scaled[0] + scaled[2] / 2).toBeCloseTo(normal[0] + normal[2] / 2)
  expect(scaled[1] + scaled[3] / 2).toBeCloseTo(normal[1] + normal[3] / 2)
})
