import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { CardProbe } from './CardProbe'

// Cards shown on the faction card (as initial forces) must be rendered
// first. Render `probes` somewhere in the tree; `images` fills in as cards
// finish (null = could not be rendered); `pending` is true until all have.
export function useCardImages(ids: number[]): { images: Record<number, HTMLCanvasElement>; pending: boolean; probes: ReactNode } {
  const [state, setState] = useState<Record<number, HTMLCanvasElement | null>>({})
  const onImage = useCallback((id: number, canvas: HTMLCanvasElement | null | undefined) => setState(prev => {
    if (canvas === undefined) { if (!(id in prev)) return prev; const next = { ...prev }; delete next[id]; return next }
    return prev[id] === canvas ? prev : { ...prev, [id]: canvas }
  }), [])
  const key = [...new Set(ids)].sort((a, b) => a - b).join(',')
  const unique = useMemo(() => key ? key.split(',').map(Number) : [], [key])
  const images = useMemo(() => Object.fromEntries(Object.entries(state).filter((e): e is [string, HTMLCanvasElement] => !!e[1] && unique.includes(Number(e[0]))).map(([k, v]) => [Number(k), v])), [state, unique])
  const pending = unique.some(id => !(id in state))
  const probes = useMemo(() => unique.map(id => <CardProbe key={id} cardId={id} onImage={onImage} />), [unique, onImage])
  return { images, pending, probes }
}
