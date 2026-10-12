import type { ImageChoice, Selection } from '../lib/useImageSelection'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'

export function ImageSelectionControls({ selection, images, disabled = false }: { selection: Selection; images: ImageChoice[]; disabled?: boolean }) {
  const { chosen, setSelected, confirming, setConfirming, error, setError, remove } = selection
  const busy = disabled || remove.isPending
  return <>
    {images.length > 0 && <div role="toolbar" aria-label="Selected images" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink/60">{chosen.length ? `${chosen.length} selected` : 'Select images to delete them.'}</span>
      <Button disabled={busy} onClick={() => setSelected(new Set(images.map(image => image.key)))}>Select all</Button>
      {chosen.length > 0 && <>
        <Button disabled={busy} onClick={() => setSelected(new Set())}>Select none</Button>
        <Button disabled={busy} onClick={() => { setError(null); setConfirming([...chosen]) }}>Delete selected ({chosen.length})</Button>
      </>}
    </div>}
    {confirming && <ConfirmDialog title="Delete selected images?"
      body={`Permanently delete ${confirming.length} selected image${confirming.length === 1 ? '' : 's'} from Library and Generations? This cannot be undone. Images used by a template must be unselected first.`}
      confirmLabel={remove.isPending ? 'Deleting…' : `Delete ${confirming.length} image${confirming.length === 1 ? '' : 's'}`} error={error}
      onConfirm={() => { if (!busy) remove.mutate(confirming) }} onCancel={() => { if (!remove.isPending) setConfirming(null) }} />}
  </>
}

export function ImageSelectionCheckbox({ name, selected, anySelected, disabled, onToggle }: {
  name: string; selected: boolean; anySelected: boolean; disabled?: boolean; onToggle: () => void
}) {
  return <label className={`absolute left-2 top-2 z-[1] grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-white/20 bg-black/70 backdrop-blur-sm ${anySelected ? '' : 'opacity-0 group-hover/image:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100'}`}>
    <input type="checkbox" aria-label={`Select ${name}`} checked={selected} disabled={disabled} onChange={onToggle} className="h-4 w-4 cursor-pointer accent-[var(--color-accent)]" />
  </label>
}
