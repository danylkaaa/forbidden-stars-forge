import '@testing-library/jest-dom/vitest'
import { beforeAll, afterEach, afterAll } from 'vitest'
import { server } from './msw'

// jsdom has no ResizeObserver; the resizable panels (react-resizable-panels) need one to mount.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
// jsdom lays nothing out: every box is 0×0 at the pointer's (0, 0), so the panels library takes each click for a grab
// of its resize edge and swallows it. Its own boxes are put far away, so clicks reach the page.
const boundingRect = Element.prototype.getBoundingClientRect
Element.prototype.getBoundingClientRect = function () {
  return this.matches('[data-group],[data-panel],[data-separator]') ? new DOMRect(-1e4, -1e4, 0, 0) : boundingRect.call(this)
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
})
afterAll(() => server.close())
