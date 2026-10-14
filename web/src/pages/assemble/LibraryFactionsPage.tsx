import { Link } from 'react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../components/Button'
import { useCards } from '../cards/api'
import { useFactions } from '../factions/api'
import { DlcTag } from '../factions/DlcTag'
import { LIBRARY_TABS, libraryLink } from './model'
import { useSavedFactionCards } from '../faction-card/api'
import { deleteFactionLogo, uploadFactionLogo, useFactionLogos } from './logos'

function LogoCell({ factionId, name, url }: { factionId: number; name: string; url?: string }) {
  const queryClient = useQueryClient()
  const change = useMutation({
    mutationFn: (file: File | null) => file ? uploadFactionLogo(factionId, file) : deleteFactionLogo(factionId),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['faction-logos'] }),
  })
  return <div className="flex items-center gap-2">
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded border border-divider bg-black/40">
      {url ? <img src={url} alt={`${name} logo`} className="max-h-full max-w-full object-contain" /> : <span className="text-ink/30">—</span>}
    </span>
    <label className={`cursor-pointer text-xs text-accent hover:underline ${change.isPending ? 'pointer-events-none opacity-45' : ''}`}>
      {url ? 'Replace' : 'Upload'}
      <input type="file" accept="image/png,image/jpeg" className="sr-only" aria-label={`Upload logo for ${name}`} disabled={change.isPending}
        onChange={e => { const file = e.target.files?.[0]; if (file) change.mutate(file); e.target.value = '' }} />
    </label>
    {url && <Button className="px-2! py-1!" disabled={change.isPending} aria-label={`Remove logo for ${name}`} onClick={() => change.mutate(null)}>✕</Button>}
    {change.isError && <span role="alert" className="text-xs text-danger">{change.error.message}</span>}
  </div>
}

// Library-mode Factions: deck progress per faction. Prompt editing lives on
// the generation-mode Factions page.
export default function LibraryFactionsPage() {
  const factions = useFactions(), cards = useCards('', ''), logos = useFactionLogos(), savedCards = useSavedFactionCards()
  const count = (factionId: number, category: string) => cards.data?.filter(c => c.faction_id === factionId && c.category === category).length ?? 0
  const expectedTotal = LIBRARY_TABS.reduce((n, t) => n + t.expected, 0)
  const error = factions.error ?? cards.error
  return <div>
    <div className="mb-5">
      <h1 className="mb-1.5 text-[32px] font-medium leading-tight tracking-tight">Factions</h1>
      <p className="m-0 text-sm text-ink/60">Cards per faction and type. Each deck needs {LIBRARY_TABS.map(t => `${t.expected} ${t.label.toLowerCase()}`).join(', ')}.</p>
    </div>
    {(factions.isPending || cards.isPending) && <p className="text-ink/60">Loading…</p>}
    {error && <p role="alert" className="text-danger">Failed to load: {error.message}</p>}
    {factions.data && cards.data && <div className="overflow-hidden rounded-md bg-surface shadow-[0_0_0_1px_var(--color-neutral-800)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60">
            <th className="px-4 py-3.5 font-medium">Faction</th>
            <th className="px-4 py-3.5 font-medium">Logo <span className="normal-case tracking-normal text-ink/40">(starting cards)</span></th>
            <th className="px-4 py-3.5 font-medium">DLC</th>
            {LIBRARY_TABS.map(t => <th key={t.category} className="px-4 py-3.5 text-right font-medium">{t.label}</th>)}
            <th className="px-4 py-3.5 text-right font-medium">Faction card</th>
            <th className="px-4 py-3.5 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {factions.data.map(f => {
            const total = LIBRARY_TABS.reduce((n, t) => n + count(f.id, t.category), 0)
            return <tr key={f.id} className="border-t border-ink/8 hover:bg-ink/4">
              <td className="whitespace-nowrap px-4 py-3 font-medium">{f.name}</td>
              <td className="px-4 py-2"><LogoCell factionId={f.id} name={f.name} url={logos.data?.find(l => l.faction_id === f.id)?.url} /></td>
              <td className="whitespace-nowrap px-4 py-3 text-[11px]"><DlcTag dlc={f.dlc} /></td>
              {LIBRARY_TABS.map(t => {
                const n = count(f.id, t.category)
                const tone = n === t.expected ? 'text-success' : n > t.expected ? 'text-danger' : n ? 'text-warn' : 'text-ink/45'
                return <td key={t.category} className="whitespace-nowrap px-4 py-3 text-right font-mono">
                  <Link to={libraryLink(f.id, t.category)} aria-label={`${f.name} ${t.label}: ${n} of ${t.expected}`} className={`${tone} no-underline hover:underline`}>
                    {n}<span className="text-ink/40"> / {t.expected}</span>
                  </Link>
                </td>
              })}
              <td className="whitespace-nowrap px-4 py-3 text-right font-mono">
                {(() => { const n = savedCards.data?.includes(f.id) ? 1 : 0
                  return <Link to={`/assemble/faction-card?faction=${f.id}`} aria-label={`${f.name} faction card: ${n} of 1`} className={`${n ? 'text-success' : 'text-ink/45'} no-underline hover:underline`}>{n}<span className="text-ink/40"> / 1</span></Link> })()}
              </td>
              <td className={`whitespace-nowrap px-4 py-3 text-right font-mono ${total === expectedTotal ? 'text-success' : 'text-ink/70'}`}>{total}<span className="text-ink/40"> / {expectedTotal}</span></td>
            </tr>
          })}
        </tbody>
      </table>
    </div>}
  </div>
}
