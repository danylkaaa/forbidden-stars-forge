import { useActionState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Dialog } from '../../components/Dialog'
import { DiffPanel } from '../../components/DiffPanel'
import { ClaudeTextAssist } from '../../components/ClaudeTextAssist'
import { Field, inputClass } from '../../components/Field'
import { ImageSizeField } from '../../components/ImageSizeField'
import { isDraftDirty } from '../../lib/draftForm'
import { sizeError } from '../../lib/imageSize'
import { buildCardTypeForm, isBuiltinCardType, createCardType, templateUrl, startCardTypeAssist, updateCardType, type CardType } from './api'
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
      const sizeProblem = sizeError(d.image_size ?? '')
      if (sizeProblem) return { error: `AI image size: ${sizeProblem}` }
      const form = buildCardTypeForm(
        { name: d.name.trim(), description: d.description, constraints: d.constraints, image_size: d.image_size ?? '' },
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
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label htmlFor={`ct-${key}`} className="text-xs text-ink/70">{label}</label>
        <button type="button" disabled={ui.assistField !== null} onClick={() => ui.set({ assistField: key })}
          aria-label={`Edit ${key} with Claude`}
          className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent disabled:cursor-not-allowed disabled:opacity-45">
          {draft[key].trim() ? 'Edit with Claude' : 'Generate with Claude'}
        </button>
      </div>
      <textarea id={`ct-${key}`} value={draft[key]} placeholder={placeholder}
        onChange={(e) => draftState.setField(key, e.target.value)}
        className={`${inputClass} min-h-16 resize-y font-sans`} />
      {ui.assistField === key && (
        <div className="mt-2">
          <ClaudeTextAssist
            field={key}
            current={draft[key]}
            start={(baseline, messages) => {
              const d = useCardTypeDraft.getState().draft
              return startCardTypeAssist({
                field: key,
                name: d?.name ?? '',
                // The edited field is the pinned baseline; the other is live.
                description: key === 'description' ? baseline : d?.description ?? '',
                constraints: key === 'constraints' ? baseline : d?.constraints ?? '',
                messages,
              })
            }}
            onAccept={(text) => {
              useCardTypeDraft.getState().setField(key, text)
              useCardTypesUi.getState().set({ assistField: null })
            }}
            onClose={() => useCardTypesUi.getState().set({ assistField: null })}
          />
        </div>
      )}
    </div>
  )

  return (
    <>
      <Dialog
        title={ui.dialogMode === 'edit' ? 'Edit Image Type' : 'New Image Type'}
        // Outside click closes, after a confirmation when there are unsaved changes.
        onBackdropClick={requestClose}
        width="min(560px,100%)"
        titleExtra={dirty ? (
          <span className="whitespace-nowrap rounded-full border border-warn/30 bg-warn/10 px-2.5 py-0.5 text-[11px] text-warn">Unsaved changes</span>
        ) : undefined}
      >
        <Field label="Name">
          {(id) => (
            <input id={id} type="text" value={draft.name} placeholder="e.g. combat"
              disabled={!!persistedCt && isBuiltinCardType(persistedCt.name)} title={persistedCt && isBuiltinCardType(persistedCt.name) ? 'Built-in card types cannot be renamed' : undefined}
              onChange={(e) => draftState.setField('name', e.target.value)} className={inputClass} />
          )}
        </Field>
        {textField('description', 'Description', 'What this image is, overall aesthetic…')}
        {textField('constraints', 'Constraints', 'Zones, chromakey color, do-not-touch areas…')}
        <div>
          <div className="mb-1 text-xs text-ink/70">AI image size</div>
          <ImageSizeField value={draft.image_size ?? ''} onChange={(size) => draftState.setField('image_size', size)}
            previewSrc={ui.stagedMeta?.url ?? (persistedCt ? templateUrl(persistedCt) : null)} />
          <p className="m-0 mt-1 text-[11px] text-ink/45">Empty follows the template image.</p>
        </div>

        {ui.showDiff && dirty && persisted && (
          <DiffPanel simpleRows={[]}
            textDiffs={[
              { field: 'name', before: persisted.name, after: draft.name },
              { field: 'description', before: persisted.description, after: draft.description },
              { field: 'constraints', before: persisted.constraints, after: draft.constraints },
              { field: 'image size', before: persisted.image_size, after: draft.image_size },
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
            <Button variant="primary" type="submit" disabled={!draft.name.trim() || saving || sizeError(draft.image_size ?? '') !== null}>
              {saving ? 'Saving…' : 'Save Image Type'}
            </Button>
          </form>
        </div>
      </Dialog>

      {ui.discardConfirmOpen && (
        <ConfirmDialog title="Discard unsaved changes?"
          body="You have unsaved changes to this image type. Closing now will discard them."
          confirmLabel="Discard" cancelLabel="Keep editing"
          onConfirm={() => { ui.set({ discardConfirmOpen: false }); ui.closeDialog() }}
          onCancel={() => ui.set({ discardConfirmOpen: false })} />
      )}
    </>
  )
}
