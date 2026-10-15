import { useImageSelection } from '../../lib/useImageSelection'
import { SearchableSelect } from '../../components/SearchableSelect'
import { useSearchParams } from 'react-router'
import { ZoomableImage } from '../../components/ImageLightbox'
import { MultiSelect } from '../../components/MultiSelect'
import { Pagination } from '../../components/Pagination'
import { FavoriteButton } from '../../components/FavoriteButton'
import { ImageSelectionCheckbox, ImageSelectionControls } from '../../components/ImageSelection'
import { DeleteImageButton } from '../../components/DeleteImageButton'
import { EditOf } from '../../components/EditOf'
import { parentImageUrl } from '../../lib/imageEdits'
import { inputClass } from '../../components/Field'
import { Tag } from '../../components/Tag'
import { formatCost } from '../../lib/format'
import { previewLayers, useCardTypes } from '../card-types/api'
import { useFactions } from '../factions/api'
import { DLC_VALUES } from '../factions/dlc'
import { useGenerations } from '../test-generation/api'
import { UPLOADED_PROMPT, filtersToParams, parseFilters, type GalleryEntry, type GalleryFilters } from './api'

const PER_PAGE_OPTIONS = [24, 48, 96]

// Every asset — finished Faction Lab images, and your uploads — in one filterable
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
  const { data: factions } = useFactions()
  const { data: cardTypes } = useCardTypes()

  const entries: GalleryEntry[] = [
    ...(gens ?? []).filter((g) => g.status === 'done').map((g): GalleryEntry => ({
      key: `test-${g.id}`, name: g.name, favorite: g.favorite, ref: { kind: 'generation', id: g.id }, origin: g.prompt === UPLOADED_PROMPT ? 'uploaded' : 'generated',
      parentName: g.parent_name, editInstruction: g.edit_instruction, compareSrc: parentImageUrl(g), factionId: g.faction_id, cardTypeId: g.card_type_id,
      mode: g.mode, model: g.model, imageUrl: `/api/generations/${g.id}/image`, costUsd: g.cost_usd, createdAt: g.created_at,
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // both are "YYYY-MM-DD HH:MM:SS"

  const factionById = new Map((factions ?? []).map((f) => [f.id, f]))
  const cardTypeById = new Map((cardTypes ?? []).map((c) => [c.id, c]))
  const { q, favorites, dlcs, factionIds, cardTypeIds, origins, modes } = filters
  // Every whitespace-separated term must appear in the name.
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const shown = entries.filter((e) => {
    const dlc = factionById.get(e.factionId)?.dlc
    return terms.every((t) => e.name.toLowerCase().includes(t)) &&
      (!favorites || e.favorite) &&
      (dlcs.length === 0 || (dlc !== undefined && dlcs.includes(dlc))) &&
      (factionIds.length === 0 || factionIds.includes(e.factionId)) &&
      (cardTypeIds.length === 0 || cardTypeIds.includes(e.cardTypeId)) &&
      (origins.length === 0 || origins.includes(e.origin)) &&
      (modes.length === 0 || modes.includes(e.mode))
  })
  const selection = useImageSelection(shown, filtersToParams(filters).toString())
  const filtering = terms.length > 0 || favorites || dlcs.length + factionIds.length + cardTypeIds.length + origins.length + modes.length > 0
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
          <SearchableSelect value={perPage} onChange={(e) => setPaging(1, Number(e.target.value))} aria-label="Images per page"
            className="min-h-7 rounded-md border border-divider bg-bg py-0.5 pl-2 text-xs text-ink">
            {PER_PAGE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
          </SearchableSelect>
        </label>
      </div>
    </div>
  )
  const loading = gensLoading
  const error = gensError

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Assets</h1>
          <p className="m-0 text-sm text-ink/60">Every finished image from Faction Lab, and your uploads</p>
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
        <MultiSelect label="Origin" selected={origins} onChange={(next) => setFilters({ origins: next })}
          options={[{ value: 'generated' as const, label: 'Generated' }, { value: 'uploaded' as const, label: 'Uploaded' }]} />
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
      {error && <p role="alert" className="text-danger">Failed to load assets: {error instanceof Error ? error.message : 'unknown'}</p>}
      {!loading && !error && shown.length === 0 && (
        <p className="m-0 text-sm text-ink/50">
          {entries.length === 0 ? 'No assets yet.' : 'No assets match the filters.'}
        </p>
      )}

      <ImageSelectionControls selection={selection} images={shown} />

      {shown.length > 0 && pager}

      <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">
        {pageItems.map((e) => {
          const faction = factionById.get(e.factionId)?.name ?? '—'
          const ct = cardTypeById.get(e.cardTypeId)
          const alt = `${faction} × ${ct?.name ?? '—'}`
          return (
            <div key={e.key} className="group/image overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
              <div className="relative">
              <ZoomableImage src={e.imageUrl} alt={alt} {...previewLayers(ct)} cardPreviewFactionId={e.factionId} downloadName={e.name} favorite={{ target: e.ref, value: e.favorite }}
                editTarget={e.ref} compareSrc={e.compareSrc} className="block w-full">
                <img src={e.imageUrl} alt={alt} loading="lazy" className="block aspect-[3/4] w-full object-cover" />
              </ZoomableImage>
              <ImageSelectionCheckbox name={e.name || `Image ${e.key}`} selected={selection.selected.has(e.key)} anySelected={selection.chosen.length > 0}
                disabled={selection.remove.isPending} onToggle={() => selection.toggle(e.key)} />
              <DeleteImageButton overlay target={e.ref} name={e.name || `Image ${e.key}`} disabled={selection.remove.isPending} />
              </div>
              <div className="flex flex-col gap-1 p-2.5">
                <div className="flex items-center gap-1">
                  <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{faction} <span className="text-ink/40">×</span> {ct?.name ?? '—'}</div>
                  <FavoriteButton target={e.ref} favorite={e.favorite} />
                </div>
                {e.name && <div className="truncate font-mono text-[11px] text-ink/60" title={e.name}>{e.name}</div>}
                {e.parentName && <div className="truncate"><EditOf gen={{ parent_name: e.parentName, edit_instruction: e.editInstruction }} /></div>}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Tag variant={e.origin === 'uploaded' ? 'solid-accent' : 'neutral'}>{e.origin === 'uploaded' ? 'Uploaded' : 'Generated'}</Tag>
                  {e.origin === 'generated' && <Tag variant={e.mode === 'final' ? 'solid-accent' : 'neutral'}>{e.mode}</Tag>}
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
