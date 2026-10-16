// What the file pickers accept: any image the browser can decode. Uploads are converted to PNG before they are sent.
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp'

const pngName = (name: string) => `${name.replace(/\.[^./\\]+$/, '') || 'image'}.png`

// Decodes the image in the browser; GIF becomes its first frame.
async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
    } catch { /* fall back to an image element */ }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error(`${(file as File).name ?? 'The file'} could not be read as an image.`))
      el.src = url
    })
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

// A PNG copy of any image (WebP, AVIF, JPEG, GIF, BMP …). PNG files are returned as they are.
export async function toPng(file: File): Promise<File> {
  if (file.type === 'image/png') return file
  const image = await decode(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = image.width; canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('This browser cannot convert images.')
    ctx.drawImage(image.source, 0, 0)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error(`${file.name} could not be converted to PNG.`)
    return new File([blob], pngName(file.name), { type: 'image/png', lastModified: file.lastModified })
  } finally {
    image.close()
  }
}

// The same form with every image file in it converted to PNG.
export async function formWithPngImages(form: FormData): Promise<FormData> {
  const out = new FormData()
  for (const [key, value] of form.entries()) {
    if (typeof value !== 'string' && value.type.startsWith('image/') && value.type !== 'image/png') out.append(key, await toPng(value as File))
    else out.append(key, value)
  }
  return out
}
