import { renderCard } from './render'
import { defaultLayout, type CombatCard } from './model'

const ctx = { drawImage: vi.fn(), fillText: vi.fn(), measureText: vi.fn((text: string) => ({ width: text.length * 10, actualBoundingBoxAscent: 20, actualBoundingBoxDescent: 5 })), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), font: '', fillStyle: '' }
const card: CombatCard = { id: 1, faction_id: 1, category: 'combat', name: 'Title', level: 0, resource_cost: 2, guns: 0, shields: 0, eagles: 0, upper_text: 'upper (B)', lower_text: 'lower [M]', created_at: '', updated_at: '' }
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('Image', class {
    naturalWidth = 816; naturalHeight = 1104
    onload?: () => void
    set src(value: string) { if (value.includes('background')) { this.naturalWidth = 759; this.naturalHeight = 379 } else if (value.includes('foreground')) { this.naturalWidth = 759; this.naturalHeight = 300 } else if (value.includes('bottom')) { this.naturalWidth = 454; this.naturalHeight = 18 }; queueMicrotask(() => this.onload?.()) }
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
test('optional centered alignment measures the complete line including icons', async () => {
  const layout = defaultLayout()
  layout.upper_text.align = 'center'; layout.lower_text.align = 'center'
  await renderCard({ card, layout, imageUrl: 'art', overlayUrl: 'frame' })
  const upper = ctx.fillText.mock.calls.find(call => call[0] === 'upper')!
  const lower = ctx.fillText.mock.calls.find(call => call[0] === 'lower')!
  // Each rendered line is 70 px, including a space and its one-glyph icon.
  expect(upper[1]).toBeCloseTo((layout.upper_text.x + layout.upper_text.width / 2) * 816 / 100 - 35)
  expect(lower[1]).toBeCloseTo((layout.lower_text.x + layout.lower_text.width / 2) * 816 / 100 - 35)
})
test('visible lower text is vertically centered between divider and bottom edge', async () => {
  await renderCard({ card, layout: defaultLayout(), imageUrl: 'art', overlayUrl: 'frame' })
  const textures = ctx.drawImage.mock.calls.slice(2)
  const dividerY = textures[1][2] as number, bottomY = textures[2][2] as number
  const baseline = ctx.fillText.mock.calls.find(call => call[0] === 'lower')![2] as number
  expect(baseline - 20 - dividerY).toBeCloseTo(bottomY - (baseline + 5))
})


test('rules text defaults to left alignment while remaining vertically centered', async () => {
  const layout = defaultLayout()
  await renderCard({ card, layout, imageUrl: 'art', overlayUrl: 'frame' })
  expect(ctx.fillText.mock.calls.find(call => call[0] === 'upper')![1]).toBeCloseTo(layout.upper_text.x * 816 / 100)
  expect(ctx.fillText.mock.calls.find(call => call[0] === 'lower')![1]).toBeCloseTo(layout.lower_text.x * 816 / 100)
  const textures = ctx.drawImage.mock.calls.slice(2)
  const upperBaseline = ctx.fillText.mock.calls.find(call => call[0] === 'upper')![2] as number
  const lowerBaseline = ctx.fillText.mock.calls.find(call => call[0] === 'lower')![2] as number
  expect(upperBaseline - 20 - (textures[0][2] as number)).toBeCloseTo((textures[1][2] as number) - upperBaseline - 5)
  expect(lowerBaseline - 20 - (textures[1][2] as number)).toBeCloseTo((textures[2][2] as number) - lowerBaseline - 5)
})
