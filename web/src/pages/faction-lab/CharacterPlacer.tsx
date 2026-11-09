import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { saveCharacterPlacement, useFactionCharacters, type CharacterPlacement } from '../factions/characters'
import { useFactionCardOver, useSavedPlateUrl } from '../faction-card/useFactionCardCanvases'
import { CharacterPicker } from '../factions/CharacterPicker'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

// Where the faction's character sits on a "with character" image: drag to move, scroll to resize. The box has the
// image type's shape; parts outside it are cut off, as in the generated image. Saved when a move or zoom ends. The
// faction's saved card (plate, units, texts) can be shown over it, since the image becomes that card's background.
export function CharacterPlacer({ factionId, imageSize }: { factionId: number; imageSize: string }) {
  const { data: characters, isLoading } = useFactionCharacters()
  const character = characters?.find((c) => c.faction_id === factionId)
  const queryClient = useQueryClient()
  const save = useMutation({
    mutationFn: (p: CharacterPlacement) => saveCharacterPlacement(factionId, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['faction-characters'] }),
  })
  const [place, setPlace] = useState<CharacterPlacement | null>(null)
  const [showCard, setShowCard] = useState(true)
  const plate = useSavedPlateUrl(factionId)
  const card = useFactionCardOver(factionId, 'front', plate, false, true)
  useEffect(() => { setPlace(character?.placement ?? null) }, [character?.url, character?.placement])
  const box = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; start: CharacterPlacement } | null>(null)
  const placed = place !== null
  const latest = useRef({ place, save: save.mutate }); latest.current = { place, save: save.mutate }

  useEffect(() => {
    const el = box.current
    if (!el) return
    let timer = 0
    const wheel = (e: WheelEvent) => {
      const p = latest.current.place
      if (!p) return
      e.preventDefault()
      const next = { ...p, scale: clamp(p.scale * Math.exp(-e.deltaY * 0.0015), 0.05, 4) }
      setPlace(next); latest.current.place = next
      window.clearTimeout(timer); timer = window.setTimeout(() => latest.current.save(next), 400)
    }
    el.addEventListener('wheel', wheel, { passive: false })
    return () => { el.removeEventListener('wheel', wheel); window.clearTimeout(timer) }
  }, [character?.url, placed]) // the box only exists once a placement is known

  const [w, h] = imageSize.split('x').map(Number)
  if (isLoading) return null
  const picker = <CharacterPicker factionId={factionId} character={character} />
  if (!character || !place) return picker

  return <div className="flex flex-col gap-1">
    {picker}
    <span className="text-xs text-ink/70">Character position</span>
    <div ref={box} role="application" aria-label="Character position: drag to move, scroll to resize"
      className="relative w-full cursor-move touch-none overflow-hidden rounded border border-divider bg-[repeating-conic-gradient(#2a2622_0_25%,#211e1b_0_50%)] bg-[length:16px_16px]"
      style={{ aspectRatio: w > 0 && h > 0 ? `${w} / ${h}` : '1' }}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, start: place } }}
      onPointerMove={(e) => {
        const d = drag.current, r = box.current?.getBoundingClientRect()
        if (!d || !r?.width) return
        setPlace({ ...d.start, x: clamp(d.start.x + (e.clientX - d.x) / r.width, -1, 2), y: clamp(d.start.y + (e.clientY - d.y) / r.height, -1, 2) })
      }}
      onPointerUp={() => { if (drag.current) { drag.current = null; save.mutate(place) } }}
      onPointerCancel={() => { drag.current = null }}>
      <img src={character.url} alt="Placed character" draggable={false} className="pointer-events-none absolute max-w-none select-none"
        style={{ left: `${place.x * 100}%`, top: `${place.y * 100}%`, height: `${place.scale * 100}%`, transform: `translate(-50%, -50%)${place.flip ? ' scaleX(-1)' : ''}` }} />
      {showCard && card.url && <img src={card.url} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover" />}
    </div>
    <button type="button" className="self-start cursor-pointer border-0 bg-transparent p-0 text-xs text-accent"
      onClick={() => { const next = { ...place, flip: !place.flip }; setPlace(next); save.mutate(next) }}>Flip horizontally</button>
    <label className="flex items-center gap-2 text-xs text-ink/70">
      <input type="checkbox" checked={showCard} onChange={(e) => setShowCard(e.target.checked)} />
      Show the faction card over it{!plate ? ' (no plate saved on the faction card yet)' : card.pending ? ' (rendering…)' : ''}
    </label>
    <p className="m-0 text-[11px] text-ink/50">Drag to move, scroll to resize. OpenAI paints the empty area around the character; its picture is the result.{save.isPending ? ' Saving…' : ''}</p>
    {save.isError && <p role="alert" className="m-0 text-xs text-danger">{save.error.message}</p>}
  </div>
}
