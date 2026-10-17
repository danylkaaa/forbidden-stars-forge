import { useState } from 'react'

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

// '#abc' / 'abc' / '#aabbcc' -> '#aabbcc'; null when it isn't a hex colour.
function normalizeHex(text: string): string | null {
  const m = HEX.exec(text.trim())
  if (!m) return null
  const hex = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1]
  return `#${hex.toLowerCase()}`
}

// Native colour swatch plus a text box to type or paste a hex value.
export function ColorInput({ id, value, onChange, 'aria-label': ariaLabel, className = 'h-9 w-14 cursor-pointer' }: {
  id?: string
  value: string
  onChange: (hex: string) => void
  'aria-label'?: string
  className?: string
}) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? value
  const invalid = text !== null && normalizeHex(text) === null
  return <span className="inline-flex items-center gap-2">
    <input id={id} type="color" aria-label={ariaLabel} value={value} onChange={e => { setText(null); onChange(e.target.value) }} className={className} />
    <input
      type="text"
      aria-label={ariaLabel ? `${ariaLabel} hex` : 'Hex colour'}
      aria-invalid={invalid}
      value={shown}
      maxLength={7}
      spellCheck={false}
      onChange={e => {
        setText(e.target.value)
        const hex = normalizeHex(e.target.value)
        if (hex) onChange(hex)
      }}
      onBlur={() => setText(null)}
      className={`h-8 w-24 rounded border bg-bg px-2 font-mono text-xs ${invalid ? 'border-danger' : 'border-divider'}`}
    />
  </span>
}
