import { useCardTypesUi } from './store'

const revoke = vi.fn()

beforeEach(() => {
  revoke.mockClear()
  vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:x', revokeObjectURL: revoke })
  useCardTypesUi.setState({ dialogMode: null, editingId: null, stagedFile: null, stagedMeta: null, showDiff: false, discardConfirmOpen: false, deleteConfirmId: null })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test('replacing a staged template revokes the previous blob url', () => {
  const ui = useCardTypesUi.getState()
  ui.set({ stagedFile: new File(['a'], 'a.png'), stagedMeta: { w: 1, h: 1, url: 'blob:first' } })
  expect(revoke).not.toHaveBeenCalled()
  ui.set({ stagedFile: new File(['b'], 'b.png'), stagedMeta: { w: 2, h: 2, url: 'blob:second' } })
  expect(revoke).toHaveBeenCalledWith('blob:first')
})

test('clearing staged state revokes the blob url', () => {
  const ui = useCardTypesUi.getState()
  ui.set({ stagedFile: new File(['a'], 'a.png'), stagedMeta: { w: 1, h: 1, url: 'blob:first' } })
  ui.set({ stagedFile: null, stagedMeta: null })
  expect(revoke).toHaveBeenCalledWith('blob:first')
})

test('closeDialog revokes the staged blob url', () => {
  const ui = useCardTypesUi.getState()
  ui.set({ stagedFile: new File(['a'], 'a.png'), stagedMeta: { w: 1, h: 1, url: 'blob:open' } })
  useCardTypesUi.getState().closeDialog()
  expect(revoke).toHaveBeenCalledWith('blob:open')
})

test('unrelated set does not revoke', () => {
  const ui = useCardTypesUi.getState()
  ui.set({ stagedFile: new File(['a'], 'a.png'), stagedMeta: { w: 1, h: 1, url: 'blob:keep' } })
  ui.set({ showDiff: true })
  expect(revoke).not.toHaveBeenCalled()
})
