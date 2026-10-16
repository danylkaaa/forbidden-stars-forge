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
  return <canvas ref={ref} width={36} height={36} aria-hidden="true" className="h-6 w-6 shrink-0" />
}

// Small icon buttons that insert a symbol token at the cursor of the focused text field. They keep the field's focus.
export function SymbolButtons({ insert, disabled }: { insert: (token: string) => void; disabled: boolean }) {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let active = true
    void loadFonts().then(() => { if (active) setReady(true) }).catch(() => {})
    return () => { active = false }
  }, [])
  return <div role="toolbar" aria-label="Insert a symbol" className="flex gap-0.5 rounded-md border border-divider bg-bg/95 p-0.5 shadow-[0_2px_8px_rgba(0,0,0,0.5)]">
    {SYMBOL_CATALOG.map(symbol => <button key={symbol.token} type="button" disabled={disabled}
      aria-label={`Insert ${symbol.label}`} title={`${symbol.label} ${symbol.token}`} onMouseDown={e => e.preventDefault()} onClick={() => insert(symbol.token)}
      className="grid h-7 w-7 cursor-pointer place-items-center rounded border border-transparent bg-transparent p-0 hover:border-accent disabled:opacity-40">
      <SymbolPreview symbol={symbol} ready={ready} />
    </button>)}
  </div>
}
