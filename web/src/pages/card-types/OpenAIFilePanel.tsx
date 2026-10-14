import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { dropTemplate, uploadToOpenAI, type CardType } from './api'
import { useCardTypesUi } from './store'

export function OpenAIFilePanel({ persisted }: { persisted: CardType | null }) {
  const stagedFile = useCardTypesUi((s) => s.stagedFile)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const queryClient = useQueryClient()

  if (!persisted) return null // create mode: save first

  const hasTemplate = persisted.template_path !== ''
  const disabled = busy || !hasTemplate || stagedFile !== null
  const title = stagedFile !== null ? 'Save the new template first' : !hasTemplate ? 'Upload a template first' : undefined

  async function onUpload() {
    if (!persisted) return
    setBusy(true)
    setError(null)
    try {
      await uploadToOpenAI(persisted.id)
      queryClient.invalidateQueries({ queryKey: ['card-types'] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function onDrop() {
    if (!persisted) return
    setBusy(true); setError(null)
    try {
      await dropTemplate(persisted.id)
      queryClient.invalidateQueries({ queryKey: ['card-types'] })
      setConfirming(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'could not remove the template')
    } finally {
      setBusy(false)
    }
  }

  // No template on purpose: the pictures are made from the prompt text alone.
  if (persisted.no_template) return (
    <div className="rounded-md border border-ink/10 bg-bg p-3">
      <div className="mb-0.5 text-xs text-ink/70">Template</div>
      <p className="m-0 text-sm text-ink/80">None: pictures of this type are generated from the prompt alone. Upload a template above to use one again.</p>
    </div>
  )

  const idText = persisted.openai_file_id || (hasTemplate ? 'Not uploaded' : 'Upload a template first')

  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-bg p-3">
      <div className="min-w-0">
        <div className="mb-0.5 text-xs text-ink/70">OpenAI file</div>
        <div className={`overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs ${persisted.openai_file_id ? 'text-accent-300' : 'text-ink/45'}`}>
          {idText}
        </div>
        {error && <p role="alert" className="m-0 mt-1 text-xs text-danger">{error}</p>}
      </div>
      <span className="flex flex-none gap-1.5">
        {persisted.openai_file_id && (
          <Button type="button" onClick={() => navigator.clipboard?.writeText(persisted.openai_file_id).catch(() => {})}>
            Copy
          </Button>
        )}
        <Button variant="primary" type="button" disabled={disabled} title={title} onClick={onUpload}>
          {busy ? 'Uploading…' : persisted.openai_file_id ? 'Re-upload' : 'Upload to OpenAI'}
        </Button>
        {confirming
          ? <Button type="button" disabled={busy} onClick={() => void onDrop()}>Confirm: remove template</Button>
          : <Button type="button" disabled={busy || stagedFile !== null} title="Generate this type from its prompt alone, with no template image" onClick={() => setConfirming(true)}>Remove template</Button>}
      </span>
    </div>
  )
}
