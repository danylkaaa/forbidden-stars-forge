import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { Magnifier } from '../../components/Magnifier'
import { removeBackLogo, saveAssemblyTemplate, uploadBackLogo, type AssemblyTemplate } from './api'
import { BackImage } from './BackImage'

export function BackLogoEditor({ template, imageUrl }: { template: AssemblyTemplate; imageUrl: string }) {
  const [scale, setScale] = useState(template.logo_scale ?? 0.5)
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: async (action: File | 'scale' | 'remove') => {
      if (action === 'scale') await saveAssemblyTemplate({ faction_id: template.faction_id, category: template.category, side: 'back', image_key: template.image_key, logo_scale: scale })
      else if (action === 'remove') await removeBackLogo(template.faction_id, template.category)
      else await uploadBackLogo(template.faction_id, template.category, action)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assembly-templates'] }),
  })
  return <section aria-label="Card back logo" className="flex flex-wrap gap-5 rounded-md border border-divider p-3">
    <Magnifier className="w-40 shrink-0"><BackImage category={template.category} factionId={template.faction_id} url={imageUrl} logoUrl={template.logo_url} scale={scale} alt="Selected card back" /></Magnifier>
    <div className="min-w-48 flex-1 space-y-3">
      <input ref={fileInput} type="file" aria-label="Upload card back logo" accept="image/png,image/jpeg" className="hidden" disabled={change.isPending}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) change.mutate(file) }} />
      <button type="button" disabled={change.isPending} onClick={() => fileInput.current?.click()}
        onDragOver={e => { e.preventDefault(); if (!change.isPending) setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); const file = e.dataTransfer.files[0]; if (file && !change.isPending) change.mutate(file) }}
        className={`flex min-h-36 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-5 py-4 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-60 ${dragging ? 'border-accent bg-accent/20' : 'border-accent/50 bg-accent/5 hover:border-accent hover:bg-accent/10'}`}>
        <span className="pointer-events-none grid h-10 w-10 place-items-center rounded-full bg-accent/15 text-accent" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" /></svg>
        </span>
        <span className="pointer-events-none font-display text-sm font-semibold text-accent">{change.isPending ? 'Saving logo…' : dragging ? 'Drop logo here' : template.logo_url ? 'Replace logo' : 'Upload logo'}</span>
        <span className="pointer-events-none text-sm text-ink/75">Click to choose an image or drag it here</span>
        <span className="pointer-events-none text-xs text-ink/50">PNG or JPEG · up to 10 MiB</span>
      </button>
      <p className="m-0 text-xs text-ink/60">Your logo appears in the center of the card back. Resize it below after uploading.</p>
      {template.logo_url && <>
        <Field label={`Logo size (${Math.round(scale * 100)}%)`}>{id => <input id={id} type="range" min="5" max="100" step="1" value={Math.round(scale * 100)} disabled={change.isPending}
          className="w-full" onChange={e => { change.reset(); setScale(Number(e.target.value) / 100) }} />}</Field>
        <div className="flex gap-2">
          <Button disabled={change.isPending || scale === (template.logo_scale ?? 0.5)} onClick={() => change.mutate('scale')}>Save logo size</Button>
          <Button disabled={change.isPending} onClick={() => change.mutate('remove')}>Remove logo</Button>
        </div>
      </>}
      {change.isPending && <p role="status" className="m-0 text-sm text-ink/60">Saving…</p>}
      {change.isSuccess && <p role="status" className="m-0 text-sm text-ink/60">Saved.</p>}
      {change.isError && <p role="alert" className="m-0 text-sm text-danger">{change.error.message}</p>}
    </div>
  </section>
}
