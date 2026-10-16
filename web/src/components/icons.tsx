type IconProps = { className?: string }

// Heraldic shield with a chevron: a faction's banner.
export function FactionsIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M9 1.8L15 4V8.5C15 12.2 12.5 14.9 9 16.2C5.5 14.9 3 12.2 3 8.5V4L9 1.8Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5.8 7.5L9 10L12.2 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// A card template: title band, art window and text box.
export function CardTypesIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <rect x="3.5" y="1.5" width="11" height="15" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 4.5H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="6" y="7" width="6" height="3.5" rx=".5" fill="currentColor" opacity=".55" />
      <path d="M6 13H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

// A fanned hand of cards: the card library.
export function LibraryIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <rect x="2.2" y="4.2" width="7" height="10" rx="1.2" transform="rotate(-14 5.7 9.2)" stroke="currentColor" strokeWidth="1.3" opacity=".6" />
      <rect x="8.8" y="4.2" width="7" height="10" rx="1.2" transform="rotate(14 12.3 9.2)" stroke="currentColor" strokeWidth="1.3" opacity=".6" />
      <rect x="5.5" y="2.5" width="7" height="12" rx="1.2" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 5.5H10.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
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

// A magnifying glass.
export function MagnifierIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <circle cx="7.5" cy="7.5" r="4.8" stroke="currentColor" strokeWidth="1.6" />
      <path d="M11.2 11.2L15.5 15.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

// A square with a hidden corner: a layer mask.
export function MaskIcon({ className }: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="13" height="13" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 2.5h6.5V9L9 2.5z M2.5 9H9v6.5H2.5V9z" fill="currentColor" opacity="0.55" />
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

export function GearIcon({ className }: IconProps) {
  const teeth = Array.from({ length: 8 }, (_, i) => i * 45)
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      {teeth.map((deg) => <rect key={deg} x="8" y="1.5" width="2" height="3" rx=".5" fill="currentColor" transform={`rotate(${deg} 9 9)`} />)}
      <circle cx="9" cy="9" r="5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="9" cy="9" r="1.8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

// Stacked layers: a subtype's overlay stack.
export function LayersIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M9 2L16 5.8L9 9.6L2 5.8L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M2 9L9 12.8L16 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12.2L9 16L16 12.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity=".6" />
    </svg>
  )
}

// An isometric cube: open a 3D preview.
export function CubeIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M9 1.8L15.5 5.4V12.6L9 16.2L2.5 12.6V5.4L9 1.8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2.5 5.4L9 9L15.5 5.4M9 9V16.2" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}

// A printer: the print workspace.
export function PrintIcon({ className }: IconProps) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <path d="M5 6.5V2.5h8v4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <rect x="2" y="6.5" width="14" height="6" rx="1.3" stroke="currentColor" strokeWidth="1.4" />
      <rect x="5" y="10.5" width="8" height="5" rx=".6" fill="var(--color-bg)" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  )
}

export function BombIcon({ className }: IconProps) {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" className={className} aria-hidden="true">
      <circle cx="7.5" cy="11" r="5.2" fill="currentColor" fillOpacity="0.2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 6.6l2-2M13.2 2.6v1.6M15.6 4.8h-1.6M12.4 3.4l-.8-.8M15 6l.8.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M5 9.6a2.6 2.6 0 0 1 1.6-1.2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

// An image with an arrow pointing into it: a place to drop a picture.
export function DropImageIcon({ className }: IconProps) {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
      <rect x="3" y="4" width="22" height="20" rx="3" stroke="currentColor" strokeWidth="1.8" strokeDasharray="3 2.4" />
      <path d="M14 8v9m0 0l-3.6-3.6M14 17l3.6-3.6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 21h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

