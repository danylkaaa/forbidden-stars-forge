import { Tag } from '../../components/Tag'
import { formatCost, formatDuration, generationImageUrl, type Generation } from './api'
import { useTestGenUi } from './store'

export function HistoryRow({ gen, factionName, cardTypeName }: { gen: Generation; factionName: string; cardTypeName: string }) {
  const expanded = useTestGenUi((s) => s.expandedId === gen.id)
  const imageUrl = generationImageUrl(gen)

  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <button type="button"
        onClick={() => useTestGenUi.getState().set({ expandedId: expanded ? null : gen.id })}
        className="flex w-full cursor-pointer items-center gap-3.5 border-0 bg-transparent px-3.5 py-3 text-left text-ink">
        {imageUrl ? (
          <img src={imageUrl} alt="" className="h-14 w-10 flex-none rounded object-cover" />
        ) : (
          <div className="h-14 w-10 flex-none rounded bg-neutral-800" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{factionName} <span className="font-normal text-ink/40">×</span> {cardTypeName}</span>
            <Tag variant={gen.mode === 'final' ? 'solid-accent' : 'neutral'}>{gen.mode}</Tag>
          </div>
          <div className="mt-0.5 text-xs text-ink/50">
            {gen.created_at} · {formatDuration(gen.duration_ms)} · <span>$</span>
            {formatCost(gen.cost_usd).slice(1)}
          </div>
          {gen.status === 'failed' && <div className="mt-0.5 text-xs text-danger">{gen.error}</div>}
        </div>
      </button>
      {expanded && (
        <div className="flex gap-4 px-3.5 pb-4">
          {imageUrl && <img src={imageUrl} alt="Generated card" className="max-h-72 rounded" />}
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md border border-ink/10 bg-bg p-2.5 font-mono text-xs leading-normal text-ink/70">
              {gen.prompt}
            </div>
            {imageUrl && (
              <a href={imageUrl} download={`gen-${gen.id}.png`}
                className="self-start rounded-md border border-divider px-3 py-1.5 text-[13px] font-medium text-ink no-underline hover:bg-ink/5">
                Download PNG
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
