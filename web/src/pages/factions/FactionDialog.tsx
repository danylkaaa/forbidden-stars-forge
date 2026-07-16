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

export function FactionDialog({ generateSlot }: { generateSlot?: ReactNode }) {
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
  }

  return (
    <>
      <Dialog
        title={ui.dialogMode === 'edit' ? 'Edit Faction' : 'New Faction'}
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

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="faction-description" className="text-xs text-ink/70">Description</label>
            {generateSlot}
          </div>
          <textarea id="faction-description" aria-label="Description" value={draft.description}
            placeholder="Color palette, materials, iconography, mood…"
            onChange={(e) => draftState.setField('description', e.target.value)}
            className={`${inputClass} min-h-28 resize-y font-sans`} />
          <p className="mt-1 text-[11px] text-ink/45">Nothing is persisted until you click Save — including generated text.</p>
        </div>

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
