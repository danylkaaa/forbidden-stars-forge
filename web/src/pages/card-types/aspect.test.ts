import { computeAspectWarning } from './aspect'

test('exact 816x1104 has no warning', () => {
  expect(computeAspectWarning(816, 1104)).toBeNull()
})

test('within 2% has no warning', () => {
  expect(computeAspectWarning(820, 1104)).toBeNull() // ~0.5% off
})

test('beyond 2% warns with percentage', () => {
  const w = computeAspectWarning(830, 1080) // ~4% off
  expect(w).toMatch(/deviates from 816:1104 by \d+\.\d%/)
  expect(w).toMatch(/re-cropping/)
})

test('zero dimensions return null', () => {
  expect(computeAspectWarning(0, 0)).toBeNull()
})
