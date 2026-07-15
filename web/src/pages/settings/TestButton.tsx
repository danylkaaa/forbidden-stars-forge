import { useState } from 'react'
import { Button } from '../../components/Button'
import type { TestResult } from './api'

export function TestButton({ label, run }: { label: string; run: () => Promise<TestResult> }) {
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  async function onClick() {
    setBusy(true)
    setResult(null)
    try {
      setResult(await run())
    } catch (e) {
      setResult({ ok: false, message: e instanceof Error ? e.message : 'Request failed' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" disabled={busy} onClick={onClick}>
        {busy ? 'Testing…' : label}
      </Button>
      {result && (
        <span className={`text-[13px] ${result.ok ? 'text-success' : 'text-danger'}`}>
          {result.message}
        </span>
      )}
    </div>
  )
}
