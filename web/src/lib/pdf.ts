// A minimal PDF writer: JPEG images and stroked rectangles on fixed-size pages.
// Coordinates are in points, measured from the page's top-left corner.
export type PdfImage = { jpeg: Uint8Array; width: number; height: number }
export type PdfStroke = { color: string; width: number; dash: number[] }
export type PdfOp =
  | { type: 'image'; image: PdfImage; x: number; y: number; w: number; h: number; clip?: { x: number; y: number; w: number; h: number } }
  | { type: 'rect'; x: number; y: number; w: number; h: number; stroke: PdfStroke }
  | { type: 'line'; x1: number; y1: number; x2: number; y2: number; stroke: PdfStroke }

const n = (value: number) => value.toFixed(3).replace(/\.?0+$/, '') || '0'
function rgb(hex: string) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  return (m ? [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255) : [0, 0, 0]).map(n).join(' ')
}

export function buildPdf(pageWidth: number, pageHeight: number, pages: PdfOp[][]): Blob {
  const encoder = new TextEncoder()
  const images = [...new Set(pages.flat().flatMap(op => op.type === 'image' ? [op.image] : []))]
  const imageId = new Map(images.map((image, i) => [image, 3 + i]))
  const firstPage = 3 + images.length
  const chunks: Uint8Array[] = [], offsets: number[] = []
  let length = 0
  const push = (data: Uint8Array | string) => { const bytes = typeof data === 'string' ? encoder.encode(data) : data; chunks.push(bytes); length += bytes.length }
  const object = (id: number, dict: string, stream?: Uint8Array | string) => {
    offsets[id] = length
    const body = typeof stream === 'string' ? encoder.encode(stream) : stream
    push(`${id} 0 obj\n<< ${dict}${body ? ` /Length ${body.length}` : ''} >>\n`)
    if (body) { push('stream\n'); push(body); push('\nendstream\n') }
    push('endobj\n')
  }

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n')
  const pageIds = pages.map((_, i) => firstPage + i * 2)
  // Ask viewers to print at 100%, not scaled to fit the printable area (honoured by Adobe Reader and Chrome).
  object(1, '/Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >>')
  object(2, `/Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}]`)
  for (const image of images) object(imageId.get(image)!, `/Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, image.jpeg)
  pages.forEach((ops, i) => {
    const used = [...new Set(ops.flatMap(op => op.type === 'image' ? [op.image] : []))]
    const content = ops.map(op => {
      if (op.type === 'line') return `q ${rgb(op.stroke.color)} RG ${n(op.stroke.width)} w [${op.stroke.dash.map(n).join(' ')}] 0 d ${n(op.x1)} ${n(pageHeight - op.y1)} m ${n(op.x2)} ${n(pageHeight - op.y2)} l S Q`
      const top = pageHeight - op.y - op.h
      if (op.type === 'image') {
        const clip = op.clip ? `${n(op.clip.x)} ${n(pageHeight - op.clip.y - op.clip.h)} ${n(op.clip.w)} ${n(op.clip.h)} re W n ` : ''
        return `q ${clip}${n(op.w)} 0 0 ${n(op.h)} ${n(op.x)} ${n(top)} cm /Im${imageId.get(op.image)} Do Q`
      }
      const { color, width, dash } = op.stroke
      return `q ${rgb(color)} RG ${n(width)} w [${dash.map(n).join(' ')}] 0 d ${n(op.x)} ${n(top)} ${n(op.w)} ${n(op.h)} re S Q`
    }).join('\n')
    const page = pageIds[i]
    object(page, `/Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(pageWidth)} ${n(pageHeight)}] /Contents ${page + 1} 0 R /Resources << /XObject << ${used.map(image => `/Im${imageId.get(image)} ${imageId.get(image)} 0 R`).join(' ')} >> >>`)
    object(page + 1, '', content)
  })
  const count = firstPage + pages.length * 2
  const xref = length
  push(`xref\n0 ${count}\n0000000000 65535 f \n${offsets.slice(1, count).map(o => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`)
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
  return new Blob(chunks as BlobPart[], { type: 'application/pdf' })
}
