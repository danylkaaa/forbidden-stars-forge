import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog } from '../../components/Dialog'
import { Button } from '../../components/Button'
import { inputClass } from '../../components/Field'
import type { Faction } from '../factions/api'
import { FIELDS, LABELS } from './model'
import { parseImport, type ValidationIssue } from './validation'
import { exampleImport, readUTF8 } from './import'
import { ImportError, importCards } from './api'

export function ImportCardsDialog({ factions, onClose, onImported, onDirty }: { factions: Faction[]; onClose: () => void; onImported: (count: number) => void; onDirty: (dirty: boolean) => void }) {
  const [source, setSource] = useState('')
  const [filename, setFilename] = useState('')
  const [error, setError] = useState('')
  const [serverErrors, setServerErrors] = useState<ValidationIssue[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const readVersion = useRef(0)
  useEffect(() => () => { readVersion.current++ }, [])
  useEffect(() => { onDirty(Boolean(source || filename || reading)) }, [source, filename, reading, onDirty])
  const parsed = useMemo(() => source ? parseImport(source, factions.map(f => f.id)) : { cards: [], errors: [] }, [source, factions])
  const example = JSON.stringify(exampleImport(factions[0]?.id ?? 1), null, 2)
  const change = (value: string) => { setSource(value); setError(''); setServerErrors([]) }
  async function upload(file: File) {
    const version = ++readVersion.current
    setReading(true); setFilename(file.name); change('')
    try { const text = await readUTF8(file); if (version === readVersion.current) change(text) }
    catch (e) { if (version === readVersion.current) setError(e instanceof Error ? e.message : 'File read failed') }
    finally { if (version === readVersion.current) setReading(false) }
  }
  async function submit() {
    if (saving || reading || parsed.errors.length || !parsed.cards.length) return
    setSaving(true); setError(''); setServerErrors([])
    try { const result = await importCards(parsed.cards); onImported(result.count) }
    catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed')
      if (e instanceof ImportError) setServerErrors(e.issues)
    } finally { setSaving(false) }
  }
  return <Dialog title="Import Cards" width="min(760px,100%)" onBackdropClick={() => { if (!saving && !reading) onClose() }}>
    <p className="m-0 text-sm text-ink/70">Choose a UTF-8 JSON file. Review the cards before clicking Import. Every import creates new cards, including repeated uploads.</p>
    <details className="rounded border border-divider p-3 text-sm">
      <summary className="cursor-pointer">JSON format and validation rules</summary>
      <p>Use an object with a non-empty <code>cards</code> array. Every card needs an existing <code>faction_id</code>, a non-empty <code>name</code>, and a <code>category</code>.</p>
      <p>Integers must be between 0 and 9007199254740991; combat level is 0–3. All text fields are required strings; empty text is allowed. Unknown fields, fields from another category, nulls, and numeric strings are rejected.</p>
      {Object.entries(FIELDS).map(([category, fields]) => <p key={category}><strong>{category}:</strong> {fields.map(f => `${f.key}${f.options ? ` (${f.options.join(', ')})` : ''}`).join('; ')}.</p>)}
      <p>Available factions: {factions.map(f => `${f.name} (ID ${f.id})`).join(', ') || 'None — create a faction first.'}</p>
      <a className="text-accent" download="cards-example.json" href={`data:application/json;charset=utf-8,${encodeURIComponent(example)}`}>Download example JSON</a>
      <pre className="max-h-52 overflow-auto text-xs">{example}</pre>
    </details>
    <label className="text-sm">JSON file<input aria-label="JSON file" type="file" accept=".json,application/json" disabled={saving || reading} className={`${inputClass} mt-1`} onChange={e => {
      const file = e.target.files?.[0]; if (file) void upload(file)
      e.target.value = ''
    }} /></label>
    {filename && <p className="m-0 text-xs text-ink/60">{reading ? 'Reading…' : filename}</p>}
    <label className="text-sm">JSON content<textarea aria-label="JSON content" className={`${inputClass} mt-1 min-h-32 font-mono text-xs`} disabled={saving || reading} value={source} onChange={e => change(e.target.value)} /></label>
    {(parsed.errors.length > 0 || serverErrors.length > 0) && <div role="alert" className="text-sm text-danger">{[...parsed.errors, ...serverErrors].map((e, i) => <p key={i} className="m-0">{e.index !== undefined ? `Card ${e.index + 1}, ` : ''}{e.field}: {e.message}</p>)}</div>}
    {error && <p role="alert" className="m-0 text-sm text-danger">{error}</p>}
    {parsed.cards.length > 0 && <section aria-label="Import preview" className="rounded border border-divider p-3">
      <h3 className="m-0 text-sm">Preview: {parsed.cards.length} cards</h3>
      <div className="max-h-48 overflow-auto">{parsed.cards.map((c, i) => <p key={i} className="my-1 text-sm">{i + 1}. {c.name} · {factions.find(f => f.id === c.faction_id)?.name} · {LABELS[c.category]}</p>)}</div>
      <p className="mb-0 text-xs text-ink/60">All cards are saved together. A validation failure saves none.</p>
    </section>}
    <div className="flex justify-end gap-2">
      <Button type="button" disabled={saving || reading} onClick={onClose}>Cancel</Button>
      <Button type="button" variant="primary" disabled={saving || reading || !parsed.cards.length || parsed.errors.length > 0 || !factions.length} onClick={() => void submit()}>{saving ? 'Importing…' : 'Import'}</Button>
    </div>
  </Dialog>
}
