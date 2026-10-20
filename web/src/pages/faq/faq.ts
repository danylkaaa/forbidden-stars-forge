// Parses docs/FAQ.md (the same file GitHub shows) into sections of questions.
// Only what the FAQ uses is understood: `#` title, `##` sections, `###` questions,
// paragraphs and `- ` lists; inline `code`, **bold** and [links](url).
export type Block = { kind: 'p'; text: string } | { kind: 'ul'; items: string[] }
export type Question = { id: string; question: string; answer: Block[] }
export type Section = { title: string; questions: Question[] }

export const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export function parseFaq(markdown: string): Section[] {
  const sections: Section[] = []
  let answer: Block[] | null = null, paragraph: string[] = [], list: string[] | null = null
  const flush = () => {
    if (answer && paragraph.length) answer.push({ kind: 'p', text: paragraph.join(' ') })
    if (answer && list) answer.push({ kind: 'ul', items: list })
    paragraph = []; list = null
  }
  for (const raw of markdown.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('### ')) {
      flush()
      const question = line.slice(4).trim()
      answer = []
      sections.at(-1)?.questions.push({ id: slug(question), question, answer })
    } else if (line.startsWith('## ')) {
      flush(); answer = null
      sections.push({ title: line.slice(3).trim(), questions: [] })
    } else if (line.startsWith('# ')) {
      flush(); answer = null
    } else if (line.startsWith('- ')) {
      if (paragraph.length) flush()
      list = [...(list ?? []), line.slice(2)]
    } else if (!line) flush()
    else if (list) list[list.length - 1] += ` ${line}`
    else paragraph.push(line)
  }
  flush()
  return sections
}

export type Inline = { kind: 'text' | 'code' | 'bold'; text: string } | { kind: 'link'; text: string; href: string }
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  // Code first, so ** inside backticks stays literal.
  for (const [i, part] of text.split(/`([^`]*)`/).entries()) {
    if (i % 2) { out.push({ kind: 'code', text: part }); continue }
    for (const piece of part.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/)) {
      if (!piece) continue
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(piece)
      if (link) out.push({ kind: 'link', text: link[1], href: link[2] })
      else if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) out.push({ kind: 'bold', text: piece.slice(2, -2) })
      else out.push({ kind: 'text', text: piece })
    }
  }
  return out
}
