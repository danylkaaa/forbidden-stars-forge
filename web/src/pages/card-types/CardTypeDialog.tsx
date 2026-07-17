import { useActionState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog } from '../../components/Dialog'
import { DiffPanel } from '../../components/DiffPanel'
import { Field, inputClass } from '../../components/Field'
import { isDraftDirty } from '../../lib/draftForm'
import { buildCardTypeForm, createCardType, updateCardType, type CardType } from './api'
import { OpenAIFilePanel } from './OpenAIFilePanel'
import { TemplateDropzone } from './TemplateDropzone'
import { useCardTypeDraft, useCardTypesUi } from './store'

export function CardTypeDialog({ cardTypes }: { cardTypes: CardType[] }) {
  const ui = useCardTypesUi()
  const draftState = useCardTypeDraft()
  const queryClient = useQueryClient()
  const { draft, persisted } = draftState
  const persistedCt = cardTypes.find((c) => c.id === ui.editingId) ?? null
  const dirty = isDraftDirty(draftState) || ui.stagedFile !== null

  const [saveResult, saveAction, saving] = useActionState(
    async (): Promise<{ error: string | null }> => {
      const d = useCardTypeDraft.getState().draft
      const { dialogMode, editingId, stagedFile } = useCardTypesUi.getState()
      if (!d || !d.name.trim()) return { error: 'Name is required' }
      const form = buildCardTypeForm(
        { name: d.name.trim(), description: d.description, constraints: d.constraints },
        stagedFile,
      )
      try {
        if (dialogMode === 'edit' && editingId !== null) await updateCardType(editingId, form)
        else await createCardType(form)
        queryClient.invalidateQueries({ queryKey: ['card-types'] })
        useCardTypesUi.getState().closeDialog()
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

  const discardAll = () => {
    draftState.discard()
    ui.set({ stagedFile: null, stagedMeta: null })
  }

  const textField = (key: 'description' | 'constraints', label: string, placeholder: string) => (
    <Field label={label}>
      {(id) => (
        <textarea id={id} value={draft[key]} placeholder={placeholder}
          onChange={(e) => draftState.setField(key, e.target.value)}
          className={`${inputClass} min-h-16 resize-y font-sans`} />
      )}
    </Field>
  )

  return (
    <>
      <Dialog
        title={ui.dialogMode === 'edit' ? 'Edit Card Type' : 'New Card Type'}
        width="min(560px,100%)"
        titleExtra={dirty ? (
          <span className="whitespace-nowrap rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-[11px] text-warn">Unsaved changes</span>
        ) : undefined}
      >
        <Field label="Name">
          {(id) => (
            <input id={id} type="text" value={draft.name} placeholder="e.g. combat"
              onChange={(e) => draftState.setField('name', e.target.value)} className={inputClass} />
          )}
        </Field>
        {textField('description', 'Description', 'What this card type is, overall aesthetic…')}
        {textField('constraints', 'Constraints', 'Zones, chromakey color, do-not-touch areas…')}

        {ui.showDiff && dirty && persisted && (
          <DiffPanel simpleRows={[]}
            textDiffs={[
              { field: 'name', before: persisted.name, after: draft.name },
              { field: 'description', before: persisted.description, after: draft.description },
              { field: 'constraints', before: persisted.constraints, after: draft.constraints },
            ]} />
        )}

        <TemplateDropzone persisted={persistedCt} />
        <OpenAIFilePanel persisted={persistedCt} />

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
            {dirty && <Button type="button" onClick={discardAll}>Discard</Button>}
            <Button type="button" onClick={requestClose}>Cancel</Button>
            <Button variant="primary" type="submit" disabled={!draft.name.trim() || saving}>
              {saving ? 'Saving…' : 'Save Card Type'}
            </Button>
          </form>
        </div>
      </Dialog>

      {ui.discardConfirmOpen && (
        <ConfirmDialog title="Discard unsaved changes?"
          body="You have unsaved changes to this card type. Closing now will discard them."
          confirmLabel="Discard" cancelLabel="Keep editing"
          onConfirm={() => { ui.set({ discardConfirmOpen: false }); ui.closeDialog() }}
          onCancel={() => ui.set({ discardConfirmOpen: false })} />
      )}
    </>
  )
}
