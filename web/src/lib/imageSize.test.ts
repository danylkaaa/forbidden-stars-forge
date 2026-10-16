import { expect, test } from 'vitest'
import { mmToPx, parseSize, pxToMm } from './imageSize'

test('converts between millimetres and pixels at a DPI', () => {
  expect(mmToPx(25.4, 300)).toBe(300)
  expect(pxToMm(300, 300)).toBe(25.4)
  expect(pxToMm(1104, 300)).toBe(93.47)
  expect(mmToPx(93.47, 300)).toBe(1104)
})

test('parses a WxH size and rejects anything else', () => {
  expect(parseSize('816x1104')).toEqual({ w: 816, h: 1104 })
  expect(parseSize('auto')).toBeNull()
  expect(parseSize('')).toBeNull()
})

test('a size is valid when empty or both sides are divisible by 16', async () => {
  const { sizeError, roundToStep } = await import('./imageSize')
  expect(sizeError('')).toBeNull()
  expect(sizeError('816x1104')).toBeNull()
  expect(sizeError('472x295')).toMatch(/divisible by 16/)
  expect(sizeError('816x')).toMatch(/width and a height/)
  expect(sizeError('480x288')).toMatch(/at least 655,360/)
  expect(sizeError('4096x2048')).toMatch(/Too large/)
  expect(sizeError('1024x160')).toMatch(/Too small/)
  expect(sizeError('3840x1024')).toMatch(/aspect ratio/)
  expect(sizeError('1024x1536')).toBeNull()
  expect(roundToStep(295)).toBe(288)
  expect(roundToStep(472)).toBe(480)
  expect(roundToStep(3)).toBe(16)
})

test('suggests a valid size with the same shape', async () => {
  const { suggestSize, sizeError } = await import('./imageSize')
  const small = suggestSize('472x295')!
  expect(sizeError(`${small.w}x${small.h}`)).toBeNull()
  expect(small.w / small.h).toBeCloseTo(472 / 295, 1)
  const big = suggestSize('6000x4000')!
  expect(sizeError(`${big.w}x${big.h}`)).toBeNull()
  expect(big.w / big.h).toBeCloseTo(1.5, 1)
  const wide = suggestSize('4000x400')!
  expect(wide.w / wide.h).toBeLessThanOrEqual(3.1)
  expect(sizeError(`${wide.w}x${wide.h}`)).toBeNull()
  expect(suggestSize('816x')).toBeNull()
  expect(suggestSize('816x1104')).toEqual({ w: 816, h: 1104 })
})
