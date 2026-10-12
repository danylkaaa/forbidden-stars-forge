import { crc32, zip } from './zip'

test('crc32 matches the standard check value', () => {
  expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
})

test('zip stores each file with headers and a central directory', async () => {
  const blob = zip([{ name: 'a.png', data: new Uint8Array([1, 2, 3]) }, { name: 'Ж.png', data: new Uint8Array([4]) }])
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(bytes.buffer)
  expect(view.getUint32(0, true)).toBe(0x04034b50)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  expect(view.getUint16(end + 10, true)).toBe(2)
  const centralOffset = view.getUint32(end + 16, true)
  expect(view.getUint32(centralOffset, true)).toBe(0x02014b50)
  expect(Array.from(bytes.slice(30 + 5, 30 + 5 + 3))).toEqual([1, 2, 3])
})
