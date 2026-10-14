import { Link } from 'react-router'
import { Button } from '../../components/Button'
import { ZoomableImage } from '../../components/ImageLightbox'
import { generationsLink } from '../generations/api'
import { isBuiltinCardType, templateUrl, type CardType } from './api'

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s
}

// Small thumbnail; click opens the full-size popup.
function Thumb({ src, alt }: { src: string; alt: string }) {
  return (
    <ZoomableImage src={src} alt={alt} className="block flex-none">
      <img src={src} alt={alt} loading="lazy" title={alt}
        className="block h-12 w-9 rounded border border-divider bg-[repeating-conic-gradient(var(--color-accent-700)_0%_25%,var(--color-accent-900)_0%_50%)] bg-[length:8px_8px] object-contain" />
    </ZoomableImage>
  )
}

export function CardTypesTable({
  cardTypes, onEdit, onDelete,
}: { cardTypes: CardType[]; onEdit: (ct: CardType) => void; onDelete: (ct: CardType) => void }) {
  return (
    <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60">
            <th className="px-4 py-3.5 font-medium">Name</th>
            <th className="px-4 py-3.5 font-medium">Images</th>
            <th className="px-4 py-3.5 font-medium">Description</th>
            <th className="px-4 py-3.5 font-medium">Constraints</th>
            <th className="px-4 py-3.5 font-medium">Updated</th>
            <th className="px-4 py-3.5" />
          </tr>
        </thead>
        <tbody>
          {cardTypes.map((ct) => {
            const template = templateUrl(ct)
            return (
              <tr key={ct.id} className="border-t border-ink/8 align-top hover:bg-ink/4">
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  <Link to={generationsLink({ cardTypeIds: [ct.id] })} title="Show this card type's assets"
                    className="text-ink no-underline hover:text-accent hover:underline">{ct.name}</Link>
                  {isBuiltinCardType(ct.name) && <span className="ml-2 text-[10px] uppercase tracking-wider text-ink/40">built-in</span>}
                </td>
                <td className="px-4 py-3">
                  {template ? (
                    <span className="flex gap-1.5">
                      {template && <Thumb src={template} alt={`${ct.name} template`} />}
                    </span>
                  ) : <span className="text-ink/35">—</span>}
                </td>
                <td className="px-4 py-3 text-[13px] text-ink/70">{truncate(ct.description, 220) || <span className="text-ink/35">—</span>}</td>
                <td className="px-4 py-3 text-[13px] text-ink/70">{truncate(ct.constraints, 160) || <span className="text-ink/35">—</span>}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[13px] text-ink/50">{ct.updated_at}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right">
                  <span className="inline-flex gap-1.5">
                    <Button onClick={() => onEdit(ct)}>Edit</Button>
                    {!isBuiltinCardType(ct.name) && <Button onClick={() => onDelete(ct)}>Delete</Button>}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
