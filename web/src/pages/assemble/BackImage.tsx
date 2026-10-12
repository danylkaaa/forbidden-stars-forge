export function BackImage({ url, logoUrl, scale = 0.5, alt = '' }: { url: string; logoUrl?: string; scale?: number; alt?: string }) {
  return <div className="relative aspect-[816/1104] w-full overflow-hidden">
    <img draggable={false} src={url} alt={alt} className="block h-full w-full object-cover" />
    {logoUrl && <img draggable={false} src={logoUrl} alt="Card back logo" className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain"
      style={{ width: `${scale * 100}%`, height: `${scale * 100}%` }} />}
  </div>
}
