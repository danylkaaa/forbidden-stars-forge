import { Button } from '../../components/Button'
import { ModelOverrideSelect } from '../../components/ModelOverrideSelect'
import type { Faction } from '../factions/api'
import { DLC_VALUES } from '../factions/dlc'
import type { CardType } from '../card-types/api'
import { useBatchWizard } from './store'

export function ScopeStep({
  factions, cardTypes, onNext, loading,
}: { factions: Faction[]; cardTypes: CardType[]; onNext: () => void; loading: boolean }) {
  const wizard = useBatchWizard()
  const uploadedCardTypes = cardTypes.filter((c) => c.openai_file_id)
  const requestCount = wizard.factionIds.length * wizard.cardTypeIds.length
  const canProceed = requestCount > 0 && !loading

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-ink/70">Factions</span>
          <button type="button"
            onClick={() => wizard.setAllFactions(factions.map((f) => f.id), wizard.factionIds.length < factions.length)}
            className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent">
            {wizard.factionIds.length < factions.length ? 'Select all' : 'Deselect all'}
          </button>
        </div>
        <div className="flex flex-col gap-3 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-neutral-800)]">
          {DLC_VALUES.map((dlc) => {
            const group = factions.filter((f) => f.dlc === dlc)
            if (group.length === 0) return null
            const groupIds = group.map((f) => f.id)
            const allSelected = groupIds.every((id) => wizard.factionIds.includes(id))
            return (
              <div key={dlc}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide text-ink/45">{dlc}</span>
                  <button type="button" onClick={() => wizard.setAllFactions(groupIds, !allSelected)}
                    className="cursor-pointer border-0 bg-transparent text-[11px] font-medium text-accent">
                    {allSelected ? 'Deselect group' : 'Select group'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {group.map((f) => (
                    <label key={f.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-md border border-divider px-2.5 py-1.5 text-[13px] has-[:checked]:border-accent has-[:checked]:text-accent">
                      <input type="checkbox" checked={wizard.factionIds.includes(f.id)} onChange={() => wizard.toggleFaction(f.id)} />
                      {f.name}
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          {factions.length === 0 && <p className="m-0 text-sm text-ink/50">No factions yet.</p>}
        </div>
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-ink/70">Card Types</span>
          <button type="button"
            onClick={() => wizard.setAllCardTypes(uploadedCardTypes.map((c) => c.id), wizard.cardTypeIds.length < uploadedCardTypes.length)}
            className="cursor-pointer border-0 bg-transparent px-1 py-0.5 text-xs font-medium text-accent">
            {wizard.cardTypeIds.length < uploadedCardTypes.length ? 'Select all' : 'Deselect all'}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-neutral-800)]">
          {cardTypes.map((c) => {
            const disabled = !c.openai_file_id
            return (
              <label key={c.id}
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[13px] ${disabled ? 'cursor-not-allowed border-divider/50 text-ink/35' : 'cursor-pointer border-divider has-[:checked]:border-accent has-[:checked]:text-accent'}`}>
                <input type="checkbox" disabled={disabled} checked={wizard.cardTypeIds.includes(c.id)} onChange={() => wizard.toggleCardType(c.id)} />
                {c.name}{disabled && ' (no file uploaded)'}
              </label>
            )
          })}
          {cardTypes.length === 0 && <p className="m-0 text-sm text-ink/50">No card types yet.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 items-end gap-3.5">
      <div>
        <span className="mb-1 block text-xs text-ink/70">Mode</span>
        <div className="inline-flex overflow-hidden rounded-md border border-divider" role="group" aria-label="Mode">
          {(['draft', 'final'] as const).map((m, i) => (
            <button key={m} type="button" onClick={() => wizard.set({ mode: m })}
              className={`px-3.5 py-1.5 text-[13px] cursor-pointer bg-transparent border-0 ${i > 0 ? 'border-l border-divider' : ''} ${wizard.mode === m ? 'text-accent shadow-[inset_0_0_0_1px_var(--color-accent)]' : 'text-ink'}`}>
              {m === 'draft' ? 'Draft' : 'Final'}
            </button>
          ))}
        </div>
      </div>
      <ModelOverrideSelect value={wizard.model} onChange={(model) => wizard.set({ model })} />
      </div>

      <div className="flex items-center gap-3">
        <Button variant="primary" disabled={!canProceed} onClick={onNext}>
          {loading ? 'Building preview…' : 'Next: Preview'}
        </Button>
        <span className="text-xs text-ink/45">{requestCount} request{requestCount === 1 ? '' : 's'}</span>
      </div>
    </div>
  )
}
