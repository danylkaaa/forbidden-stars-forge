// Mechanicus plates: display type, beveled edge. Primary = Mars-red robe
// with brass trim; secondary = gunmetal with brass on hover. Shared by
// <Button> and button-looking links.
export function buttonClass(variant: 'primary' | 'secondary' = 'secondary'): string {
  const base =
    'inline-flex items-center justify-center gap-1.5 cursor-pointer font-display font-semibold uppercase tracking-[0.08em] text-[12.5px] px-3.5 py-2 rounded-md border no-underline transition-colors disabled:opacity-45 disabled:cursor-not-allowed shadow-[inset_0_1px_0_rgba(255,220,180,0.1),0_1px_2px_rgba(0,0,0,0.6)]'
  const look =
    variant === 'primary'
      ? 'text-accent-100 border-accent bg-gradient-to-b from-mars to-mars-700 enabled:hover:from-[#c22d22] enabled:hover:text-white'
      : 'text-ink border-divider bg-gradient-to-b from-neutral-800/70 to-neutral-900/70 hover:border-accent/60 hover:text-accent-100'
  return `${base} ${look}`
}
