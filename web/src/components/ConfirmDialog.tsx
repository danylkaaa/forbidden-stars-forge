import { Dialog } from './Dialog'

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
}: {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog title={title} width="min(400px,100%)">
      <p className="m-0 text-sm opacity-85">{body}</p>
      <div className="mt-1.5 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-transparent px-3.5 py-2 text-sm font-medium text-ink hover:bg-ink/5"
        >
          {cancelLabel}
        </button>
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
