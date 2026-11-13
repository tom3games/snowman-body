// 3D の見た目（地形・雪の質感・木・岩・小屋・村・雪玉・雪煙）
import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from '../vendor/jsm/utils/BufferGeometryUtils.js'
import { OBJ, FIRES, STEAMS, BRANCHES, BRIDGE, TUNNEL, POOL, STAGE, YARD, S_END, L, HW0, height, surfaceAt, lanesAt, laneX, cx, rng, clamp } from './course.js?v=2'
import { Person } from './chars.js?v=2'

const TEX = {}, CLONES = {}
// 最初の画面に要るのは雪だけ。ほかは平均の色の仮の絵を置いて、最初の画面のあとで差し替える
const FIRST = ['snow_02_diff', 'snow_02_nor_gl']
const LATER = { snow_02_rough: '#b4b4b4', rock_boulder_dry_diff: '#78736a', rock_boulder_dry_nor_gl: '#8080ff', aerial_rocks_02_diff: '#6e695f', japanese_cedar_bark_diff: '#5a4637', japanese_cedar_bark_nor_gl: '#8080ff', weathered_planks_diff: '#4e4239', weathered_planks_nor_gl: '#8080ff', cobblestone_floor_08_diff: '#908a7e', cobblestone_floor_08_nor_gl: '#8080ff', plastered_wall_04_diff: '#8c8986', dirt_diff: '#61513d', corrugated_iron_diff: '#a8b2ad', corrugated_iron_nor_gl: '#8080ff' }
function prep(t, n) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; if (/diff/.test(n)) t.colorSpace = THREE.SRGBColorSpace; return t }
export function loadTextures(V, onEach) {
  const tl = new THREE.TextureLoader()
  for (const [n, col] of Object.entries(LATER)) { const c = document.createElement('canvas'); c.width = c.height = 4; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, 4, 4); TEX[n] = prep(new THREE.Texture(c), n); TEX[n].needsUpdate = true; onEach && onEach() }
  return Promise.all(FIRST.map(n => tl.loadAsync('assets/tex/' + n + '.webp' + V).then(t => { TEX[n] = prep(t, n); onEach && onEach() }).catch(e => { console.warn('tex', n, e); onEach && onEach() })))
}
export function loadLaterTextures(V) {
  for (const n of Object.keys(LATER)) {
    const img = new Image(); img.decoding = 'async'
    img.onload = () => { for (const t of [TEX[n], ...(CLONES[n] || [])]) { t.dispose(); t.image = img; t.needsUpdate = true } } /* 大きさが変わるので一度捨てて作り直す */
    img.src = 'assets/tex/' + n + '.webp' + V
  }
}
const tx = (n, rx = 1, ry = rx) => { const t = TEX[n]; if (!t) return null; const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; (CLONES[n] || (CLONES[n] = [])).push(c); return c }

// ------------------------------------------------------------ 地形
const U0 = -48, U1 = 48, DU = 1.2, DS = 1.0
function terrainMaterial(sky) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: TEX.snow_02_diff || null, normalMap: TEX.snow_02_nor_gl || null, roughness: 0.92, metalness: 0 })
  m.normalScale.set(0.7, 0.7)
  m.userData.u = { tDirt: { value: TEX.dirt_diff || null }, tStone: { value: TEX.cobblestone_floor_08_diff || null }, tRock: { value: TEX.aerial_rocks_02_diff || TEX.rock_boulder_dry_diff || null }, time: { value: 0 }, sunAmt: { value: 1 } }
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.u)
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aW1; attribute vec4 aW2; varying vec4 vW1; varying vec4 vW2; varying vec3 vWP; varying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW1 = aW1; vW2 = aW2; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normal;')
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tDirt; uniform sampler2D tStone; uniform sampler2D tRock; uniform float time; uniform float sunAmt;
varying vec4 vW1; varying vec4 vW2; varying vec3 vWP; varying vec3 vWN;
float h21(vec2 p){ p = mod(p, 1024.0); vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }`)
      .replace('#include <map_fragment>', `
vec2 wuv = vWP.xz * 0.21;
vec3 snow = texture2D(map, wuv).rgb;
snow = mix(vec3(0.93,0.95,0.98), snow * vec3(1.02,1.03,1.06), 0.55);
float dirtW = vW1.x, stoneW = vW1.y, packW = vW1.z, sunW = vW1.w, rockW = vW2.x, slushW = vW2.y, deepW = vW2.z;
// 圧雪: 整地車の縞
float cord = smoothstep(0.35, 0.5, abs(fract(vWP.x * 2.2) - 0.5));
vec3 col = mix(snow, snow * (0.9 + 0.06 * cord), packW);
// 湿った雪（日なた）: 灰色っぽく、少し透ける
col = mix(col, col * vec3(0.84, 0.87, 0.9), slushW);
// 土・石畳・岩
vec3 dirt = texture2D(tDirt, vWP.xz * 0.28).rgb * vec3(0.95, 0.85, 0.78);
vec3 stone = texture2D(tStone, vWP.xz * 0.3).rgb * 0.9;
vec3 rock = texture2D(tRock, vec2(vWP.x + vWP.z, vWP.y) * 0.12).rgb * 0.75;
float snowOnTop = smoothstep(0.55, 0.85, vWN.y);
col = mix(col, mix(dirt, snow, 0.12 + 0.18 * h21(floor(vWP.xz * 3.0))), dirtW);
col = mix(col, mix(stone, snow, 0.08), stoneW);
col = mix(col, mix(rock, snow, snowOnTop), rockW);
// 日陰は青く、日なたは暖かく明るい
vec3 shadeTint = mix(vec3(0.86, 0.9, 1.0), vec3(0.6, 0.7, 0.95), sunAmt);
vec3 sunTint = mix(vec3(1.0, 0.99, 0.97), vec3(1.16, 1.05, 0.86), sunAmt);
col *= mix(shadeTint, sunTint, sunW);
diffuseColor.rgb *= col;`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.38, vW2.y * 0.9);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
// 雪のきらめき（日なたと新雪）
vec2 cell = floor(vWP.xz * 26.0);
float rnd = h21(cell);
vec3 V = normalize(cameraPosition - vWP);
float tw = step(0.985 - 0.012 * vW2.z, rnd) * pow(max(0.0, sin(rnd * 60.0 + dot(V, vec3(13.0, 7.0, 11.0)) * 3.0)), 8.0);
totalEmissiveRadiance += vec3(1.0, 0.97, 0.9) * tw * (0.25 + 1.6 * vW1.w) * sunAmt * (1.0 - vW1.x) * (1.0 - vW1.y);
// 日なたは雪がほんのり光る（溶けかけの照り返し）
totalEmissiveRadiance += vec3(0.16, 0.11, 0.04) * vW1.w * sunAmt * (1.0 - vW1.x) * (1.0 - vW1.y);`)
  }
  return m
}
function surfW(x, z, ny) {
  const sf = surfaceAt(x, z)
  const t = sf.type
  return [t === 'dirt' ? 1 : 0, t === 'stone' ? 1 : 0, t === 'packed' ? 1 : 0, sf.sun ? 1 : 0, ny < 0.62 ? clamp((0.78 - ny) / 0.18, 0, 1) : 0, t === 'slush' ? 1 : 0, t === 'deep' ? 1 : 0, 0]
}
function buildTerrain(scene, mat) {
  const group = new THREE.Group(); group.name = 'terrain'
  const nu = Math.round((U1 - U0) / DU) + 1, chunk = 80
  for (let c0 = -45; c0 < L + 70; c0 += chunk) {
    const ns = Math.round(chunk / DS) + 1
    const pos = new Float32Array(nu * ns * 3), nor = new Float32Array(nu * ns * 3), uv = new Float32Array(nu * ns * 2), w1 = new Float32Array(nu * ns * 4), w2 = new Float32Array(nu * ns * 4)
    let k = 0
    for (let j = 0; j < ns; j++) {
      const z = c0 + j * DS, c = cx(z)
      for (let i = 0; i < nu; i++, k++) {
        const u = U0 + i * DU, x = c + u, y = height(x, z)
        pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z
        const e = 0.5, gx = (height(x + e, z) - height(x - e, z)) / (2 * e), gz = (height(x, z + e) - height(x, z - e)) / (2 * e)
        const nl = Math.hypot(gx, 1, gz); nor[k * 3] = -gx / nl; nor[k * 3 + 1] = 1 / nl; nor[k * 3 + 2] = -gz / nl
        uv[k * 2] = x * 0.21; uv[k * 2 + 1] = z * 0.21
        const w = surfW(x, z, 1 / nl)
        w1.set(w.slice(0, 4), k * 4); w2.set(w.slice(4, 8), k * 4)
      }
    }
    const idx = []
    for (let j = 0; j < ns - 1; j++) for (let i = 0; i < nu - 1; i++) { const a = j * nu + i, b = a + 1, c = a + nu, d = c + 1; idx.push(a, c, b, b, c, d) }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
    g.setAttribute('aW1', new THREE.BufferAttribute(w1, 4)); g.setAttribute('aW2', new THREE.BufferAttribute(w2, 4)); g.setIndex(idx)
    g.computeBoundingSphere()
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m)
  }
  scene.add(group); return group
}

// ------------------------------------------------------------ 空・遠い山
export function buildSky(scene) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x3d78c9) }, hor: { value: new THREE.Color(0xdfe9f2) }, sunDir: { value: new THREE.Vector3(0.5, 0.45, 0.7).normalize() }, sunCol: { value: new THREE.Color(1, 0.92, 0.75) }, sunAmt: { value: 1 } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunAmt; varying vec3 vD;
      void main(){ float h = clamp(vD.y, -0.2, 1.0); vec3 c = mix(hor, top, pow(max(h, 0.0), 0.55));
        float s = max(dot(normalize(vD), sunDir), 0.0); c += sunCol * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.12) * sunAmt;
        gl_FragColor = vec4(c, 1.0); }`,
  })
  const s = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), m); s.renderOrder = -10; s.frustumCulled = false; scene.add(s)
  return s
}
function mountainsTex(weather) {
  const c = document.createElement('canvas'); c.width = 2048; c.height = 512; const x = c.getContext('2d'); const R = rng(5)
  const clear = weather === 'sunny'
  // 尾根の線: 鋭い峰（|sin| の和）を重ねる。左右はつながる（2048px で1周）
  const ridge = (seed, base, amp, sharp) => { const R2 = rng(seed), ph = [R2() * 6, R2() * 6, R2() * 6, R2() * 6], ys = []; for (let i = 0; i <= 512; i++) { const a = i / 512 * Math.PI * 2; let v = 0.55 * Math.pow(1 - Math.abs(Math.sin(a * 2 + ph[0])), sharp) + 0.3 * Math.pow(1 - Math.abs(Math.sin(a * 5 + ph[1])), sharp) + 0.15 * Math.pow(1 - Math.abs(Math.sin(a * 11 + ph[2])), 1.5) + 0.06 * Math.sin(a * 37 + ph[3]); ys.push(base - v * amp) } return ys }
  const layers = [
    { ys: ridge(11, 330, 230, 3), top: clear ? '#ffffff' : '#eef1f4', mid: clear ? '#c8d8ea' : '#cfd6de', low: clear ? '#9db5cf' : '#b3bcc8', haze: 0.55 },
    { ys: ridge(23, 400, 170, 2.4), top: '#f8fbfe', mid: clear ? '#a9bfd6' : '#bcc5d0', low: clear ? '#6f8aa8' : '#98a3b2', haze: 0.3 },
    { ys: ridge(37, 470, 110, 2), top: '#f2f6fa', mid: clear ? '#8aa2bc' : '#a9b3bf', low: clear ? '#4f6680' : '#7f8a99', haze: 0.12 },
  ]
  for (const L of layers) {
    x.beginPath(); x.moveTo(0, 512); L.ys.forEach((y, i) => x.lineTo(i * 4, y)); x.lineTo(2048, 512); x.closePath()
    const g = x.createLinearGradient(0, Math.min(...L.ys), 0, 512); g.addColorStop(0, L.top); g.addColorStop(0.35, L.mid); g.addColorStop(1, L.low); x.fillStyle = g; x.fill()
    // 岩の筋（峰から下へ）
    x.save(); x.clip(); x.globalAlpha = 0.22; x.strokeStyle = clear ? '#3d556f' : '#5d6876'; x.lineWidth = 2
    for (let i = 2; i < 510; i += 5) { if (R() < 0.45) continue; const y0 = L.ys[i]; x.beginPath(); x.moveTo(i * 4, y0 + 6); x.lineTo(i * 4 + (R() - 0.5) * 30, y0 + 40 + R() * 90); x.stroke() }
    x.globalAlpha = L.haze; const hz = x.createLinearGradient(0, 300, 0, 512); hz.addColorStop(0, 'rgba(225,235,245,0)'); hz.addColorStop(1, clear ? 'rgba(225,235,245,1)' : 'rgba(215,222,230,1)'); x.fillStyle = hz; x.fillRect(0, 0, 2048, 512)
    x.restore()
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping
  return t
}
export function buildBackdrop(scene, weather) {
  const g = new THREE.CylinderGeometry(900, 900, 420, 64, 1, true)
  const m = new THREE.MeshBasicMaterial({ map: mountainsTex(weather), side: THREE.BackSide, transparent: true, depthWrite: false, fog: false })
  m.map.repeat.set(1, 1)
  const mesh = new THREE.Mesh(g, m); mesh.renderOrder = -9; mesh.frustumCulled = false; scene.add(mesh)
  return mesh
}

// ------------------------------------------------------------ 木（針葉樹）
function coniferGeo(detail = 1) {
  const R = rng(3), parts = []
  const trunk = new THREE.CylinderGeometry(0.08, 0.17, 1.6, 6); trunk.translate(0, 0.8, 0); paint(trunk, [0.3, 0.2, 0.15]); parts.push(trunk)
  const tiers = detail ? 6 : 4, seg = detail ? 18 : 10
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers, rad = 1.45 * (1 - t * 0.8), hh = 1.35 * (1 - t * 0.3), y = 0.95 + t * 3.9
    const cone = new THREE.ConeGeometry(rad, hh, seg, 3, true)
    const p = cone.attributes.position
    for (let k = 0; k < p.count; k++) {
      const px = p.getX(k), pz = p.getZ(k), r = Math.hypot(px, pz)
      if (r < 1e-4) continue
      const a = Math.atan2(pz, px), tip = Math.pow(Math.max(0, Math.cos(a * 4.5 + i * 1.3)), 2)
      const j = 0.82 + 0.3 * tip + (R() - 0.5) * 0.08
      p.setX(k, px * j); p.setZ(k, pz * j)
      // 枝先は垂れる
      if (r > rad * 0.55) p.setY(k, p.getY(k) - 0.22 * (r / rad) * (0.6 + tip))
    }
    cone.translate(0, y, 0); cone.computeVertexNormals(); cone.deleteAttribute('uv')
    const n = cone.attributes.normal, col = new Float32Array(p.count * 3)
    for (let k = 0; k < p.count; k++) {
      const up = n.getY(k), yy = p.getY(k) - y, sn = clamp((up - 0.2) * 2.4, 0, 1) * clamp(0.55 + yy * 1.2, 0, 1) * (0.7 + R() * 0.3)
      const g = [0.05 + R() * 0.03, 0.15 + R() * 0.05, 0.1 + R() * 0.03], sh = 0.75 + 0.25 * clamp(1 - yy * -1.2, 0, 1)
      for (let q = 0; q < 3; q++) col[k * 3 + q] = g[q] * sh * (1 - sn) + [0.95, 0.97, 1.0][q] * sn
    }
    cone.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(cone)
  }
  const g = mergeGeometries(parts.map(p => p.index ? p.toNonIndexed() : p)); g.computeBoundingSphere(); return g
}
function paint(g, c) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g }
const treeMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 })

// ------------------------------------------------------------ 岩
function rockGeo(seed, r) {
  let g = new THREE.IcosahedronGeometry(1, 3); g.deleteAttribute('uv'); g = mergeVertices(g); const p = g.attributes.position, R = rng(seed)
  const amp = [R(), R(), R()]
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const n = 1 + 0.22 * Math.sin(v.x * 3.1 + amp[0] * 6) * Math.cos(v.y * 2.7 + amp[1] * 6) + 0.12 * Math.sin(v.z * 5 + amp[2] * 6); v.multiplyScalar(n); v.y *= 0.72; p.setXYZ(i, v.x * r, v.y * r, v.z * r) }
  g.computeVertexNormals()
  const uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) + p.getZ(i)) * 0.35; uv[i * 2 + 1] = p.getY(i) * 0.35 } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  return g
}
function rockMat() {
  const m = new THREE.MeshStandardMaterial({ map: tx('rock_boulder_dry_diff', 1), normalMap: tx('rock_boulder_dry_nor_gl', 1), roughness: 0.95, color: 0x9a9690 })
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN2;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWN2 = normalize(mat3(modelMatrix) * normal);')
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWN2;').replace('#include <map_fragment>', '#include <map_fragment>\nfloat sn = smoothstep(0.45, 0.7, vWN2.y); diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92,0.94,0.98), sn);')
  }
  return m
}

// ------------------------------------------------------------ 小物
const M = {}
function mats() {
  if (M.wood) return M
  M.wood = new THREE.MeshStandardMaterial({ map: tx('weathered_planks_diff', 1, 1), normalMap: tx('weathered_planks_nor_gl', 1, 1), roughness: 0.9 }); M.wood.color.setRGB(2.1, 1.75, 1.4)
  M.woodDark = new THREE.MeshStandardMaterial({ map: tx('weathered_planks_diff', 1, 1), roughness: 0.9 }); M.woodDark.color.setRGB(1.15, 0.85, 0.65)
  M.bark = new THREE.MeshStandardMaterial({ map: tx('japanese_cedar_bark_diff', 1, 2), normalMap: tx('japanese_cedar_bark_nor_gl', 1, 2), roughness: 0.95 })
  M.snow = new THREE.MeshStandardMaterial({ color: 0xf4f7fc, map: tx('snow_02_diff', 1), normalMap: tx('snow_02_nor_gl', 1), roughness: 0.92 })
  M.snow.normalScale.set(0.5, 0.5)
  M.plaster = new THREE.MeshStandardMaterial({ map: tx('plastered_wall_04_diff', 1.5), roughness: 0.95 }); M.plaster.color.setRGB(1.75, 1.66, 1.5)
  M.iron = new THREE.MeshStandardMaterial({ map: tx('corrugated_iron_diff', 2), normalMap: tx('corrugated_iron_nor_gl', 2), color: 0x8a3b2e, roughness: 0.6, metalness: 0.3 })
  M.ironBlue = new THREE.MeshStandardMaterial({ map: tx('corrugated_iron_diff', 2), normalMap: tx('corrugated_iron_nor_gl', 2), color: 0x3d5878, roughness: 0.6, metalness: 0.3 })
  M.stone = new THREE.MeshStandardMaterial({ map: tx('rock_boulder_dry_diff', 0.6), color: 0xa8a49c, roughness: 0.95 })
  M.coal = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.6 })
  M.carrot = new THREE.MeshStandardMaterial({ color: 0xe8701e, roughness: 0.6 })
  M.red = new THREE.MeshStandardMaterial({ color: 0xc4342b, roughness: 0.6 })
  M.window = new THREE.MeshStandardMaterial({ color: 0x3a2a18, emissive: 0xffb45a, emissiveIntensity: 1.4, roughness: 0.4 })
  M.concrete = new THREE.MeshStandardMaterial({ map: tx('rock_boulder_dry_diff', 2), color: 0xb9b8b2, roughness: 0.95 })
  M.tent = new THREE.MeshStandardMaterial({ color: 0xe0782a, roughness: 0.75, side: THREE.DoubleSide })
  M.tent2 = new THREE.MeshStandardMaterial({ color: 0x2f6b8a, roughness: 0.75, side: THREE.DoubleSide })
  M.water = new THREE.MeshStandardMaterial({ color: 0x24536a, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.88 })
  M.onsen = new THREE.MeshStandardMaterial({ color: 0x6fb3b8, emissive: 0x1a3a40, roughness: 0.1, transparent: true, opacity: 0.92 })
  M.cloth = new THREE.MeshStandardMaterial({ color: 0xc8323a, roughness: 0.8, side: THREE.DoubleSide })
  return M
}
function snowCap(w, d, h = 0.18) { const g = new THREE.CapsuleGeometry(h, 1, 4, 8); g.rotateZ(Math.PI / 2); g.scale(w / (1 + 2 * h), 1, d / (2 * h)); return new THREE.Mesh(g, M.snow) }
function box(w, h, d, mat) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; m.receiveShadow = true; return m }
function makeFence(o) {
  const g = new THREE.Group(), dx = o.x2 - o.x, dz = o.z2 - o.z, len = Math.hypot(dx, dz)
  for (const t of [0, 1]) { const p = box(0.14, 1.1, 0.14, M.woodDark); p.position.set(t * len, 0.45, 0); g.add(p); const c = snowCap(0.22, 0.22, 0.08); c.position.set(t * len, 1.02, 0); g.add(c) }
  for (const y of [0.4, 0.8]) { const r = box(len + 0.2, 0.12, 0.05, M.wood); r.position.set(len / 2, y, 0.08); g.add(r) }
  const cap = snowCap(len, 0.14, 0.06); cap.position.set(len / 2, 0.87, 0.08); g.add(cap)
  g.position.set(o.x, height(o.x, o.z), o.z); g.rotation.y = -Math.atan2(dz, dx)
  return g
}
export function makeSnowman(r = 0.45, o = {}) {
  const g = new THREE.Group()
  const b1 = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 3), M.snow); b1.position.y = r * 0.9; b1.castShadow = true
  const b2 = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.66, 3), M.snow); b2.position.y = r * 1.75 + r * 0.55; b2.castShadow = true
  g.add(b1, b2)
  const hy = b2.position.y, hr = r * 0.66
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.09, 6, 4), M.coal); e.position.set(s * hr * 0.32, hy + hr * 0.18, hr * 0.92); g.add(e) }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(hr * 0.1, hr * 0.5, 6), M.carrot); nose.rotation.x = Math.PI / 2; nose.position.set(0, hy, hr * 1.12); g.add(nose)
  if (!o.noHat) { const hat = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.5, hr * 0.6, hr * 0.7, 10), o.hatMat || M.red); hat.position.set(0, hy + hr * 0.95, 0); hat.rotation.z = 0.15; hat.castShadow = true; g.add(hat) }
  for (const s of [-1, 1]) { const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.025, r * 1.4, 4), M.woodDark); arm.position.set(s * r * 1.1, r * 1.5, 0); arm.rotation.z = s * -1.0; g.add(arm) }
  return g
}
function makeHut(w = 4, d = 3.4, h = 2.4, roofMat = M.iron) {
  const g = new THREE.Group()
  const wall = box(w, h, d, M.wood); wall.position.y = h / 2; g.add(wall)
  wall.material = M.wood
  const roofL = box(w + 0.6, 0.12, d * 0.62, roofMat), roofR = roofL.clone()
  roofL.position.set(0, h + 0.55, -d * 0.24); roofL.rotation.x = 0.55; roofR.position.set(0, h + 0.55, d * 0.24); roofR.rotation.x = -0.55
  g.add(roofL, roofR)
  const sL = snowCap(w + 0.5, d * 0.62, 0.22); sL.position.set(0, h + 0.72, -d * 0.24); sL.rotation.x = 0.55; const sR = sL.clone(); sR.position.z = d * 0.24; sR.rotation.x = -0.55; g.add(sL, sR)
  const gable = new THREE.Mesh(new THREE.CylinderGeometry(0.001, d * 0.62, 1.1, 3, 1), M.wood); gable.rotation.set(0, 0, 0); gable.scale.set(1, 1, 1)
  const win = box(0.7, 0.55, 0.05, M.window); win.position.set(w * 0.22, h * 0.6, d / 2 + 0.03); g.add(win)
  const door = box(0.8, 1.6, 0.06, M.woodDark); door.position.set(-w * 0.2, 0.8, d / 2 + 0.03); g.add(door)
  // 軒下の雪の吹きだまり
  const drift = snowCap(w + 0.4, 0.8, 0.3); drift.position.set(0, 0.15, -d / 2 - 0.2); g.add(drift)
  return g
}
function makeHouse(v = 0) {
  const g = new THREE.Group(), w = 6.2, d = 5, h = 3.2
  const wall = box(w, h, d, M.plaster); wall.position.y = h / 2; g.add(wall)
  for (const x of [-w / 2 + 0.1, 0, w / 2 - 0.1]) { const b = box(0.2, h, d + 0.04, M.woodDark); b.position.set(x, h / 2, 0); g.add(b) }
  const base = box(w + 0.1, 0.5, d + 0.1, M.stone); base.position.y = 0.25; g.add(base)
  const rm = v === 1 ? M.ironBlue : M.iron
  const roofL = box(w + 1.2, 0.14, d * 0.66, rm), roofR = roofL.clone()
  roofL.position.set(0, h + 0.75, -d * 0.25); roofL.rotation.x = 0.6; roofR.position.set(0, h + 0.75, d * 0.25); roofR.rotation.x = -0.6
  g.add(roofL, roofR)
  const sL = snowCap(w + 1.1, d * 0.66, 0.35); sL.position.set(0, h + 1.0, -d * 0.25); sL.rotation.x = 0.6; const sR = sL.clone(); sR.position.z = d * 0.25; sR.rotation.x = -0.6; g.add(sL, sR)
  for (const x of [-1.6, 1.6]) { const win = box(1.0, 0.8, 0.06, M.window); win.position.set(x, h * 0.58, d / 2 + 0.04); g.add(win) }
  const door = box(1.0, 2.0, 0.08, M.woodDark); door.position.set(0, 1.0, d / 2 + 0.04); g.add(door)
  const chim = box(0.5, 1.4, 0.5, M.stone); chim.position.set(w * 0.3, h + 1.3, -0.6); g.add(chim)
  return g
}
function makeSign(lines, w = 1.6) {
  const g = new THREE.Group()
  const post = box(0.12, 1.8, 0.12, M.woodDark); post.position.y = 0.9; g.add(post)
  const c = document.createElement('canvas'); c.width = 256; c.height = 128 * lines.length; const x = c.getContext('2d')
  x.fillStyle = '#d9c4a0'; x.fillRect(0, 0, c.width, c.height)
  x.fillStyle = 'rgba(80,50,20,0.25)'; for (let i = 0; i < 40; i++) x.fillRect(0, Math.random() * c.height, c.width, 1)
  lines.forEach((l, i) => { x.fillStyle = '#3a2412'; x.font = '700 64px "Zen Kaku Gothic New", sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(l, 128, 64 + i * 128) })
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
  const board = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6 * lines.length, 0.06), [M.wood, M.wood, M.wood, M.wood, new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 }), M.wood])
  board.position.y = 1.55 + 0.3 * (lines.length - 1); board.castShadow = true; g.add(board)
  const cap = snowCap(w, 0.1, 0.06); cap.position.y = board.position.y + 0.3 * lines.length + 0.03; g.add(cap)
  return g
}
function makeFire(drum) {
  const g = new THREE.Group()
  if (drum) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.85, 14, 1, true), M.iron); d.position.y = 0.42; d.material = M.iron; d.castShadow = true; g.add(d) }
  else {
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2, s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 0), M.stone); s.position.set(Math.cos(a) * 0.55, 0.08, Math.sin(a) * 0.55); s.castShadow = true; g.add(s) }
    for (let i = 0; i < 3; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.8, 6), M.bark); l.rotation.set(0.9, i * 2.1, 0); l.position.y = 0.2; g.add(l) }
  }
  return g
}
function makeTorii() {
  const g = new THREE.Group()
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.2, 12), M.red); p.position.set(s * 2.6, 2.1, 0); p.castShadow = true; g.add(p) }
  const k = box(7.0, 0.32, 0.5, M.red); k.position.y = 4.3; g.add(k)
  const k2 = box(6.6, 0.2, 0.3, new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 })); k2.position.y = 4.55; g.add(k2)
  const n = box(6.0, 0.22, 0.3, M.red); n.position.y = 3.6; g.add(n)
  const sc = snowCap(7.1, 0.5, 0.12); sc.position.y = 4.72; g.add(sc)
  return g
}
function makeLantern() {
  const g = new THREE.Group(), s = M.stone
  const parts = [[new THREE.CylinderGeometry(0.28, 0.34, 0.25, 8), 0.12], [new THREE.CylinderGeometry(0.1, 0.12, 0.7, 8), 0.6], [new THREE.CylinderGeometry(0.3, 0.22, 0.14, 6), 0.98], [new THREE.BoxGeometry(0.36, 0.34, 0.36), 1.2], [new THREE.ConeGeometry(0.42, 0.32, 6), 1.52]]
  for (const [geo, y] of parts) { const m = new THREE.Mesh(geo, s); m.position.y = y; m.castShadow = true; g.add(m) }
  const light = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.38), M.window); light.position.y = 1.2; g.add(light)
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), M.snow); cap.scale.y = 0.4; cap.position.y = 1.66; g.add(cap)
  return g
}
function makeTent(i) {
  const g = new THREE.Group()
  const t = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.6, 4, 1, true), i % 2 ? M.tent : M.tent2); t.rotation.y = Math.PI / 4; t.position.y = 0.8; t.castShadow = true; g.add(t)
  const sc = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.5, 4), M.snow); sc.rotation.y = Math.PI / 4; sc.position.y = 1.45; g.add(sc)
  return g
}
function makeCart() {
  const g = new THREE.Group()
  const bed = box(1.6, 0.6, 1.0, M.wood); bed.position.y = 0.75; g.add(bed)
  const oven = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.6, 10), M.iron); oven.position.set(0.2, 1.35, 0); oven.castShadow = true; g.add(oven)
  const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 6), M.iron); pipe.position.set(0.45, 1.9, 0); g.add(pipe)
  for (const s of [-1, 1]) { const wh = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 6, 14), M.woodDark); wh.position.set(-0.3, 0.35, s * 0.55); g.add(wh) }
  const c = document.createElement('canvas'); c.width = 64; c.height = 192; const x = c.getContext('2d'); x.fillStyle = '#f2ead8'; x.fillRect(0, 0, 64, 192); x.fillStyle = '#b02a20'; x.font = '900 46px "Zen Kaku Gothic New", sans-serif'; x.textAlign = 'center'; ['や', 'き', 'い', 'も'].forEach((ch, i) => x.fillText(ch, 32, 44 + i * 46))
  const ft = new THREE.CanvasTexture(c); ft.colorSpace = THREE.SRGBColorSpace
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 1.2), new THREE.MeshStandardMaterial({ map: ft, side: THREE.DoubleSide, roughness: 0.9 })); flag.position.set(-0.6, 1.9, 0.52); g.add(flag)
  const pole = box(0.04, 2.6, 0.04, M.woodDark); pole.position.set(-0.82, 1.3, 0.52); g.add(pole)
  return g
}
function makeLift() {
  const g = new THREE.Group()
  const h = makeHut(3.6, 3.2, 2.6, M.ironBlue); g.add(h)
  const tower = box(0.3, 7, 0.3, M.iron); tower.position.set(0, 3.5, -6); g.add(tower)
  const arm = box(3, 0.2, 0.2, M.iron); arm.position.set(0, 6.9, -6); g.add(arm)
  return g
}
function makeBridge() {
  const g = new THREE.Group(), len = BRIDGE.s1 - BRIDGE.s0 + 3
  for (const s of [-0.85, 0, 0.85]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, len, 10), M.bark); l.rotation.x = Math.PI / 2; l.position.set(s, 0, 0); l.castShadow = true; l.receiveShadow = true; g.add(l) }
  const sn = snowCap(2.4, len, 0.1); sn.rotation.y = Math.PI / 2; sn.scale.set(1, 1, 1); g.add(sn)
  for (const s of [-1, 1]) for (const z of [-len / 2 + 0.5, len / 2 - 0.5]) { const p = box(0.12, 1.1, 0.12, M.woodDark); p.position.set(s * 1.35, 0.4, z); g.add(p) }
  return g
}

// ------------------------------------------------------------ 世界を作る
export function buildWorld(scene, o = {}) {
  mats()
  const W = { objs: new Array(OBJ.length).fill(null), fires: [], steams: [], people: [], anim: [], treesInst: null }
  const tmat = terrainMaterial(); W.terrainMat = tmat
  W.terrain = buildTerrain(scene, tmat)
  // 木: 当たる木（個別に倒せるよう InstancedMesh の番号を持つ）＋ 景色の森
  const tgeo = coniferGeo(1), tgeoLo = coniferGeo(0), tm = treeMat()
  const hit = OBJ.filter(q => q.kind === 'tree')
  const inst = new THREE.InstancedMesh(tgeo, tm, hit.length); inst.castShadow = true; inst.receiveShadow = true
  const mx = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0)
  hit.forEach((t, i) => { const s = (t.h || 6) / 5.2; q.setFromAxisAngle(up, (t.i * 1.7) % 6.28); p.set(t.x, height(t.x, t.z) - 0.2, t.z); sc.set(s, s, s); mx.compose(p, q, sc); inst.setMatrixAt(i, mx); W.objs[t.i] = { inst, k: i, base: mx.clone(), s } })
  inst.computeBoundingSphere(); scene.add(inst); W.treesInst = inst
  // 景色の森（崖の上・奥）。80m ごとに分けて画面外を省く
  const R = rng(91)
  for (let c0 = -40; c0 < L + 60; c0 += 80) {
    const mats4 = []
    for (let s = c0; s < c0 + 80; s += 2.6) {
      const la = lanesAt(s), hw = la.n === 1 ? HW0 : Math.max(HW0, Math.abs(la.offs[0]) + la.lw, Math.abs(la.offs[la.n - 1]) + la.lw)
      for (const side of [-1, 1]) for (let row = 0; row < 5; row++) {
        if (R() < 0.3) continue
        const u = side * (hw + 5 + row * 4.5 + R() * 3), x = cx(s) + u, zz = s + R() * 2.6
        const sc2 = 0.9 + R() * 0.9; q.setFromAxisAngle(up, R() * 6.28); p.set(x, height(x, zz) - 0.3, zz); sc.set(sc2, sc2 * (0.9 + R() * 0.4), sc2); mats4.push(mx.compose(p, q, sc).clone())
      }
    }
    // 村は家があるので森を減らす
    const im = new THREE.InstancedMesh(tgeoLo, tm, mats4.length); mats4.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = false; im.receiveShadow = true; im.computeBoundingSphere(); scene.add(im)
  }
  // 岩
  const rmat = rockMat()
  for (const r of OBJ.filter(q => q.kind === 'rock')) { const m = new THREE.Mesh(rockGeo(r.i, r.r * 1.05), rmat); m.position.set(r.x, height(r.x, r.z) + r.r * 0.25, r.z); m.rotation.y = r.i; m.castShadow = true; m.receiveShadow = true; scene.add(m); W.objs[r.i] = m }
  // ほかの物
  let tentN = 0
  for (const ob of OBJ) {
    let m = null
    const y = height(ob.x, ob.z)
    if (ob.kind === 'fence') { m = makeFence(ob) }
    else if (ob.kind === 'snowman') { m = makeSnowman(ob.r * (ob.contest ? 1.6 : 1), { noHat: !!ob.fort, hatMat: ob.i % 3 === 0 ? M.woodDark : ob.i % 3 === 1 ? M.red : M.ironBlue }); m.position.set(ob.x, y - 0.05, ob.z); m.rotation.y = Math.PI + (ob.i % 5 - 2) * 0.2 }
    else if (ob.kind === 'hut') { m = makeHut(4, 3.4, 2.4); m.position.set(ob.x, y - 0.1, ob.z); m.rotation.y = Math.PI + (ob.yaw || 0) }
    else if (ob.kind === 'barn') { m = makeHut(5.2, 4.2, 3.0); m.position.set(ob.x, y - 0.1, ob.z); m.rotation.y = Math.PI }
    else if (ob.kind === 'house') { m = makeHouse(ob.v); m.position.set(ob.x, height(ob.x, ob.z) - 0.2, ob.z); m.rotation.y = ob.yaw }
    else if (ob.kind === 'tent') { m = makeTent(tentN++); m.position.set(ob.x, y, ob.z) }
    else if (ob.kind === 'cart') { m = makeCart(); m.position.set(ob.x, y, ob.z); m.rotation.y = Math.PI / 2 }
    else if (ob.kind === 'lift') { m = makeLift(); m.position.set(ob.x, y - 0.1, ob.z); m.rotation.y = Math.PI / 2 }
    else if (ob.kind === 'lantern') { m = makeLantern(); m.position.set(ob.x, y, ob.z) }
    else if (ob.kind === 'post' && ob.torii) { if (OBJ[ob.i - 1] && OBJ[ob.i - 1].torii && OBJ[ob.i - 1].z === ob.z) { W.objs[ob.i] = W.objs[ob.i - 1]; continue } m = makeTorii(); const xm = ob.x + 2.6; m.position.set(xm, height(xm, ob.z), ob.z) }
    else if (ob.kind === 'fire') { m = makeFire(ob.drum); m.position.set(ob.x, y, ob.z); W.fires.push({ ob, g: m }) }
    else if (ob.kind === 'skier') { m = new THREE.Group(); m.position.set(ob.x, y, ob.z); const pp = new Person(m, { kind: ['character-male-c', 'character-female-b', 'character-male-e', 'character-female-d'][ob.i % 4], hat: ob.i, anim: ob.line != null ? 'idle' : 'crouch', scale: ob.line != null ? 0.85 : 1.05 }); m.rotation.y = Math.PI + (ob.line != null ? 0.3 : 0); for (const sx of [-0.12, 0.12]) { const ski = box(0.08, 0.03, 1.5, M.red); ski.position.set(sx, 0.02, 0.1); m.add(ski) } W.people.push(pp); m.userData.person = pp }
    else if (ob.kind === 'sign') { const lines = ob.fork ? forkLines(ob) : ['山頂']; m = makeSign(lines, 1.5); m.position.set(ob.x, y, ob.z); m.rotation.y = Math.PI }
    if (m) { m.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true } }); scene.add(m); W.objs[ob.i] = m }
  }
  // 焚き火の炎（加算の板）と光
  W.flameTex = flameTex(); W.glowTex = glowTex()
  for (const f of W.fires) {
    const fl = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.flameTex, color: new THREE.Color(2.4, 1.3, 0.55), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }))
    fl.scale.set(1.1, 1.6, 1); fl.position.y = f.ob.drum ? 1.35 : 0.75; f.g.add(fl); f.fl = fl
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.glowTex, color: new THREE.Color(1.0, 0.5, 0.2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 })); gl.scale.set(4, 4, 1); gl.position.y = 0.9; f.g.add(gl); f.gl = gl
  }
  W.fireLights = [0, 1].map(() => { const l = new THREE.PointLight(0xff8a3a, 0, 9, 1.6); scene.add(l); return l })
  // 湯けむり（板を重ねる）
  W.steamTex = puffTex()
  for (const s of STEAMS) { const g = new THREE.Group(); g.position.set(s.x, height(s.x, s.z), s.z); const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 0.3, 10), M.stone); vent.position.y = 0.1; g.add(vent); const puffs = []; for (let i = 0; i < 6; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.steamTex, transparent: true, depthWrite: false, opacity: 0.5, color: 0xffffff })); g.add(sp); puffs.push(sp) } scene.add(g); W.steams.push({ g, puffs, s }) }
  // 沢と丸太橋
  { const bx = laneX(BRIDGE.s, 'creek'), y = height(bx, BRIDGE.s) ; const water = new THREE.Mesh(new THREE.PlaneGeometry(14, BRIDGE.s1 - BRIDGE.s0 - 2), M.water); water.rotation.x = -Math.PI / 2; water.position.set(bx, y + 0.05, BRIDGE.s); scene.add(water); W.water = water
    const br = makeBridge(); br.position.set(bx, height(bx, BRIDGE.s0) + 0.15, BRIDGE.s); br.traverse(n => { if (n.isMesh) n.castShadow = true }); scene.add(br); W.bridge = br }
  // スノーシェッド（トンネル）
  { const g = new THREE.Group(), len = TUNNEL.s1 - TUNNEL.s0, hh = 3.6, half = TUNNEL.half + 0.25
    for (let z = TUNNEL.s0; z < TUNNEL.s1; z += 2) {
      const x = laneX(z + 1, 'tunnel'), y = height(x, z + 1)
      const seg = new THREE.Group(); seg.position.set(x, y, z + 1)
      const roof = box(half * 2 + 1.2, 0.5, 2.02, M.concrete); roof.position.y = hh; seg.add(roof)
      const wl = box(0.5, hh, 2.02, M.concrete); wl.position.set(-half - 0.25, hh / 2, 0); seg.add(wl)
      const wr = box(0.5, hh, 2.02, M.concrete); wr.position.set(half + 0.25, hh / 2, 0); seg.add(wr)
      if ((z - TUNNEL.s0) % 6 === 0) { const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.3), new THREE.MeshBasicMaterial({ color: 0xffd28a })); lamp.position.y = hh - 0.3; seg.add(lamp) }
      const sn = snowCap(half * 2 + 1.4, 2.04, 0.4); sn.position.y = hh + 0.4; seg.add(sn)
      g.add(seg)
    }
    // 入口の看板（高さ制限）
    const x0 = laneX(TUNNEL.s0, 'tunnel')
    const c = document.createElement('canvas'); c.width = 256; c.height = 96; const cx2 = c.getContext('2d'); cx2.fillStyle = '#1d4f9a'; cx2.fillRect(0, 0, 256, 96); cx2.fillStyle = '#fff'; cx2.font = '700 40px "Zen Kaku Gothic New", sans-serif'; cx2.textAlign = 'center'; cx2.fillText('幅 2.1m', 128, 62)
    const ct = new THREE.CanvasTexture(c); ct.colorSpace = THREE.SRGBColorSpace
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.68), new THREE.MeshStandardMaterial({ map: ct, roughness: 0.5 })); plate.rotation.y = Math.PI; plate.position.set(x0, height(x0, TUNNEL.s0) + hh + 0.85, TUNNEL.s0 - 0.3); g.add(plate)
    g.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true } }); scene.add(g); W.tunnel = g
  }
  // 露天風呂
  { const pxc = laneX(POOL.s, 'onsen') + POOL.du, y = height(pxc, POOL.s)
    const g = new THREE.Group(); g.position.set(pxc, y, POOL.s)
    const water = new THREE.Mesh(new THREE.CircleGeometry(1, 28), M.onsen); water.rotation.x = -Math.PI / 2; water.scale.set(POOL.rx, POOL.rz, 1); water.position.y = 0.12; g.add(water)
    for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), M.stone); s.position.set(Math.cos(a) * (POOL.rx + 0.3), 0.1, Math.sin(a) * (POOL.rz + 0.3)); s.rotation.set(i, i * 2, 0); s.castShadow = true; g.add(s) }
    const man = new THREE.Group(); man.position.set(0.8, -0.35, 1.2); man.rotation.y = Math.PI; g.add(man)
    const pp = new Person(man, { kind: 'character-male-e', anim: 'sit', noHat: true, noScarf: true, scale: 1.1 }); W.people.push(pp)
    const towel = box(0.32, 0.06, 0.24, new THREE.MeshStandardMaterial({ color: 0xf6f4ee, roughness: 1 })); towel.position.set(0, 1.22, 0); man.add(towel)
    const puffs = []; for (let i = 0; i < 5; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: W.steamTex, transparent: true, depthWrite: false, opacity: 0.45 })); g.add(sp); puffs.push(sp) }
    W.steams.push({ g, puffs, s: { R: POOL.rx } })
    scene.add(g); W.pool = g; W.onsenMan = man
  }
  // スキー場の大会の横断幕
  { const x = laneX(STAGE.s, 'resort'), y = height(x, STAGE.s)
    const c = document.createElement('canvas'); c.width = 1024; c.height = 160; const x2 = c.getContext('2d'); x2.fillStyle = '#f4efe2'; x2.fillRect(0, 0, 1024, 160); x2.fillStyle = '#b8261d'; x2.font = '900 92px "Zen Kaku Gothic New", sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText('巨大雪だるま大会', 512, 84)
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace
    const ban = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.25), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 })); ban.position.set(x, y + 4.3, STAGE.s + 1); ban.rotation.y = Math.PI
    scene.add(ban)
    for (const s of [-1, 1]) { const pole = box(0.16, 5, 0.16, M.woodDark); pole.position.set(x + s * 4.1, y + 2.5, STAGE.s + 1); scene.add(pole) }
  }
  // 校庭の子どもたち（雪の壁のうしろ）
  W.schoolKids = []
  for (const [s, du] of [[848, 5.3], [862, -5.3], [878, 5.3], [892, -5.2]]) { const x = laneX(s, 'school') + du, g = new THREE.Group(); g.position.set(x, height(x, s), s); g.rotation.y = du > 0 ? -Math.PI / 2 : Math.PI / 2; scene.add(g); const pp = new Person(g, { kind: ['character-male-a', 'character-female-b', 'character-male-c', 'character-female-d'][W.schoolKids.length], hat: W.schoolKids.length + 1, anim: 'idle', scale: 0.8 }); W.people.push(pp); W.schoolKids.push({ g, pp, s }) }
  // やきいも屋
  { const ob = OBJ.find(q => q.yakiimo); const g = new THREE.Group(); g.position.set(ob.x - 1.4, height(ob.x - 1.4, ob.z + 1), ob.z + 1); g.rotation.y = Math.PI / 2; scene.add(g); W.vendor = new Person(g, { kind: 'character-male-e', hat: 4, anim: 'idle' }); W.people.push(W.vendor); W.vendorG = g }
  // 終点: 子ども・頭・家
  { const g = new THREE.Group(); g.position.set(YARD.x + 1.6, height(YARD.x + 1.6, YARD.z + 1.5), YARD.z + 1.5); g.rotation.y = Math.PI - 0.5; scene.add(g)
    W.kid = new Person(g, { kind: 'character-female-b', hat: 0, anim: 'idle', scale: 0.82 }); W.people.push(W.kid); W.kidG = g
    W.homeHouse = makeHouse(1); W.homeHouse.position.set(YARD.house.x, height(YARD.house.x, YARD.house.z) - 0.2, YARD.house.z); W.homeHouse.rotation.y = -Math.PI / 2 - 0.25; W.homeHouse.traverse(n => { if (n.isMesh) { n.castShadow = true; n.receiveShadow = true } }); scene.add(W.homeHouse)
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.24, 12), M.ironBlue); bucket.position.set(YARD.x + 2.4, height(YARD.x + 2.4, YARD.z + 0.6) + 0.12, YARD.z + 0.6); bucket.castShadow = true; scene.add(bucket); W.bucket = bucket
  }
  return W
}
function forkLines(ob) {
  const N = { forest: '林 日陰', open: '斜面', ridge: '尾根 日なた', camp: '焚き火', creek: '沢 丸太橋', resort: 'スキー場', tunnel: 'トンネル', sunslope: '大斜面 日なた', onsen: '温泉', shrine: '参道 日陰', field: '雪原', school: '校庭' }
  // カメラは +z を向くので、x が小さい道が画面の右
  const [a, b] = ob.lanes
  return ['→ ' + N[a], N[b] + ' ←']
}
function flameTex() { const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 92, 2, 32, 80, 50); g.addColorStop(0, 'rgba(255,255,220,1)'); g.addColorStop(0.3, 'rgba(255,190,90,0.9)'); g.addColorStop(0.7, 'rgba(230,80,20,0.35)'); g.addColorStop(1, 'rgba(200,40,0,0)'); x.fillStyle = g; x.beginPath(); x.moveTo(32, 4); x.bezierCurveTo(60, 50, 60, 120, 32, 124); x.bezierCurveTo(4, 120, 4, 50, 32, 4); x.fill(); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t }
function glowTex() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t }
export function puffTex() { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); for (let i = 0; i < 7; i++) { const px = 20 + Math.random() * 24, py = 20 + Math.random() * 24, r = 10 + Math.random() * 12; const g = x.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64) } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t }

// ------------------------------------------------------------ 雪玉
export function makeBall() {
  let g = new THREE.IcosahedronGeometry(1, 5); g.deleteAttribute('uv'); g = mergeVertices(g); const p = g.attributes.position
  for (let i = 0; i < p.count; i++) { const v = new THREE.Vector3().fromBufferAttribute(p, i); const n = 1 + 0.035 * Math.sin(v.x * 7.3 + 1) * Math.sin(v.y * 6.1 + 2) * Math.sin(v.z * 5.7) + 0.02 * Math.sin(v.x * 17 + v.z * 13); v.multiplyScalar(n); p.setXYZ(i, v.x, v.y, v.z) }
  g.computeVertexNormals()
  // 継ぎ目の出ない UV（球の向きから）
  const uv = new Float32Array(p.count * 2); for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z); uv[i * 2] = 0.5 + Math.atan2(z, x) / (2 * Math.PI); uv[i * 2 + 1] = 0.5 + Math.asin(y / l) / Math.PI } g.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tx('snow_02_diff', 3, 1.5), normalMap: tx('snow_02_nor_gl', 3, 1.5), roughness: 0.88 })
  m.normalScale.set(1.1, 1.1)
  m.userData.u = { wet: { value: 0 } }
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, m.userData.u)
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float wet;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(vec3(0.95,0.96,0.99), diffuseColor.rgb * 1.05, 0.6) * mix(vec3(1.0), vec3(0.86,0.9,0.96), wet);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35, wet);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat fr = pow(1.0 - max(dot(normal, normalize(vViewPosition)), 0.0), 3.0);\ntotalEmissiveRadiance += vec3(0.24, 0.3, 0.4) * fr * 0.55;')
  }
  const mesh = new THREE.Mesh(g, m); mesh.castShadow = true; mesh.receiveShadow = true
  return mesh
}

// ------------------------------------------------------------ 粒（雪煙・きらめき・降る雪）
export function makeParticles(scene, n = 900) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n)
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(size, 1)); g.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1))
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, vertexColors: true,
    uniforms: { scale: { value: 600 } },
    vertexShader: 'attribute float size; attribute float alpha; varying float vA; varying vec3 vC; uniform float scale; void main(){ vA = alpha; vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d); if (r > 0.5) discard; float a = smoothstep(0.5, 0.0, r) * vA; gl_FragColor = vec4(vC, a); }',
  })
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts)
  const P = { pts, n, pos, col, size, alpha, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s0: new Float32Array(n), drag: new Float32Array(n), grav: new Float32Array(n), i: 0 }
  P.emit = (x, y, z, vx, vy, vz, life, s, c = [1, 1, 1], drag = 1.5, grav = 6) => {
    const k = P.i; P.i = (P.i + 1) % n
    pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z; P.vel[k * 3] = vx; P.vel[k * 3 + 1] = vy; P.vel[k * 3 + 2] = vz
    P.life[k] = life; P.max[k] = life; P.s0[k] = s; P.drag[k] = drag; P.grav[k] = grav; col[k * 3] = c[0]; col[k * 3 + 1] = c[1]; col[k * 3 + 2] = c[2]
  }
  P.update = dt => {
    for (let k = 0; k < n; k++) {
      if (P.life[k] <= 0) { alpha[k] = 0; continue }
      P.life[k] -= dt; const t = P.life[k] / P.max[k]
      const d = Math.exp(-P.drag[k] * dt)
      P.vel[k * 3] *= d; P.vel[k * 3 + 2] *= d; P.vel[k * 3 + 1] = P.vel[k * 3 + 1] * d - P.grav[k] * dt
      pos[k * 3] += P.vel[k * 3] * dt; pos[k * 3 + 1] += P.vel[k * 3 + 1] * dt; pos[k * 3 + 2] += P.vel[k * 3 + 2] * dt
      size[k] = P.s0[k] * (1.6 - 0.6 * t); alpha[k] = Math.min(1, t * 2.5) * 0.85
    }
    g.attributes.position.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.color.needsUpdate = true
  }
  return P
}
// 転がった跡（踏み固めた溝）
export function makeTrail(scene, n = 260) {
  const pos = new Float32Array(n * 2 * 3), al = new Float32Array(n * 2)
  const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2) }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('al', new THREE.BufferAttribute(al, 1)); g.setIndex(idx)
  const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, uniforms: {}, vertexShader: 'attribute float al; varying float vA; void main(){ vA = al; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(0.32, 0.42, 0.6, vA * 0.32); }' })
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh)
  const T = { mesh, n, pts: [], last: null }
  T.reset = () => { T.pts.length = 0; T.last = null; al.fill(0); g.attributes.al.needsUpdate = true }
  T.add = (x, z, r, dirx, dirz, on) => {
    if (T.last && Math.hypot(x - T.last[0], z - T.last[1]) < 0.5) return
    T.last = [x, z]; T.pts.push({ x, z, w: r * 0.75, nx: -dirz, nz: dirx, on }); if (T.pts.length > n) T.pts.shift()
    const N = T.pts.length
    for (let i = 0; i < N; i++) { const q = T.pts[i]; const y = height(q.x, q.z) + 0.03; pos.set([q.x + q.nx * q.w, y, q.z + q.nz * q.w, q.x - q.nx * q.w, y, q.z - q.nz * q.w], i * 6); const a = q.on ? Math.min(1, i / 30) : 0; al[i * 2] = a; al[i * 2 + 1] = a }
    for (let i = N; i < n; i++) { al[i * 2] = 0; al[i * 2 + 1] = 0 }
    g.attributes.position.needsUpdate = true; g.attributes.al.needsUpdate = true
  }
  return T
}
// 壊れた物の破片（板・雪のかたまり）
export function makeDebris(scene) {
  mats()
  const D = { list: [] }
  const plank = new THREE.BoxGeometry(1, 0.1, 0.22), chunk = new THREE.IcosahedronGeometry(0.3, 1)
  D.spawn = (x, y, z, kind, n, sp, dir) => {
    for (let i = 0; i < n; i++) {
      const snowy = kind === 'snow' || (kind !== 'wood' && Math.random() < 0.4)
      const m = new THREE.Mesh(snowy ? chunk : plank, snowy ? M.snow : (Math.random() < 0.5 ? M.wood : M.woodDark))
      const s = snowy ? 0.4 + Math.random() * 0.9 : 0.6 + Math.random() * 1.2; m.scale.setScalar(s); if (!snowy) m.scale.set(s, 1, 1)
      m.castShadow = true; m.position.set(x + (Math.random() - 0.5), y + Math.random() * 1.5, z + (Math.random() - 0.5)); scene.add(m)
      const f = sp * (0.4 + Math.random() * 0.6)
      D.list.push({ m, vx: dir[0] * f * 0.45 + (Math.random() - 0.5) * 9, vy: 4 + Math.random() * 8 + sp * 0.3, vz: dir[1] * f * 0.45 + (Math.random() - 0.65) * 8, wx: (Math.random() - 0.5) * 12, wz: (Math.random() - 0.5) * 12, life: 5 + Math.random() * 2 })
    }
  }
  D.fling = (obj, sp, dir) => { D.list.push({ m: obj, vx: dir[0] * sp * 0.7 + (Math.random() - 0.5) * 3, vy: 5 + sp * 0.3, vz: dir[1] * sp * 0.7, wx: (Math.random() - 0.5) * 8, wz: (Math.random() - 0.5) * 8, life: 6, keep: 1 }) }
  D.update = dt => {
    for (let i = D.list.length - 1; i >= 0; i--) {
      const d = D.list[i], m = d.m
      d.vy -= 18 * dt; m.position.x += d.vx * dt; m.position.y += d.vy * dt; m.position.z += d.vz * dt; m.rotation.x += d.wx * dt; m.rotation.z += d.wz * dt
      const gy = height(m.position.x, m.position.z)
      if (m.position.y < gy + 0.1) { m.position.y = gy + 0.1; d.vy = Math.abs(d.vy) * 0.3; d.vx *= 0.6; d.vz *= 0.6; d.wx *= 0.5; d.wz *= 0.5 }
      d.life -= dt
      if (d.life < 0 && !d.keep) { if (d.life < -1) { scene.remove(m); D.list.splice(i, 1) } else m.position.y -= dt * 0.4 }
      if (d.life < 0 && d.keep) D.list.splice(i, 1)
    }
  }
  return D
}
