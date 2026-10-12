import { Link, useSearchParams } from 'react-router'
import { ZoomableImage } from '../../components/ImageLightbox'
import { MultiSelect } from '../../components/MultiSelect'
import { Pagination } from '../../components/Pagination'
import { FavoriteButton } from '../../components/FavoriteButton'
import { EditOf } from '../../components/EditOf'
import { parentImageUrl } from '../../lib/imageEdits'
import { inputClass } from '../../components/Field'
import { Tag } from '../../components/Tag'
import { formatCost } from '../../lib/format'
import { previewLayers, useCardTypes } from '../card-types/api'
import { useFactions } from '../factions/api'
import { DLC_VALUES } from '../factions/dlc'
import { useGenerations } from '../test-generation/api'
import { filtersToParams, parseFilters, useDoneBatchItems, type GalleryEntry, type GalleryFilters } from './api'

const PER_PAGE_OPTIONS = [24, 48, 96]

// Every finished image — Test Generation and batches — in one filterable
// grid. Filters are kept in the URL so other pages can deep-link here.
export default function GenerationsPage() {
  const [params, setParams] = useSearchParams()
  const filters = parseFilters(params)
  // Changing a filter goes back to page 1 (page is dropped from the URL).
  const setFilters = (patch: Partial<GalleryFilters>) => setParams(filtersToParams({ ...filters, ...patch }), { replace: true })
  const perPage = PER_PAGE_OPTIONS.includes(Number(params.get('per'))) ? Number(params.get('per')) : PER_PAGE_OPTIONS[0]
  const setPaging = (page: number, per = perPage) => {
    const next = filtersToParams(filters)
    if (page > 1) next.set('page', String(page))
    if (per !== PER_PAGE_OPTIONS[0]) next.set('per', String(per))
    setParams(next) // pushes history: Back returns to the previous page
    document.querySelector('main')?.scrollTo({ top: 0 })
  }

  const { data: gens, isLoading: gensLoading, error: gensError } = useGenerations()
  const { data: batchItems, isLoading: itemsLoading, error: itemsError } = useDoneBatchItems()
  const { data: factions } = useFactions()
  const { data: cardTypes } = useCardTypes()

  const entries: GalleryEntry[] = [
    ...(gens ?? []).filter((g) => g.status === 'done').map((g): GalleryEntry => ({
      key: `test-${g.id}`, name: g.name, favorite: g.favorite, ref: { kind: 'generation', id: g.id }, source: 'test',
      parentName: g.parent_name, editInstruction: g.edit_instruction, compareSrc: parentImageUrl(g), factionId: g.faction_id, cardTypeId: g.card_type_id,
      mode: g.mode, model: g.model, imageUrl: `/api/generations/${g.id}/image`, costUsd: g.cost_usd, createdAt: g.created_at,
    })),
    ...(batchItems ?? []).map((it): GalleryEntry => ({
      key: `batch-${it.id}`, name: it.name, favorite: it.favorite,
      ref: { kind: 'batch-item', batchId: it.batch_id, itemId: it.id }, source: 'batch',
      parentName: '', editInstruction: '', compareSrc: null, factionId: it.faction_id, cardTypeId: it.card_type_id,
      mode: it.mode, model: it.model, imageUrl: `/api/batches/${it.batch_id}/items/${it.id}/image`,
      costUsd: it.cost_usd, createdAt: it.completed_at, batchId: it.batch_id,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // both are "YYYY-MM-DD HH:MM:SS"

  const factionById = new Map((factions ?? []).map((f) => [f.id, f]))
  const cardTypeById = new Map((cardTypes ?? []).map((c) => [c.id, c]))
  const { q, favorites, dlcs, factionIds, cardTypeIds, sources, modes } = filters
  // Every whitespace-separated term must appear in the name.
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = entries.filter((e) => {
    const dlc = factionById.get(e.factionId)?.dlc
    return terms.every((t) => e.name.toLowerCase().includes(t)) &&
      (!favorites || e.favorite) &&
      (dlcs.length === 0 || (dlc !== undefined && dlcs.includes(dlc))) &&
      (factionIds.length === 0 || factionIds.includes(e.factionId)) &&
      (cardTypeIds.length === 0 || cardTypeIds.includes(e.cardTypeId)) &&
      (sources.length === 0 || sources.includes(e.source)) &&
      (modes.length === 0 || modes.includes(e.mode))
  })
  const filtering = terms.length > 0 || favorites || dlcs.length + factionIds.length + cardTypeIds.length + sources.length + modes.length > 0
  const total = shown.reduce((sum, e) => sum + e.costUsd, 0)
  const pages = Math.max(1, Math.ceil(shown.length / perPage))
  const page = Math.min(pages, Math.max(1, Number(params.get('page')) || 1))
  const pageItems = shown.slice((page - 1) * perPage, page * perPage)
  const pager = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-xs text-ink/45">
        {shown.length > 0 && `${(page - 1) * perPage + 1}–${Math.min(page * perPage, shown.length)} of ${shown.length}`}
      </span>
      <div className="flex items-center gap-3">
        <Pagination page={page} pages={pages} onPage={(p) => setPaging(p)} />
        <label className="flex items-center gap-1.5 text-xs text-ink/55">
          Per page
          <select value={perPage} onChange={(e) => setPaging(1, Number(e.target.value))} aria-label="Images per page"
            className="min-h-7 rounded-md border border-divider bg-bg py-0.5 pl-2 text-xs text-ink">
            {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>
    </div>
  )
  const loading = gensLoading || itemsLoading
  const error = gensError ?? itemsError

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Generations</h1>
          <p className="m-0 text-sm text-ink/60">Every finished image from Test Generation and batches</p>
        </div>
        <span className="text-sm text-ink/60">{filtering ? 'Filtered total' : 'Total'}: {formatCost(total)}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input type="search" value={q} placeholder="Search names, e.g. 12-necrons or final"
          aria-label="Search by name" onChange={(e) => setFilters({ q: e.target.value })}
          className={`${inputClass} min-h-8 w-72 py-1 font-sans text-[13px]`} />
        <button type="button" aria-pressed={favorites} onClick={() => setFilters({ favorites: !favorites })}
          className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-md border bg-transparent px-2.5 py-1 text-[13px] ${favorites ? 'border-warn text-warn' : 'border-divider text-ink'}`}>
          {favorites ? '★' : '☆'} Favorites
        </button>
        <MultiSelect label="DLC" options={DLC_VALUES.map((d) => ({ value: d as string, label: d }))} selected={dlcs}
          onChange={(next) => setFilters({
            dlcs: next,
            // Drop selected factions the new DLC choice hides.
            factionIds: factionIds.filter((id) => next.length === 0 || next.includes(factionById.get(id)?.dlc ?? '')),
          })} />
        <MultiSelect label="Faction" selected={factionIds} onChange={(next) => setFilters({ factionIds: next })}
          options={(factions ?? []).filter((f) => dlcs.length === 0 || dlcs.includes(f.dlc)).map((f) => ({ value: f.id, label: f.name }))} />
        <MultiSelect label="Card type" selected={cardTypeIds} onChange={(next) => setFilters({ cardTypeIds: next })}
          options={(cardTypes ?? []).map((c) => ({ value: c.id, label: c.name }))} />
        <MultiSelect label="Source" selected={sources} onChange={(next) => setFilters({ sources: next })}
          options={[{ value: 'test' as const, label: 'Test Generation' }, { value: 'batch' as const, label: 'Batch' }]} />
        <MultiSelect label="Mode" selected={modes} onChange={(next) => setFilters({ modes: next })}
          options={[{ value: 'draft' as const, label: 'Draft' }, { value: 'final' as const, label: 'Final' }]} />
        {filtering && (
          <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })}
            className="cursor-pointer border-0 bg-transparent px-1 py-1 text-xs font-medium text-accent">
            Clear filters
          </button>
        )}
        <span className="text-xs text-ink/45">{shown.length}{filtering ? ` of ${entries.length}` : ''} images</span>
      </div>

      {loading && <p className="text-ink/60">Loading…</p>}
      {error && <p role="alert" className="text-danger">Failed to load generations: {error instanceof Error ? error.message : 'unknown'}</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="m-0 text-sm text-ink/50">
          {entries.length === 0 ? 'No generated images yet.' : 'No generations match the filters.'}
        </p>
      )}

      {shown.length > 0 && pager}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {pageItems.map((e) => {
          const faction = factionById.get(e.factionId)?.name ?? '—'
          const ct = cardTypeById.get(e.cardTypeId)
          const alt = `${faction} × ${ct?.name ?? '—'}`
          return (
            <div key={e.key} className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
              <ZoomableImage src={e.imageUrl} alt={alt} {...previewLayers(ct)} downloadName={e.name} favorite={{ target: e.ref, value: e.favorite }}
                editTarget={e.ref} compareSrc={e.compareSrc} className="block w-full">
                <img src={e.imageUrl} alt={alt} loading="lazy" className="block aspect-[3/4] w-full object-cover" />
              </ZoomableImage>
              <div className="flex flex-col gap-1 p-2.5">
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{faction} <span className="text-ink/40">×</span> {ct?.name ?? '—'}</div>
                  <FavoriteButton target={e.ref} favorite={e.favorite} />
                </div>
                {e.name && <div className="truncate font-mono text-[11px] text-ink/60" title={e.name}>{e.name}</div>}
                {e.parentName && <div className="truncate"><EditOf gen={{ parent_name: e.parentName, edit_instruction: e.editInstruction }} /></div>}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag variant={e.mode === 'final' ? 'solid-accent' : 'neutral'}>{e.mode}</Tag>
                  {e.source === 'batch' && e.batchId !== undefined ? (
                    <Link to={`/batches/${e.batchId}`} className="text-[11px] text-accent no-underline hover:underline">batch #{e.batchId}</Link>
                  ) : (
                    <span className="text-[11px] text-ink/45">test</span>
                  )}
                  {e.model && <span className="truncate font-mono text-[10.5px] text-ink/45">{e.model}</span>}
                </div>
                <div className="text-[11px] text-ink/45">{e.createdAt} · {formatCost(e.costUsd)}</div>
              </div>
            </div>
          )
        })}
      </div>

      {shown.length > perPage && pager}
    </div>
  )
}
