// The assembled prompt is Markdown: an intro line, then "## Title" sections. The lab lets each part be
// left out of what is sent, so the prompt is cut into those parts here.
export type PromptPart = { key: string; label: string; text: string }

export function splitPrompt(prompt: string): PromptPart[] {
  const chunks = prompt.split(/\n\n(?=## )/).filter((c) => c.trim() !== '')
  const parts: PromptPart[] = []
  chunks.forEach((text, i) => {
    const title = /^## (.+)/.exec(text)?.[1]
    if (title === undefined) { parts.push({ key: i === 0 ? 'intro' : `part-${i}`, label: i === 0 ? 'Intro' : 'Other', text }); return }
    // The front-image note is appended after the last section, not part of it.
    const tail = i === chunks.length - 1 && title === 'Rendering' ? text.indexOf('\n\n') : -1
    if (tail > 0) {
      parts.push({ key: title, label: title, text: text.slice(0, tail) })
      parts.push({ key: 'front-reference', label: 'Front image note', text: text.slice(tail + 2) })
    } else parts.push({ key: title, label: title, text })
  })
  return parts
}

export const joinPrompt = (parts: PromptPart[], off: ReadonlySet<string>) =>
  parts.filter((p) => !off.has(p.key)).map((p) => p.text).join('\n\n')
