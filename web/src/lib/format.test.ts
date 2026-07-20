import { formatCost, formatDuration } from './format'

test('formatCost trims trailing zero under 10 cents', () => {
  expect(formatCost(0.01)).toBe('$0.01')
  expect(formatCost(0.19)).toBe('$0.19')
})

test('formatCost keeps two decimals at or above 10 cents', () => {
  expect(formatCost(0.4)).toBe('$0.40')
  expect(formatCost(1.5)).toBe('$1.50')
})

test('formatDuration renders seconds under a minute', () => {
  expect(formatDuration(45000)).toBe('45s')
})

test('formatDuration renders minutes and seconds at/above a minute', () => {
  expect(formatDuration(78000)).toBe('1m 18s')
})
