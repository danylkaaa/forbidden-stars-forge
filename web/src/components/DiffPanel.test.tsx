import { render, screen } from '@testing-library/react'
import { DiffPanel } from './DiffPanel'

test('renders simple before/after rows', () => {
  render(<DiffPanel simpleRows={[{ field: 'dlc', before: 'Galaxy in Flames', after: 'Darkest Dawn' }]} textDiffs={[]} />)
  expect(screen.getByText('dlc')).toBeInTheDocument()
  expect(screen.getByText('Galaxy in Flames')).toBeInTheDocument()
  expect(screen.getByText('Darkest Dawn')).toBeInTheDocument()
})

test('renders side-by-side word diff for changed text field', () => {
  render(<DiffPanel simpleRows={[]} textDiffs={[{ field: 'description', before: 'old text', after: 'new text' }]} />)
  expect(screen.getByText('description')).toBeInTheDocument()
  expect(screen.getByText('Before')).toBeInTheDocument()
  expect(screen.getByText('After')).toBeInTheDocument()
  expect(screen.getByText(/old/)).toBeInTheDocument()
  expect(screen.getByText(/new/)).toBeInTheDocument()
})

test('unchanged text field renders nothing', () => {
  const { container } = render(<DiffPanel simpleRows={[]} textDiffs={[{ field: 'description', before: 'same', after: 'same' }]} />)
  expect(container.textContent).not.toContain('description')
})
