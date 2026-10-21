import { useEffect, useRef, useState } from 'react'
import { CARD_SIZE, type PortraitCrop } from './model'
import type { Box } from './placeholders'

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))
const MAX_ZOOM = 4

// Sits over the leader portrait's frame on a preview: drag the picture to choose which part shows, scroll to zoom.
// `box` is the frame in card pixels; the handle is placed in % of the card.
export function PortraitHandle({ box, url, crop, onChange }: { box: Box; url: string; crop: PortraitCrop; onChange: (crop: PortraitCrop) => void }) {
  const el = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const drag = useRef<{ x: number; y: number; start: PortraitCrop } | null>(null)
  const latest = useRef({ crop, onChange })
  latest.current = { crop, onChange }
  useEffect(() => {
    let live = true
    const img = new Image()
    img.onload = () => { if (live) setSize({ w: img.naturalWidth, h: img.naturalHeight }) }
    img.src = url
    return () => { live = false }
  }, [url])
  // React's wheel listener is passive, so the page would scroll too; this one is not.
  useEffect(() => {
    const node = el.current
    if (!node) return
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const { crop: c, onChange: change } = latest.current
      change({ ...c, zoom: Math.round(clamp(c.zoom * Math.exp(-e.deltaY * 0.0015), 1, MAX_ZOOM) * 1000) / 1000 })
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => node.removeEventListener('wheel', wheel)
  }, [])

  const move = (e: React.PointerEvent) => {
    const d = drag.current, rect = el.current?.getBoundingClientRect()
    if (!d || !size || !rect?.width) return
    // How far the picture overhangs the frame, in card pixels; dragging it right shows more of its left side.
    const k = Math.max(box.w / size.w, box.h / size.h) * d.start.zoom, over = { x: size.w * k - box.w, y: size.h * k - box.h }
    const toCard = box.w / rect.width, dx = (e.clientX - d.x) * toCard, dy = (e.clientY - d.y) * toCard
    const round = (n: number) => Math.round(n * 1000) / 1000
    onChange({ ...d.start, x: over.x > 0 ? round(clamp(d.start.x - dx / over.x, 0, 1)) : d.start.x, y: over.y > 0 ? round(clamp(d.start.y - dy / over.y, 0, 1)) : d.start.y })
  }
  const end = () => { drag.current = null }
  return <div ref={el} role="button" tabIndex={-1} aria-label="Move the leader portrait" title="Drag to move the portrait, scroll to zoom"
    onPointerDown={e => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, start: crop } }}
    onPointerMove={move} onPointerUp={end} onPointerCancel={end} onLostPointerCapture={end} onClick={e => { e.preventDefault(); e.stopPropagation() }}
    className="absolute cursor-grab touch-none rounded border border-transparent hover:border-accent active:cursor-grabbing"
    style={{ left: `${box.x / CARD_SIZE.width * 100}%`, top: `${box.y / CARD_SIZE.height * 100}%`, width: `${box.w / CARD_SIZE.width * 100}%`, height: `${box.h / CARD_SIZE.height * 100}%` }} />
}
