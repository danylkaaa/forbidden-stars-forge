import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { IconButton } from '../../components/IconButton'
import { ExpandIcon, SparkleIcon } from '../../components/icons'
import { Button } from '../../components/Button'
import { formatCost } from '../../lib/format'
import { enhanceArtwork, extendArtwork, type Assembly } from './api'

type Mode = 'extend' | 'enhance'

// Asks the AI to repaint the card's artwork (final quality) and replaces the artwork with the result: "Extend with
// AI" paints more around it in all directions, in the shape of its artwork area; "Improve quality" renders the same
// picture at a higher resolution with more detail. The model gets only the picture and a prompt.
export function ArtworkExtend({ cardId, ratio, disabled, onDone }: { cardId: string; ratio: number; disabled: boolean; onDone: (saved: Assembly) => void }) {
  const [mode, setMode] = useState<Mode | null>(null)
  const [prompt, setPrompt] = useState('')
  const run = useMutation({
    mutationFn: (m: Mode) => m === 'extend' ? extendArtwork(cardId, ratio, prompt) : enhanceArtwork(cardId, prompt),
    onSuccess: ({ cost_usd: _cost, ...saved }) => { onDone(saved); setMode(null); setPrompt('') },
  })
  const toggle = (m: Mode) => { run.reset(); setMode(mode === m ? null : m) }
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-2">
      <IconButton label="Extend with AI" icon={<ExpandIcon />} disabled={disabled || run.isPending} onClick={() => toggle('extend')} aria-expanded={mode === 'extend'}
        title="Extend with AI: ask the AI to paint more around the artwork, so it fills the artwork area" />
      <IconButton label="Improve quality" icon={<SparkleIcon />} disabled={disabled || run.isPending} onClick={() => toggle('enhance')} aria-expanded={mode === 'enhance'}
        title="Improve quality: ask the AI to render the artwork at a higher resolution, with more detail and fewer flaws" />
      {run.isSuccess && <span role="status" className="text-xs text-ink/60">{run.variables === 'extend' ? 'Artwork extended' : 'Artwork improved'} ({formatCost(run.data.cost_usd)}).</span>}
    </div>
    {mode && <div className="space-y-2 rounded-md border border-divider p-2.5">
      <p className="m-0 text-xs text-ink/60">{mode === 'extend'
        ? `The AI gets only the picture and a prompt, and paints more around it in all directions, keeping the original as it is, in a picture ${ratio.toFixed(2)}:1 (the shape of the artwork area).`
        : 'The AI gets only the picture and a prompt, and renders it again at a higher resolution with finer detail, sharper edges and cleaner textures, keeping the composition, colours and style the same.'} The result replaces the artwork. It runs at final quality and costs money; it can take a minute or two.</p>
      <textarea aria-label={mode === 'extend' ? 'What to paint around the artwork' : 'What to improve'} rows={2} value={prompt} onChange={e => setPrompt(e.target.value)} disabled={run.isPending}
        placeholder={mode === 'extend' ? 'Optional: what the new surroundings should show, e.g. smoke and a ruined cathedral' : 'Optional: what to pay attention to, e.g. the face and the armour'}
        className="w-full resize-y rounded-md border border-divider bg-bg px-2.5 py-1.5 text-sm text-ink focus:border-accent focus:outline-none" />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" disabled={run.isPending} onClick={() => run.mutate(mode)}>{run.isPending ? (mode === 'extend' ? 'Extending…' : 'Improving…') : mode === 'extend' ? 'Extend artwork' : 'Improve artwork'}</Button>
        <Button disabled={run.isPending} onClick={() => setMode(null)}>Cancel</Button>
      </div>
    </div>}
    {run.isError && <p role="alert" className="m-0 text-sm text-danger">{run.error.message}</p>}
  </div>
}
