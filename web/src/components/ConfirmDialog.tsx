import { Button } from './Button'
import { Dialog } from './Dialog'

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  error,
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog title={title} width="min(400px,100%)">
      <p className="m-0 text-sm opacity-85">{body}</p>
      {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
      <div className="mt-1.5 flex justify-end gap-2">
        <Button type="button" onClick={onCancel}>
          {cancelLabel}
        </Button>
        <button
          type="button"
          onClick={onConfirm}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-danger/50 bg-transparent px-3.5 py-2 text-sm font-medium text-danger hover:bg-danger/10"
        >
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
