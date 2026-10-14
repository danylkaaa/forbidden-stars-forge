import { Button } from '../../components/Button'
import { Dialog } from '../../components/Dialog'
import { Field, inputClass, selectClass } from '../../components/Field'
import { StepperInput } from '../../components/StepperInput'
import { CardRowPreview } from './CardRowPreview'
import type { ModelStyle, Orientation, SlotKey, UnitStats } from './model'
import type { FactionCardInput } from './render'
import { UnitModelEditor } from './UnitModelEditor'

const STAT_FIELDS = [['dice', 'Dice'], ['health', 'Health'], ['morale', 'Morale'], ['cost', 'Price'], ['forge', 'Forge']] as const

// The popup for a unit: its name and numbers, its model (upload, pose,
// colour-override PNG) and how it looks on the card. Opened from the unit's
// thumbnail or by clicking its icon on the card preview.
export function UnitModelDialog({ factionId, slot, label, unit, onUnitChange, style, stlUrl, iconUrl, orientation, color, cardInput, onChange, onClose }: {
  cardInput: FactionCardInput; factionId: number; slot: SlotKey; label: string; unit: UnitStats; onUnitChange: (patch: Partial<UnitStats>) => void; style: ModelStyle
  stlUrl?: string; iconUrl?: string; orientation: Partial<Orientation> | undefined; color: string
  onChange: (o: Orientation) => void; onClose: () => void
}) {
  return <Dialog title={`${label} model`} width="min(760px,100%)" onBackdropClick={onClose} titleExtra={<Button onClick={onClose}>Close</Button>}>
    <div className="space-y-2">
      <Field label="Name">{id => <input id={id} className={inputClass} value={unit.name} onChange={e => onUnitChange({ name: e.target.value })} />}</Field>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {STAT_FIELDS.map(([stat, name]) => <Field key={stat} label={name}>{id => <StepperInput id={id} label={name} value={unit[stat]} onChange={n => onUnitChange({ [stat]: n })} />}</Field>)}
        <Field label="Tech">{id => <select id={id} className={selectClass} value={unit.tech ?? ''} onChange={e => onUnitChange({ tech: e.target.value === '' ? null : Number(e.target.value) })}>
          <option value="">—</option>{[0, 1, 2, 3].map(n => <option key={n} value={n}>{n}</option>)}</select>}</Field>
      </div>
    </div>
    {slot === 'bastion'
      ? <p className="m-0 text-xs text-ink/55">The bastion always uses the shared structure icon (Library → Faction card → Shared icons).</p>
      : <UnitModelEditor factionId={factionId} slot={slot} label={label} stlUrl={stlUrl} iconUrl={iconUrl} orientation={orientation} color={color} style={style} onChange={onChange} />}
    <CardRowPreview input={cardInput} slot={slot} />
  </Dialog>
}

// City and factory: only their price is editable.
export function StructureDialog({ label, cost, onCost, onClose }: { label: string; cost: number; onCost: (n: number) => void; onClose: () => void }) {
  return <Dialog title={label} width="min(420px,100%)" onBackdropClick={onClose} titleExtra={<Button onClick={onClose}>Close</Button>}>
    <div className="w-40"><Field label="Price">{id => <StepperInput id={id} label="Price" value={cost} onChange={onCost} />}</Field></div>
    <p className="m-0 text-xs text-ink/55">The icon is the shared {label.toLowerCase()} icon; its size and outline are set on the Card Types page.</p>
  </Dialog>
}
