import { AmbientLight, BufferGeometry, DirectionalLight, FloatType, HemisphereLight, Mesh, MeshNormalMaterial, MeshStandardMaterial, OrthographicCamera, RGBAFormat, Scene, ShaderMaterial, WebGLRenderTarget, WebGLRenderer } from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { withDefaults, type Orientation } from './model'

const geometries = new Map<string, Promise<BufferGeometry>>()
function loadGeometry(url: string) {
  let pending = geometries.get(url)
  if (!pending) {
    // Smooth surfaces are shaded smoothly, sharp edges stay crisp. Normals in the
    // file are ignored: many STLs carry zeros or wrong ones.
    pending = new STLLoader().loadAsync(url).then(g => { g.center(); const creased = toCreasedNormals(g, Math.PI / 5); creased.computeBoundingSphere(); return creased })
    pending.catch(() => geometries.delete(url))
    geometries.set(url, pending)
  }
  return pending
}

// Finished icons by pose, so unchanged units are not re-rendered whenever one
// unit is being turned.
const icons = new Map<string, HTMLCanvasElement>()
let renderer: WebGLRenderer | undefined
function sharedRenderer() {
  if (!renderer) {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true })
    renderer.setClearColor(0x000000, 0)
  }
  return renderer
}

// The 3D part: lit model with relief and detail lines. It does not depend on
// the shared shadow / outline / contrast settings, so it is cached apart and
// changing those settings only redoes the cheap 2D finishing below.
async function renderModelBase(url: string, o: Orientation, color: string, highlight: string, size: number): Promise<HTMLCanvasElement> {
  const geometry = await loadGeometry(url)
  const radius = geometry.boundingSphere?.radius || 1
  const scene = new Scene()
  const material = new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.08 })
  const mesh = new Mesh<BufferGeometry, MeshStandardMaterial | MeshNormalMaterial | ShaderMaterial>(geometry, material)
  const rad = (deg: number) => deg * Math.PI / 180
  mesh.rotation.set(rad(o.rx), rad(o.ry), rad(o.rz), 'XYZ')
  // A strong low-ambient key light from the chosen direction brings out the
  // relief; a weak opposite fill keeps the shadow side from going black.
  const az = rad(o.lightAzimuth), el = rad(o.lightElevation)
  const key = new DirectionalLight(0xffffff, o.lightPower)
  key.position.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).multiplyScalar(4)
  const fill = new DirectionalLight(0xffffff, o.lightPower * 0.18); fill.position.set(-key.position.x, -key.position.y * 0.3, 2)
  scene.add(mesh, key, fill, new AmbientLight(0xffffff, o.lightAmbient), new HemisphereLight(0xffffff, 0x222233, o.lightAmbient * 0.8))
  const half = radius * 1.05 / Math.max(o.scale, 0.05)
  const camera = new OrthographicCamera(-half, half, half, -half, -radius * 4, radius * 4)
  camera.position.set(-o.x * half * 2, -o.y * half * 2, radius * 2)
  camera.lookAt(-o.x * half * 2, -o.y * half * 2, 0)
  const gl = sharedRenderer()
  gl.setSize(size, size, false)
  gl.render(scene, camera)
  const lit = document.createElement('canvas'); lit.width = lit.height = size
  const litCtx = lit.getContext('2d', { willReadFrequently: true })!
  litCtx.drawImage(gl.domElement, 0, 0)
  if (o.detail > 0 || o.relief > 0) {
    // A second pass paints each pixel with its surface normal. From it:
    // dark lines where the normal changes quickly (creases) and a local
    // contrast boost: how far each normal deviates from its blurred
    // neighbourhood, lit from the key light direction, lightens or darkens
    // the pixel. That shows fine relief that smooth lighting leaves flat.
    const normalMaterial = new MeshNormalMaterial()
    mesh.material = normalMaterial
    gl.render(scene, camera)
    const normals = document.createElement('canvas'); normals.width = normals.height = size
    const nctx = normals.getContext('2d', { willReadFrequently: true })!
    nctx.drawImage(gl.domElement, 0, 0)
    const blurred = document.createElement('canvas'); blurred.width = blurred.height = size
    const bctx = blurred.getContext('2d', { willReadFrequently: true })!
    bctx.filter = `blur(${Math.max(1, size * 0.014)}px)`; bctx.drawImage(normals, 0, 0); bctx.filter = 'none'
    const src = nctx.getImageData(0, 0, size, size).data, soft = bctx.getImageData(0, 0, size, size).data
    const overlay = nctx.createImageData(size, size)
    // Highlights are a lighter tone of the model's own colour, not white.
    const rgb = [1, 3, 5].map(n => parseInt(color.slice(n, n + 2), 16) || 0)
    const light = rgb.map(c => Math.round(c + (255 - c) * 0.4))
    const lx = Math.cos(el) * Math.sin(az), ly = Math.sin(el), lz = Math.cos(el) * Math.cos(az)
    const at = (x: number, y: number) => (y * size + x) * 4
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const i = at(x, y), r = at(x + 1, y), d = at(x, y + 1)
      if (src[i + 3] < 250 || src[r + 3] < 250 || src[d + 3] < 250 || soft[i + 3] < 250) continue
      let alpha = 0, shade = 0
      if (o.relief > 0) {
        // Normals are stored as 0..255 for -1..1; the screen y axis points down.
        const dx = (src[i] - soft[i]) / 127.5, dy = -(src[i + 1] - soft[i + 1]) / 127.5, dz = (src[i + 2] - soft[i + 2]) / 127.5
        shade = (dx * lx + dy * ly + dz * lz) * o.relief * 3
      }
      if (shade > 0) { overlay.data[i] = light[0]; overlay.data[i + 1] = light[1]; overlay.data[i + 2] = light[2]; alpha = Math.min(0.4, shade) }
      else if (shade < 0) { overlay.data[i] = 10; overlay.data[i + 1] = 4; overlay.data[i + 2] = 16; alpha = Math.min(0.75, -shade) }
      if (o.detail > 0) {
        const diff = (Math.abs(src[i] - src[r]) + Math.abs(src[i + 1] - src[r + 1]) + Math.abs(src[i + 2] - src[r + 2]) + Math.abs(src[i] - src[d]) + Math.abs(src[i + 1] - src[d + 1]) + Math.abs(src[i + 2] - src[d + 2])) / 255
        const line = Math.min(1, Math.max(0, (diff - 0.06) * 4)) * Math.min(1, o.detail)
        if (line > alpha) { overlay.data[i] = 12; overlay.data[i + 1] = 6; overlay.data[i + 2] = 18; alpha = line * 0.92 }
      }
      overlay.data[i + 3] = alpha * 255
    }
    nctx.putImageData(overlay, 0, 0)
    litCtx.globalCompositeOperation = 'source-atop'
    litCtx.drawImage(normals, 0, 0)
    litCtx.globalCompositeOperation = 'source-over'
    normalMaterial.dispose()
  }
  if (o.edge > 0 || o.wash > 0 || o.cavity > 0 || o.rim > 0) {
    mesh.material = normalDepth
    paintHighlights(gl, scene, camera, o, half * 2 / size, litCtx, size, highlight || lighter(color))
  }
  material.dispose()
  return lit
}

export const lighter = (color: string) => '#' + [1, 3, 5].map(n => parseInt(color.slice(n, n + 2), 16) || 0).map(c => Math.round(c + (255 - c) * 0.4).toString(16).padStart(2, '0')).join('')

// View-space normal in rgb and distance from the camera in alpha; alpha 0 is background.
const normalDepth = new ShaderMaterial({
  vertexShader: 'varying vec3 vN; varying float vD; void main() { vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }',
  fragmentShader: 'varying vec3 vN; varying float vD; void main() { gl_FragColor = vec4(normalize(vN), vD); }',
})

// Box blur run twice each way: close to a gaussian, linear in the radius.
function blur(src: Float32Array, n: number, r: number) {
  const a = new Float32Array(n * n), b = new Float32Array(n * n)
  const pass = (from: Float32Array, to: Float32Array, horizontal: boolean) => {
    for (let line = 0; line < n; line++) {
      const at = (k: number) => { k = Math.min(n - 1, Math.max(0, k)); return from[horizontal ? line * n + k : k * n + line] }
      let sum = 0
      for (let k = -r; k <= r; k++) sum += at(k)
      for (let k = 0; k < n; k++) { to[horizontal ? line * n + k : k * n + line] = sum / (2 * r + 1); sum += at(k + r + 1) - at(k - r) }
    }
  }
  pass(src, a, true); pass(a, b, false); pass(b, a, true); pass(a, b, false)
  return b
}

// Highlights that do not depend on the light, from a float normal + depth pass: raised edges (the normal turns
// convex) get the highlight colour, creases darken; a pixel nearer or farther than its neighbourhood average is
// raised or recessed; surfaces turned away from the viewer get a rim of light.
function paintHighlights(gl: WebGLRenderer, scene: Scene, camera: OrthographicCamera, o: Orientation, perPx: number, ctx: CanvasRenderingContext2D, n: number, highlight: string) {
  const target = new WebGLRenderTarget(n, n, { type: FloatType, format: RGBAFormat })
  gl.setRenderTarget(target); gl.clear(); gl.render(scene, camera); gl.setRenderTarget(null)
  const raw = new Float32Array(n * n * 4)
  gl.readRenderTargetPixels(target, 0, 0, n, n, raw)
  target.dispose()
  const nx = new Float32Array(n * n), ny = new Float32Array(n * n), nz = new Float32Array(n * n), depth = new Float32Array(n * n), mask = new Float32Array(n * n)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x, j = ((n - 1 - y) * n + x) * 4 // GL rows go bottom-up
    if (raw[j + 3] <= 0) continue
    nx[i] = raw[j]; ny[i] = raw[j + 1]; nz[i] = raw[j + 2]; depth[i] = raw[j + 3]; mask[i] = 1
  }
  const r = Math.max(1, Math.round(o.cavityRadius * n)), s = Math.max(1, Math.round(o.edgeWidth * n / 256))
  const avgDepth = o.cavity > 0 ? blur(depth, n, r) : depth, avgMask = o.cavity > 0 ? blur(mask, n, r) : mask
  const step = 8 * s * perPx, tint = [1, 3, 5].map(k => parseInt(highlight.slice(k, k + 2), 16) || 0)
  const img = ctx.getImageData(0, 0, n, n), px = img.data
  for (let y = s; y < n - s; y++) for (let x = s; x < n - s; x++) {
    const i = y * n + x
    if (!mask[i] || px[i * 4 + 3] === 0) continue
    const u = o.cavity > 0 ? (avgDepth[i] / avgMask[i] - depth[i]) / (r * perPx) : 0
    const L = i - s, R = i + s, U = i - s * n, D = i + s * n
    // Steps in depth are one part in front of another, not a bend.
    const c = mask[L] && mask[R] && mask[U] && mask[D] && Math.abs(depth[R] - depth[L]) < step && Math.abs(depth[D] - depth[U]) < step ? (nx[R] - nx[L]) + (ny[U] - ny[D]) : 0
    const light = Math.min(1, o.edge * Math.max(0, c) * 0.6 + o.cavity * Math.max(0, u) * 0.5 + o.rim * (1 - Math.max(0, nz[i])) ** 3)
    const dark = Math.min(0.9, o.wash * Math.max(0, -c) * 0.6 + o.cavity * Math.max(0, -u))
    for (let k = 0; k < 3; k++) { const p = px[i * 4 + k] * (1 - dark); px[i * 4 + k] = p + (tint[k] - p) * light }
  }
  ctx.putImageData(img, 0, 0)
}

function finishModelIcon(lit: HTMLCanvasElement, o: Orientation, size: number): HTMLCanvasElement {
  // Work on a copy: `lit` is cached and shared.
  const work = document.createElement('canvas'); work.width = work.height = size
  const litCtx = work.getContext('2d', { willReadFrequently: true })!
  litCtx.drawImage(lit, 0, 0)
  lit = work
  // Contrast, then an inner shadow: the dark outside of the silhouette, blurred
  // and clipped to the silhouette, darkens the model along its edges.
  if (o.contrast !== 1) {
    const adjusted = document.createElement('canvas'); adjusted.width = adjusted.height = size
    const actx = adjusted.getContext('2d')!
    actx.filter = `contrast(${Math.max(0.2, o.contrast)})`; actx.drawImage(lit, 0, 0); actx.filter = 'none'
    litCtx.clearRect(0, 0, size, size); litCtx.drawImage(adjusted, 0, 0)
  }
  if (o.innerShadow > 0 && o.innerShadowSize > 0) {
    const dark = document.createElement('canvas'); dark.width = dark.height = size
    const dctx = dark.getContext('2d')!
    dctx.fillStyle = '#05020a'; dctx.fillRect(0, 0, size, size)
    dctx.globalCompositeOperation = 'destination-out'; dctx.drawImage(lit, 0, 0)
    const soft = document.createElement('canvas'); soft.width = soft.height = size
    const sctx = soft.getContext('2d')!
    sctx.filter = `blur(${Math.max(0.5, o.innerShadowSize * size)}px)`; sctx.drawImage(dark, 0, 0); sctx.filter = 'none'
    sctx.globalCompositeOperation = 'destination-in'; sctx.drawImage(lit, 0, 0)
    litCtx.globalAlpha = Math.min(1, o.innerShadow); litCtx.drawImage(soft, 0, 0); litCtx.globalAlpha = 1
  }
  const out = document.createElement('canvas'); out.width = out.height = size
  // The model is drawn a little smaller, leaving room for outline and shadow.
  const ctx = out.getContext('2d')!, fit = 0.9, inset = size * (1 - fit) / 2, drawSize = size * fit
  const width = Math.max(0, o.outline) * size
  const layer = document.createElement('canvas'); layer.width = layer.height = size
  const lctx = layer.getContext('2d')!
  if (width > 0) {
    // The outline is the silhouette grown by `width` in every direction.
    for (let i = 0; i < 28; i++) { const a = i * Math.PI * 2 / 28; lctx.drawImage(lit, inset + Math.cos(a) * width, inset + Math.sin(a) * width, drawSize, drawSize) }
    lctx.globalCompositeOperation = 'source-in'; lctx.fillStyle = '#ffffff'; lctx.fillRect(0, 0, size, size)
  }
  lctx.globalCompositeOperation = 'source-over'
  lctx.drawImage(lit, inset, inset, drawSize, drawSize)
  ctx.shadowColor = `rgba(0, 0, 0, ${Math.min(1, Math.max(0, o.shadow))})`
  ctx.shadowBlur = o.shadowBlur * size; ctx.shadowOffsetX = o.shadowX * size; ctx.shadowOffsetY = o.shadowY * size
  ctx.drawImage(layer, 0, 0)
  return out
}

const BASE_KEYS = ['rx', 'ry', 'rz', 'scale', 'x', 'y', 'lightAzimuth', 'lightElevation', 'lightPower', 'lightAmbient', 'detail', 'relief', 'edge', 'edgeWidth', 'wash', 'cavity', 'cavityRadius', 'rim'] as const
const bases = new Map<string, Promise<HTMLCanvasElement>>()
// A miniature rendered on a transparent square: front-lit, orthographic.
// `scale` 1 fits the model's bounding sphere inside the square, so turning
// the model never changes its size.
export async function renderModelIcon(url: string, pose: Partial<Orientation>, color: string, highlight = '', size = 512): Promise<HTMLCanvasElement> {
  const o = withDefaults(pose)
  const baseKey = JSON.stringify([url, BASE_KEYS.map(k => o[k]), color, highlight, size])
  let base = bases.get(baseKey)
  if (!base) {
    if (bases.size >= 60) bases.delete(bases.keys().next().value!)
    base = renderModelBase(url, o, color, highlight, size); bases.set(baseKey, base)
    base.catch(() => bases.delete(baseKey))
  }
  const cacheKey = JSON.stringify([baseKey, o.shadow, o.shadowBlur, o.shadowX, o.shadowY, o.outline, o.innerShadow, o.innerShadowSize, o.contrast])
  const cached = icons.get(cacheKey)
  if (cached) return cached
  const out = finishModelIcon(await base, o, size)
  if (icons.size >= 120) icons.delete(icons.keys().next().value!)
  icons.set(cacheKey, out)
  return out
}
