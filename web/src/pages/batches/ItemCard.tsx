import { FavoriteButton } from '../../components/FavoriteButton'
import { ZoomableImage } from '../../components/ImageLightbox'
import { Tag } from '../../components/Tag'
import { formatCost } from '../../lib/format'
import { batchItemImageUrl, type BatchItem } from './api'

export function ItemCard({
  item, batchId, factionName, cardTypeName, maskSrc,
}: { item: BatchItem; batchId: number; factionName: string; cardTypeName: string; maskSrc?: string | null }) {
  const imageUrl = batchItemImageUrl(batchId, item)
  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      {imageUrl ? (
        <ZoomableImage src={imageUrl} alt={`${factionName} ${cardTypeName}`} maskSrc={maskSrc} cardPreviewFactionId={item.faction_id} downloadName={item.name} favorite={{ target: { kind: 'batch-item', batchId, itemId: item.id }, value: item.favorite }}
          editTarget={{ kind: 'batch-item', batchId, itemId: item.id }} className="block w-full">
          <img src={imageUrl} alt={`${factionName} ${cardTypeName}`} className="block aspect-[3/4] w-full object-cover" />
        </ZoomableImage>
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center bg-neutral-800">
          <Tag variant={item.status === 'failed' ? 'warn' : 'neutral'}>{item.status}</Tag>
        </div>
      )}
      <div className="p-2.5">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{factionName} <span className="text-ink/40">×</span> {cardTypeName}</div>
          {item.status === 'done' && <FavoriteButton target={{ kind: 'batch-item', batchId, itemId: item.id }} favorite={item.favorite} />}
        </div>
        {item.name && <div className="truncate font-mono text-[11px] text-ink/60" title={item.name}>{item.name}</div>}
        {item.status === 'done' && <div className="mt-0.5 text-xs text-ink/50">{formatCost(item.cost_usd)}</div>}
        {item.status === 'failed' && <div role="alert" className="mt-0.5 text-xs text-danger">{item.error}</div>}
      </div>
    </div>
  )
}
