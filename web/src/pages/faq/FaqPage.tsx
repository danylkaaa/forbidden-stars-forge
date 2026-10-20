import { Fragment } from 'react'
import faqMarkdown from '../../../../docs/FAQ.md?raw'
import { parseFaq, parseInline, slug, type Block } from './faq'

const sections = parseFaq(faqMarkdown)

// Links to other repository files only work on GitHub; in the app they show as plain text.
function Text({ text }: { text: string }) {
  return <>{parseInline(text).map((part, i) => part.kind === 'code' ? <code key={i} className="rounded bg-bg px-1 py-0.5 font-mono text-[0.85em] text-accent-300">{part.text}</code>
    : part.kind === 'bold' ? <strong key={i} className="font-semibold text-ink">{part.text}</strong>
    : part.kind === 'link' ? /^https?:/.test(part.href) ? <a key={i} href={part.href} target="_blank" rel="noreferrer" className="text-accent underline">{part.text}</a> : <Fragment key={i}>{part.text}</Fragment>
    : <Fragment key={i}>{part.text}</Fragment>)}</>
}
function Answer({ blocks }: { blocks: Block[] }) {
  return <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-ink/80">
    {blocks.map((b, i) => b.kind === 'p' ? <p key={i} className="m-0"><Text text={b.text} /></p>
      : <ul key={i} className="m-0 list-disc space-y-1 pl-5">{b.items.map((item, j) => <li key={j}><Text text={item} /></li>)}</ul>)}
  </div>
}

export default function FaqPage() {
  return <div className="mx-auto max-w-3xl space-y-8">
    <div>
      <h1 className="m-0 font-display text-2xl text-accent-300">FAQ</h1>
      <p className="m-0 mt-1 text-sm text-ink/60">How the library, templates, faction card, AI Lab and printing work.</p>
      <nav aria-label="FAQ sections" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {sections.map(s => <a key={s.title} href={`#${slug(s.title)}`} className="text-accent no-underline hover:underline">{s.title}</a>)}
      </nav>
    </div>
    {sections.map(s => <section key={s.title} id={slug(s.title)} aria-labelledby={`${slug(s.title)}-title`} className="scroll-mt-4 space-y-2">
      <h2 id={`${slug(s.title)}-title`} className="m-0 font-display text-lg text-accent-300">{s.title}</h2>
      {s.questions.map(q => <details key={q.id} id={q.id} className="group rounded-md border border-divider bg-surface open:border-accent/40">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink marker:hidden">
          <span className="mr-2 inline-block text-accent transition-transform group-open:rotate-90">›</span>{q.question}
        </summary>
        <Answer blocks={q.answer} />
      </details>)}
    </section>)}
  </div>
}
