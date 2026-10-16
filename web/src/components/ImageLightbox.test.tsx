import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../test/msw'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ZoomableImage } from './ImageLightbox'
import { usePreviewLayers } from '../lib/previewLayers'

beforeEach(() => usePreviewLayers.setState({ mask: false, maskOpacity: 0.5 }))

function renderThumb() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ZoomableImage src="/img.png" alt="Tau × combat">
        <img src="/img.png" alt="thumb" />
      </ZoomableImage>
    </QueryClientProvider>,
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

test('there is no overlay layer any more; card preview replaces it', async () => {
  renderThumb()
  await userEvent.click(screen.getByRole('button', { name: 'Open Tau × combat' }))
  expect(screen.queryByRole('button', { name: /Overlay/ })).not.toBeInTheDocument()
})

test('download saves the raw image', async () => {
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

test('mask layer shows the template at adjustable opacity', async () => {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ZoomableImage src="/img.png" alt="Card" maskSrc="/template.png">
        <img src="/img.png" alt="thumb" />
      </ZoomableImage>
    </QueryClientProvider>,
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
