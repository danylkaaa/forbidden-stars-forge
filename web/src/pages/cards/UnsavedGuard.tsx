import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import { ConfirmDialog } from '../../components/ConfirmDialog'
export function UnsavedGuard({ dirty, discard }: { dirty: boolean; discard: () => void }) {
  const blocker = useBlocker(dirty)
  useEffect(() => {
    if (!dirty) return
    const beforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [dirty])
  return blocker.state === 'blocked' ? <ConfirmDialog title="Discard unsaved changes?" body="Leaving this page will discard your unsaved card changes."
    confirmLabel="Discard" cancelLabel="Keep editing" onCancel={() => blocker.reset()} onConfirm={() => { discard(); blocker.proceed() }} /> : null
}
