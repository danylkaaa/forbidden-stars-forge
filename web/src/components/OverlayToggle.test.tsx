import { expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OverlayToggle } from './PreviewLayers'
import { usePreviewLayers } from '../lib/previewLayers'

test('one button hides and shows everything the card type lays over the image', async () => {
  usePreviewLayers.setState({ overlay: true })
  render(<OverlayToggle />)
  await userEvent.click(screen.getByRole('button', { name: 'Overlay on' }))
  expect(usePreviewLayers.getState().overlay).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Overlay off' }))
  expect(usePreviewLayers.getState().overlay).toBe(true)
})
