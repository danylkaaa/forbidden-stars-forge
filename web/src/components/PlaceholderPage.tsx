export function PlaceholderPage({ title, milestone }: { title: string; milestone: number }) {
  return (
    <div className="max-w-2xl">
      <h1 className="text-[32px] font-medium tracking-tight leading-tight mb-1.5">{title}</h1>
      <div className="mt-4 p-4 rounded-md bg-surface text-sm text-ink/60">
        Coming in Milestone {milestone}.
      </div>
    </div>
  )
}
