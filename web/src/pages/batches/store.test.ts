import { useBatchWizard } from './store'

beforeEach(() => {
  useBatchWizard.getState().reset()
})

test('toggleFaction adds then removes an id', () => {
  useBatchWizard.getState().toggleFaction(1)
  expect(useBatchWizard.getState().factionIds).toEqual([1])
  useBatchWizard.getState().toggleFaction(1)
  expect(useBatchWizard.getState().factionIds).toEqual([])
})

test('setAllCardTypes(ids, true) adds without duplicating', () => {
  useBatchWizard.getState().toggleCardType(2)
  useBatchWizard.getState().setAllCardTypes([1, 2, 3], true)
  expect(useBatchWizard.getState().cardTypeIds.sort()).toEqual([1, 2, 3])
})

test('setAllFactions(ids, false) removes only the given ids', () => {
  useBatchWizard.setState({ factionIds: [1, 2, 3] })
  useBatchWizard.getState().setAllFactions([2], false)
  expect(useBatchWizard.getState().factionIds.sort()).toEqual([1, 3])
})

test('reset clears selection and step back to scope', () => {
  useBatchWizard.setState({ step: 'preview', factionIds: [1], cardTypeIds: [2], mode: 'final' })
  useBatchWizard.getState().reset()
  const s = useBatchWizard.getState()
  expect(s.step).toBe('scope')
  expect(s.factionIds).toEqual([])
  expect(s.cardTypeIds).toEqual([])
  expect(s.mode).toBe('draft')
})
