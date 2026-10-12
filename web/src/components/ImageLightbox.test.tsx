import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw'
import userEvent from '@testing-library/user-event'
import { ZoomableImage } from './ImageLightbox'
import { usePreviewLayers } from '../lib/previewLayers'

beforeEach(() => usePreviewLayers.setState({ overlay: true, mask: false, maskOpacity: 0.5 }))

function renderThumb() {
  render(
    <ZoomableImage src="/img.png" alt="Tau × combat">
      <img src="/img.png" alt="thumb" />
    </ZoomableImage>,
  )
}

test('clicking the thumbnail opens the popup; Escape closes it', async () => {
  renderThumb()
  await userEvent.click(screen.getByRole('button', { name: 'Open Tau × combat' }))
  expect(screen.getByRole('dialog', { name: 'Tau × combat' })).toBeInTheDocument()
  await userEvent.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('backdrop and close button close the popup, clicking the image does not', async () => {
  renderThumb()
  await userEvent.click(screen.getByRole('button', { name: 'Open Tau × combat' }))
  await userEvent.click(screen.getByRole('img', { name: 'Tau × combat' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('dialog'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Open Tau × combat' }))
  await userEvent.click(screen.getByRole('button', { name: 'Close' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('overlay toggle lays the overlay over the image and is remembered', async () => {
  render(
    <ZoomableImage src="/img.png" alt="Card" overlaySrc="/overlay.png">
      <img src="/img.png" alt="thumb" />
    </ZoomableImage>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Open Card' }))
  expect(screen.getByTestId('overlay')).toHaveAttribute('src', '/overlay.png')

  await userEvent.click(screen.getByRole('button', { name: 'Overlay on' }))
  expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeInTheDocument() // toggling doesn't close

  await userEvent.keyboard('{Escape}')
  await userEvent.click(screen.getByRole('button', { name: 'Open Card' }))
  expect(screen.getByRole('button', { name: 'Overlay off' })).toBeInTheDocument()
  expect(screen.queryByTestId('overlay')).not.toBeInTheDocument()
})

test('no overlay toggle without an overlay', async () => {
  renderThumb()
  await userEvent.click(screen.getByRole('button', { name: 'Open Tau × combat' }))
  expect(screen.queryByRole('button', { name: /Overlay/ })).not.toBeInTheDocument()
})

test('download saves the raw image; with the overlay on, the label says it includes the overlay', async () => {
  server.use(http.get('/img.png', () => new HttpResponse(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png' } })))
  const created: Blob[] = []
  const origCreate = URL.createObjectURL
  const origRevoke = URL.revokeObjectURL
  URL.createObjectURL = (b: Blob) => { created.push(b); return 'blob:x' }
  URL.revokeObjectURL = () => {}
  const clicks: string[] = []
  const origClick = HTMLAnchorElement.prototype.click
  HTMLAnchorElement.prototype.click = function () { clicks.push(this.download) }
  try {
    renderThumb()
    await userEvent.click(screen.getByRole('button', { name: 'Open Tau × combat' }))
    await userEvent.click(screen.getByRole('button', { name: 'Download' }))
    await waitFor(() => expect(clicks).toEqual(['tau_combat.png']))
    expect(created).toHaveLength(1)
    expect(screen.getByRole('dialog')).toBeInTheDocument() // downloading doesn't close
  } finally {
    URL.createObjectURL = origCreate
    URL.revokeObjectURL = origRevoke
    HTMLAnchorElement.prototype.click = origClick
  }
})

test('download label reflects the overlay toggle', async () => {
  render(
    <ZoomableImage src="/img.png" alt="Card" overlaySrc="/overlay.png">
      <img src="/img.png" alt="thumb" />
    </ZoomableImage>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Open Card' }))
  expect(screen.getByRole('button', { name: 'Download (with overlay)' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Overlay on' }))
  expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
})

test('mask layer shows the template at adjustable opacity', async () => {
  render(
    <ZoomableImage src="/img.png" alt="Card" overlaySrc="/overlay.png" maskSrc="/template.png">
      <img src="/img.png" alt="thumb" />
    </ZoomableImage>,
  )
  await userEvent.click(screen.getByRole('button', { name: 'Open Card' }))
  expect(screen.queryByTestId('mask')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Mask opacity')).not.toBeInTheDocument()

  await userEvent.click(screen.getByRole('button', { name: 'Mask off' }))
  expect(screen.getByTestId('mask')).toHaveAttribute('src', '/template.png')
  expect(screen.getByTestId('mask')).toHaveStyle({ opacity: '0.5' })

  const slider = screen.getByLabelText('Mask opacity')
  fireEvent.change(slider, { target: { value: '80' } })
  expect(screen.getByTestId('mask')).toHaveStyle({ opacity: '0.8' })
  expect(screen.getByText('80%')).toBeInTheDocument()
  expect(screen.getByRole('dialog')).toBeInTheDocument() // controls don't close the popup
})
