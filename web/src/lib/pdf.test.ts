import { buildPdf } from './pdf'

test('builds a PDF with images and dashed rectangles', async () => {
  const image = { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), width: 2, height: 2 }
  const blob = buildPdf(595, 842, [[{ type: 'image', image, x: 10, y: 10, w: 100, h: 150 }, { type: 'rect', x: 10, y: 10, w: 100, h: 150, stroke: { color: '#00a651', width: 1.5, dash: [6, 4.5] } }], []])
  const text = new TextDecoder('latin1').decode(await blob.arrayBuffer())
  expect(text.startsWith('%PDF-1.4')).toBe(true)
  expect(text).toContain('/Count 2')
  expect(text).toContain('/Filter /DCTDecode')
  expect(text).toContain('0 0.651 0.318 RG 1.5 w [6 4.5] 0 d')
  expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
})
