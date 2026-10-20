import shippedFaq from '../../../../docs/FAQ.md?raw'
import { parseFaq, parseInline } from './faq'

test('sections hold their questions with paragraphs and lists', () => {
  const sections = parseFaq('# FAQ\n\n## Start\n\n### How do I run it?\n\nRun `make`\nnow.\n\n- one\n- two\n  more\n\n## Print\n\n### Why bleed?\n\nSo cuts land on image.\n')
  expect(sections.map(s => s.title)).toEqual(['Start', 'Print'])
  expect(sections[0].questions[0]).toEqual({ id: 'how-do-i-run-it', question: 'How do I run it?', answer: [{ kind: 'p', text: 'Run `make` now.' }, { kind: 'ul', items: ['one', 'two more'] }] })
  expect(sections[1].questions[0].answer).toEqual([{ kind: 'p', text: 'So cuts land on image.' }])
})

test('inline code keeps its asterisks; bold and links are recognised', () => {
  expect(parseInline('Write `**text**` for **italic** keywords, see [FAQ](docs/FAQ.md).')).toEqual([
    { kind: 'text', text: 'Write ' }, { kind: 'code', text: '**text**' }, { kind: 'text', text: ' for ' }, { kind: 'bold', text: 'italic' },
    { kind: 'text', text: ' keywords, see ' }, { kind: 'link', text: 'FAQ', href: 'docs/FAQ.md' }, { kind: 'text', text: '.' },
  ])
})

test('the shipped FAQ parses into sections that each have answered questions', () => {
  const sections = parseFaq(shippedFaq)
  expect(sections.length).toBeGreaterThan(3)
  for (const s of sections) {
    expect(s.questions.length).toBeGreaterThan(0)
    for (const q of s.questions) expect(q.answer.length).toBeGreaterThan(0)
  }
})
