import { useEffect } from 'react'
import { useSettings } from './api'
import { useSettingsStore, selectIsDirty } from './store'
import { OpenAISection } from './OpenAISection'
import { ClaudeSection } from './ClaudeSection'
import { SaveBar } from './SaveBar'
import { DebugSection } from './DebugSection'

export default function SettingsPage() {
  const { data, isLoading, error } = useSettings()
  const init = useSettingsStore((s) => s.init)
  const dirty = useSettingsStore(selectIsDirty)

  useEffect(() => {
    if (data) init(data)
  }, [data, init])

  if (isLoading) return <p className="text-ink/60">Loading…</p>
  if (error || !data)
    return (
      <p role="alert" className="text-danger">
        Failed to load settings: {error instanceof Error ? error.message : 'unknown error'}
      </p>
    )

  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4 mb-1.5">
        <div>
          <h1 className="text-[32px] font-medium tracking-tight leading-tight mb-1.5">Settings</h1>
          <p className="text-sm text-ink/60 m-0">
            Stored locally · never leaves this machine except the calls below
          </p>
        </div>
        {dirty && (
          <span className="text-[11px] text-warn bg-warn/10 border border-warn/30 px-2.5 py-0.5 rounded-full whitespace-nowrap">
            Unsaved changes
          </span>
        )}
      </div>
      <OpenAISection settings={data} />
      <ClaudeSection />
      <SaveBar settings={data} />
      <DebugSection />
    </div>
  )
}
