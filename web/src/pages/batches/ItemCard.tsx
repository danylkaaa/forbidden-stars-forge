import { Tag } from '../../components/Tag'
import { formatCost } from '../../lib/format'
import { batchItemImageUrl, type BatchItem } from './api'

export function ItemCard({
  item, batchId, factionName, cardTypeName,
}: { item: BatchItem; batchId: number; factionName: string; cardTypeName: string }) {
  const imageUrl = batchItemImageUrl(batchId, item)
  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      {imageUrl ? (
        <img src={imageUrl} alt={`${factionName} ${cardTypeName}`} className="aspect-[3/4] w-full object-cover" />
      ) : (
        <div className="flex aspect-[3/4] w-full items-center justify-center bg-neutral-800">
          <Tag variant={item.status === 'failed' ? 'warn' : 'neutral'}>{item.status}</Tag>
        </div>
      )}
      <div className="p-2.5">
        <div className="truncate text-[13px] font-medium">{factionName} <span className="text-ink/40">×</span> {cardTypeName}</div>
        {item.status === 'done' && <div className="mt-0.5 text-xs text-ink/50">{formatCost(item.cost_usd)}</div>}
        {item.status === 'failed' && <div role="alert" className="mt-0.5 text-xs text-danger">{item.error}</div>}
      </div>
    </div>
  )
}
