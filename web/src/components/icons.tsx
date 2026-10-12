type IconProps = { className?: string }

export function FactionsIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M4 2V16M4 3H14V10L9 8L4 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 4.5L9.6 5.7L11 6L9.6 6.3L9 7.5L8.4 6.3L7 6L8.4 5.7Z" fill="currentColor" />
      <path d="M2.5 16H5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function CardTypesIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="2" y="3" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10" width="14" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function TestGenIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <path
        d="M9 2L11 7L16 9L11 11L9 16L7 11L2 9L7 7Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function BatchIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="2" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="2" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
      <rect x="10" y="10" width="6" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

export function RetryIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M15 9a6 6 0 1 1-1.76-4.24" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 2.5V5.5H12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function EditIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M11.5 3.5l3 3L6 15H3v-3l8.5-8.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

export function GalleryIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <rect x="2" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M2.5 13l4-4 3 3 2-2 4 4" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="12" cy="6.5" r="1.2" fill="currentColor" />
    </svg>
  )
}

export function LabIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className}>
      <path d="M7 2.5h4M7.5 2.5v5L3.5 14a1 1 0 0 0 .9 1.5h9.2a1 1 0 0 0 .9-1.5l-4-6.5v-5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M5.2 11h7.6" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

// Cog Mechanicum: a toothed cog, half machine and half skull, for the
// sidebar crest.
export function CogMechanicumIcon({ className }: IconProps) {
  const teeth = Array.from({ length: 12 }, (_, i) => i * 30)
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g fill="currentColor">
        {teeth.map((deg) => (
          <rect key={deg} x="28.5" y="2" width="7" height="10" rx="1" transform={`rotate(${deg} 32 32)`} />
        ))}
        <circle cx="32" cy="32" r="22" />
      </g>
      {/* skull face cut out of the cog */}
      <g fill="var(--color-bg)">
        <path d="M32 15 C22 15 17 22 17 30 C17 36 20 39 23 41 L23 47 L41 47 L41 41 C44 39 47 36 47 30 C47 22 42 15 32 15 Z" />
      </g>
      <g fill="currentColor">
        {/* left: organic eye; right: augmetic lens */}
        <ellipse cx="25.5" cy="30" rx="4.5" ry="4" />
        <rect x="35" y="25.5" width="9" height="9" rx="1.5" />
        <path d="M32 34 L29.5 39 L34.5 39 Z" />
        <rect x="26" y="42" width="2" height="5" />
        <rect x="31" y="42" width="2" height="5" />
        <rect x="36" y="42" width="2" height="5" />
        <rect x="31.25" y="15" width="1.5" height="32" opacity="0.55" />
      </g>
      <circle cx="39.5" cy="30" r="2.2" fill="var(--color-phosphor)" />
    </svg>
  )
}
