// 人（Kenney Mini Characters, CC0）。毛糸の帽子とマフラーを足して冬の格好にする
import * as THREE from 'three'
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js'
import { clone as skClone } from '../vendor/jsm/utils/SkeletonUtils.js'

export const KINDS = ['character-male-a', 'character-female-b', 'character-male-c', 'character-female-d', 'character-male-e']
const A = { ready: false, src: {}, clips: null }
export const charAssets = A
export function loadChars(V = '') {
  if (A.loading) return A.loading
  const L = new GLTFLoader()
  A.loading = Promise.all(KINDS.map(k => L.loadAsync('assets/chars/' + k + '.glb' + V).then(g => { A.src[k] = g; if (!A.clips) A.clips = g.animations }).catch(e => console.warn('char', k, e))))
    .then(() => { A.ready = Object.keys(A.src).length > 0; for (const f of A.wait || []) f(); A.wait = [] ; return A })
  return A.loading
}
const knitTex = (() => {
  let t = null
  return () => {
    if (t) return t
    const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d')
    x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64)
    for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) { x.fillStyle = 'rgba(0,0,0,0.13)'; x.beginPath(); x.ellipse(k * 8 + 4, r * 8 + 4, 2.4, 3.6, (k % 2 ? 0.4 : -0.4), 0, 7); x.fill() }
    t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.SRGBColorSpace
    return t
  }
})()
const HATS = [0xc8323a, 0x2f5fa8, 0xe8a33a, 0x3d8a5a, 0xf2efe8, 0x8a4fa8]
export class Person {
  constructor(parent, o = {}) {
    this.root = new THREE.Group(); parent.add(this.root)
    this.o = o; this.kind = o.kind || KINDS[0]; this.anim = o.anim || 'idle'; this.mixer = null; this.act = null; this.model = null
    this.scale = o.scale ?? 1
    // 届くまでの仮の形（円柱と球）
    const m = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 })
    const g = new THREE.Group()
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.3, 4, 10), m(HATS[(o.hat ?? 0) % HATS.length])); body.position.y = 0.42
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), m(0xe9c4a0)); head.position.y = 0.86
    g.add(body, head); g.scale.setScalar(this.scale); this.root.add(g); this.fb = g
    if (A.ready) this.attach(); else (A.wait || (A.wait = [])).push(() => this.attach())
  }
  attach() {
    const src = A.src[this.kind] || Object.values(A.src)[0]; if (!src || this.model) return
    const mdl = skClone(src.scene); mdl.scale.setScalar(this.scale * 1.0)
    mdl.traverse(n => { if (n.isMesh) { n.castShadow = true; n.frustumCulled = false; n.material = n.material.clone(); n.material.roughness = 0.85; n.material.metalness = 0 } })
    const head = mdl.getObjectByName('head')
    if (head && !this.o.noHat) {
      const col = HATS[(this.o.hat ?? 0) % HATS.length]
      const mat = new THREE.MeshStandardMaterial({ color: col, roughness: 1, map: knitTex() })
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.52), mat); cap.position.set(0, 0.36, -0.01); cap.scale.set(1, 0.85, 1)
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.05, 8, 22), new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 1, map: knitTex() })); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.37, -0.01)
      const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), rim.material); pom.position.set(0, 0.62, -0.02)
      for (const p of [cap, rim, pom]) p.castShadow = true
      head.add(cap, rim, pom)
    }
    const torso = mdl.getObjectByName('torso')
    if (torso && !this.o.noScarf) {
      const sc = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.06, 8, 20), new THREE.MeshStandardMaterial({ color: HATS[((this.o.hat ?? 0) + 2) % HATS.length], roughness: 1, map: knitTex() }))
      sc.rotation.x = Math.PI / 2; sc.position.set(0, 0.36, 0.0); sc.scale.set(1, 1.05, 1); torso.add(sc)
    }
    this.root.remove(this.fb); this.root.add(mdl); this.model = mdl
    this.mixer = new THREE.AnimationMixer(mdl)
    this.play(this.anim, true)
    if (this.onReady) this.onReady(this)
  }
  play(name, force) {
    this.anim = name; if (!this.mixer || !A.clips) return
    const cl = A.clips.find(c => c.name === name); if (!cl) return
    const a = this.mixer.clipAction(cl)
    if (this.act === a && !force) return
    a.reset(); a.setLoop(/jump|die|pick-up|emote|attack|interact|fall/.test(name) && !this.o.loopAll ? THREE.LoopOnce : THREE.LoopRepeat); a.clampWhenFinished = true
    if (this.act) this.act.crossFadeTo(a, 0.2, false)
    a.play(); this.act = a
  }
  update(dt) { if (this.mixer) this.mixer.update(dt) }
}
