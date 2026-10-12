import { useState } from 'react'
import { useElapsedMs } from '../../lib/useElapsedMs'
import { ZoomableImage } from '../../components/ImageLightbox'
import { EditIcon, RetryIcon } from '../../components/icons'
import { FavoriteButton } from '../../components/FavoriteButton'
import { GeneratingSpinner } from '../../components/GeneratingSpinner'
import { Tag } from '../../components/Tag'
import { formatCost, formatDuration, generationImageUrl, useStartGeneration, type Generation } from './api'
import { useTestGenUi } from './store'

export function HistoryRow({ gen, factionName, cardTypeName, overlaySrc, maskSrc }: {
  gen: Generation; factionName: string; cardTypeName: string; overlaySrc?: string | null; maskSrc?: string | null
}) {
  const expanded = useTestGenUi((s) => s.expandedId === gen.id)
  const imageUrl = generationImageUrl(gen)
  const pending = gen.status === 'pending'
  const elapsedMs = useElapsedMs(gen.created_at, pending)
  const start = useStartGeneration()
  const [retrying, setRetrying] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  // Retry = a new generation with this row's exact params and prompt; this
  // row (and its image) stays in History.
  // Modify = load this row's settings and prompt into the setup form above
  // so they can be tweaked before generating again.
  function modify() {
    useTestGenUi.getState().set({
      factionId: gen.faction_id, cardTypeId: gen.card_type_id, mode: gen.mode, model: gen.model,
      editingPrompt: true, promptOverride: gen.prompt, promptAssistOpen: false,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function retry() {
    setRetrying(true)
    setRetryError(null)
    try {
      await start({
        faction_id: gen.faction_id, card_type_id: gen.card_type_id, mode: gen.mode, prompt_override: gen.prompt,
        ...(gen.model ? { model: gen.model } : {}),
      })
    } catch (e) {
      setRetryError(e instanceof Error ? e.message : 'retry failed')
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div
      aria-busy={pending}
      className={`overflow-hidden rounded-md bg-surface ${
        pending ? 'shadow-[0_0_0_1px_var(--color-accent-700)]' : 'shadow-[0_0_0_1px_var(--color-neutral-800)]'
      }`}>
      <div className="flex items-center gap-3.5 px-3.5 py-3">
        {imageUrl ? (
          <ZoomableImage src={imageUrl} alt={`${factionName} × ${cardTypeName}`} overlaySrc={overlaySrc} maskSrc={maskSrc} downloadName={gen.name} favorite={{ target: { kind: 'generation', id: gen.id }, value: gen.favorite }} className="flex-none">
            <img src={imageUrl} alt="" className="block h-14 w-10 rounded object-cover" />
          </ZoomableImage>
        ) : pending ? (
          <div className="grid h-14 w-10 flex-none place-items-center overflow-hidden rounded bg-accent-900">
            <GeneratingSpinner seed={gen.id} size="sm" />
          </div>
        ) : (
          <div className="h-14 w-10 flex-none rounded bg-neutral-800" />
        )}
        <button type="button"
          onClick={() => useTestGenUi.getState().set({ expandedId: expanded ? null : gen.id })}
          className="min-w-0 flex-1 cursor-pointer self-stretch border-0 bg-transparent p-0 text-left text-ink">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{factionName} <span className="font-normal text-ink/40">×</span> {cardTypeName}</span>
            <Tag variant={gen.mode === 'final' ? 'solid-accent' : 'neutral'}>{gen.mode}</Tag>
            {gen.model && <span className="font-mono text-[11px] text-ink/45">{gen.model}</span>}
            {pending && <Tag variant="outline-accent"><span className="animate-pulse">generating…</span></Tag>}
          </div>
          {gen.name && <div className="mt-0.5 font-mono text-[11.5px] text-ink/70">{gen.name}</div>}
          <div className="mt-0.5 text-xs text-ink/50">
            {pending ? (
              <>{gen.created_at} · {formatDuration(elapsedMs)} elapsed</>
            ) : (
              <>
                {gen.created_at} · {formatDuration(gen.duration_ms)} · <span>$</span>
                {formatCost(gen.cost_usd).slice(1)}
              </>
            )}
          </div>
          {gen.status === 'failed' && <div className="mt-0.5 text-xs text-danger">{gen.error}</div>}
          {retryError && <div role="alert" className="mt-0.5 text-xs text-danger">Retry failed: {retryError}</div>}
        </button>
        <FavoriteButton target={{ kind: 'generation', id: gen.id }} favorite={gen.favorite} />
        <button type="button" onClick={modify} aria-label="Modify generation" title="Copy settings and prompt into the form above"
          className="inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-transparent px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-ink/5">
          <EditIcon />
          Modify
        </button>
        <button type="button" onClick={retry} disabled={retrying} aria-label="Retry generation" title="Generate again with the same settings"
          className="inline-flex flex-none cursor-pointer items-center gap-1.5 rounded-md border border-divider bg-transparent px-2.5 py-1.5 text-xs font-medium text-ink hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-45">
          <RetryIcon className={retrying ? 'animate-spin' : ''} />
          Retry
        </button>
      </div>
      {expanded && (
        <div className="flex gap-4 px-3.5 pb-4">
          {imageUrl && (
            <ZoomableImage src={imageUrl} alt={`${factionName} × ${cardTypeName}`} overlaySrc={overlaySrc} maskSrc={maskSrc} downloadName={gen.name} favorite={{ target: { kind: 'generation', id: gen.id }, value: gen.favorite }}>
              <img src={imageUrl} alt="Generated card" className="block max-h-72 rounded" />
            </ZoomableImage>
          )}
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
