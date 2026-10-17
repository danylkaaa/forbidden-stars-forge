import { SearchableSelect } from '../../components/SearchableSelect'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ClaudeTextAssist } from '../../components/ClaudeTextAssist'
import { Field, inputClass, selectClass } from '../../components/Field'
import { UseForFactionButton } from './UseForFactionButton'
import { SuggestInput } from '../../components/SuggestInput'
import { ElementPlacement } from './ElementPlacement'
import { maskedImageUrl, useImageMasks } from '../../lib/imageMasks'
import { EditImageButton, HideAreasButton, ZoomableImage } from '../../components/ImageLightbox'
import { ModelOverrideSelect } from '../../components/ModelOverrideSelect'
import { LayerControls, LayeredImage, OverlayToggle } from '../../components/PreviewLayers'
import { GeneratingSpinner } from '../../components/GeneratingSpinner'
import { FavoriteButton } from '../../components/FavoriteButton'
import { EditOf } from '../../components/EditOf'
import { parentImageUrl } from '../../lib/imageEdits'
import { CardPicker, QuickCardPreview } from '../assemble/QuickCardPreview'
import { GenerationPreview3D } from '../assemble/GenerationPreview3D'
import { BackFlatPreview } from '../assemble/BackLogoPreview'
import { Tag } from '../../components/Tag'
import { buildCardTypeForm, previewLayers, startCardTypeAssist, updateCardType, useCardTypes, type CardType } from '../card-types/api'
import { useFactionColors } from '../assemble/api'
import { startGenerateDescription, updateFaction, useFactions, type Faction } from '../factions/api'
import { useElapsedMs } from '../../lib/useElapsedMs'
import { formatCost, formatDuration, useGenerations, usePreview, useStartGeneration, type Generation } from '../test-generation/api'
import { usePreviewLayers } from '../../lib/previewLayers'
import { useAssembledPrompt } from './api'
import { joinPrompt, splitPrompt } from './promptSections'
import { FrontImagePicker, type FrontImageOption } from './FrontImagePicker'
import { sameCt, sameFields, useFactionLab, type CtFields, type LabFields } from './store'

// The prompt parts that come from an editable field: the tab it is on and the field.
const PART_FIELDS: Record<string, { tab: 'faction' | 'card-type'; field: string }> = {
  Description: { tab: 'card-type', field: 'ct-description' },
  Constraints: { tab: 'card-type', field: 'ct-constraints' },
  'Primary color': { tab: 'faction', field: 'primary_color' },
  Texture: { tab: 'faction', field: 'texture' },
  'Faction style': { tab: 'faction', field: 'description' },
}
const TEXTURE_SUGGESTIONS = ['metal', 'ceramite armor', 'skin', 'chitin', 'bone', 'wood', 'stone', 'cloth', 'leather', 'crystal']

const savedFields = (f: Faction): LabFields => ({ primary_color: f.primary_color, texture: f.texture, description: f.description })
const savedCt = (c: CardType): CtFields => ({ description: c.description, constraints: c.constraints })

// Debounce typing so the prompt is re-assembled once the user pauses.
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

// Quick experiments with one faction's aesthetic: edit the fields, see the
// assembled prompt, generate — and only save to the faction once a result
// looks right. Three full-height columns (fields | prompt | result) so
// nothing needs page scrolling; long content scrolls inside its column.
export default function FactionLabPage() {
  const [params] = useSearchParams()
  const lab = useFactionLab()
  const { data: factions } = useFactions()
  const { data: colors } = useFactionColors()
  const { data: cardTypes } = useCardTypes()
  const { data: gens, isPending: gensLoading, error: gensError } = useGenerations()
  const [frontKey, setFrontKey] = useState('')
  const queryClient = useQueryClient()
  const start = useStartGeneration()
  const [assistOpen, setAssistOpen] = useState(false)
  const [ctAssist, setCtAssist] = useState<keyof CtFields | null>(null)
  const [tab, setTab] = useState<'faction' | 'card-type'>('faction')
  const [busy, setBusy] = useState<'generate' | 'save' | 'save-ct' | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  // ?faction=<id> (from the Factions page) picks the faction; the Assemble
  // library also passes ?card_type=<id>&generation=<id> to open its template.
  const paramFaction = Number(params.get('faction'))
  const paramCardType = Number(params.get('card_type'))
  const paramGeneration = Number(params.get('generation'))
  useEffect(() => {
    if (paramFaction > 0) useFactionLab.getState().set({ factionId: paramFaction })
    if (paramCardType > 0) useFactionLab.getState().set({ cardTypeId: paramCardType })
    if (paramGeneration > 0) setSelectedId(paramGeneration)
  }, [paramFaction, paramCardType, paramGeneration])

  const faction = factions?.find((f) => f.id === lab.factionId) ?? null
  const cardType = cardTypes?.find((c) => c.id === lab.cardTypeId) ?? null
  const isBack = cardType?.name.endsWith(' back') ?? false
  // The card back serves combat and event cards; other backs pair with the type of the same name.
  const frontNames = !isBack ? [] : cardType!.name === 'card back' ? ['combat', 'events'] : [cardType!.name.slice(0, -5)]
  const frontTypes = cardTypes?.filter((c) => frontNames.includes(c.name)) ?? []
  const isFrontType = (id: number) => frontTypes.some((t) => t.id === id)
  const frontOptions: FrontImageOption[] = [
    ...(gens ?? []).filter((g) => g.status === 'done' && g.faction_id === faction?.id && isFrontType(g.card_type_id)).map((g) => ({
      key: `generation-${g.id}`, name: g.name || `Generation #${g.id}`, url: `/api/generations/${g.id}/image`,
      libraryKey: `test-${g.id}`, source: 'Lab' as const,
      ref: { kind: 'generation' as const, id: g.id },
    })),
  ]
  const frontImage = isBack ? frontOptions.find((image) => image.key === frontKey) : undefined
  useEffect(() => { setFrontKey('') }, [lab.factionId, lab.cardTypeId])
  // Memoized so object identity is stable across renders (debounce/query keys).
  const saved = useMemo(() => (faction ? savedFields(faction) : null), [faction])
  const fields = faction ? lab.drafts[faction.id] ?? saved : null
  const dirty = saved !== null && fields !== null && !sameFields(saved, fields)
  const ctSaved = useMemo(() => (cardType ? savedCt(cardType) : null), [cardType])
  const ctFields = cardType ? lab.ctDrafts[cardType.id] ?? ctSaved : null
  const ctDirty = ctSaved !== null && ctFields !== null && !sameCt(ctSaved, ctFields)

  const inputs = useMemo(() => ({ fields, ct: ctFields }), [fields, ctFields])
  const debounced = useDebounced(inputs, 300)
  const assembled = useAssembledPrompt(lab.cardTypeId, faction?.name ?? '', debounced.fields, debounced.ct, !!frontImage)
  const { data: preview } = usePreview(lab.factionId, lab.cardTypeId, lab.model)
  // Parts of the prompt switched off; they are neither shown nor sent.
  const [off, setOff] = useState<ReadonlySet<string>>(new Set())
  // Clicking a part of the prompt opens the tab with the field it is built from and focuses that field.
  const [focusField, setFocusField] = useState<string | null>(null)
  useEffect(() => {
    if (!focusField) return
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[data-field="${focusField}"]`)
    if (!el) return
    el.focus()
    el.setSelectionRange?.(el.value.length, el.value.length)
    el.scrollIntoView?.({ block: 'nearest' })
    setFocusField(null)
  }, [focusField, tab])
  const parts = useMemo(() => splitPrompt(assembled.data?.prompt ?? ''), [assembled.data?.prompt])
  const sentPrompt = joinPrompt(parts, off)
  // Parts built from fields whose text differs from what is saved: "custom", the rest is as the backend wrote it.
  const edited: Record<string, boolean> = {
    'Primary color': !!saved && !!fields && saved.primary_color !== fields.primary_color,
    Texture: !!saved && !!fields && saved.texture !== fields.texture,
    'Faction style': !!saved && !!fields && saved.description !== fields.description,
    Description: !!ctSaved && !!ctFields && ctSaved.description !== ctFields.description,
    Constraints: !!ctSaved && !!ctFields && ctSaved.constraints !== ctFields.constraints,
  }
  const promptReady = assembled.data !== undefined && !assembled.isFetching &&
    debounced.fields !== null && fields !== null && sameFields(debounced.fields, fields) &&
    (debounced.ct === null) === (ctFields === null) && (!ctFields || sameCt(debounced.ct!, ctFields))
  const estimate = preview ? (lab.mode === 'draft' ? preview.est_draft_usd : preview.est_final_usd) : null
  const expectedSeconds = (mode: string) => (mode === 'draft' ? preview?.est_draft_seconds : preview?.est_final_seconds) || 0
  const expectedMs = expectedSeconds(lab.mode) * 1000

  const openPart = (key: string) => {
    const target = PART_FIELDS[key]
    if (!target) return
    setTab(target.tab)
    setFocusField(target.field)
  }
  const setField = (key: keyof LabFields, value: string) => {
    if (faction && fields) lab.setDraft(faction.id, { ...fields, [key]: value })
  }
  const setCtField = (key: keyof CtFields, value: string) => {
    if (cardType && ctFields) lab.setCtDraft(cardType.id, { ...ctFields, [key]: value })
  }

  async function onGenerate() {
    if (!faction || !cardType || !fields || !ctFields || !assembled.data) return
    setBusy('generate')
    setError(null)
    try {
      const g = await start({
        faction_id: faction.id, card_type_id: cardType.id, mode: lab.mode,
        prompt_override: sentPrompt, ...(lab.model ? { model: lab.model } : {}),
        ...(frontImage ? { front_image: frontImage.ref } : {}),
      })
      lab.snapshot(g.id, fields, ctFields)
      setSelectedId(g.id) // show the new run on the right
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to start generation')
    } finally {
      setBusy(null)
    }
  }

  async function onSave() {
    if (!faction || !fields) return
    setBusy('save')
    setError(null)
    try {
      await updateFaction(faction.id, {
        name: faction.name, dlc: faction.dlc, source: 'manual',
        primary_color: fields.primary_color.trim(), texture: fields.texture.trim(), description: fields.description,
      })
      await queryClient.invalidateQueries({ queryKey: ['factions'] })
      lab.clearDraft(faction.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setBusy(null)
    }
  }

  async function onSaveCt() {
    if (!cardType || !ctFields) return
    setBusy('save-ct')
    setError(null)
    try {
      await updateCardType(cardType.id, buildCardTypeForm(
        { name: cardType.name, description: ctFields.description, constraints: ctFields.constraints }, null))
      await queryClient.invalidateQueries({ queryKey: ['card-types'] })
      lab.clearCtDraft(cardType.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'save failed')
    } finally {
      setBusy(null)
    }
  }

  // Which of the run's inputs (faction fields + card type text) it matches.
  const runLabel = (id: number): string | null => {
    const f = lab.snapshots[id]
    if (!f) return null
    const c = lab.ctSnapshots[id] // absent on runs made before card type editing
    const matches = (fv: LabFields | null, cv: CtFields | null) => fv !== null && sameFields(f, fv) && (!c || (cv !== null && sameCt(c, cv)))
    if (matches(saved, ctSaved)) return 'saved fields'
    if (matches(fields, ctFields)) return 'current fields'
    return 'lab experiment'
  }
  const applyRunFields = (id: number) => {
    if (faction && lab.snapshots[id]) lab.setDraft(faction.id, lab.snapshots[id])
    if (cardType && lab.ctSnapshots[id]) lab.setCtDraft(cardType.id, lab.ctSnapshots[id])
  }

  const results = (gens ?? []).filter((g) => g.faction_id === lab.factionId && g.card_type_id === lab.cardTypeId)
  const current = results.find((g) => g.id === selectedId) ?? results[0] ?? null
  // Failed runs show their error in the result when they are the newest or selected, but are not kept in the history.
  const history = results.filter((g) => g.status !== 'failed')

  const panel = 'flex min-h-0 flex-col gap-3 rounded-md bg-surface p-4 shadow-[0_0_0_1px_var(--color-neutral-800)]'

  return (
    <div className="flex h-full min-h-[600px] flex-col gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="m-0 text-[28px] font-medium leading-tight tracking-tight">AI Lab</h1>
        <p className="m-0 text-[13px] text-ink/55">Nothing is saved until you click Save to faction</p>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(300px,0.85fr)] gap-4">
        {/* Left: what to try */}
        <section className={`${panel} overflow-y-auto`}>
          <div className="grid grid-cols-2 gap-2.5">
            <Field label="Faction">
              {(id) => (
                <SearchableSelect id={id} className={selectClass} value={lab.factionId ?? ''}
                  onChange={(e) => { lab.set({ factionId: e.target.value ? Number(e.target.value) : null }); setAssistOpen(false); setSelectedId(null) }}>
                  <option value="">Select…</option>
                  {factions?.map((f) => <option key={f.id} value={f.id} data-color={colors?.find(c => c.faction_id === f.id)?.color}>{f.name}{lab.drafts[f.id] && !sameFields(lab.drafts[f.id], savedFields(f)) ? ' •' : ''}</option>)}
                </SearchableSelect>
              )}
            </Field>
            <Field label="Image Type">
              {(id) => (
                <SearchableSelect id={id} className={selectClass} value={lab.cardTypeId ?? ''}
                  onChange={(e) => { lab.set({ cardTypeId: e.target.value ? Number(e.target.value) : null }); setSelectedId(null) }}>
                  <option value="">Select…</option>
                  {cardTypes?.filter((c) => c.name !== 'upgrade').map((c) => <option key={c.id} value={c.id}>{c.openai_file_id || c.no_template ? c.name : `${c.name} (no file)`}</option>)}
                </SearchableSelect>
              )}
            </Field>
            <div>
              <span className="mb-1 block text-xs text-ink/70">Mode</span>
              <div className="flex overflow-hidden rounded-md border border-divider" role="group" aria-label="Mode">
                {(['draft', 'final'] as const).map((m, i) => (
                  <button key={m} type="button" onClick={() => lab.set({ mode: m })}
                    className={`flex-1 cursor-pointer border-0 bg-transparent px-2 py-1.5 text-[13px] ${i > 0 ? 'border-l border-divider' : ''} ${lab.mode === m ? 'text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-ink'}`}>
                    {m === 'draft' ? 'Draft' : 'Final'}
                  </button>
                ))}
              </div>
            </div>
            <ModelOverrideSelect value={lab.model} onChange={(model) => lab.set({ model })} />
          </div>

          {isBack && (
            <FrontImagePicker key={`${lab.factionId}-${lab.cardTypeId}`} options={frontOptions} selectedKey={frontImage?.key ?? ''}
              onSelect={setFrontKey} factionId={lab.factionId} frontTypeName={frontNames.join(' or ')}
              loading={gensLoading} error={!!gensError} />
          )}

          <div role="tablist" aria-label="What to edit" className="flex gap-1 border-b border-ink/10">
            {([['faction', 'Faction', dirty], ['card-type', 'Image type', ctDirty]] as const).map(([key, label, isDirty]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                className={`-mb-px cursor-pointer border-0 border-b-2 bg-transparent px-3 py-1.5 text-[13px] font-medium ${tab === key ? 'border-accent text-accent' : 'border-transparent text-ink/60 hover:text-ink'}`}>
                {label}{isDirty && <span className="ml-1 text-warn" aria-label="unsaved">•</span>}
              </button>
            ))}
          </div>

          {tab === 'card-type' ? (
            !cardType || !ctFields ? (
              <p className="m-0 text-sm text-ink/50">Pick an image type to edit its prompt text.</p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="m-0 truncate text-[15px] font-medium">{cardType.name}</h2>
                  {ctDirty && (
                    <span className="whitespace-nowrap rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-[11px] text-warn">Unsaved experiment</span>
                  )}
                </div>
                <p className="-mt-1 m-0 text-[11px] text-ink/45">Shared by every faction — saving changes all of this image type&apos;s prompts.</p>
                {(['description', 'constraints'] as const).map((key) => (
                  <div key={key} className={`flex flex-col ${key === 'constraints' ? 'min-h-48 flex-1' : 'min-h-28'}`}>
                    <div className="mb-1 flex items-center justify-between">
                      <label htmlFor={`lab-ct-${key}`} className="text-xs text-ink/70">{key === 'description' ? 'Image type description' : 'Constraints'}</label>
                      <button type="button" disabled={ctAssist !== null} onClick={() => setCtAssist(key)}
                        aria-label={`Edit ${key} with Claude`}
                        className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-45">
                        Edit with Claude
                      </button>
                    </div>
                    <textarea id={`lab-ct-${key}`} data-field={`ct-${key}`} value={ctFields[key]}
                      onChange={(e) => setCtField(key, e.target.value)}
                      className={`${inputClass} min-h-20 flex-1 resize-none font-sans text-[13px] leading-relaxed`} />
                    {ctAssist === key && (
                      <div className="mt-2">
                        <ClaudeTextAssist
                          field={key}
                          current={ctFields[key]}
                          start={(baseline, messages) => startCardTypeAssist({
                            field: key, name: cardType.name, messages,
                            description: key === 'description' ? baseline : ctFields.description,
                            constraints: key === 'constraints' ? baseline : ctFields.constraints,
                          })}
                          onAccept={(text) => { setCtField(key, text); setCtAssist(null) }}
                          onClose={() => setCtAssist(null)}
                        />
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex items-center justify-end gap-2">
                  {ctDirty && <Button type="button" onClick={() => lab.clearCtDraft(cardType.id)}>Reset to saved</Button>}
                  <Button variant="primary" type="button" disabled={!ctDirty || busy !== null} onClick={onSaveCt}>
                    {busy === 'save-ct' ? 'Saving…' : 'Save to image type'}
                  </Button>
                </div>
              </>
            )
          ) : !faction || !fields ? (
            <p className="m-0 text-sm text-ink/50">Pick a faction to start experimenting.</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <h2 className="m-0 truncate text-[15px] font-medium">{faction.name}</h2>
                {dirty && (
                  <span className="whitespace-nowrap rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-[11px] text-warn">Unsaved experiment</span>
                )}
              </div>
              <Field label="Primary color">
                {(id) => (
                  <input id={id} data-field="primary_color" type="text" value={fields.primary_color} placeholder="e.g. deep crimson with gold trim"
                    onChange={(e) => setField('primary_color', e.target.value)} className={`${inputClass} font-sans`} />
                )}
              </Field>
              <Field label="Texture">
                {(id) => (
                  <SuggestInput id={id} data-field="texture" suggestions={TEXTURE_SUGGESTIONS} value={fields.texture} placeholder="e.g. metal, skin, wood"
                    onValueChange={(v) => setField('texture', v)} className={`${inputClass} font-sans`} />
                )}
              </Field>
              <div className="flex min-h-40 flex-1 flex-col">
                <div className="mb-1 flex items-center justify-between">
                  <label htmlFor="lab-description" className="text-xs text-ink/70">Description (rest of the style)</label>
                  <button type="button" disabled={assistOpen} onClick={() => setAssistOpen(true)}
                    className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-45">
                    Edit with Claude
                  </button>
                </div>
                <textarea id="lab-description" data-field="description" value={fields.description}
                  onChange={(e) => setField('description', e.target.value)}
                  className={`${inputClass} min-h-32 flex-1 resize-none font-sans text-[13px] leading-relaxed`} />
              </div>
              {assistOpen && (
                <ClaudeTextAssist
                  field="description"
                  current={fields.description}
                  start={(baseline, messages) => startGenerateDescription(faction.name, faction.dlc, {
                    primary_color: fields.primary_color, texture: fields.texture, current_description: baseline, messages,
                  })}
                  onAccept={(text) => { setField('description', text); setAssistOpen(false) }}
                  onClose={() => setAssistOpen(false)}
                />
              )}
              <div className="flex items-center justify-end gap-2">
                {dirty && <Button type="button" onClick={() => lab.clearDraft(faction.id)}>Reset to saved</Button>}
                <Button variant="primary" type="button" disabled={!dirty || busy !== null} onClick={onSave}>
                  {busy === 'save' ? 'Saving…' : 'Save to faction'}
                </Button>
              </div>
            </>
          )}
        </section>

        {/* Middle: exactly what will be sent */}
        <section className={panel}>
          <div className="flex items-center justify-between">
            <h2 className="m-0 text-[15px] font-medium">Assembled prompt</h2>
            {!promptReady && lab.cardTypeId !== null && fields && <span className="text-[11px] text-ink/45">updating…</span>}
          </div>
          {parts.length > 0 && (
            <fieldset aria-label="Prompt parts to send" className="m-0 flex flex-wrap gap-x-3 gap-y-1 border-0 p-0">
              {parts.map((part) => (
                <label key={part.key} className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink/80">
                  <input type="checkbox" checked={!off.has(part.key)} className="accent-[var(--color-accent)]"
                    onChange={(e) => setOff((cur) => { const next = new Set(cur); if (e.target.checked) next.delete(part.key); else next.add(part.key); return next })} />
                  {part.label}
                </label>
              ))}
            </fieldset>
          )}
          <div aria-label="Assembled prompt"
            className={`flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto rounded-md border border-divider bg-bg p-1.5 font-mono text-[12px] leading-normal text-ink/75 ${promptReady ? '' : 'opacity-60'}`}>
            {!fields || lab.cardTypeId === null || !assembled.data
              ? <p className="m-0 px-1 py-0.5">{!fields ? 'Pick a faction' : lab.cardTypeId === null ? 'Select an image type' : 'Loading…'}</p>
              : parts.filter((part) => !off.has(part.key)).map((part) => (
                <div key={part.key} className={`flex gap-2 rounded border ${edited[part.key] ? 'border-accent/60' : 'border-divider'} ${PART_FIELDS[part.key] ? 'cursor-pointer hover:border-accent' : ''}`}
                  {...(PART_FIELDS[part.key] ? {
                    role: 'button', tabIndex: 0, 'aria-label': `Edit ${part.label}`, title: `Edit ${part.label.toLowerCase()}`,
                    onClick: () => { if (!window.getSelection()?.toString()) openPart(part.key) },
                    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPart(part.key) } },
                  } : {})}>
                  <span aria-hidden="true" title={edited[part.key] ? 'Text you changed in the fields' : 'Sent as the backend assembled it'}
                    className={`flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-l px-1 py-1 text-[10px] font-medium uppercase tracking-wider [text-orientation:mixed] [writing-mode:vertical-rl] rotate-180 ${edited[part.key] ? 'bg-accent/25 text-accent' : 'bg-neutral-800 text-ink/50'}`}>
                    {part.label}{edited[part.key] ? ' · custom, edited' : ''}
                  </span>
                  <pre className="m-0 min-w-0 flex-1 whitespace-pre-wrap py-1.5 pr-2 font-[inherit]">{part.text}</pre>
                </div>
              ))}
          </div>
          {cardType && !cardType.openai_file_id && !cardType.no_template && (
            <p className="m-0 text-[13px] text-warn">This image type has no OpenAI file uploaded yet.</p>
          )}
          {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
          <div className="flex items-center gap-3">
            <Button variant="primary" type="button" onClick={onGenerate}
              disabled={!promptReady || !sentPrompt.trim() || !(cardType?.openai_file_id || cardType?.no_template) || busy !== null}>
              {busy === 'generate' ? 'Starting…' : 'Generate'}
            </Button>
            <span className="text-xs text-ink/45">
              {estimate !== null && `est. ${formatCost(estimate)} · `}{expectedMs > 0 && `usually ~${formatDuration(expectedMs)} · `}uses the fields as they are now
            </span>
          </div>
        </section>

        {/* Right: the result */}
        <section className={panel}>
          <h2 className="m-0 text-[15px] font-medium">Result</h2>
          {!faction || !cardType ? (
            <p className="m-0 text-sm text-ink/50">Pick a faction and image type.</p>
          ) : !current ? (
            <p className="m-0 text-sm text-ink/50">No generations for this pair yet — click Generate.</p>
          ) : (
            <ResultView
              key={`${current.id}-${cardType.id}`}
              gen={current}
              cardType={cardType}
              expectedMs={expectedSeconds(current.mode) * 1000}
              cardTypeName={cardType.name}
              alt={`${faction.name} × ${cardType.name} #${current.id}`}
              {...previewLayers(cardType)}
              label={runLabel(current.id)}
              onUseFields={runLabel(current.id) && runLabel(current.id) !== 'current fields' ? () => applyRunFields(current.id) : undefined}
              onEdited={(g) => setSelectedId(g.id)}
            />
          )}
          {(history.length > 1 || (history.length > 0 && current?.status === 'failed')) && cardType && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wider text-ink/45">All runs ({history.length})</div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {history.map((g) => (
                  <button key={g.id} type="button" onClick={() => setSelectedId(g.id)}
                    aria-label={`Show run #${g.id}`} aria-pressed={g.id === current?.id}
                    className={`h-20 w-15 flex-none cursor-pointer overflow-hidden rounded border-2 bg-neutral-800 p-0 ${g.id === current?.id ? 'border-accent' : 'border-transparent'}`}>
                    {g.status === 'done' ? (
                      <img src={`/api/generations/${g.id}/image`} alt="" loading="lazy" className="block h-full w-full object-cover" />
                    ) : (
                      <span className="grid h-full w-full place-items-center bg-accent-900/60"><GeneratingSpinner seed={g.id} size="sm" /></span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// The selected run, as large as the column allows.
function ResultView({ gen, cardType, expectedMs, cardTypeName, alt, maskSrc, label, onUseFields, onEdited }: {
  gen: Generation; cardType: CardType; expectedMs: number; cardTypeName: string; alt: string; maskSrc: string | null; label: string | null
  onUseFields?: () => void; onEdited: (g: Generation) => void
}) {
  const pending = gen.status === 'pending'
  const elapsed = useElapsedMs(gen.created_at, pending)
  const imageUrl = gen.status === 'done' ? `/api/generations/${gen.id}/image` : null
  // Cards are made from the image with its hiding mask applied.
  const masks = useImageMasks()
  const cardImageUrl = imageUrl ? maskedImageUrl(imageUrl, gen.id, masks.data) : null
  // Quick check of the image as a finished card, with an existing card's
  // text and artwork (or the demo card).
  // The card type's overlay on the plain image: the finished card for a combat front, the banner for a back.
  const overlayOn = usePreviewLayers((l) => l.overlay)
  const [previewCardId, setPreviewCardId] = useState(0)
  const combatSide = cardTypeName === 'combat' ? 'front' : cardTypeName === 'card back' ? 'back' : undefined
  const backCategory = cardTypeName === 'card back' ? 'combat' : undefined
  // Event fronts are checked as the finished event card, like combat fronts.
  const cardCategory = cardTypeName === 'events' ? 'schema' as const : combatSide === 'front' ? 'combat' as const : undefined
  const asCard = !!cardCategory && overlayOn
  // Elements are checked where they are used: on the event card, or on the card back banner.
  const elementKind = cardTypeName === 'event element' ? 'event' as const : cardTypeName === 'back element' ? 'banner' as const : undefined
  const placing = !!elementKind && overlayOn && !!imageUrl
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {imageUrl && <div className="flex flex-wrap items-center gap-2">
        {(cardCategory || backCategory || elementKind) && <OverlayToggle />}
        <EditImageButton src={imageUrl} alt={alt} target={{ kind: 'generation', id: gen.id }} compareSrc={parentImageUrl(gen)} onEdited={onEdited} maskSrc={maskSrc} cardPreviewFactionId={cardCategory ? gen.faction_id : undefined} cardPreviewCategory={cardCategory} />
        <HideAreasButton src={imageUrl} alt={alt} target={{ kind: 'generation', id: gen.id }} maskSrc={maskSrc} cardPreviewFactionId={cardCategory ? gen.faction_id : undefined} cardPreviewCategory={cardCategory} />
        {cardType && <UseForFactionButton factionId={gen.faction_id} cardType={cardType} generationId={gen.id} />}
        {asCard && <CardPicker factionId={gen.faction_id} cardId={previewCardId} onCardChange={setPreviewCardId} category={cardCategory} />}
        {combatSide && cardImageUrl && <GenerationPreview3D imageUrl={cardImageUrl} factionId={gen.faction_id} side={combatSide} title={alt} />}
        {!asCard && <LayerControls maskSrc={maskSrc} />}
      </div>}
      {placing && elementKind ? <ElementPlacement key={gen.id} kind={elementKind} factionId={gen.faction_id} generationId={gen.id} /> : cardImageUrl && asCard ? <QuickCardPreview picker={false} imageUrl={cardImageUrl} factionId={gen.faction_id} cardId={previewCardId} onCardChange={setPreviewCardId} category={cardCategory} /> :
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {imageUrl ? (
          <ZoomableImage src={imageUrl} alt={alt} maskSrc={maskSrc} cardPreviewFactionId={cardCategory ? gen.faction_id : undefined} cardPreviewCategory={cardCategory} combatPreviewSide={combatSide} previewFactionId={gen.faction_id} backPreviewCategory={backCategory} downloadName={gen.name} favorite={{ target: { kind: 'generation', id: gen.id }, value: gen.favorite }}
            editTarget={{ kind: 'generation', id: gen.id }} compareSrc={parentImageUrl(gen)} onEdited={onEdited} className="block h-full w-full">
            {backCategory ? <BackFlatPreview inline category={backCategory} factionId={gen.faction_id} src={imageUrl} alt={alt} maskSrc={maskSrc} /> : <LayeredImage src={imageUrl} alt={alt} maskSrc={maskSrc} fit="contain" />}
          </ZoomableImage>
        ) : (
          <div className={`flex aspect-[3/4] h-full max-h-full max-w-full flex-col items-center justify-center gap-2 rounded p-3 text-center text-sm ${pending ? 'bg-accent-900/60 text-accent' : 'bg-neutral-800 text-danger'}`}>
            {pending ? (
              <>
                <GeneratingSpinner seed={gen.id} />
                <span className="mt-2">generating…</span>
                <span className="text-xs text-ink/50">{formatDuration(elapsed)} elapsed{expectedMs > 0 && (elapsed > expectedMs * 1.5 ? ` · taking longer than the usual ~${formatDuration(expectedMs)}` : ` · usually ~${formatDuration(expectedMs)}`)}</span>
              </>
            ) : gen.error || 'failed'}
          </div>
        )}
      </div>}
      <div className="flex items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink/80" title={gen.name}>
          {gen.name}{gen.parent_name && <EditOf gen={gen} />}
        </span>
        <FavoriteButton target={{ kind: 'generation', id: gen.id }} favorite={gen.favorite} />
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ink/45">
        <Tag variant={gen.mode === 'final' ? 'solid-accent' : 'neutral'}>{gen.mode}</Tag>
        {label && <span className={label === 'saved fields' ? 'text-success' : label === 'current fields' ? 'text-accent' : ''}>{label}</span>}
        <span>{gen.created_at}{gen.status === 'done' && ` · ${formatDuration(gen.duration_ms)} · ${formatCost(gen.cost_usd)}`}</span>
        {onUseFields && (
          <button type="button" onClick={onUseFields}
            className="ml-auto cursor-pointer border-0 bg-transparent p-0 text-xs font-medium text-accent">
            Use these fields
          </button>
        )}
      </div>
    </div>
  )
}
