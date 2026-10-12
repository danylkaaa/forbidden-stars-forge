import { render } from '@testing-library/react'
import { GeneratingSpinner } from './GeneratingSpinner'

test('variant is stable per seed and varies across seeds', () => {
  const html = (seed: number) => render(<GeneratingSpinner seed={seed} />).container.innerHTML
  expect(html(5)).toBe(html(5))
  const distinct = new Set([1, 2, 3, 4, 5, 6, 7].map(html))
  expect(distinct.size).toBe(7)
})
