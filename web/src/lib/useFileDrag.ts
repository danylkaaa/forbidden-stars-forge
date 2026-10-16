import { useEffect, useState } from 'react'

// True while files are being dragged over the page (from Finder, say), so drop targets can show themselves.
export function useFileDrag(enabled = true) {
  const [dragging, setDragging] = useState(false)
  useEffect(() => {
    if (!enabled) { setDragging(false); return }
    let depth = 0
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
    const enter = (e: DragEvent) => { if (hasFiles(e)) { depth++; setDragging(true) } }
    const leave = (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false) } }
    const end = () => { depth = 0; setDragging(false) }
    window.addEventListener('dragenter', enter)
    window.addEventListener('dragleave', leave)
    window.addEventListener('drop', end)
    window.addEventListener('dragend', end)
    return () => {
      window.removeEventListener('dragenter', enter); window.removeEventListener('dragleave', leave)
      window.removeEventListener('drop', end); window.removeEventListener('dragend', end)
    }
  }, [enabled])
  return dragging
}
