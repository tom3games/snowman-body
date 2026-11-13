// 雪だるまの胴体になれ — 本体（画面・入力・演出・音・結末・絵日記）
import * as THREE from 'three'
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js'
import { ShaderPass } from '../vendor/jsm/postprocessing/ShaderPass.js'
import { TXT, ENDINGS } from './data.js?v=1'
import { S_END, OBJ, FIRES, STEAMS, BRANCHES, BRIDGE, TUNNEL, POOL, STAGE, SCHOOL, YARD, cx, height, lanesAt, laneOf, laneX, surfaceAt, clamp, rng } from './course.js?v=1'
import { newRun, step, DT, bodyRange } from './phys.js?v=1'
import { buildWorld, buildSky, buildBackdrop, makeBall, makeParticles, makeTrail, makeDebris, loadTextures, makeSnowman, puffTex } from './view.js?v=1'
import { loadChars, Person } from './chars.js?v=1'
import { makeBot, botInput } from './bot.js?v=1'

window.__jsUp = true
const V = '?v=1'
const $ = id => document.getElementById(id)
const Q = new URLSearchParams(location.search)
const isTouch = matchMedia('(pointer: coarse)').matches
const lowEnd = isTouch && Math.min(screen.width, screen.height) < 500
let lang = 'ja'
try { lang = Q.get('lang') || localStorage.getItem('snowman-lang') || ((navigator.language || 'ja').slice(0, 2) === 'ja' ? 'ja' : 'en') } catch (e) {}
const t = k => (TXT[lang][k] ?? TXT.ja[k])

// ------------------------------------------------------------ 描画の土台
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false })
renderer.setPixelRatio(Math.min(devicePixelRatio, lowEnd ? 1.3 : 1.75))
renderer.setSize(innerWidth, innerHeight)
renderer.outputColorSpace = THREE.SRGBColorSpace
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 1.05
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
$('view').appendChild(renderer.domElement)
const scene = new THREE.Scene()
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 2400)
const sky = buildSky(scene)
let backdrop = null
const hemi = new THREE.HemisphereLight(0xcfe0f5, 0x8a96a8, 0.9); scene.add(hemi)
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); scene.add(sun, sun.target)
const SUNDIR = new THREE.Vector3(0.55, 0.62, 0.56).normalize()
sun.castShadow = true
sun.shadow.mapSize.set(lowEnd ? 1024 : 2048, lowEnd ? 1024 : 2048)
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 120 })
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05
scene.fog = new THREE.Fog(0xdfe9f2, 60, 520)
// 空の色から周りの光を作る（影の側が真っ黒にならない）
const pmrem = new THREE.PMREMGenerator(renderer)
function makeEnv(top, hor) {
  const es = new THREE.Scene()
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { top: { value: new THREE.Color(top) }, hor: { value: new THREE.Color(hor) } }, vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'uniform vec3 top; uniform vec3 hor; varying vec3 vD; void main(){ float h = vD.y; vec3 c = h > 0.0 ? mix(hor, top, pow(h, 0.6)) : mix(hor, vec3(0.92,0.95,1.0), min(1.0, -h * 3.0)); gl_FragColor = vec4(c, 1.0); }' })
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m))
  const rt = pmrem.fromScene(es, 0.02); return rt.texture
}
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: lowEnd ? 0 : 4 }))
composer.setPixelRatio(renderer.getPixelRatio())
composer.addPass(new RenderPass(scene, camera))
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.35, 0.5, 0.95)
composer.addPass(bloom)
composer.addPass(new OutputPass())
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(innerWidth, innerHeight) }, cool: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; uniform float cool; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, 1.06);
      c.rgb += vec3(-0.01, 0.0, 0.025) * (1.0 - smoothstep(0.0, 0.6, l)) + vec3(-0.02, 0.0, 0.03) * cool;
      vec2 d = vUv - 0.5; float v = smoothstep(0.95, 0.35, length(d * vec2(1.1, 1.0)));
      c.rgb *= mix(0.72, 1.0, v);
      float g = fract(sin(dot(vUv * res + time, vec2(12.9898, 78.233))) * 43758.5453);
      c.rgb += (g - 0.5) * 0.016;
      gl_FragColor = c; }`,
})
composer.addPass(grade)
function onResize() {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); grade.uniforms.res.value.set(innerWidth, innerHeight)
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix()
  if (P) P.pts.material.uniforms.scale.value = innerHeight * 0.75
}
addEventListener('resize', onResize)

// ------------------------------------------------------------ 音
Snd.def({ wood: ['snd/wood1.mp3', 'snd/wood2.mp3', 'snd/wood3.mp3'], woodfall: 'snd/woodfall.mp3', rock: ['snd/rock1.mp3', 'snd/rock2.mp3', 'snd/rock3.mp3'], splash: ['snd/splash1.mp3', 'snd/splash2.mp3'], snowhit: 'snd/snowhit.mp3', steam: 'snd/steam.mp3', chime: 'snd/chime.mp3', click: 'snd/click.mp3', j_good: 'snd/j_good.mp3', j_bad: 'snd/j_bad.mp3', j_rare: 'snd/j_rare.mp3', rumble: 'snd/rumble.mp3', applause: 'snd/applause.mp3' })
try { Snd.muted = localStorage.getItem('snowman-mute') === '1' } catch (e) {}
function startAudio() {
  Snd.init()
  if (Snd.ctx && !Snd.loops.roll) { Snd.loop('roll', 'snd/roll_loop.wav', 0.0001, 0.3); Snd.loop('wind', 'snd/wind_loop.wav', 0.0001, 0.6); Snd.loop('fire', 'snd/fire_loop.wav', 0.0001, 0.4); Snd.loop('brook', 'snd/brook.mp3', 0.0001, 0.5); Snd.loop('kids', 'snd/kids.mp3', 0.0001, 0.5); Snd.loop('bgm', 'snd/bgm.mp3', 0.16, 1.5) }
}
function loopVol(slot, v, tc = 0.15) { const L = Snd.loops[slot]; if (L && L.node && Snd.ctx) L.g.gain.setTargetAtTime(Math.max(0.0001, v), Snd.ctx.currentTime, tc) }
function setMuteIcons() { for (const b of [$('bMute'), $('bMute2')]) { b.querySelector('.wave').style.display = Snd.muted ? 'none' : ''; b.querySelector('.x').style.display = Snd.muted ? '' : 'none' } }
for (const b of [$('bMute'), $('bMute2')]) b.onclick = () => { startAudio(); Snd.setMute(!Snd.muted); try { localStorage.setItem('snowman-mute', Snd.muted ? '1' : '0') } catch (e) {} setMuteIcons() }

// ------------------------------------------------------------ 状態
const G = { state: 'load', run: null, inp: { steer: 0, brake: 0 }, keys: new Set(), btn: { L: 0, R: 0, B: 0 }, acc: 0, last: 0, prev: null, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camDir: new THREE.Vector3(0, 0, 1), shake: 0, hitStop: 0, bubQ: [], bub: null, endT: 0, endKey: null, seen: {}, zukan: {}, paused: false, bot: null, tut: 0, runs: 0, fx: [] }
window.snow = G
try { G.zukan = JSON.parse(localStorage.getItem('snowman-zukan') || '{}') } catch (e) { G.zukan = {} }
try { G.runs = +(localStorage.getItem('snowman-runs') || 0) } catch (e) {}
let W = null, ball = null, P = null, trail = null, D = null, fallSnow = null, sparkle = null
const ballQ = new THREE.Quaternion()

// ------------------------------------------------------------ 読み込み
let ldN = 0; const ldMax = 16 + 5 + 1
function ldStep() { ldN++; $('ldBar').firstElementChild.style.width = Math.min(100, ldN / ldMax * 100) + '%' }
async function boot() {
  applyLang()
  const fontP = document.fonts ? Promise.race([document.fonts.load('700 20px "Zen Kaku Gothic New"'), new Promise(r => setTimeout(r, 2500))]).catch(() => {}) : Promise.resolve()
  const M = n => window.__mark && window.__mark(n); M('start')
  await loadTextures(V, ldStep); M('tex')
  W = buildWorld(scene); ldStep(); M('world')
  ball = makeBall(); scene.add(ball)
  P = makeParticles(scene, lowEnd ? 700 : 1100); P.pts.material.uniforms.scale.value = innerHeight * 0.75
  trail = makeTrail(scene); D = makeDebris(scene)
  fallSnow = makeFallingSnow(); sparkle = null
  for (let i = 0; i < 5; i++) ldStep()
  setWeather('sunny')
  G.run = newRun(1, { weather: 'sunny' }); placeBall(true)
  enter('title'); M('weather')
  renderer.compile(scene, camera); M('compile')
  window.__snowReady = true
  setTimeout(() => loadChars(V), 50)  // 人は最初の画面のあとで読む（届くまでは仮の形）
  const l = $('loading'); l.style.opacity = '0'; setTimeout(() => l.remove(), 450)
}
setTimeout(() => { const l = $('loading'); if (l && G.state === 'load') { l.style.opacity = '0' } }, 12000)

// ------------------------------------------------------------ 天気
const WX = {
  sunny: { top: 0x3576c6, hor: 0xe3edf6, fog: 0xdde8f2, sun: 2.6, hemi: 0.85, sunAmt: 1, exp: 1.05 },
  cloudy: { top: 0x8a9bb0, hor: 0xd7dee7, fog: 0xd2dae4, sun: 1.0, hemi: 1.35, sunAmt: 0.15, exp: 1.1 },
  snowing: { top: 0x9aa6b6, hor: 0xd9e0e8, fog: 0xcfd7e1, sun: 0.7, hemi: 1.45, sunAmt: 0.05, exp: 1.12 },
}
const ENVC = {}, BDC = {}
function setWeather(w) {
  const c = WX[w]
  sky.material.uniforms.top.value.set(c.top); sky.material.uniforms.hor.value.set(c.hor); sky.material.uniforms.sunAmt.value = c.sunAmt
  scene.fog.color.set(c.fog); scene.fog.near = w === 'snowing' ? 30 : 60; scene.fog.far = w === 'snowing' ? 300 : 520
  sun.intensity = c.sun; hemi.intensity = c.hemi * 0.6; renderer.toneMappingExposure = c.exp
  ENVC[w] = ENVC[w] || makeEnv(c.top, c.hor); scene.environment = ENVC[w]; scene.environmentIntensity = 0.75  // 天気ごとに1回だけ作る
  if (W) W.terrainMat.userData.u.sunAmt.value = w === 'sunny' ? 1 : 0.25
  if (backdrop) backdrop.visible = false
  BDC[w] = BDC[w] || buildBackdrop(scene, w); backdrop = BDC[w]; backdrop.visible = true
  if (fallSnow) fallSnow.visible = w === 'snowing'
  grade.uniforms.cool.value = w === 'sunny' ? 0 : 1
}
function makeFallingSnow() {
  const n = lowEnd ? 600 : 1400, pos = new Float32Array(n * 3), R = rng(4)
  for (let i = 0; i < n; i++) { pos[i * 3] = (R() - 0.5) * 60; pos[i * 3 + 1] = R() * 30; pos[i * 3 + 2] = (R() - 0.5) * 60 }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.85, depthWrite: false, map: (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); return new THREE.CanvasTexture(c) })() })
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.visible = false; scene.add(p); p.userData.pos = pos
  return p
}

// ------------------------------------------------------------ 言葉
function applyLang() {
  document.documentElement.lang = lang
  $('tH1').textContent = t('title1'); $('tH2').textContent = t('title2'); $('tK').innerHTML = t('titleK')
  $('bStartT').textContent = t('start'); $('bHow').textContent = t('how'); $('bLang').textContent = t('lang')
  if ($('ldTxt')) $('ldTxt').textContent = t('loading'); $('hK').textContent = t('toGo')
  $('bLT').textContent = t('btnL'); $('bRT').textContent = t('btnR'); $('bBT').textContent = t('btnB')
  $('bAgain').textContent = t('again'); $('bSave').textContent = t('save'); $('bPost').textContent = t('post'); $('bZukan2').textContent = t('toZukan'); $('bBack').textContent = t('back')
  $('howH').textContent = t('howH'); $('howBody').innerHTML = t('howBody').map(s => `<li>${s}</li>`).join(''); $('howCred').textContent = t('howCred'); $('howClose').textContent = t('close')
  $('zH').textContent = t('zukanH'); $('zClose').textContent = t('close')
  $('keys').textContent = '← → / A D　↓ / S / Space'
  refreshTitle()
}
function zCount() { return ENDINGS.filter(e => G.zukan[e.key]).length }
function refreshTitle() {
  $('bZukan').innerHTML = `${t('zukan')} <b>${t('zcount')(zCount(), ENDINGS.length)}</b>`
  const b = G.zukan.body
  $('tBest').textContent = b ? `${t('endName').body} ×${b.n}` : ''
}
$('bLang').onclick = () => { lang = lang === 'ja' ? 'en' : 'ja'; try { localStorage.setItem('snowman-lang', lang) } catch (e) {} applyLang() }
$('bHow').onclick = () => { $('how').hidden = false }
$('howClose').onclick = () => { $('how').hidden = true }
function openZukan() {
  $('zGrid').innerHTML = ENDINGS.map(e => { const z = G.zukan[e.key]; return `<div class="z ${z ? '' : 'no'} ${e.rare ? 'rare' : ''} ${e.good && z ? 'good' : ''}"><b>${z ? t('endName')[e.key] : t('unknown')}</b><i>${z ? `×${z.n}` : t('endHint')[e.key]}</i></div>` }).join('')
  $('zukan').hidden = false
}
$('bZukan').onclick = openZukan; $('bZukan2').onclick = openZukan
$('zClose').onclick = () => { $('zukan').hidden = true }

// ------------------------------------------------------------ 画面の切り替え
function enter(s) {
  G.state = s
  $('vTitle').hidden = s !== 'title'; $('vPlay').hidden = !(s === 'play' || s === 'ending'); $('vEnd').hidden = s !== 'result'
  $('pad').style.visibility = s === 'play' ? 'visible' : 'hidden'
  $('vPlay').classList.toggle('cine', s === 'ending')
  $('keys').hidden = !(s === 'play' && !isTouch)
  if (s === 'title') { refreshTitle(); G.titleT = 0 }
}
$('bStart').onclick = () => { startAudio(); Snd.play('click', { vol: 0.5 }); startRun() }
$('bAgain').onclick = () => { startAudio(); Snd.play('click', { vol: 0.5 }); startRun() }
$('bBack').onclick = () => { resetWorld(); G.run = newRun(1, { weather: G.run.weather }); placeBall(true); enter('title') }

function startRun(seed) {
  resetWorld()
  const sd = seed ?? (Q.get('seed') ? +Q.get('seed') + G.runs : (Date.now() % 1000003))
  const o = {}; if (Q.get('w')) o.weather = Q.get('w'); if (Q.get('h')) o.headR = +Q.get('h')
  G.run = newRun(sd, o); G.runs++; try { localStorage.setItem('snowman-runs', G.runs) } catch (e) {}
  setWeather(G.run.weather)
  G.acc = 0; G.prev = null; G.shake = 0; G.hitStop = 0; G.bubQ.length = 0; hideBub(); G.seen = {}; G.endKey = null
  G.inp.steer = 0; G.inp.brake = 0; G.btn.L = G.btn.R = G.btn.B = 0
  ballQ.identity(); placeBall(true); trail.reset()
  placeKidHead()
  setupGauge()
  $('wx').innerHTML = wxIcon(G.run.weather) + `<span>${t('weather')[G.run.weather]}</span>`
  G.tut = G.runs <= 2 ? 6 : 0; $('tutT').textContent = isTouch ? t('tutSP') : t('tutPC'); $('tut').style.opacity = G.tut ? 1 : 0
  enter('play')
  if (window.TM) TM.start()
  setTimeout(() => { if (G.state === 'play') { radio(t('bub').start) } }, 700)
  G.t0 = performance.now()
}
function wxIcon(w) {
  if (w === 'sunny') return '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="4.5" fill="#f2a52a"/><g stroke="#f2a52a" stroke-width="1.8" stroke-linecap="round"><path d="M10 1.5v2.5M10 16v2.5M1.5 10h2.5M16 10h2.5M4 4l1.7 1.7M14.3 14.3L16 16M4 16l1.7-1.7M14.3 5.7L16 4"/></g></svg>'
  if (w === 'cloudy') return '<svg viewBox="0 0 20 20"><path d="M5 15a3.5 3.5 0 0 1 .5-7 5 5 0 0 1 9.3 1.2A3 3 0 0 1 15 15z" fill="#9aa8ba"/></svg>'
  return '<svg viewBox="0 0 20 20"><path d="M5 11a3.5 3.5 0 0 1 .5-7 5 5 0 0 1 9.3 1.2A3 3 0 0 1 15 11z" fill="#9aa8ba"/><g fill="#5a7aa0"><circle cx="6" cy="15" r="1.3"/><circle cx="10" cy="17" r="1.3"/><circle cx="14" cy="15" r="1.3"/></g></svg>'
}

// ------------------------------------------------------------ 入力（ボタンの位置は固定）
const KEYMAP = { ArrowLeft: 'L', a: 'L', A: 'L', ArrowRight: 'R', d: 'R', D: 'R', ArrowDown: 'B', s: 'B', S: 'B', ' ': 'B' }
addEventListener('keydown', e => { const k = KEYMAP[e.key]; if (k) { G.keys.add(k); if (G.state === 'play') e.preventDefault() } if (e.key === 'Enter' && (G.state === 'title' || G.state === 'result') && $('how').hidden && $('zukan').hidden) { startAudio(); startRun() } })
addEventListener('keyup', e => { const k = KEYMAP[e.key]; if (k) G.keys.delete(k) })
addEventListener('blur', () => { G.keys.clear(); G.btn.L = G.btn.R = G.btn.B = 0 })
for (const [id, k] of [['bL', 'L'], ['bR', 'R'], ['bB', 'B']]) {
  const b = $(id)
  const on = e => { e.preventDefault(); startAudio(); G.btn[k] = 1; b.classList.add('on'); try { b.setPointerCapture(e.pointerId) } catch (er) {} }
  const off = e => { G.btn[k] = 0; b.classList.remove('on') }
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off)
}
function readInput() {
  if (G.bot) return botInput(G.bot, G.run)
  const L = G.keys.has('L') || G.btn.L, R = G.keys.has('R') || G.btn.R
  const target = (R ? 1 : 0) - (L ? 1 : 0)
  G.inp.steer += clamp(target - G.inp.steer, -DT * 7, DT * 7)
  G.inp.brake = G.keys.has('B') || G.btn.B ? 1 : 0
  return G.inp
}

// ------------------------------------------------------------ 大きさの柱
const GMAX = 2.4
const gy = r => Math.sqrt(clamp(r, 0, GMAX) / GMAX) // 0..1（下から）
function setupGauge() {
  const [lo, hi] = bodyRange(G.run.headR)
  const band = $('pBand'); band.style.bottom = (gy(lo) * 100) + '%'; band.style.height = ((gy(hi) - gy(lo)) * 100) + '%'
  $('pBandT').textContent = t('bodyBand'); $('post').dataset.k = t('postK')
  const head = G.run.headR
  $('pMarks').innerHTML = `<div class="mk" style="bottom:${gy(head) * 100}%"></div>
    <svg class="ic" style="bottom:${gy(head) * 100}%;transform:translateY(50%)" viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" fill="#fff" stroke="#24344c" stroke-width="1.5"/><circle cx="8" cy="10" r="1.1" fill="#24344c"/><circle cx="14" cy="10" r="1.1" fill="#24344c"/><path d="M11 12l4 1.2-4 .8z" fill="#e8701e"/></svg>
    <div class="mk" style="bottom:${gy(1.9) * 100}%"></div>
    <svg class="ic" style="bottom:${gy((hi + 1.9) / 2) * 100}%;transform:translateY(50%)" viewBox="0 0 22 22"><path d="M3 19V10l8-6 8 6v9z" fill="#c7362c" stroke="#5a1a14" stroke-width="1.4" stroke-linejoin="round"/><path d="M9 19v-5h4v5" fill="#fff"/></svg>
    <svg class="ic" style="bottom:${gy(2.15) * 100}%;transform:translateY(50%)" viewBox="0 0 22 22"><path d="M1 18L8 6l4 6 3-4 6 10z" fill="#fff" stroke="#24344c" stroke-width="1.4" stroke-linejoin="round"/><path d="M2 18q5-5 10-1t9-2" stroke="#7ab3e8" stroke-width="2" fill="none"/></svg>`
}
let lastR = 0, trendT = 0, trend = 0
function updateGauge(dt) {
  const r = G.run.b.r, [lo, hi] = bodyRange(G.run.headR)
  const c = $('pCur'); c.style.bottom = (gy(r) * 100) + '%'
  const d = r - lastR; lastR = r; trendT += dt
  if (trendT > 0.25) { trendT = 0; c.classList.toggle('dn', trend < -0.0015); c.classList.toggle('up', trend > 0.0015); trend = 0 } else trend += d
  c.classList.toggle('ok', r >= lo && r <= hi)
  const cm = Math.round(r * 200)
  $('sizeT').textContent = t('size')(cm >= 100 ? (cm / 100).toFixed(1) + 'm' : cm + 'cm')
  $('hN').textContent = Math.max(0, Math.round(S_END - G.run.b.z))
}
function diam(r) { const cm = Math.round(r * 200); return cm >= 100 ? (cm / 100).toFixed(1) + 'm' : cm + 'cm' }

// ------------------------------------------------------------ 吹き出し（1つずつ）
function say(text, pos, o = {}) { if (G.bubQ.length > 2) return; G.bubQ.push({ text, pos: pos ? pos.clone() : null, radio: !!o.radio, ttl: 0.9 + text.length * 0.09 + (o.extra || 0) }) }
function radio(text) { Snd.play('chime', { vol: 0.35, jitter: 0 }); say(text, null, { radio: 1, extra: 0.6 }) }
function hideBub() { $('bub').classList.remove('on'); G.bub = null }
const _v = new THREE.Vector3()
function updateBub(dt) {
  if (!G.bub && G.bubQ.length) { G.bub = G.bubQ.shift(); const el = $('bub'); el.textContent = G.bub.text; el.classList.toggle('radio', G.bub.radio); el.classList.add('on') }
  if (!G.bub) return
  G.bub.ttl -= dt; const el = $('bub')
  if (G.bub.pos) { _v.copy(G.bub.pos).project(camera); if (_v.z > 1) { el.style.opacity = 0 } else { const hw = el.offsetWidth / 2 + 10, right = innerWidth - (G.state === 'play' ? 70 : 0); el.style.opacity = ''; el.style.left = clamp((_v.x * 0.5 + 0.5) * innerWidth, hw, Math.max(hw, right - hw)) + 'px'; el.style.top = clamp((-_v.y * 0.5 + 0.5) * innerHeight - 10, 150, innerHeight - 190) + 'px' } }
  else { el.style.left = '50%'; el.style.top = 'calc(96px + env(safe-area-inset-top))'; el.style.opacity = '' }
  if (G.bub.ttl < 0) hideBub()
}
function pop(text, bad) { const el = $('pop'); el.textContent = text; el.classList.remove('on'); void el.offsetWidth; el.classList.add('on'); el.style.color = bad ? '#cfe6ff' : '#fff' }

// ------------------------------------------------------------ 世界のリセット（壊した物を戻す）
const saved = new Map()
function remember(o) { if (o && !saved.has(o)) saved.set(o, { p: o.position.clone(), r: o.rotation.clone(), s: o.scale.clone(), parent: o.parent }) }
function resetWorld() {
  if (!W) return
  for (const [o, s] of saved) { o.position.copy(s.p); o.rotation.copy(s.r); o.scale.copy(s.s); o.visible = true; if (o.parent !== s.parent && s.parent) s.parent.add(o) }
  for (const d of D.list) { if (!d.keep) scene.remove(d.m) } D.list.length = 0
  for (const t2 of OBJ.filter(q => q.kind === 'tree')) { const h = W.objs[t2.i]; if (h && h.inst) h.inst.setMatrixAt(h.k, h.base) }
  W.treesInst.instanceMatrix.needsUpdate = true
  for (const f of W.fires) { f.fl.visible = true; f.gl.visible = true }
  for (const m of G.fx) scene.remove(m); G.fx.length = 0
  if (W.kid) W.kid.play('idle', true)
  W.vendor && W.vendor.play('idle', true)
  for (const k of W.schoolKids) k.pp.play('idle', true)
  ball.visible = true; ball.scale.setScalar(1)
  ball.material.userData.u.wet.value = 0
}

// ------------------------------------------------------------ 雪玉を置く・動かす
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3()
function placeBall(snap) {
  const b = G.run.b
  ball.position.set(b.x, height(b.x, b.z) + b.r * 0.93, b.z); ball.scale.setScalar(b.r)
  if (snap) { G.camDir.set(0, 0, 1); camSnap() }
}
function ballVisual(alpha) {
  const b = G.run.b, pv = G.prev || b
  const x = pv.x + (b.x - pv.x) * alpha, z = pv.z + (b.z - pv.z) * alpha, r = pv.r + (b.r - pv.r) * alpha
  // 転がり: 進んだ距離 / 半径 だけ回す
  const dx = x - ball.position.x, dz = z - ball.position.z, dist = Math.hypot(dx, dz)
  if (dist > 1e-5 && dist < 5) { _ax.set(dz, 0, -dx).normalize(); _q.setFromAxisAngle(_ax, dist / Math.max(0.05, r)); ballQ.premultiply(_q); ball.quaternion.copy(ballQ) }
  ball.position.set(x, height(x, z) + r * 0.93, z); ball.scale.setScalar(r)
}

// ------------------------------------------------------------ カメラ
function camSnap() { const b = ball.position; G.camPos.set(b.x, b.y + 3, b.z - 7); G.camLook.copy(b); camera.position.copy(G.camPos); camera.lookAt(G.camLook) }
function camFollow(dt) {
  const b = G.run.b, r = b.r
  const sp = Math.hypot(b.vx, b.vz)
  const dcx = (cx(b.z + 4) - cx(b.z - 4)) / 8
  // 進む向き（速さの向きと道の向きを混ぜてぶれを減らす）
  _p.set(b.vx / (sp || 1), 0, b.vz / (sp || 1)).multiplyScalar(0.55).add(_v.set(dcx, 0, 1).normalize().multiplyScalar(0.45)).normalize()
  G.camDir.lerp(_p, 1 - Math.exp(-dt * 2.5)).normalize()
  const portrait = innerWidth / innerHeight < 0.8
  const dist = (portrait ? 6.2 : 5.4) + r * 3.4, hh = (portrait ? 3.2 : 2.6) + r * 1.9
  const want = _p.copy(ball.position).addScaledVector(G.camDir, -dist); want.y = Math.max(height(want.x, want.z) + 1.2, ball.position.y + hh)
  // スノーシェッドの中は屋根の下に
  const ln = laneOf(b.x, b.z)
  if (ln && ln.key === 'tunnel' && b.z > TUNNEL.s0 - 8 && b.z < TUNNEL.s1 + 2) { const k = clamp((b.z - (TUNNEL.s0 - 8)) / 6, 0, 1); want.copy(ball.position).addScaledVector(G.camDir, -(dist * (1 - k) + 3.2 * k)); want.y = height(want.x, want.z) + (hh + 0.8) * (1 - k) + 2.7 * k }
  G.camPos.lerp(want, 1 - Math.exp(-dt * 5))
  const look = _v.copy(ball.position).addScaledVector(G.camDir, 7 + r * 2); look.y = ball.position.y + 0.3 - 1.0
  G.camLook.lerp(look, 1 - Math.exp(-dt * 6))
  camera.position.copy(G.camPos)
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; G.shake = Math.max(0, G.shake - dt * 2.2) }
  camera.lookAt(G.camLook)
  const fov = (portrait ? 70 : 58) + clamp(sp - 8, 0, 14) * 0.45
  camera.fov += (fov - camera.fov) * (1 - Math.exp(-dt * 3)); camera.updateProjectionMatrix()
}

// ------------------------------------------------------------ 出来事（当たった・壊した・溶けた）
const LINES = { barn: 'barn', skier: 'skier', lift: 'lift', cart: 'yakiimo' }
function onEvent(e) {
  const b = G.run.b, at = new THREE.Vector3(b.x, ball.position.y + b.r, b.z)
  if (e.k === 'smash') {
    const o = OBJ[e.o], m = W.objs[e.o], dir = [b.vx / (b.sp || 1), b.vz / (b.sp || 1)]
    const big = /hut|barn|house|lift/.test(e.kind)
    G.shake = Math.max(G.shake, big ? 0.9 : 0.35); G.hitStop = big ? 0.09 : 0.04
    snowBurst(o.x, height(o.x, o.z) + 0.6, o.z, big ? 60 : 24, 6 + e.sp * 0.4)
    if (e.kind === 'tree') { const h = W.objs[e.o]; const mesh = new THREE.Mesh(W.treesInst.geometry, W.treesInst.material); h.inst.getMatrixAt(h.k, mesh.matrix); mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale); h.inst.setMatrixAt(h.k, new THREE.Matrix4().makeScale(0, 0, 0)); W.treesInst.instanceMatrix.needsUpdate = true; mesh.castShadow = true; scene.add(mesh); G.fx.push(mesh); D.fling(mesh, e.sp, dir); Snd.play('woodfall', { vol: 0.8 }); Snd.play('snowhit', { vol: 0.7 }) }
    else if (m) {
      remember(m)
      if (e.kind === 'snowman') { m.visible = false; D.spawn(o.x, height(o.x, o.z) + 0.5, o.z, 'snow', 7, e.sp, dir); Snd.play('snowhit', { vol: 0.9 }); if (!G.seen.man && G.run.rare < 0.18) { G.seen.man = 1; spawnMan(o) } }
      else if (e.kind === 'skier') { D.fling(m, e.sp, dir); if (m.userData.person) m.userData.person.play('fall', true); Snd.play('snowhit', { vol: 0.8 }); if (!G.seen.skier) { G.seen.skier = 1; say(t('bub').skier, at.clone().add(new THREE.Vector3(0, 1.5, 0))) } }
      else if (e.kind === 'sign') { D.fling(m, e.sp, dir); Snd.play('wood', { vol: 0.8 }) }
      else { m.visible = false; D.spawn(o.x, height(o.x, o.z) + (big ? 1.5 : 0.6), o.z, big ? 'mix' : 'wood', big ? 22 : 7, e.sp, dir); Snd.play('wood', { vol: 1 }); if (big) { Snd.play('rumble', { vol: 0.6 }); Snd.play('woodfall', { vol: 0.9, delay: 0.1 }) } }
      const ln = LINES[e.kind]; if (ln && !G.seen[ln]) { G.seen[ln] = 1; say(t('bub')[ln], new THREE.Vector3(o.x, height(o.x, o.z) + 3, o.z)) }
    }
    if (window.navigator.vibrate && isTouch) try { navigator.vibrate(big ? 40 : 15) } catch (er) {}
  } else if (e.k === 'bump') {
    const o = OBJ[e.o]
    if (e.kind === 'rock' || e.kind === 'post' || e.kind === 'lantern' || e.kind === 'house') {
      snowBurst(b.x - e.nx * b.r, ball.position.y, b.z - e.nz * b.r, 30, 7); Snd.play('rock', { vol: 0.8 }); Snd.play('snowhit', { vol: 0.6 }); G.shake = Math.max(G.shake, 0.45); G.hitStop = 0.05
      pop('-' + Math.round(-e.dr * 200) + 'cm', true)
      if ((e.kind === 'lantern' || e.kind === 'post') && !G.seen.shrine) { G.seen.shrine = 1; say(t('bub').shrine, new THREE.Vector3(o.x, height(o.x, o.z) + 2.5, o.z)) }
    } else if (e.kind === 'tree') {
      // 枝の雪がどさっと落ちてくる
      for (let i = 0; i < 40; i++) P.emit(b.x + (Math.random() - 0.5) * 2, ball.position.y + b.r + 2 + Math.random() * 3, b.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, -2, (Math.random() - 0.5) * 2, 1.0, 0.35 + Math.random() * 0.4, [1, 1, 1], 0.5, 9)
      Snd.play('snowhit', { vol: 0.9 }); pop('+' + Math.round(e.dr * 200) + 'cm'); G.shake = Math.max(G.shake, 0.25)
    } else { Snd.play('wood', { vol: 0.5 }); G.shake = Math.max(G.shake, 0.2) }
  } else if (e.k === 'sizzle' || e.k === 'douse') {
    const o = OBJ[e.o]; steamBurst(o.x, height(o.x, o.z) + 0.8, o.z, e.k === 'douse' ? 40 : 18); Snd.play('steam', { vol: 0.7 })
    if (e.k === 'douse') { const f = W.fires.find(q => q.ob === o); if (f) { f.fl.visible = false; f.gl.visible = false } if (!G.seen.douse) { G.seen.douse = 1; say(t('bub').douse, new THREE.Vector3(o.x, height(o.x, o.z) + 2.5, o.z)) } }
  } else if (e.k === 'splash') {
    for (let i = 0; i < 60; i++) P.emit(b.x, ball.position.y - b.r * 0.5, b.z, (Math.random() - 0.5) * 8, 4 + Math.random() * 6, (Math.random() - 0.5) * 8, 1.1, 0.25 + Math.random() * 0.3, [0.7, 0.85, 0.95], 1, 12)
    Snd.play('splash', { vol: 1 }); pop('-' + Math.round(G.run.b.r * 0.38 / 0.62 * 200) + 'cm', true); G.shake = 0.5
  } else if (e.k === 'bridge') {
    if (W.bridge) { remember(W.bridge); for (const c of [...W.bridge.children]) { remember(c); scene.attach(c); G.fx.push(c); D.fling(c, 8, [(Math.random() - 0.5), 1]) } }
    Snd.play('wood', { vol: 1 }); Snd.play('woodfall', { vol: 1 }); say(t('bub').bridge, at.clone().add(new THREE.Vector3(0, 2, 0)))
  } else if (e.k === 'throw') {
    throwAt()
  } else if (e.k === 'tunnelIn') {
    if (!G.seen.tunnelOk && b.r > 0.75) { G.seen.tunnelOk = 1; say(t('bub').tunnelOk, at.clone().add(new THREE.Vector3(0, 2, 0))) }
  } else if (e.k === 'end') {
    beginEnding(e.key)
  }
}
function snowBurst(x, y, z, n, sp) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = sp * (0.3 + Math.random() * 0.7); P.emit(x, y, z, Math.cos(a) * v, 2 + Math.random() * sp * 0.7, Math.sin(a) * v, 0.9 + Math.random() * 0.6, 0.3 + Math.random() * 0.5, [1, 1, 1], 1.4, 8) } }
function steamBurst(x, y, z, n) { for (let i = 0; i < n; i++) P.emit(x + (Math.random() - 0.5), y, z + (Math.random() - 0.5), (Math.random() - 0.5) * 1.5, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5, 1.6, 0.8 + Math.random() * 0.8, [0.92, 0.94, 0.97], 0.8, -0.5) }
function spawnMan(o) {
  // 雪だるまの中から、おじさん
  const g = new THREE.Group(); g.position.set(o.x, height(o.x, o.z), o.z); g.rotation.y = Math.PI; scene.add(g); G.fx.push(g)
  const pp = new Person(g, { kind: 'character-male-e', hat: 3, anim: 'idle' }); W.people.push(pp)
  say(t('bub').man, new THREE.Vector3(o.x, height(o.x, o.z) + 2.2, o.z))
}
const thrown = []
function throwAt() {
  const b = G.run.b
  let best = null, bd = 1e9; for (const k of W.schoolKids) { const d = Math.abs(k.s - b.z); if (d < bd) { bd = d; best = k } }
  if (!best) return
  best.pp.play('attack-melee-right', true)
  const from = best.g.position.clone().add(new THREE.Vector3(0, 1.2, 0))
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.14, 2), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 })); m.position.copy(from); m.castShadow = true; scene.add(m)
  thrown.push({ m, from, t: 0 })
  if (!G.seen.school) { G.seen.school = 1; say(t('bub').school, from.clone().add(new THREE.Vector3(0, 1.4, 0))) }
}
function updateThrown(dt) {
  for (let i = thrown.length - 1; i >= 0; i--) {
    const q = thrown[i]; q.t += dt * 2.2
    const to = ball.position, k = Math.min(1, q.t)
    q.m.position.lerpVectors(q.from, to, k); q.m.position.y += Math.sin(k * Math.PI) * 2.5
    if (k >= 1) { scene.remove(q.m); thrown.splice(i, 1); snowBurst(to.x, to.y + G.run.b.r * 0.6, to.z, 14, 3); Snd.play('snowhit', { vol: 0.8 }); pop('+' + Math.round(SCHOOL.add * 200) + 'cm') }
  }
}

// ------------------------------------------------------------ 毎コマの見た目
let rollTimer = 0
function updateFx(dt, now) {
  const b = G.run.b, sp = b.sp, r = b.r
  const sf = surfaceAt(b.x, b.z)
  // 雪煙（速さと大きさで増える。土・石では茶色・少なめ）
  if (G.state === 'play' && sp > 1.5) {
    const snowy = !(sf.type === 'dirt' || sf.type === 'stone')
    const n = Math.min(10, Math.floor((sp * 0.35 + r * 3) * (snowy ? 1 : 0.35) * dt * 60 * 0.25 + Math.random()))
    for (let i = 0; i < n; i++) {
      const side = (Math.random() - 0.5) * 2 * r * 0.9
      const ux = b.vx / sp, uz = b.vz / sp
      const x = b.x - ux * r * 0.6 + uz * side, z = b.z - uz * r * 0.6 - ux * side
      const c = snowy ? (sf.sun ? [1, 0.98, 0.95] : [0.93, 0.96, 1]) : [0.55, 0.45, 0.38]
      P.emit(x, height(x, z) + 0.1, z, -ux * sp * 0.15 + uz * side * 1.5 + (Math.random() - 0.5), 1 + Math.random() * (1.5 + sp * 0.12 + r * 0.8), -uz * sp * 0.15 - ux * side * 1.5 + (Math.random() - 0.5), 0.6 + Math.random() * 0.5, 0.18 + r * 0.25 + Math.random() * 0.2, c, 2.2, 3.5)
    }
    // 日なたで溶けるしずく
    if (sf.sun && G.run.weather === 'sunny' && Math.random() < dt * 20) P.emit(b.x + (Math.random() - 0.5) * r, ball.position.y - r * 0.3, b.z + (Math.random() - 0.5) * r, 0, -1, 0, 0.5, 0.08, [0.7, 0.85, 1], 0.2, 10)
  }
  trail.add(b.x, b.z, r, b.vx / (sp || 1), b.vz / (sp || 1), !(sf.type === 'dirt' || sf.type === 'stone'))
  ball.material.userData.u.wet.value += ((sf.sun && G.run.weather !== 'snowing' ? 1 : 0) - ball.material.userData.u.wet.value) * Math.min(1, dt * 2)
  // 焚き火: 近い2つに光を当て、炎をゆらす
  let near = W.fires.map(f => ({ f, d: Math.hypot(f.ob.x - b.x, f.ob.z - b.z) })).sort((a, c) => a.d - c.d)
  W.fireLights.forEach((l, i) => { const n = near[i]; if (n && n.d < 40 && n.f.fl.visible) { l.position.set(n.f.ob.x, height(n.f.ob.x, n.f.ob.z) + 1.2, n.f.ob.z); l.intensity = 6 + Math.sin(now * 0.017 + i) * 1.5 + Math.random() } else l.intensity = 0 })
  for (const f of W.fires) { if (Math.abs(f.ob.z - b.z) > 80) continue; const k = 1 + Math.sin(now * 0.02 + f.ob.i) * 0.08 + Math.random() * 0.06; f.fl.scale.set(1.1 * k, 1.6 * (2 - k), 1); if (Math.random() < dt * 8) P.emit(f.ob.x, height(f.ob.x, f.ob.z) + 1.3, f.ob.z, (Math.random() - 0.5) * 0.6, 2 + Math.random() * 2, (Math.random() - 0.5) * 0.6, 1.2, 0.06, [1.6, 0.8, 0.3], 0.3, -0.5) }
  // 湯けむり
  for (const s of W.steams) { if (Math.abs(s.g.position.z - b.z) > 90) continue; s.puffs.forEach((p, i) => { const ph = ((now * 0.00025 + i / s.puffs.length) % 1); p.position.set(Math.sin(i * 2.3 + now * 0.0004) * 0.6, 0.3 + ph * 4.5, Math.cos(i * 1.7) * 0.5); const sc = 1.2 + ph * 3.5; p.scale.set(sc, sc, 1); p.material.opacity = 0.42 * Math.sin(ph * Math.PI) }) }
  // 人のアニメ（近い人だけ）
  for (const pp of W.people) if (pp.root.parent && Math.abs(pp.root.getWorldPosition(_v).z - b.z) < 70) pp.update(dt)
  // 降る雪（カメラのまわりに置き直す）
  if (fallSnow.visible) { const p = fallSnow.userData.pos; for (let i = 0; i < p.length; i += 3) { p[i + 1] -= dt * (1.4 + (i % 7) * 0.12); p[i] += Math.sin(now * 0.001 + i) * dt * 0.4; if (p[i + 1] < -2) p[i + 1] += 30 } fallSnow.position.set(Math.round(camera.position.x / 60) * 60, camera.position.y - 12, Math.round(camera.position.z / 60) * 60); fallSnow.geometry.attributes.position.needsUpdate = true }
  // 影のカメラを雪玉に合わせる
  const sr = 18 + r * 4; Object.assign(sun.shadow.camera, { left: -sr, right: sr, top: sr, bottom: -sr }); sun.shadow.camera.updateProjectionMatrix()
  sun.target.position.set(b.x, ball.position.y, b.z + 6); sun.position.copy(sun.target.position).addScaledVector(SUNDIR, 60)
  sky.position.copy(camera.position); backdrop.position.set(camera.position.x, camera.position.y - 60, camera.position.z)
}
function soundUpdate(dt) {
  if (!Snd.ctx || Snd.away) return
  const b = G.run.b, playing = G.state === 'play', sf = surfaceAt(b.x, b.z)
  const snowy = !(sf.type === 'dirt' || sf.type === 'stone')
  loopVol('roll', playing ? Math.min(0.55, b.sp * 0.025 + b.r * 0.12) * (snowy ? 1 : 0.35) : 0)
  const L = Snd.loops.roll; if (L && L.node) L.node.playbackRate.setTargetAtTime(clamp(0.7 + b.sp * 0.025 - b.r * 0.1, 0.5, 1.3), Snd.ctx.currentTime, 0.2)
  loopVol('wind', 0.12 + Math.min(0.35, b.sp * 0.016) * (G.state === 'title' ? 0.5 : 1))
  let fd = 99; for (const f of FIRES) if (W.objs[f.oi] && W.fires.find(q => q.ob.i === f.oi && q.fl.visible)) fd = Math.min(fd, Math.hypot(f.x - b.x, f.z - b.z))
  loopVol('fire', Math.max(0, 1 - fd / 16) * 0.5)
  const bz = Math.abs(b.z - BRIDGE.s), bl = laneOf(b.x, b.z)
  loopVol('brook', bz < 50 ? (1 - bz / 50) * (bl && bl.key === 'creek' ? 0.45 : 0.15) : 0)
  const kz = Math.min(Math.abs(b.z - 875), Math.abs(b.z - 975))
  loopVol('kids', kz < 60 ? (1 - kz / 60) * 0.3 : 0)
}

// ------------------------------------------------------------ 道中の一言
function routeLines() {
  const b = G.run.b
  if (!G.seen.fork && b.z > 52) { G.seen.fork = 1; if (G.runs <= 3) say(t('bub').forkTut, new THREE.Vector3(cx(104), height(cx(104), 104) + 3, 104), { extra: 1 }) }
  if (!G.seen.yaki && b.z > 372 && b.z < 392) { const ln = laneOf(b.x, b.z); if (ln && ln.key === 'camp') { G.seen.yaki = 1; say(t('bub').yakiimo, W.vendorG.position.clone().add(new THREE.Vector3(0, 2.2, 0))) } }
  if (!G.seen.onsen && b.z > 620 && b.z < 638) { const ln = laneOf(b.x, b.z); if (ln && ln.key === 'onsen') { G.seen.onsen = 1; say(t('bub').onsenMan, W.onsenMan.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 1.8, 0))) } }
  if (!G.seen.near && b.z > S_END - 100) { G.seen.near = 1; radio(t('bub').near) }
  if (!G.seen.fat && b.r > 1.7) { G.seen.fat = 1; say(t('bub').fat, ball.position.clone().add(new THREE.Vector3(0, b.r * 2 + 0.5, 0))) }
}

// ------------------------------------------------------------ 結末の演出（約4秒）→ 絵日記
const E = { t: 0, key: null, data: {} }
function beginEnding(key) {
  G.endKey = key; E.t = 0; E.shot = 0; E.key = key; E.data = { r: G.run.b.r, x: G.run.b.x, z: G.run.b.z, vx: G.run.b.vx, vz: G.run.b.vz }
  enter('ending'); hideBub(); G.bubQ.length = 0
  loopVol('roll', 0)
  const good = key === 'body', rare = ENDINGS.find(e => e.key === key).rare
  setTimeout(() => Snd.play(good ? 'j_good' : rare ? 'j_rare' : 'j_bad', { vol: 0.8, jitter: 0 }), key === 'house' || key === 'avalanche' ? 1600 : 1100)
  if (good) setTimeout(() => Snd.play('applause', { vol: 0.25 }), 1400)
  if (window.TM) TM.end(Math.round(E.data.r * 200), good)
  const kidHead = W.kidHead
  E.data.headR = G.run.headR
  // 子どもの頭（小さい雪玉）を庭に置く
  placeKidHead()
  if (key === 'house') { E.data.toX = W.homeHouse.position.x; E.data.toZ = W.homeHouse.position.z }
}
// 子どもが作った頭（庭に置いてある）。大きさは回ごとに変わる
function placeKidHead() {
  if (!W.kidHead) { W.kidHead = makeHeadBall(); scene.add(W.kidHead) }
  for (const c of W.kidHead.children) c.visible = true
  W.kidHead.visible = true; W.kidHead.scale.setScalar(G.run.headR); W.kidHead.position.set(YARD.x + 1.0, height(YARD.x + 1.0, YARD.z + 0.6) + G.run.headR * 0.95, YARD.z + 0.6); W.kidHead.rotation.set(0, Math.PI, 0)
}
function makeHeadBall() {
  const g = new THREE.Group()
  const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), ball.material); s.castShadow = true; g.add(s)
  const coal = new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.6 })
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), coal); e.position.set(sx * 0.32, 0.2, 0.92); g.add(e) }
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 8), new THREE.MeshStandardMaterial({ color: 0xe8701e, roughness: 0.6 })); nose.rotation.x = Math.PI / 2; nose.position.set(0, 0, 1.2); g.add(nose)
  for (let i = 0; i < 5; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), coal); const a = -0.5 + i * 0.25; m.position.set(Math.sin(a) * 0.55, -0.38 + Math.abs(a) * 0.15, Math.cos(a) * 0.82); g.add(m) }
  const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.42, 0.75, 14), new THREE.MeshStandardMaterial({ color: 0x3d5878, roughness: 0.5, metalness: 0.4 })); bucket.position.y = 1.15; bucket.rotation.z = 0.18; bucket.castShadow = true; g.add(bucket)
  return g
}
const _c = new THREE.Vector3()
function updateEnding(dt) {
  E.t += dt; const d = E.data, key = E.key, T = E.t
  const yardX = YARD.x - 0.6, yardZ = YARD.z + 0.4
  const arrive = /body|head|rabbit/.test(key)
  let camFrom = null
  if (arrive) {
    // 庭まで転がって止まる
    const k = Math.min(1, T / 1.2), e2 = 1 - Math.pow(1 - k, 3)
    const x = d.x + (yardX - d.x) * e2, z = d.z + (yardZ - d.z) * e2
    moveBallTo(x, z, d.r)
    if (key === 'body' && T > 1.4) { const k2 = Math.min(1, (T - 1.4) / 0.8), hp = W.kidHead.position; const top = ball.position.y + d.r * 0.92 + d.headR * 0.9; const sx = YARD.x + 1.0, sz = YARD.z + 0.6; hp.set(sx + (x - sx) * k2, (height(sx, sz) + d.headR) * (1 - k2) + top * k2 + Math.sin(k2 * Math.PI) * 1.2, sz + (z - sz) * k2); if (k2 >= 1 && !d.cheer) { d.cheer = 1; W.kid.play('jump', true); snowBurst(x, top, z, 30, 4); Snd.play('snowhit') } }
    if (key === 'head' && T > 1.4) {
      // 子どもの頭（小さい）を胴体にして、その上にのせられる。顔とバケツはこっちへ
      const k2 = Math.min(1, (T - 1.4) / 0.9), sx = YARD.x + 1.0, sz = YARD.z + 0.6, by = height(sx, sz) + d.headR * 0.95
      const bx = x + (sx - x) * k2, bz = z + (sz - z) * k2
      ball.position.set(bx, (height(x, z) + d.r * 0.93) * (1 - k2) + (by + d.headR * 0.85 + d.r * 0.8) * k2 + Math.sin(k2 * Math.PI) * 1.5, bz)
      if (k2 >= 1 && !d.cheer) { d.cheer = 1; W.kid.play('emote-yes', true); Snd.play('snowhit'); for (let i = 1; i < W.kidHead.children.length; i++) W.kidHead.children[i].visible = false; const f = makeHeadBall(); f.children[0].visible = false; f.scale.setScalar(d.r); f.rotation.y = Math.PI; ball.quaternion.identity(); scene.add(f); G.fx.push(f); d.face = f }
      if (d.face) d.face.position.copy(ball.position)
    }
    if (key === 'rabbit' && T > 1.4 && !d.cheer) { d.cheer = 1; W.kid.play('pick-up', true); addRabbitEars(); Snd.play('snowhit') }
    if (T < 1.3 && !d.kidIdle) { d.kidIdle = 1; W.kid.play('idle', true) }
    camFrom = _c.set(yardX - 4.2, height(yardX, yardZ) + 2.6, yardZ - 4.5)
    camera.position.lerp(camFrom, 1 - Math.exp(-dt * 2.2)); camera.lookAt(yardX + 0.6, height(yardX, yardZ) + 0.9, yardZ + 0.5)
  } else if (key === 'house' || key === 'avalanche') {
    const hx = W.homeHouse.position.x, hz = W.homeHouse.position.z
    const k = Math.min(1, T / 1.6)
    const tx = key === 'house' ? hx - 1.5 : d.x + d.vx * 3, tz = key === 'house' ? hz : d.z + 40
    const x = d.x + (tx - d.x) * k, z = d.z + (tz - d.z) * k; moveBallTo(x, z, d.r)
    if (T > 1.0 && !d.crush) { d.crush = 1; crushHouse(W.homeHouse, 1); G.shake = 1.2; Snd.play('rumble', { vol: 1 }); Snd.play('wood', { vol: 1 }); Snd.play('woodfall', { vol: 1, delay: 0.15 }); W.kid.play('emote-no', true); snowBurst(hx, height(hx, hz) + 2, hz, 80, 10) }
    if (key === 'avalanche') {
      if (!d.wave) { d.wave = 1; Snd.play('rumble', { vol: 1 }); Snd.play('rumble', { vol: 0.8, delay: 0.9, rate: 0.7 }) }
      // 雪の壁が村を飲む
      for (let i = 0; i < 26; i++) { const u = (Math.random() - 0.5) * 40, z0 = d.z - 6 + T * 22; P.emit(cx(z0) + u, height(cx(z0) + u, z0) + Math.random() * 6, z0 + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 3, 3 + Math.random() * 6, 8 + Math.random() * 6, 1.4, 1.6 + Math.random() * 2, [1, 1, 1], 0.6, 2) }
      for (const ob of OBJ) if (ob.kind === 'house' && ob.z < d.z - 6 + T * 22 && W.objs[ob.i] && W.objs[ob.i].visible) { crushHouse(W.objs[ob.i]); G.shake = 0.8 }
      G.shake = Math.max(G.shake, 0.5)
    }
    camFrom = _c.set(hx - 16, height(hx, hz) + (key === 'avalanche' ? 14 + T * 4 : 7), hz - 12 - (key === 'avalanche' ? T * 6 : 0))
    camera.position.lerp(camFrom, 1 - Math.exp(-dt * 1.8)); camera.lookAt(hx - 3, height(hx, hz) + 1.5, hz)
  } else if (key === 'puddle') {
    const k = Math.min(1, T / 1.6)
    if (!d.pd) { d.pd = 1; const m = new THREE.Mesh(new THREE.CircleGeometry(1, 40, 0), new THREE.MeshStandardMaterial({ color: 0x8fb4cf, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -4 })); m.rotation.x = -Math.PI / 2; m.position.set(d.x, height(d.x, d.z) + 0.04, d.z); scene.add(m); G.fx.push(m); d.pm = m; steamBurst(d.x, height(d.x, d.z) + 0.3, d.z, 20); Snd.play('splash', { vol: 0.6 }) }
    ball.scale.setScalar(Math.max(0.001, d.r * (1 - k))); ball.position.y = height(d.x, d.z) + d.r * (1 - k) * 0.9
    // 水たまりを斜面に沿わせる（毎コマ広げながら、頂点を地面の高さに合わせる）
    const sc = 0.2 + k * 0.9, pa = d.pm.geometry.attributes.position; if (!d.pm.userData.base) d.pm.userData.base = pa.array.slice()
    const bs = d.pm.userData.base, y0 = height(d.x, d.z)
    for (let i = 0; i < pa.count; i++) { const lx = bs[i * 3] * sc, lz = -bs[i * 3 + 1] * sc; pa.setXYZ(i, lx, -lz, height(d.x + lx, d.z + lz) - y0 + 0.03) }
    pa.needsUpdate = true
    camFrom = _c.set(d.x - 1.2, 0, d.z - 3.2); camFrom.y = Math.max(height(camFrom.x, camFrom.z) + 1.6, height(d.x, d.z) + 2.6); camera.position.lerp(camFrom, 1 - Math.exp(-dt * 2)); camera.lookAt(d.x, height(d.x, d.z) + 0.1, d.z)
  } else if (key === 'bullet') {
    // いちばん近い子が拾って、向かいの子に投げる
    if (!d.kid) {
      let kid = W.schoolKids[0], bd = 1e9; for (const k2 of W.schoolKids) { const dd = Math.abs(k2.s - d.z); if (dd < bd) { bd = dd; kid = k2 } }
      d.kid = kid; const lx = laneX(d.z, 'school'); remember(kid.g); kid.g.position.set(lx - 1.4, height(lx - 1.4, d.z + 1.5), d.z + 1.5); const vx = lx + 1.5, vz = d.z + 5.5
      const g = new THREE.Group(); g.position.set(vx, height(vx, vz), vz); g.lookAt(kid.g.position.x, g.position.y, kid.g.position.z); scene.add(g); G.fx.push(g)
      d.vic = new Person(g, { kind: 'character-male-c', hat: 5, anim: 'idle', scale: 0.8 }); W.people.push(d.vic); d.vg = g
      kid.g.lookAt(vx, kid.g.position.y, vz); kid.pp.play('pick-up', true)
    }
    const hand = d.kid.g.position.clone().add(new THREE.Vector3(0, 0.9, 0)), tgt = d.vg.position.clone().add(new THREE.Vector3(0, 0.75, 0))
    if (T < 1.1) { const k = T / 1.1; ball.position.lerpVectors(new THREE.Vector3(d.x, height(d.x, d.z) + d.r, d.z), hand, k); ball.position.y += Math.sin(k * Math.PI) * 0.8 }
    else if (T < 2.0) { if (!d.thr) { d.thr = 1; d.kid.pp.play('attack-melee-right', true) } const k = (T - 1.1) / 0.9; ball.position.lerpVectors(hand, tgt, k); ball.position.y += Math.sin(k * Math.PI) * 1.6 }
    else if (!d.hit) { d.hit = 1; ball.visible = false; snowBurst(tgt.x, tgt.y + 0.3, tgt.z, 40, 4); d.vic.play('die', true); Snd.play('snowhit', { vol: 1 }) }
    const mx = (hand.x + tgt.x) / 2, mz = (hand.z + tgt.z) / 2
    camFrom = _c.set(mx - 0.6, height(mx, mz - 5) + 2.3, mz - 5); camera.position.lerp(camFrom, 1 - Math.exp(-dt * 3)); camera.lookAt(mx, height(mx, mz) + 0.7, mz)
  } else if (key === 'contest') {
    const sx = laneX(STAGE.s, 'resort'), sz = STAGE.s + 1.5
    const k = Math.min(1, T / 1.0); moveBallTo(d.x + (sx - d.x) * k, d.z + (sz - d.z) * k, d.r)
    if (T > 1.0 && !d.win) { d.win = 1; const tr = makeTrophy(); tr.position.set(sx, height(sx, sz) + d.r * 2 + 0.8, sz); scene.add(tr); G.fx.push(tr); d.tr = tr; Snd.play('applause', { vol: 0.6 }); for (let i = 0; i < 5; i++) { const g = new THREE.Group(); const a = -0.9 + i * 0.45; g.position.set(sx + Math.sin(a) * (d.r + 3), height(sx, sz - 3), sz - Math.cos(a) * (d.r + 3)); g.lookAt(sx, g.position.y, sz); scene.add(g); G.fx.push(g); const pp = new Person(g, { kind: ['character-male-a', 'character-female-b', 'character-male-c', 'character-female-d', 'character-male-e'][i], hat: i + 2, anim: 'jump', loopAll: true }); W.people.push(pp) } }
    if (d.tr) d.tr.rotation.y += dt * 1.5
    camFrom = _c.set(sx + 2, height(sx, sz) + 3 + d.r, sz - 8 - d.r * 2); camera.position.lerp(camFrom, 1 - Math.exp(-dt * 2)); camera.lookAt(sx, height(sx, sz) + d.r * 1.2, sz)
  } else if (key === 'tunnel') {
    const tx0 = laneX(TUNNEL.s0, 'tunnel')
    if (!d.stuck) { d.stuck = 1; Snd.play('rock', { vol: 1 }); Snd.play('snowhit', { vol: 1 }); G.shake = 1; snowBurst(tx0, height(tx0, TUNNEL.s0) + 2, TUNNEL.s0, 60, 6) }
    const sq = 1 + Math.sin(Math.min(1, T * 3) * Math.PI) * 0.06
    ball.position.set(d.x + (tx0 - d.x) * Math.min(1, T * 2), height(tx0, TUNNEL.s0 - d.r * 0.5) + d.r * 0.93, TUNNEL.s0 - d.r * 0.55); ball.scale.set(d.r * 0.86, d.r * sq, d.r)
    camFrom = _c.set(tx0 + 6, height(tx0, TUNNEL.s0) + 4, TUNNEL.s0 - 9); camera.position.lerp(camFrom, 1 - Math.exp(-dt * 2)); camera.lookAt(tx0, height(tx0, TUNNEL.s0) + 2, TUNNEL.s0)
  } else if (key === 'onsen') {
    const px = laneX(POOL.s, 'onsen') + POOL.du, pz = POOL.s, py = height(px, pz)
    const k = Math.min(1, T / 1.6)
    ball.scale.setScalar(Math.max(0.001, d.r * (1 - k))); ball.position.set(px + (d.x - px) * (1 - Math.min(1, T * 2)), py + d.r * (1 - k) * 0.5, pz)
    if (Math.random() < 0.35 && T < 2) steamBurst(px + (Math.random() - 0.5) * 2, py + 0.4, pz, 1)
    if (!d.say && T > 0.6) { d.say = 1; Snd.play('steam', { vol: 0.9 }); Snd.play('splash', { vol: 0.8 }) }
    camFrom = _c.set(px - 6.5, py + 4.2, pz - 7.5); camera.position.lerp(camFrom, 1 - Math.exp(-dt * 2)); camera.lookAt(px, py + 0.6, pz)
  }
  if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.6; camera.position.y += (Math.random() - 0.5) * G.shake * 0.6; G.shake = Math.max(0, G.shake - dt * 1.5) }
  if (T > (key === 'avalanche' ? 4.2 : key === 'bullet' ? 3.4 : 3.6) && !E.shot) { E.shot = 1; showResult() }
}
function moveBallTo(x, z, r) { const dx = x - ball.position.x, dz = z - ball.position.z, dist = Math.hypot(dx, dz); if (dist > 1e-5 && dist < 5) { _ax.set(dz, 0, -dx).normalize(); _q.setFromAxisAngle(_ax, dist / Math.max(0.05, r)); ballQ.premultiply(_q); ball.quaternion.copy(ballQ) } ball.position.set(x, height(x, z) + r * 0.93, z) }
function crushHouse(h, big) {
  if (!h.visible) return
  remember(h)
  for (const c of [...h.children]) { remember(c); const wp = c.getWorldPosition(new THREE.Vector3()), wq = c.getWorldQuaternion(new THREE.Quaternion()); scene.add(c); c.position.copy(wp); c.quaternion.copy(wq); D.fling(c, big ? 10 : 6, [(Math.random() - 0.5) * 2, 1 + Math.random()]) }
  h.visible = false
}
function addRabbitEars() {
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 0.6, side: THREE.DoubleSide })
  const g = new THREE.Group(); G.fx.push(g)
  for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 6), leaf); e.scale.set(0.35, 1.1, 0.08); e.position.set(s * 0.35, 0.9, 0.2); e.rotation.z = s * -0.25; g.add(e) }
  for (const s of [-1, 1]) { const ey = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd0201a, roughness: 0.4 })); ey.position.set(s * 0.3, 0.25, 0.9); g.add(ey) }
  g.position.copy(ball.position); g.scale.setScalar(E.data.r); g.rotation.y = Math.PI * 1.15; scene.add(g)
  ball.quaternion.identity(); ball.scale.set(E.data.r, E.data.r * 0.78, E.data.r * 1.2); ball.rotation.y = Math.PI * 1.15
}
function makeTrophy() {
  const pts = []; for (const [r, y] of [[0.5, 0], [0.5, 0.1], [0.18, 0.2], [0.12, 0.6], [0.55, 0.9], [0.62, 1.5], [0.58, 1.55]]) pts.push(new THREE.Vector2(r, y))
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 0.9, roughness: 0.25, emissive: 0x3a2a00 })); m.castShadow = true
  const g = new THREE.Group(); g.add(m); return g
}

// ------------------------------------------------------------ 絵日記（結果の1枚）
const resCv = $('res'), rx = resCv.getContext('2d')
let shotImg = null
function grabShot() {
  composer.render()
  const src = renderer.domElement, w = src.width, h = src.height
  const c = document.createElement('canvas'); c.width = 960; c.height = 640; const x = c.getContext('2d')
  const ar = 960 / 640; let sw = w, sh = w / ar; if (sh > h) { sh = h; sw = h * ar }
  x.drawImage(src, (w - sw) / 2, (h - sh) * 0.45, sw, sh, 0, 0, 960, 640)
  return c
}
async function showResult() {
  shotImg = grabShot()
  const key = E.key, r = E.data.r, good = key === 'body', now = new Date()
  const z = G.zukan[key] || { n: 0 }; const isNew = !z.n; z.n++; G.zukan[key] = z
  try { localStorage.setItem('snowman-zukan', JSON.stringify(G.zukan)) } catch (e) {}
  try { if (document.fonts) await Promise.race([Promise.all([document.fonts.load('600 40px "Klee One"'), document.fonts.load('60px "Yuji Syuku"')]), new Promise(res => setTimeout(res, 1500))]) } catch (e) {}
  drawDiary(key, r, now)
  $('newEnd').textContent = isNew ? `${t('newEnd')}  ${t('zcount')(zCount(), ENDINGS.length)}` : ''
  enter('result'); resCv.classList.remove('in'); void resCv.offsetWidth; resCv.classList.add('in')
  window.__lastEnd = { key, r, head: G.run.headR, weather: G.run.weather, t: G.run.t }
}
function drawDiary(key, r, now) {
  const x = rx, W2 = 1080, H2 = 1350
  x.fillStyle = '#fbf7ee'; x.fillRect(0, 0, W2, H2)
  // 紙の目
  x.globalAlpha = 0.05; for (let i = 0; i < 1400; i++) { x.fillStyle = Math.random() < 0.5 ? '#7a6a50' : '#fff'; x.fillRect(Math.random() * W2, Math.random() * H2, 2, 2) } x.globalAlpha = 1
  // 上の欄: 日付と天気
  x.strokeStyle = '#5a7ab0'; x.lineWidth = 3; x.strokeRect(50, 46, W2 - 100, 92)
  x.beginPath(); x.moveTo(W2 - 330, 46); x.lineTo(W2 - 330, 138); x.stroke()
  x.fillStyle = '#26324a'; x.font = '600 46px "Klee One", sans-serif'; x.textBaseline = 'middle'
  x.fillText(t('dateFmt')(now.getMonth() + 1, now.getDate(), now.getDay()), 76, 94)
  x.font = '600 34px "Klee One", sans-serif'; x.fillText(t('weatherL') + '：' + t('weather')[G.run.weather], W2 - 304, 94)
  // 絵（クレヨンの枠）
  const fx0 = 60, fy0 = 170, fw = 960, fh = 640
  x.save(); x.translate(W2 / 2, fy0 + fh / 2); x.rotate(-0.008); x.drawImage(shotImg, -fw / 2, -fh / 2, fw, fh); x.restore()
  x.strokeStyle = '#3a4a6a'; x.lineWidth = 6; x.lineJoin = 'round'
  x.beginPath(); for (let i = 0; i <= 40; i++) { const k = i / 40; x.lineTo(fx0 + fw * k, fy0 + Math.sin(i * 1.7) * 2) } for (let i = 0; i <= 30; i++) { const k = i / 30; x.lineTo(fx0 + fw + Math.sin(i * 2.1) * 2, fy0 + fh * k) } for (let i = 0; i <= 40; i++) { const k = i / 40; x.lineTo(fx0 + fw * (1 - k), fy0 + fh + Math.sin(i * 1.3) * 2) } for (let i = 0; i <= 30; i++) { const k = i / 30; x.lineTo(fx0 + Math.sin(i * 1.9) * 2, fy0 + fh * (1 - k)) } x.stroke()
  // 題（結末の名前）と、はんこ
  const name = t('endName')[key]
  x.fillStyle = '#1d2430'; x.font = `${lang === 'ja' ? 76 : 62}px "Yuji Syuku", serif`; x.textBaseline = 'alphabetic'
  x.fillText(name, 64, 902)
  if (key === 'body') hanamaru(x, W2 - 140, 868, 66)
  else stamp(x, W2 - 150, 878, ENDINGS.find(e => e.key === key).rare ? (lang === 'ja' ? 'レア' : 'RARE') : (lang === 'ja' ? 'ざんねん' : 'OOPS'), ENDINGS.find(e => e.key === key).rare ? '#c08a12' : '#3a5a90')
  // 日記の文（罫線の上に）
  x.strokeStyle = 'rgba(90,122,176,.45)'; x.lineWidth = 2
  for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(60, 1006 + i * 70); x.lineTo(W2 - 60, 1006 + i * 70); x.stroke() }
  x.fillStyle = '#26324a'; x.font = `600 ${lang === 'ja' ? 40 : 34}px "Klee One", sans-serif`
  wrapText(x, t('diary')[key], 68, 992, W2 - 136, 70, 3)
  // 大きさ
  const [lo, hi] = bodyRange(G.run.headR)
  x.font = '700 32px "Zen Kaku Gothic New", sans-serif'; x.fillStyle = '#4a5a74'
  x.fillText(t('sizeEnd')(diam(r)) + '　' + t('target')(diam(lo), diam(hi)), 64, 1262)
  x.textAlign = 'right'; x.font = '700 26px "Zen Kaku Gothic New", sans-serif'; x.fillStyle = '#8090a8'; x.fillText(lang === 'ja' ? '雪だるまの胴体になれ　tom3games.com' : 'Become the Snowman\'s Body  tom3games.com', W2 - 60, 1316); x.textAlign = 'left'
}
function wrapText(x, s, x0, y0, w, lh, max) {
  const words = lang === 'ja' ? [...s] : s.split(' ')
  let line = '', y = y0, n = 0
  for (let i = 0; i < words.length; i++) {
    const add = lang === 'ja' ? words[i] : (line ? ' ' : '') + words[i]
    if (x.measureText(line + add).width > w && line) { x.fillText(line, x0, y); line = lang === 'ja' ? words[i] : words[i]; y += lh; if (++n >= max) return } else line += add
  }
  if (line) x.fillText(line, x0, y)
}
function hanamaru(x, cx0, cy0, r) {
  x.save(); x.strokeStyle = '#d6342a'; x.lineWidth = 7; x.lineCap = 'round'
  x.beginPath(); for (let a = 0; a < Math.PI * 2 * 3.2; a += 0.08) { const rr = r * (0.35 + a / (Math.PI * 2 * 3.2) * 0.6); x.lineTo(cx0 + Math.cos(a) * rr, cy0 + Math.sin(a) * rr * 0.92) } x.stroke()
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; x.beginPath(); x.ellipse(cx0 + Math.cos(a) * r * 1.12, cy0 + Math.sin(a) * r * 1.05, r * 0.28, r * 0.17, a, 0, 7); x.stroke() }
  x.restore()
}
function stamp(x, cx0, cy0, text, col) {
  x.save(); x.translate(cx0, cy0); x.rotate(-0.12); x.strokeStyle = col; x.fillStyle = col; x.globalAlpha = 0.85; x.lineWidth = 6
  x.beginPath(); x.arc(0, 0, 76, 0, 7); x.stroke(); x.beginPath(); x.arc(0, 0, 64, 0, 7); x.lineWidth = 2; x.stroke()
  x.font = `900 ${text.length > 3 ? 34 : 40}px "Zen Kaku Gothic New", sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 0, 2)
  x.restore()
}
$('bSave').onclick = () => {
  if (window.TM) TM.share('save')
  resCv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'snowman-body.png'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000) }, 'image/png')
}
$('bPost').onclick = () => {
  if (window.TM) TM.share('x')
  const key = window.__lastEnd ? window.__lastEnd.key : 'body', r = window.__lastEnd ? window.__lastEnd.r : 0.5
  const text = t('postTxt')(t('endName')[key], diam(r)) + ' ' + t('hashtag')
  open('https://x.com/intent/post?text=' + encodeURIComponent(text) + '&url=' + encodeURIComponent('https://tom3games.com/play/snowman-body/'), '_blank', 'noopener')
}

// ------------------------------------------------------------ ループ（物理は固定 60Hz）
function frame(now) {
  requestAnimationFrame(frame)
  if (!W) return
  now = performance.now()
  let dt = G.last ? (now - G.last) / 1000 : 0.016; G.last = now; dt = Math.min(dt, 0.1)
  if (G.paused) dt = 0
  grade.uniforms.time.value = now * 0.001
  if (G.state === 'play') {
    if (G.hitStop > 0) { G.hitStop -= dt } else {
      G.acc += dt
      let n = 0
      while (G.acc >= DT && n++ < 8) {
        G.prev = { x: G.run.b.x, z: G.run.b.z, r: G.run.b.r }
        step(G.run, readInput())
        const ev = G.run.ev.splice(0); for (const e of ev) onEvent(e)
        G.acc -= DT
        if (G.state !== 'play') break
      }
    }
    if (G.state === 'play') { ballVisual(G.hitStop > 0 ? 1 : clamp(G.acc / DT, 0, 1)); camFollow(dt); updateGauge(dt); routeLines() }
    if (G.tut > 0) { G.tut -= dt; if (G.tut <= 0) $('tut').style.opacity = 0 }
  } else if (G.state === 'ending') {
    updateEnding(dt)
  } else if (G.state === 'title' || G.state === 'result') {
    if (G.state === 'title') {
      G.titleT = (G.titleT || 0) + dt
      const b = ball.position, a = G.titleT * 0.08
      camera.position.set(b.x + Math.sin(a) * 6 - 2, b.y + 2.8, b.z - 6.5 + Math.cos(a) * 1.2); camera.lookAt(b.x + 2, b.y + 0.4, b.z + 14)
      camera.fov = innerWidth / innerHeight < 0.8 ? 66 : 54; camera.updateProjectionMatrix()
    }
  }
  updateFx(dt, now); updateBub(dt); updateThrown(dt); D.update(dt); P.update(dt); soundUpdate(dt)
  composer.render()
}
requestAnimationFrame(frame)

// ------------------------------------------------------------ 検証用の窓口
window.snowman = {
  G, OBJ, get run() { return G.run }, start: seed => startRun(seed), step,
  pause(p = true) { G.paused = p },
  stepN(n, inp) { for (let i = 0; i < n && G.state === 'play'; i++) { G.prev = { x: G.run.b.x, z: G.run.b.z, r: G.run.b.r }; step(G.run, inp || readInput()); for (const e of G.run.ev.splice(0)) onEvent(e) } ballVisual(1); camFollow(0.2); updateGauge(0.3) },
  bot(kind, o) { G.bot = kind ? makeBot(kind, o || {}) : null },
  setRun(o) { Object.assign(G.run.b, o); G.prev = null; placeBall(); camSnap() },
  ending(key) { beginEnding(key) },
  btnXY(id) { const r = $(id).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height } },
  render() { composer.render() },
}
boot().catch(e => { console.error(e); const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:auto 8px 8px 8px;z-index:199;background:#fff;color:#b00;font:12px monospace;padding:10px'; d.textContent = 'start failed: ' + e.message; document.body.appendChild(d) })
setMuteIcons()
