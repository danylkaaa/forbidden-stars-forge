import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { saveFactionColor } from './api'
import { deleteFactionLogo, uploadFactionLogo } from './logos'

// The faction's colour as a small round swatch; nothing while it has none.
export function ColorDot({ color }: { color?: string }) {
  return color ? <span role="img" aria-label={`Faction colour ${color}`} title={color} className="inline-block h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/25" style={{ background: color }} /> : null
}

export function LogoCell({ factionId, name, url }: { factionId: number; name: string; url?: string }) {
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: (file: File | null) => file ? uploadFactionLogo(factionId, file) : deleteFactionLogo(factionId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['faction-logos'] }),
  })
  return <div className="flex items-center gap-2">
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded border border-divider bg-black/40">
      {url ? <img src={url} alt={`${name} logo`} className="max-h-full max-w-full object-contain" /> : <span className="text-ink/30">—</span>}
    </span>
    <label className={`cursor-pointer text-xs text-accent hover:underline ${change.isPending ? 'pointer-events-none opacity-45' : ''}`}>
      {url ? 'Replace' : 'Upload'}
      <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`Upload logo for ${name}`} disabled={change.isPending}
        onChange={e => { const file = e.target.files?.[0]; if (file) change.mutate(file); e.target.value = '' }} />
    </label>
    {url && <Button className="px-2! py-1!" disabled={change.isPending} aria-label={`Remove logo for ${name}`} onClick={() => change.mutate(null)}>✕</Button>}
    {change.isError && <span role="alert" className="text-xs text-danger">{change.error.message}</span>}
  </div>
}


// Picks the faction's own colour; saved with the button, removable.
export function ColorField({ factionId, color }: { factionId: number; color: string }) {
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? color
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (next: string) => saveFactionColor(factionId, next),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['faction-colors'] }); setDraft(null) },
  })
  return <div className="flex flex-wrap items-center gap-3">
    <input type="color" aria-label="Faction colour" value={value || '#888888'} onChange={e => { save.reset(); setDraft(e.target.value) }} className="h-9 w-14 cursor-pointer" />
    <span className="font-mono text-xs text-ink/60">{value || 'not set'}</span>
    <Button disabled={draft === null || draft === color || save.isPending} onClick={() => save.mutate(draft!)}>Save colour</Button>
    <Button disabled={(!color && draft === null) || save.isPending} onClick={() => color ? save.mutate('') : setDraft(null)}>{color ? 'Remove colour' : 'Discard'}</Button>
    {save.isError && <span role="alert" className="text-sm text-danger">{save.error.message}</span>}
  </div>
}
