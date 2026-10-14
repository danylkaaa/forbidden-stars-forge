import { AmbientLight, BufferGeometry, DirectionalLight, HemisphereLight, Mesh, MeshNormalMaterial, MeshStandardMaterial, OrthographicCamera, Scene, WebGLRenderer } from 'three'
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

// A miniature rendered on a transparent square: front-lit, orthographic.
// `scale` 1 fits the model's bounding sphere inside the square, so turning
// the model never changes its size.
export async function renderModelIcon(url: string, pose: Partial<Orientation>, color: string, size = 512): Promise<HTMLCanvasElement> {
  const o = withDefaults(pose)
  const cacheKey = JSON.stringify([url, o, color, size])
  const cached = icons.get(cacheKey)
  if (cached) return cached
  const geometry = await loadGeometry(url)
  const radius = geometry.boundingSphere?.radius || 1
  const scene = new Scene()
  const material = new MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.08 })
  const mesh = new Mesh<BufferGeometry, MeshStandardMaterial | MeshNormalMaterial>(geometry, material)
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
  material.dispose()
  if (icons.size >= 80) icons.delete(icons.keys().next().value!)
  icons.set(cacheKey, out)
  return out
}
