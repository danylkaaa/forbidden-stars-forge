import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useFactions } from '../factions/api'
import { useCardTypes } from '../card-types/api'
import { previewBatch, submitBatch, type BatchPreview } from './api'
import { useBatchWizard } from './store'
import { ScopeStep } from './ScopeStep'
import { PreviewStep } from './PreviewStep'

export default function NewBatchPage() {
  const wizard = useBatchWizard()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: factions, error: factionsError } = useFactions()
  const { data: cardTypes, error: cardTypesError } = useCardTypes()
  const [preview, setPreview] = useState<BatchPreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function goToPreview() {
    setError(null)
    setPreviewing(true)
    try {
      const p = await previewBatch({ faction_ids: wizard.factionIds, card_type_ids: wizard.cardTypeIds, mode: wizard.mode, ...(wizard.model ? { model: wizard.model } : {}) })
      setPreview(p)
      wizard.set({ step: 'preview' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to build preview')
    } finally {
      setPreviewing(false)
    }
  }

  async function submit() {
    setError(null)
    setSubmitting(true)
    try {
      const batch = await submitBatch({ faction_ids: wizard.factionIds, card_type_ids: wizard.cardTypeIds, mode: wizard.mode, ...(wizard.model ? { model: wizard.model } : {}) })
      queryClient.invalidateQueries({ queryKey: ['batches'] })
      wizard.reset()
      navigate(`/batches/${batch.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to submit batch')
    } finally {
      setSubmitting(false)
    }
  }

  if (factionsError || cardTypesError) {
    const err = factionsError ?? cardTypesError
    return (
      <div className="max-w-3xl">
        <p role="alert" className="m-0 text-sm text-danger">
          Failed to load {factionsError ? 'factions' : 'card types'}: {err instanceof Error ? err.message : 'unknown'}
        </p>
      </div>
    )
  }
  if (!factions || !cardTypes) {
    return <div className="max-w-3xl"><p className="text-ink/60">Loading…</p></div>
  }

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">New Batch</h1>
      <p className="m-0 mb-5 text-sm text-ink/60">
        {wizard.step === 'scope' ? 'Choose factions, card types, and a mode' : 'Review the request file before it goes to OpenAI'}
      </p>

      {error && <p role="alert" className="m-0 mb-3.5 text-sm text-danger">{error}</p>}

      {wizard.step === 'scope' ? (
        <ScopeStep factions={factions} cardTypes={cardTypes} onNext={goToPreview} loading={previewing} />
      ) : (
        preview && (
          <PreviewStep preview={preview} mode={wizard.mode} submitting={submitting}
            onBack={() => wizard.set({ step: 'scope' })} onSubmit={submit} />
        )
      )}
    </div>
  )
}
