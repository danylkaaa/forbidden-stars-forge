import { useEffect, useState } from 'react'

// The natural size of the image at `url`, once it has loaded (null before, or without a url).
export function useImageSize(url: string | null | undefined) {
  const [size, setSize] = useState<{ url: string; width: number; height: number } | null>(null)
  useEffect(() => {
    if (!url) return
    let cancelled = false
    const img = new Image()
    img.onload = () => { if (!cancelled) setSize({ url, width: img.naturalWidth, height: img.naturalHeight }) }
    img.src = url
    return () => { cancelled = true }
  }, [url])
  return size && size.url === url ? size : null
}
