import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { formatCost } from '../../lib/format'
import { extendArtwork, type Assembly } from './api'

// Asks the AI to extend the card's artwork to the shape of its artwork area (final quality), and replaces the
// artwork with the result. The picture is kept as it is; the model only paints the new area around it.
export function ArtworkExtend({ cardId, ratio, disabled, onDone }: { cardId: string; ratio: number; disabled: boolean; onDone: (saved: Assembly) => void }) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const extend = useMutation({
    mutationFn: () => extendArtwork(cardId, ratio, prompt),
    onSuccess: ({ cost_usd: _cost, ...saved }) => { onDone(saved); setOpen(false); setPrompt('') },
  })
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <Button disabled={disabled || extend.isPending} onClick={() => { extend.reset(); setOpen(v => !v) }} aria-expanded={open}
        title="Ask the AI to paint more around the artwork, so it fills the artwork area">Extend with AI</Button>
      {extend.isSuccess && <span role="status" className="text-xs text-ink/60">Artwork extended ({formatCost(extend.data.cost_usd)}).</span>}
    </div>
    {open && <div className="space-y-2 rounded-md border border-divider p-2.5">
      <p className="m-0 text-xs text-ink/60">The AI gets only the picture and a prompt, and paints more around it in all directions, keeping the original as it is, in a picture {ratio.toFixed(2)}:1 (the shape of the artwork area). The result replaces the artwork. It runs at final quality and costs money; it can take a minute or two.</p>
      <textarea aria-label="What to paint around the artwork" rows={2} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={extend.isPending}
        placeholder="Optional: what the new surroundings should show, e.g. smoke and a ruined cathedral"
        className="w-full resize-y rounded-md border border-divider bg-bg px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none" />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={extend.isPending} onClick={() => extend.mutate()}>{extend.isPending ? 'Extending…' : 'Extend artwork'}</Button>
        <Button disabled={extend.isPending} onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>}
    {extend.isError && <p role="alert" className="m-0 text-sm text-danger">{extend.error.message}</p>}
  </div>
}
