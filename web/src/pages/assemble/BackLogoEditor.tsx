import { Link } from 'react-router'
import { Field } from '../../components/Field'

// The logo on a back is always the faction's own (uploaded on the Factions
// page); only its size is set here, per card type. The page saves it.
export function BackLogoEditor({ scale, logoUrl, onScale }: { scale: number; logoUrl?: string; onScale: (scale: number) => void }) {
  if (!logoUrl) return <p className="m-0 text-sm text-ink/60">This faction has no logo. <Link to="/factions?mode=library" className="text-accent underline">Upload it on the Factions page</Link>; it then appears on every back.</p>
  return <section aria-label="Card back logo" className="max-w-md">
    <Field label={`Logo size (${Math.round(scale * 100)}%)`}>{id => <input id={id} type="range" min="5" max="100" step="1" value={Math.round(scale * 100)}
      className="w-full" onChange={e => onScale(Number(e.target.value) / 100)} />}</Field>
  </section>
}
