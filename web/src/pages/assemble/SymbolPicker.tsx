import { useEffect, useRef, useState } from 'react'
import { SYMBOL_CATALOG } from './model'
import { loadFonts, paintRun } from './render'

function SymbolPreview({ symbol, ready }: { symbol: typeof SYMBOL_CATALOG[number]; ready: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ready || !ctx) return
    ctx.clearRect(0, 0, 36, 36); ctx.font = '32px CardSymbols'; ctx.fillStyle = '#ecdfcb'
    paintRun(ctx, { text: symbol.glyph, icon: true, italic: false, unframed: symbol.unframed, dice: symbol.token === '(D)' }, 2, 28, 32)
  }, [symbol, ready])
  return <canvas ref={ref} width={36} height={36} aria-hidden="true" className="shrink-0" />
}

export function SymbolPicker({ insert, disabled }: { insert: (token: string) => void; disabled: boolean }) {
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    void loadFonts().then(() => { if (active) setReady(true) }).catch(() => { if (active) setError('Symbol previews could not load. Tokens can still be inserted.') })
    return () => { active = false }
  }, [])
  return <details className="rounded border border-divider p-2 text-xs">
    <summary className="cursor-pointer text-accent">Insert resource symbol</summary>
    <p className="my-2 text-ink/60">Click an icon to insert its token at the cursor in the title or rules text. Defaults to upper text.</p>
    {error && <p role="status" className="text-warn">{error}</p>}
    <div className="grid grid-cols-2 gap-1.5">
      {SYMBOL_CATALOG.map(symbol => <button key={symbol.token} type="button" disabled={disabled}
        aria-label={`Insert ${symbol.label}`} title={symbol.token} onMouseDown={e => e.preventDefault()} onClick={() => insert(symbol.token)}
        className="flex min-w-0 items-center gap-2 rounded border border-divider bg-bg p-2 text-left hover:border-accent disabled:opacity-40">
        <SymbolPreview symbol={symbol} ready={ready} />
        <span>{symbol.label}<span className="block font-mono text-ink/50">{symbol.token}</span></span>
      </button>)}
    </div>
  </details>
}
