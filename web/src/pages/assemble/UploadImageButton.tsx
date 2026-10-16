import { IMAGE_ACCEPT } from '../../lib/imageUpload'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiSendForm } from '../../lib/api'
import type { Generation } from '../test-generation/api'

// Adds your own picture to the faction's library as an image of a card type,
// so it is listed, chosen and deleted like a generated one.
function uploadLibraryImage(factionId: number, cardTypeId: number, file: File) {
  const form = new FormData()
  form.set('faction_id', String(factionId)); form.set('card_type_id', String(cardTypeId)); form.set('image', file)
  return apiSendForm<Generation>('POST', '/api/generations/upload', form)
}

export function UploadImageButton({ factionId, cardTypeId, onUploaded, disabled }: { factionId: number; cardTypeId: number | undefined; onUploaded: (key: string) => void; disabled?: boolean }) {
  const queryClient = useQueryClient()
  const upload = useMutation({
    mutationFn: (file: File) => uploadLibraryImage(factionId, cardTypeId!, file),
    onSuccess: async g => { await queryClient.invalidateQueries({ queryKey: ['generations'] }); onUploaded(`test-${g.id}`) },
  })
  const off = disabled || upload.isPending || cardTypeId === undefined
  return <span className="inline-flex flex-wrap items-center gap-2">
    <label title={cardTypeId === undefined ? 'No matching card type to attach the image to' : undefined}
      className={`inline-flex cursor-pointer items-center rounded-md border border-divider px-3.5 py-2 text-xs font-semibold uppercase tracking-wider hover:border-accent/60 ${off ? 'pointer-events-none opacity-45' : ''}`}>
      {upload.isPending ? 'Uploading…' : 'Upload your own'}
      <input type="file" accept={IMAGE_ACCEPT} className="sr-only" aria-label="Upload your own image" disabled={off}
        onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) upload.mutate(file) }} />
    </label>
    {upload.isError && <span role="alert" className="text-sm text-danger">{upload.error.message}</span>}
  </span>
}
