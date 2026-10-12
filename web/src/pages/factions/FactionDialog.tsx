import { useActionState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { DiffPanel } from '../../components/DiffPanel'
import { Field, inputClass } from '../../components/Field'
import { isDraftDirty } from '../../lib/draftForm'
import { createFaction, updateFaction, type FactionSave } from './api'
import { DLC_VALUES, type DLC } from './dlc'
import { useFactionDraft, useFactionsUi } from './store'

// Suggestions only; any text is allowed.
const TEXTURE_SUGGESTIONS = ['metal', 'ceramite armor', 'skin', 'chitin', 'bone', 'wood', 'stone', 'cloth', 'leather', 'crystal']

export function FactionDialog({ generateSlot, assistSlot }: { generateSlot?: ReactNode; assistSlot?: ReactNode }) {
  const ui = useFactionsUi()
  const draftState = useFactionDraft()
  const dirty = isDraftDirty(draftState)
  const queryClient = useQueryClient()
  const { draft, persisted } = draftState

  const [saveResult, saveAction, saving] = useActionState(
    async (): Promise<{ error: string | null }> => {
      const d = useFactionDraft.getState().draft
      const { lastGenerated, dialogMode, editingId } = useFactionsUi.getState()
      if (!d || !d.name.trim()) return { error: 'Name is required' }
      const save: FactionSave = {
        name: d.name.trim(),
        primary_color: d.primary_color.trim(),
        texture: d.texture.trim(),
        description: d.description,
        dlc: d.dlc as DLC,
        source: lastGenerated !== null && d.description === lastGenerated ? 'claude' : 'manual',
      }
      try {
        if (dialogMode === 'edit' && editingId !== null) await updateFaction(editingId, save)
        else await createFaction(save)
        queryClient.invalidateQueries({ queryKey: ['factions'] })
        useFactionsUi.getState().closeDialog()
        return { error: null }
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Save failed' }
      }
    },
    { error: null },
  )

  if (ui.dialogMode === null || !draft) return null

  const requestClose = () => {
    if (dirty) ui.set({ discardConfirmOpen: true })
    else ui.closeDialog()
  }

  const simpleRows = []
  if (ui.dialogMode === 'edit' && persisted) {
    if (draft.name !== persisted.name) simpleRows.push({ field: 'name', before: persisted.name, after: draft.name })
    if (draft.dlc !== persisted.dlc) simpleRows.push({ field: 'dlc', before: persisted.dlc, after: draft.dlc })
    if (draft.primary_color !== persisted.primary_color) simpleRows.push({ field: 'primary color', before: persisted.primary_color, after: draft.primary_color })
    if (draft.texture !== persisted.texture) simpleRows.push({ field: 'texture', before: persisted.texture, after: draft.texture })
  }

  return (
    <>
      <Dialog
        title={ui.dialogMode === 'edit' ? 'Edit Faction' : 'New Faction'}
        // Outside click closes only when there's nothing to lose.
        onBackdropClick={() => { if (!dirty && !ui.assistOpen) ui.closeDialog() }}
        titleExtra={dirty ? (
          <span className="whitespace-nowrap rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-[11px] text-warn">Unsaved changes</span>
        ) : undefined}
      >
        <Field label="Name">
          {(id) => (
            <input id={id} type="text" value={draft.name} placeholder="e.g. Tau Empire"
              onChange={(e) => draftState.setField('name', e.target.value)} className={inputClass} />
          )}
        </Field>

        <div>
          <span className="mb-1 block text-xs text-ink/70">DLC</span>
          <div className="inline-flex overflow-hidden rounded-md border border-divider" role="group" aria-label="DLC">
            {DLC_VALUES.map((v, i) => (
              <button key={v} type="button" onClick={() => draftState.setField('dlc', v)}
                className={`px-3 py-1.5 text-[13px] cursor-pointer bg-transparent border-0 ${i > 0 ? 'border-l border-divider' : ''} ${draft.dlc === v ? 'text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-ink'}`}>
                {v}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5">
          <Field label="Primary color">
            {(id) => (
              <input id={id} type="text" value={draft.primary_color} placeholder="e.g. deep crimson with gold trim"
                onChange={(e) => draftState.setField('primary_color', e.target.value)} className={`${inputClass} font-sans`} />
            )}
          </Field>
          <Field label="Texture">
            {(id) => (
              <>
                <input id={id} type="text" list="faction-texture-suggestions" value={draft.texture}
                  placeholder="e.g. metal, skin, wood"
                  onChange={(e) => draftState.setField('texture', e.target.value)} className={`${inputClass} font-sans`} />
                <datalist id="faction-texture-suggestions">
                  {TEXTURE_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
                </datalist>
              </>
            )}
          </Field>
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="faction-description" className="text-xs text-ink/70">Description (rest of the style)</label>
            {generateSlot}
          </div>
          <textarea id="faction-description" aria-label="Description" value={draft.description}
            placeholder="Secondary colors, iconography, mood, motifs…"
            onChange={(e) => draftState.setField('description', e.target.value)}
            className={`${inputClass} min-h-28 resize-y font-sans`} />
          <p className="mt-1 text-[11px] text-ink/45">Nothing is persisted until you click Save — including generated text.</p>
        </div>

        {assistSlot}

        {ui.showDiff && dirty && persisted && (
          <DiffPanel simpleRows={simpleRows}
            textDiffs={[{ field: 'description', before: persisted.description, after: draft.description }]} />
        )}

        {saveResult.error && <p role="alert" className="m-0 text-sm text-danger">{saveResult.error}</p>}

        <div className="mt-1.5 flex items-center justify-between gap-2">
          <div>
            {dirty && (
              <button type="button" onClick={() => ui.set({ showDiff: !ui.showDiff })}
                className="cursor-pointer border-0 bg-transparent px-1 py-1.5 text-[13px] font-medium text-accent">
                {ui.showDiff ? 'Hide diff' : 'Show diff'}
              </button>
            )}
          </div>
          <form action={saveAction} className="flex gap-2">
            {dirty && <Button type="button" onClick={() => draftState.discard()}>Discard</Button>}
            <Button type="button" onClick={requestClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!draft.name.trim() || saving}>
              {saving ? 'Saving…' : 'Save Faction'}
            </Button>
          </form>
        </div>
      </Dialog>

      {ui.discardConfirmOpen && (
        <ConfirmDialog title="Discard unsaved changes?"
          body="You have unsaved changes to this faction. Closing now will discard them."
          confirmLabel="Discard" cancelLabel="Keep editing"
          onConfirm={() => { ui.set({ discardConfirmOpen: false }); ui.closeDialog() }}
          onCancel={() => ui.set({ discardConfirmOpen: false })} />
      )}
    </>
  )
}
