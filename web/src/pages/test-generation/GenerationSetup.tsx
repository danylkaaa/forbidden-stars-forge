import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Field, selectClass, inputClass } from '../../components/Field'
import { useFactions } from '../factions/api'
import { useCardTypes } from '../card-types/api'
import { formatCost, startGeneration, useGeneration, usePreview } from './api'
import { useTestGenUi } from './store'

export function GenerationSetup({ intervalMs = 2000 }: { intervalMs?: number }) {
  const ui = useTestGenUi()
  const { data: factions, error: factionsError } = useFactions()
  const { data: cardTypes, error: cardTypesError } = useCardTypes()
  const { data: previewData, error: previewError } = usePreview(ui.factionId, ui.cardTypeId)
  const gen = useGeneration(ui.activeGenerationId, intervalMs)
  const [genError, setGenError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const queryClient = useQueryClient()

  const pending = ui.activeGenerationId !== null && (gen.data === undefined || gen.data.status === 'pending')

  useEffect(() => {
    const g = gen.data
    if (!g || g.status === 'pending') return
    if (useTestGenUi.getState().activeGenerationId !== g.id) return
    queryClient.invalidateQueries({ queryKey: ['generations'] })
    useTestGenUi.getState().set({ activeGenerationId: null })
    if (g.status === 'failed') setGenError(g.error || 'generation failed')
  }, [gen.data, queryClient])

  useEffect(() => {
    if (!ui.activeGenerationId || !gen.isError) return
    useTestGenUi.getState().set({ activeGenerationId: null })
    setGenError(`failed to check generation status: ${gen.error instanceof Error ? gen.error.message : 'unknown'}`)
  }, [gen.isError, gen.error, ui.activeGenerationId])

  async function onGenerate() {
    if (starting || ui.factionId === null || ui.cardTypeId === null) return
    setStarting(true)
    setGenError(null)
    try {
      const body: Parameters<typeof startGeneration>[0] = {
        faction_id: ui.factionId, card_type_id: ui.cardTypeId, mode: ui.mode,
      }
      if (ui.editingPrompt && ui.promptOverride.trim()) body.prompt_override = ui.promptOverride
      const g = await startGeneration(body)
      ui.set({ activeGenerationId: g.id })
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'failed to start generation')
    } finally {
      setStarting(false)
    }
  }

  const estimate = previewData ? (ui.mode === 'draft' ? previewData.est_draft_usd : previewData.est_final_usd) : null
  const canGenerate = ui.factionId !== null && ui.cardTypeId !== null && previewData?.has_file === true && !pending && !starting

  if (factionsError || cardTypesError) {
    return (
      <div className="flex flex-col gap-3.5 rounded-md bg-surface p-4 shadow-[0_0_0_1px_var(--color-neutral-800)]">
        {factionsError && (
          <p role="alert" className="m-0 text-sm text-danger">
            Failed to load factions: {factionsError instanceof Error ? factionsError.message : 'unknown'}
          </p>
        )}
        {cardTypesError && (
          <p role="alert" className="m-0 text-sm text-danger">
            Failed to load card types: {cardTypesError instanceof Error ? cardTypesError.message : 'unknown'}
          </p>
        )}
      </div>
    )
  }

  if (!factions || !cardTypes) {
    return (
      <div className="flex flex-col gap-3.5 rounded-md bg-surface p-4 shadow-[0_0_0_1px_var(--color-neutral-800)]">
        <p className="m-0 text-sm text-ink/60">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3.5 rounded-md bg-surface p-4 shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <div className="grid grid-cols-2 gap-3.5">
        <Field label="Faction">
          {(id) => (
            <select id={id} className={selectClass} value={ui.factionId ?? ''}
              onChange={(e) => ui.set({ factionId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Select…</option>
              {factions?.map((f) => <option key={f.id} value={f.id} label={f.name} />)}
            </select>
          )}
        </Field>
        <Field label="Card Type">
          {(id) => (
            <select id={id} className={selectClass} value={ui.cardTypeId ?? ''}
              onChange={(e) => ui.set({ cardTypeId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Select…</option>
              {cardTypes?.map((c) => (
                <option key={c.id} value={c.id}>{c.openai_file_id ? c.name : `${c.name} (no file uploaded)`}</option>
              ))}
            </select>
          )}
        </Field>
      </div>

      {previewData && !previewData.has_file && (
        <p className="m-0 flex items-center justify-between gap-3 rounded-md border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
          <span>This card type has no OpenAI file uploaded yet.</span>
          <Link to="/card-types" className="whitespace-nowrap text-warn underline underline-offset-2">Go to Card Types →</Link>
        </p>
      )}

      {previewError ? (
        <p role="alert" className="m-0 text-sm text-danger">
          Failed to load prompt preview: {previewError instanceof Error ? previewError.message : 'unknown'}
        </p>
      ) : (
        <>
          <div>
            <span className="mb-1 block text-xs text-ink/70">Mode</span>
            <div className="flex items-center gap-3">
              <div className="inline-flex overflow-hidden rounded-md border border-divider" role="group" aria-label="Mode">
                {(['draft', 'final'] as const).map((m, i) => (
                  <button key={m} type="button" onClick={() => ui.set({ mode: m })}
                    className={`px-3.5 py-1.5 text-[13px] cursor-pointer bg-transparent border-0 ${i > 0 ? 'border-l border-divider' : ''} ${ui.mode === m ? 'text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-ink'}`}>
                    {m === 'draft' ? 'Draft' : 'Final'}
                  </button>
                ))}
              </div>
              {estimate !== null && <span className="text-xs text-ink/50">est. {formatCost(estimate)} per image (estimate)</span>}
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <label htmlFor="tg-prompt" className="text-xs text-ink/70">{ui.editingPrompt ? 'Prompt override' : 'Prompt preview'}</label>
              <button type="button"
                onClick={() => ui.set(ui.editingPrompt ? { editingPrompt: false, promptOverride: '' } : { editingPrompt: true, promptOverride: previewData?.prompt ?? '' })}
                className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent">
                {ui.editingPrompt ? 'Use assembled prompt' : 'Edit prompt'}
              </button>
            </div>
            {ui.editingPrompt ? (
              <textarea id="tg-prompt" aria-label="Prompt override" value={ui.promptOverride}
                onChange={(e) => ui.set({ promptOverride: e.target.value })}
                className={`${inputClass} min-h-36 resize-y font-mono text-[12.5px] leading-normal`} />
            ) : (
              <div id="tg-prompt" className="min-h-36 whitespace-pre-wrap rounded-md border border-divider bg-bg px-2.5 py-2 font-mono text-[12.5px] leading-normal text-ink/75">
                {previewData?.prompt ?? (ui.factionId && ui.cardTypeId ? 'Loading…' : 'Select a faction and card type')}
              </div>
            )}
          </div>
        </>
      )}

      {genError && <p role="alert" className="m-0 text-sm text-danger">{genError}</p>}

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!canGenerate} onClick={onGenerate}>
          {pending || starting ? 'Generating…' : 'Generate'}
        </Button>
        <span className="text-xs text-ink/45">
          {pending ? 'can take up to ~2 minutes' : `${ui.mode === 'draft' ? 'Draft' : 'Final'} quality · same size both modes`}
        </span>
      </div>
    </div>
  )
}
