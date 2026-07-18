import { useId, useState } from 'react'
import { computeAspectWarning } from './aspect'
import { templateUrl, type CardType } from './api'
import { useCardTypesUi } from './store'

// Staged file preview beats persisted template; persisted template beats
// the empty dropzone.
export function TemplateDropzone({ persisted }: { persisted: CardType | null }) {
  const id = useId()
  const ui = useCardTypesUi()
  const [decodeError, setDecodeError] = useState<string | null>(null)
  const persistedUrl = persisted ? templateUrl(persisted) : null

  function onFileSelect(file: File | undefined) {
    if (!file) return
    setDecodeError(null)
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      useCardTypesUi.getState().set({
        stagedFile: file,
        stagedMeta: { w: img.naturalWidth, h: img.naturalHeight, url },
      })
    }
    img.onerror = () => {
      // Undecodable file: nothing was staged, so the store never learns
      // about this blob URL — release it here and tell the user.
      URL.revokeObjectURL(url)
      setDecodeError(`${file.name} could not be read as an image — choose a PNG or JPEG`)
    }
    img.src = url
  }

  const meta = ui.stagedMeta
  const warning = meta ? computeAspectWarning(meta.w, meta.h) : null
  const previewUrl = meta?.url ?? persistedUrl

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-ink/70">Template image</label>
      <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed border-ink/25 p-3">
        <input
          id={id}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => onFileSelect(e.target.files?.[0])}
        />
        {previewUrl ? (
          <img src={previewUrl} alt="Template preview" className="max-h-40 rounded" />
        ) : (
          <span className="font-mono text-[11px] tracking-wide text-ink/60">Click to upload PNG or JPEG</span>
        )}
        {meta && (
          <span className="font-mono text-[10px] text-ink/55">
            {meta.w}×{meta.h} — staged, saved on Save
          </span>
        )}
      </label>
      {warning && (
        <p className="mt-1.5 rounded-md border border-warn/30 bg-warn/10 px-2 py-1 text-[11px] text-warn">{warning}</p>
      )}
      {decodeError && (
        <p role="alert" className="m-0 mt-1.5 text-[11px] text-danger">{decodeError}</p>
      )}
    </div>
  )
}
