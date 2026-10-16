import { expect, test, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { renderCard } from './render'
import { useRenderedCard } from './useCardView'

vi.mock('./render', () => ({ renderCard: vi.fn() }))
// The hook re-renders when its input changes, so each card's input must be the same object every time.
const inputs = Array.from({ length: 8 }, (_, i) => ({ id: i } as never))

test('card renders run two at a time, so a library of hundreds of cards does not freeze the page', async () => {
  let running = 0, peak = 0
  vi.mocked(renderCard).mockImplementation(async () => {
    running++; peak = Math.max(peak, running)
    await new Promise(resolve => setTimeout(resolve, 5))
    running--
    return { canvas: document.createElement('canvas'), warnings: [], textPositions: {} } as never
  })
  const hooks = Array.from({ length: 8 }, (_, i) => renderHook(() => useRenderedCard(inputs[i])))
  await waitFor(() => expect(hooks.every(h => h.result.current.result !== null)).toBe(true))
  expect(vi.mocked(renderCard)).toHaveBeenCalledTimes(8)
  expect(peak).toBeLessThanOrEqual(2)
})

test('a render whose card went away while it waited is skipped', async () => {
  vi.mocked(renderCard).mockClear()
  vi.mocked(renderCard).mockImplementation(async () => { await new Promise(resolve => setTimeout(resolve, 20)); return { canvas: document.createElement('canvas'), warnings: [], textPositions: {} } as never })
  const hooks = Array.from({ length: 5 }, (_, i) => renderHook(() => useRenderedCard(inputs[i])))
  hooks.slice(2).forEach(h => h.unmount())
  await waitFor(() => expect(hooks[0].result.current.result).not.toBeNull())
  await waitFor(() => expect(hooks[1].result.current.result).not.toBeNull())
  expect(vi.mocked(renderCard).mock.calls.length).toBeLessThan(5)
})
