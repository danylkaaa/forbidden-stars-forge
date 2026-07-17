import { Button } from '../../components/Button'
import { Tag } from '../../components/Tag'
import { templateUrl, type CardType } from './api'

export function CardTypeCard({ ct, onEdit, onDelete }: { ct: CardType; onEdit: () => void; onDelete: () => void }) {
  const url = templateUrl(ct)
  return (
    <div className="flex flex-col gap-3 rounded-md bg-surface p-3 shadow-[0_0_0_1px_var(--color-neutral-800)]">
      {url ? (
        <img src={url} alt={`${ct.name} template`} className="h-24 w-full rounded object-cover" />
      ) : (
        <div className="flex h-24 items-center justify-center rounded border-[1.5px] border-dashed border-ink/25">
          <span className="font-mono text-[10px] tracking-wide text-ink/55">NO TEMPLATE UPLOADED</span>
        </div>
      )}
      <div>
        <div className="mb-0.5 text-[17px] font-medium leading-tight">{ct.name}</div>
        <p className="m-0 text-[13px] text-ink/70">{ct.description}</p>
      </div>
      <div className="text-[11px]">
        {ct.openai_file_id ? (
          <Tag variant="solid-accent">{ct.openai_file_id}</Tag>
        ) : (
          <Tag variant="neutral">not uploaded</Tag>
        )}
      </div>
      <div className="mt-auto flex gap-1.5 border-t border-ink/10 pt-2">
        <Button className="flex-1" onClick={onEdit}>Edit</Button>
        <Button onClick={onDelete}>Delete</Button>
      </div>
    </div>
  )
}
