// 雪玉の物理（three を使わない。固定 60Hz。同じ入力なら同じ結果）
import { OBJ, FIRES, STEAMS, BRIDGE, TUNNEL, POOL, STAGE, SCHOOL, S_END, WEATHER, SURF, height, surfaceAt, lanesAt, laneOf, laneX, cx, clamp, rng } from './course.js?v=2'

export const DT = 1 / 60
export const TUNE = {
  g: 13.0, cd: 0.0056, roll: 0.1, steer: 8.5, brake: 6.5, vmax: 24,
  grow: 0.0030, sunMelt: 0.024, startR: 0.16, puddleR: 0.085,
  rockChip: [0.03, 0.11], hardChip: [0.02, 0.05], treeSnow: 0.025,
}
// 当たり判定を速くするため、z の 1m ごとに物を入れる
const BIN = new Map()
for (const o of OBJ) {
  const z0 = Math.floor(Math.min(o.z, o.z2 ?? o.z) - o.r - 1), z1 = Math.floor(Math.max(o.z, o.z2 ?? o.z) + o.r + 1)
  for (let z = z0; z <= z1; z++) { if (!BIN.has(z)) BIN.set(z, []); BIN.get(z).push(o) }
}
const WKEYS = ['sunny', 'cloudy', 'snowing']
export function newRun(seed = 1, opt = {}) {
  const R = rng(seed * 9973 + 11)
  const wr = R(), weather = opt.weather || (wr < 0.4 ? 'sunny' : wr < 0.75 ? 'cloudy' : 'snowing')
  const headR = opt.headR || +(0.27 + R() * 0.1).toFixed(3)
  const rare = R() // 雪だるまの中のおじさん等の小ネタ用
  return {
    seed, weather, headR, rare, t: 0, steps: 0,
    b: { x: cx(2), z: 2, vx: 0, vz: 5, r: TUNE.startR, y: 0, spin: 0, ax: 1, az: 0, sp: 2.2 },
    alive: new Uint8Array(OBJ.length).fill(1), cd: new Float32Array(OBJ.length),
    ev: [], end: null, done: false, bridgeBroken: false, prevZ: 2,
    st: { grow: 0, melt: 0, chip: 0, smash: {}, lanes: {}, maxR: TUNE.startR, maxV: 0, brakeT: 0, sunT: 0 },
  }
}
export function cloneRun(run) {
  return { ...run, b: { ...run.b }, alive: run.alive.slice(), cd: run.cd.slice(), ev: [], st: { ...run.st, smash: { ...run.st.smash }, lanes: { ...run.st.lanes } } }
}
export function bodyRange(h) { return [+(1.55 * h).toFixed(3), +(2.35 * h).toFixed(3)] }
export function endingBySize(r, h) {
  const [a, b] = bodyRange(h)
  if (r < 0.2) return 'rabbit'
  if (r < a) return 'head'
  if (r <= b) return 'body'
  if (r < 1.9) return 'house'
  return 'avalanche'
}
function finish(run, key, extra = {}) { if (run.done) return; run.done = true; run.end = { key, r: run.b.r, z: run.b.z, x: run.b.x, t: run.t, ...extra }; run.ev.push({ k: 'end', key }) }
function emit(run, k, o = {}) { run.ev.push({ k, ...o }) }

// inp: { steer: -1..1（+ で画面の右）, brake: 0..1 }
export function step(run, inp) {
  if (run.done) return
  const T = TUNE, b = run.b, W = WEATHER[run.weather]
  run.t += DT; run.steps++
  const e = 0.35
  const h0 = height(b.x, b.z)
  const gx = (height(b.x + e, b.z) - height(b.x - e, b.z)) / (2 * e)
  const gz = (height(b.x, b.z + e) - height(b.x, b.z - e)) / (2 * e)
  const sf = surfaceAt(b.x, b.z), S = SURF[sf.type]
  let ax = -T.g * gx, az = -T.g * gz
  const v = Math.hypot(b.vx, b.vz) || 1e-6, ux = b.vx / v, uz = b.vz / v
  // 空気と雪の抵抗（大きいほど効かない＝速くなる）
  const cd = T.cd / (b.r + 0.35) * (1 + S.drag)
  ax -= cd * v * b.vx; az -= cd * v * b.vz
  ax -= T.roll * (1 + S.drag) * ux; az -= T.roll * (1 + S.drag) * uz
  // 向きを変える（大きいほど曲がりにくい）。+ は画面の右 = 進む向きの右（-x 側）
  const st = clamp(inp.steer || 0, -1, 1)
  const turn = st * T.steer / (1 + 0.7 * b.r) * Math.min(1, 0.35 + v / 6)
  ax += -uz * turn; az += ux * turn
  // ブレーキ（大きいほど効かない）
  const br = clamp(inp.brake || 0, 0, 1)
  if (br > 0) { const k = br * T.brake / (1 + 2.5 * b.r * b.r); ax -= ux * k; az -= uz * k; run.st.brakeT += DT }
  b.vx += ax * DT; b.vz += az * DT
  // 道の向きに対する横すべりを少し止める（転がる玉が左右にゆれ続けないように）
  const dcx = (cx(b.z + 1) - cx(b.z - 1)) / 2, lat = b.vx - dcx * b.vz
  b.vx -= lat * 0.55 * DT
  if (b.vz < 0.6) b.vz += (0.6 - b.vz) * 0.2 // 上り返さない
  let sp = Math.hypot(b.vx, b.vz)
  if (sp > T.vmax) { b.vx *= T.vmax / sp; b.vz *= T.vmax / sp; sp = T.vmax }
  const px = b.x, pz = b.z
  b.x += b.vx * DT; b.z += b.vz * DT
  const ds = Math.hypot(b.x - px, b.z - pz)
  // 雪が付く・溶ける
  const g = T.grow * S.grow * W.grow * ds / (0.6 + b.r)
  b.r += g; run.st.grow += g
  let melt = 0
  if (sf.sun) { melt += T.sunMelt * W.melt * DT * Math.min(1, 0.45 + b.r); run.st.sunT += DT }  // 小さい玉は溶けにくくして、最初の分かれ道ですぐ消えないようにする
  for (const f of FIRES) { const dz = f.z - b.z; if (dz > f.R || dz < -f.R) continue; const d = Math.hypot(f.x - b.x, dz); if (d < f.R && run.alive[f.oi]) melt += f.rate * (1 - d / f.R) ** 2 * DT * (1 + 0.6 / (0.3 + b.r)) }
  for (const s of STEAMS) { const dz = s.z - b.z; if (dz > s.R || dz < -s.R) continue; const d = Math.hypot(s.x - b.x, dz); if (d < s.R) melt += s.rate * (1 - d / s.R) * DT }
  b.r -= melt; run.st.melt += melt
  // 仕掛け
  const ln = laneOf(b.x, b.z); if (ln) run.st.lanes[ln.key] = 1
  const crossed = z => pz < z && b.z >= z
  if (ln && ln.key === 'creek' && crossed(BRIDGE.s)) {
    const u = b.x - laneX(BRIDGE.s, 'creek')
    if (b.r > BRIDGE.maxR && !run.bridgeBroken) { run.bridgeBroken = true; emit(run, 'bridge'); dunk(run) }
    else if (Math.abs(u) > BRIDGE.half - 0.15 || run.bridgeBroken) dunk(run)
    else emit(run, 'onbridge')
  }
  if (ln && ln.key === 'tunnel') {
    if (crossed(TUNNEL.s0) && b.r > TUNNEL.maxR) { b.vx = b.vz = 0; return finish(run, 'tunnel') }
    if (b.z > TUNNEL.s0 && b.z < TUNNEL.s1) {
      const c = laneX(b.z, 'tunnel'), lim = Math.max(0.05, TUNNEL.half - b.r), u = b.x - c
      if (Math.abs(u) > lim) { b.x = c + Math.sign(u) * lim; b.vx = dcx * b.vz }
    }
    if (crossed(TUNNEL.s0)) emit(run, 'tunnelIn')
  }
  if (ln && ln.key === 'onsen') {
    const pxc = laneX(POOL.s, 'onsen') + POOL.du, dx = (b.x - pxc) / POOL.rx, dz = (b.z - POOL.s) / POOL.rz
    if (dx * dx + dz * dz < 1) { emit(run, 'splash', { big: 1 }); return finish(run, 'onsen') }
  }
  if (ln && ln.key === 'resort' && crossed(STAGE.s) && b.r >= STAGE.minR) return finish(run, 'contest')
  if (ln && ln.key === 'school') {
    for (const z of SCHOOL.throws) if (crossed(z)) { b.r += SCHOOL.add; run.st.grow += SCHOOL.add; emit(run, 'throw') }
    if (crossed(SCHOOL.catchS) && b.r < SCHOOL.catchR) return finish(run, 'bullet')
  }
  collide(run, sp)
  if (b.r > run.st.maxR) run.st.maxR = b.r
  if (sp > run.st.maxV) run.st.maxV = sp
  b.sp = Math.hypot(b.vx, b.vz)
  b.y = height(b.x, b.z) + b.r
  b.spin += ds / Math.max(0.05, b.r)
  if (ds > 1e-5) { b.ax = (b.x - px) / ds; b.az = (b.z - pz) / ds }
  if (b.r < TUNE.puddleR) { b.r = TUNE.puddleR; return finish(run, 'puddle') }
  if (b.z >= S_END) finish(run, endingBySize(b.r, run.headR))
  run.prevZ = b.z
}
function dunk(run) { const b = run.b; b.r *= 0.62; b.vx *= 0.55; b.vz *= 0.55; run.st.melt += b.r * 0.38 / 0.62; emit(run, 'splash') }

const NEAR = []
function collide(run, sp) {
  const b = run.b
  NEAR.length = 0
  const z0 = Math.floor(b.z - b.r - 1.5), z1 = Math.floor(b.z + b.r + 1.5)
  for (let z = z0; z <= z1; z++) { const a = BIN.get(z); if (a) for (const o of a) if (run.alive[o.i] && NEAR.indexOf(o) < 0) NEAR.push(o) }
  for (const o of NEAR) {
    if (run.cd[o.i] > run.t) continue
    let nx, nz, pen
    if (o.kind === 'fence') {
      // 線分との距離
      const ex = o.x2 - o.x, ez = o.z2 - o.z, L2 = ex * ex + ez * ez
      const tt = clamp(((b.x - o.x) * ex + (b.z - o.z) * ez) / L2, 0, 1)
      const qx = o.x + ex * tt, qz = o.z + ez * tt, d = Math.hypot(b.x - qx, b.z - qz)
      pen = b.r * 0.85 + 0.12 - d; if (pen <= 0) continue
      nx = (b.x - qx) / (d || 1); nz = (b.z - qz) / (d || 1)
    } else {
      const dx = b.x - o.x, dz = b.z - o.z, d = Math.hypot(dx, dz)
      pen = b.r * 0.9 + o.r - d; if (pen <= 0) continue
      nx = dx / (d || 1); nz = dz / (d || 1)
    }
    if (o.kind === 'fire') {
      // 焚き火: 通り抜けるが、触るとじゅっと溶ける。大きい玉は火を消す
      const m = 0.025 + 0.02 / (0.4 + b.r); b.r -= m; run.st.melt += m; run.cd[o.i] = run.t + 0.8
      if (b.r > 0.8) { run.alive[o.i] = 0; emit(run, 'douse', { o: o.i }) } else emit(run, 'sizzle', { o: o.i })
      continue
    }
    if (o.need > 0 && b.r >= o.need) {
      run.alive[o.i] = 0
      const slow = o.kind === 'house' ? 0.72 : o.kind === 'hut' || o.kind === 'barn' || o.kind === 'lift' ? 0.8 : o.kind === 'tree' ? 0.9 : 0.95
      b.vx *= slow; b.vz *= slow
      if (o.kind === 'house' || o.kind === 'hut' || o.kind === 'barn') b.r *= 0.97
      run.st.smash[o.kind] = (run.st.smash[o.kind] || 0) + 1
      emit(run, 'smash', { o: o.i, kind: o.kind, sp, nx, nz })
      continue
    }
    // 小さい岩は、大きい玉なら乗り越える（1回だけ欠ける）
    if (o.kind === 'rock' && b.r > 1.7 * o.r) {
      run.alive[o.i] = 0; const dr = -(TUNE.rockChip[0] + TUNE.rockChip[1] * b.r) * 0.8
      b.r += dr; run.st.chip -= dr; b.vx *= 0.9; b.vz *= 0.9
      emit(run, 'bump', { o: o.i, kind: 'rock', dr, sp, nx, nz, over: 1 }); continue
    }
    // はね返る。真正面でも横へそらす（同じ物に当たり続けない）
    if (Math.abs(nx) < 0.35) { const sx = nx !== 0 ? Math.sign(nx) : (o.i % 2 ? 1 : -1); nx = sx * 0.35 + nx * 0.65; const l = Math.hypot(nx, nz); nx /= l; nz /= l }
    const vn = b.vx * nx + b.vz * nz
    if (vn < 0) { b.vx -= 1.3 * vn * nx; b.vz -= 1.3 * vn * nz; const f = 0.82; b.vx *= f; b.vz *= f }
    b.x += nx * pen; b.z += nz * pen
    run.cd[o.i] = run.t + 1.2
    let dr = 0
    if (o.kind === 'rock') dr = -(TUNE.rockChip[0] + TUNE.rockChip[1] * b.r)
    else if (o.kind === 'post' || o.kind === 'lantern' || o.kind === 'house') dr = -(TUNE.hardChip[0] + TUNE.hardChip[1] * b.r)
    else if (o.kind === 'tree') { dr = TUNE.treeSnow }
    else dr = -0.012
    if (dr < 0) run.st.chip -= dr; else run.st.grow += dr
    b.r += dr
    emit(run, 'bump', { o: o.i, kind: o.kind, dr, sp: Math.abs(vn), nx, nz })
  }
}
