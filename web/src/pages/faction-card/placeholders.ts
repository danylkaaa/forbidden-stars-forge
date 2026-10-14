// Plain stand-ins for the icons the user supplies later (structures,
// resources, forge key, tech badge). Each is drawn inside the box.
export type Box = { x: number; y: number; w: number; h: number }

function gear(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string) {
  const teeth = 10
  ctx.beginPath()
  for (let i = 0; i < teeth * 2; i++) {
    const a = i * Math.PI / teeth, rr = i % 2 ? r * 0.78 : r
    ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill()
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.38, 0, Math.PI * 2); ctx.globalCompositeOperation = 'destination-out'; ctx.fill(); ctx.globalCompositeOperation = 'source-over'
}

export function drawPlaceholder(ctx: CanvasRenderingContext2D, key: string, b: Box) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, r = Math.min(b.w, b.h) / 2
  ctx.save()
  switch (key) {
    case 'gear': gear(ctx, cx, cy, r, '#3fbf3f'); break
    case 'forge': {
      ctx.strokeStyle = '#38b6d8'; ctx.lineWidth = r * 0.22; ctx.lineCap = 'round'
      ctx.beginPath(); ctx.arc(cx - r * 0.55, cy, r * 0.32, 0, Math.PI * 2); ctx.moveTo(cx - r * 0.23, cy); ctx.lineTo(cx + r * 0.85, cy)
      ctx.moveTo(cx + r * 0.55, cy); ctx.lineTo(cx + r * 0.55, cy + r * 0.35); ctx.stroke(); break
    }
    case 'tech':
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = '#f2c230'; ctx.fill()
      ctx.lineWidth = r * 0.12; ctx.strokeStyle = '#7a5a10'; ctx.stroke(); break
    case 'city': case 'factory': case 'bastion': {
      ctx.fillStyle = '#b9b9b2'; ctx.strokeStyle = '#55554f'; ctx.lineWidth = r * 0.05
      const base = b.y + b.h * 0.88, w = b.w * 0.8, x0 = cx - w / 2
      const blocks = key === 'city' ? [[0, .45, .5], [.28, .3, .8], [.55, .4, .6]] : key === 'factory' ? [[0, .6, .45], [.62, .12, .85], [.8, .18, .6]] : [[0, .15, .55], [.22, .15, .55], [.44, .15, .55], [.66, .15, .55], [0, .81, .35]]
      for (const [dx, bw, bh] of blocks) { ctx.fillRect(x0 + dx * w, base - bh * b.h, bw * w, bh * b.h); ctx.strokeRect(x0 + dx * w, base - bh * b.h, bw * w, bh * b.h) }
      break
    }
    default: {
      ctx.setLineDash([r * 0.2, r * 0.15]); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = r * 0.06
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.9, 0, Math.PI * 2); ctx.stroke()
    }
  }
  ctx.restore()
}
