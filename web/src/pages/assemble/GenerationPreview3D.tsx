import { SearchableSelect } from '../../components/SearchableSelect'
import { useMemo, useState } from 'react'
import { Field, selectClass } from '../../components/Field'
import { useAssembledPreview, usePreviewCard } from './previewCard'
import { CubeIcon } from '../../components/icons'
import { Card3DViewer } from './Card3DViewer'
import { useTemplate } from './library'
import type { Side } from './api'
import { BackLogoScaleControls } from './BackLogoPreview'
import { useBackLogo } from './backLogo'

// Assemble the front with a demo or saved card; keep generated backs untouched.
export function GenerationPreview3D({ imageUrl, factionId, side, title }: {
  imageUrl: string; factionId: number; side: Side; title: string
}) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" aria-label={`3D preview of ${title}`} onClick={() => setOpen(true)}
      className="flex cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-surface px-2.5 py-1 text-xs text-ink hover:text-accent">
      <CubeIcon /> 3D preview
    </button>
    {open && <GenerationViewer imageUrl={imageUrl} factionId={factionId} side={side} title={title} onClose={() => setOpen(false)} />}
  </>
}

function GenerationViewer({ imageUrl, factionId, side, title, onClose }: {
  imageUrl: string; factionId: number; side: Side; title: string; onClose: () => void
}) {
  const opposite = useTemplate(factionId, 'combat', side === 'front' ? 'back' : 'front')
  const logo = useBackLogo(factionId)
  const [cardId, setCardId] = useState(0)
  const { card, combat } = usePreviewCard(factionId, cardId)
  const frontImage = side === 'front' ? imageUrl : opposite.image?.url ?? null
  const { result, error, rendering } = useAssembledPreview(frontImage, factionId, card)
  const front = useMemo(() => result?.canvas.toDataURL('image/png') ?? null, [result])
  return <Card3DViewer title={title} front={front}
    back={side === 'back' ? imageUrl : opposite.image?.url ?? null} backLogoUrl={logo.logoUrl} backLogoScale={logo.scale} initialSide={side} onClose={onClose}
    controls={<>
      <BackLogoScaleControls logo={logo} />
      <Field label="Preview with card">{id => <SearchableSelect id={id} className={selectClass} value={card.id} onChange={e => setCardId(Number(e.target.value))}>
        <option value={0}>Demo card</option>
        {combat.map(c => <option key={c.id} value={c.id}>{c.name} (level {c.level})</option>)}
      </SearchableSelect>}</Field>
      {frontImage && (rendering || !result) && <p role="status" className="m-0 mt-1 text-xs text-ink/60">{error || 'Rendering card…'}</p>}
    </>} />
}
