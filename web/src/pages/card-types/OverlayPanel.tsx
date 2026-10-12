import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { deleteOverlay, overlayUrl, uploadOverlay, type CardType } from './api'

// Preview-only overlay (e.g. the final frame/text layer). Saved right away,
// separately from the form; used only to preview generated images — it is
// never sent to OpenAI.
export function OverlayPanel({ persisted }: { persisted: CardType | null }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  if (!persisted) {
    return (
      <div className="rounded-md border border-ink/10 bg-bg p-3 text-xs text-ink/50">
        Overlay — save the card type first to add a preview overlay.
      </div>
    )
  }
  const url = overlayUrl(persisted)

  async function run(op: () => Promise<CardType>) {
    setBusy(true)
    setError(null)
    try {
      await op()
      queryClient.invalidateQueries({ queryKey: ['card-types'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3 rounded-md border border-ink/10 bg-bg p-3">
      {url ? (
        <img src={url} alt="Overlay" className="h-16 w-12 flex-none rounded bg-[repeating-conic-gradient(var(--color-accent-700)_0%_25%,var(--color-accent-900)_0%_50%)] bg-[length:10px_10px] object-contain" />
      ) : (
        <div className="h-16 w-12 flex-none rounded border border-dashed border-divider" />
      )}
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 text-xs text-ink/70">Overlay (preview only)</div>
        <div className="text-[11px] text-ink/45">
          Transparent PNG laid over generated images in previews. Never sent to OpenAI. Saved immediately.
        </div>
        {error && <p role="alert" className="m-0 mt-1 text-xs text-danger">{error}</p>}
      </div>
      <input ref={inputRef} type="file" accept="image/png" aria-label="Overlay file" className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (file) void run(() => uploadOverlay(persisted.id, file))
        }} />
      <span className="flex flex-none gap-1.5">
        {url && <Button type="button" disabled={busy} onClick={() => run(() => deleteOverlay(persisted.id))}>Remove</Button>}
        <Button variant="primary" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
          {busy ? 'Saving…' : url ? 'Replace' : 'Upload overlay'}
        </Button>
      </span>
    </div>
  )
}
