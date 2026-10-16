import { afterEach, expect, test, vi } from 'vitest'
import { formWithPngImages, toPng } from './imageUpload'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function stubBrowser() {
  const drawn: unknown[] = []
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 30, height: 20, close: vi.fn() })))
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: (...args: unknown[]) => drawn.push(args) } as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) { cb(new Blob(['png-bytes'], { type })) })
  return drawn
}

test('a PNG is uploaded as it is', async () => {
  const png = new File(['x'], 'a.png', { type: 'image/png' })
  expect(await toPng(png)).toBe(png)
})

test('WebP, AVIF and JPEG files are converted to PNG with a .png name', async () => {
  const drawn = stubBrowser()
  for (const [name, type] of [['photo.webp', 'image/webp'], ['pic.avif', 'image/avif'], ['scan.JPG', 'image/jpeg'], ['noext', 'image/gif']] as const) {
    const out = await toPng(new File(['x'], name, { type }))
    expect(out.type).toBe('image/png')
    expect(out.name).toBe(name === 'noext' ? 'noext.png' : name.replace(/\.[^.]+$/, '.png'))
  }
  expect(drawn).toHaveLength(4)
})

test('a form keeps its other fields and files and converts only the images', async () => {
  stubBrowser()
  const form = new FormData()
  form.set('name', 'combat')
  form.set('image', new File(['x'], 'art.webp', { type: 'image/webp' }))
  form.set('model', new File(['x'], 'unit.stl', { type: '' }))
  const out = await formWithPngImages(form)
  expect(out.get('name')).toBe('combat')
  expect((out.get('image') as File).name).toBe('art.png')
  expect((out.get('model') as File).name).toBe('unit.stl')
})
