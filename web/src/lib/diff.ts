import { diffWordsWithSpace } from 'diff'

export type DiffToken = { text: string; type: 'same' | 'add' | 'remove' }

// Side-by-side word diff: left column = before (same + removed tokens),
// right column = after (same + added tokens).
export function sideBySideDiff(
  before: string,
  after: string,
): { left: DiffToken[]; right: DiffToken[]; changed: boolean } {
  const parts = diffWordsWithSpace(before, after)
  const left: DiffToken[] = []
  const right: DiffToken[] = []
  let changed = false
  for (const p of parts) {
    if (p.added) {
      changed = true
      right.push({ text: p.value, type: 'add' })
    } else if (p.removed) {
      changed = true
      left.push({ text: p.value, type: 'remove' })
    } else {
      left.push({ text: p.value, type: 'same' })
      right.push({ text: p.value, type: 'same' })
    }
  }
  return { left, right, changed }
}
