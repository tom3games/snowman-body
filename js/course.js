// コース（three を使わない。ゲームと node の sim の両方で使う）
// 座標: z = s（山頂 0 → ふもと S_END へ下る距離 m）、x = 左右（cx(s) が道の中心）、y = 高さ
export const S_END = 975
export const L = 1010
export const HW0 = 11      // 分かれ道でない所の道の半幅
export const LW = 4.6      // 分かれ道の1本の道の半幅

// 分かれ道。o は道の中心からのずれ（m）。key で路面と見た目が決まる
export const BRANCHES = [
  { id: 'A', s0: 70, s1: 215, lanes: [{ o: -17, key: 'forest' }, { o: 0, key: 'open' }, { o: 17, key: 'ridge' }] },
  { id: 'B', s0: 265, s1: 432, lanes: [{ o: -18, key: 'camp' }, { o: 0, key: 'creek' }, { o: 18, key: 'resort' }] },
  { id: 'C', s0: 520, s1: 705, lanes: [{ o: -17, key: 'tunnel' }, { o: 0, key: 'sunslope' }, { o: 17, key: 'onsen' }] },
  { id: 'D', s0: 800, s1: 925, lanes: [{ o: -16, key: 'shrine' }, { o: 0, key: 'field' }, { o: 16, key: 'school' }] },
]
const RIN = 48, ROUT = 42 // 分かれ始め・合流の長さ

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t) }
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

export function cx(s) {
  const k = 1 - sm(910, 960, s) // 村は真っすぐ
  return (9 * Math.sin(s / 110) + 4 * Math.sin(s / 47 + 0.7)) * k + 4.2 * (1 - k)
}
// 坂の傾き（下り）。区間ごとに変える
const SLOPES = [[0, 0.13], [60, 0.2], [215, 0.15], [265, 0.21], [432, 0.14], [520, 0.2], [705, 0.16], [800, 0.13], [925, 0.06], [975, 0.02]]
const YB = new Float32Array(L + 2)
{
  let y = 0
  for (let s = 0; s <= L + 1; s++) {
    let k = 0; while (k + 1 < SLOPES.length && SLOPES[k + 1][0] <= s) k++
    const a = SLOPES[k], b = SLOPES[Math.min(k + 1, SLOPES.length - 1)]
    const t = b === a ? 0 : sm(b[0] - 12, b[0] + 12, s)
    YB[s] = y; y -= a[1] * (1 - t) + b[1] * t
  }
}
export function base(s) {
  if (s <= 0) return 0.13 * -s
  if (s >= L) return YB[L] - (s - L) * 0.02
  const i = Math.floor(s), f = s - i
  return YB[i] * (1 - f) + YB[i + 1] * f
}
export function branchAt(s) { for (const b of BRANCHES) if (s > b.s0 - 1 && s < b.s1 + 1) return b; return null }
// 今の s での道の中心のずれ一覧と半幅
const _lane = { offs: [0, 0, 0], n: 1, lw: HW0, t: 0, br: null }
export function lanesAt(s) {
  const b = branchAt(s)
  if (!b) { _lane.n = 1; _lane.offs[0] = 0; _lane.lw = HW0; _lane.t = 0; _lane.br = null; return _lane }
  const t = sm(b.s0, b.s0 + RIN, s) * (1 - sm(b.s1 - ROUT, b.s1, s))
  _lane.n = b.lanes.length; _lane.t = t; _lane.br = b
  for (let i = 0; i < b.lanes.length; i++) _lane.offs[i] = b.lanes[i].o * t
  _lane.lw = HW0 + (LW - HW0) * Math.min(1, t * 1.6)
  return _lane
}
// どの道にいるか（分かれ道の中だけ。外は null）
export function laneOf(x, z) {
  const s = z, la = lanesAt(s); if (!la.br || la.t < 0.5) return null
  const u = x - cx(s); let bi = 0, bd = 1e9
  for (let i = 0; i < la.n; i++) { const d = Math.abs(u - la.offs[i]); if (d < bd) { bd = d; bi = i } }
  return la.br.lanes[bi]
}
function prof(d, lw) { return d < lw ? 0.4 * (d / lw) * (d / lw) : 0.4 + 0.3 * Math.pow(d - lw, 1.35) }
// 路面の高さ（地形）
export function height(x, z) {
  const s = clamp(z, -40, L + 60), la = lanesAt(s), u = x - cx(s)
  let d = 1e9; for (let i = 0; i < la.n; i++) d = Math.min(d, Math.abs(u - la.offs[i]))
  let h = base(s) + prof(d, la.lw)
  // 外側の崖（道の外へ出られない）
  const hw = la.n === 1 ? HW0 + 1 : Math.max(HW0, Math.abs(la.offs[0]) + la.lw + 1, Math.abs(la.offs[la.n - 1]) + la.lw + 1)
  const e = Math.abs(u) - hw; if (e > 0) h += 0.16 * Math.pow(e, 1.45)
  // 山頂の後ろも壁
  if (z < -4) h += 0.6 * Math.pow(-4 - z, 1.3)
  // 村の雪の土手（道の両わき）
  if (s > 925) { const k = sm(925, 940, s); const v = Math.abs(u); h += k * (sm(4.2, 6.5, v) * 0.55) }
  // 沢（B の真ん中）: 流れの所だけ少し低い
  if (s > 362 && s < 378 && la.br && la.br.id === 'B') { const dd = Math.abs(u - la.offs[1]); if (dd < la.lw + 1) h -= 0.6 * Math.sin(Math.PI * (s - 362) / 16) }
  return h
}
// 天気。run ごとに1つ
export const WEATHER = { sunny: { melt: 1.2, grow: 0.95 }, cloudy: { melt: 0.7, grow: 1.0 }, snowing: { melt: 0.45, grow: 1.12 } }

// 路面の帯（分かれ道の外の区間）。u は道の中心から。s0..s1
// type: snow / deep / packed / slush / dirt / stone / ice。sun: 日なた
const ZONES = [
  { s0: -50, s1: 70, u0: -99, u1: 99, type: 'snow' },
  { s0: 215, s1: 265, u0: -99, u1: 99, type: 'snow' },
  { s0: 432, s1: 520, u0: -99, u1: 99, type: 'deep' },
  { s0: 440, s1: 520, u0: -9, u1: -4.5, type: 'packed' },
  { s0: 440, s1: 520, u0: 5.5, u1: 99, type: 'slush', sun: 1 },
  { s0: 705, s1: 800, u0: -99, u1: 99, type: 'snow' },
  { s0: 712, s1: 800, u0: 3.6, u1: 8.6, type: 'dirt' },
  { s0: 735, s1: 770, u0: -99, u1: -4, type: 'slush', sun: 1 },
  { s0: 925, s1: L + 60, u0: -99, u1: 99, type: 'deep' },
  { s0: 925, s1: L + 60, u0: -4.6, u1: 4.6, type: 'stone' },
]
// 分かれ道の中の路面（道ごと）
const LANE_SURF = {
  forest: { type: 'deep', sun: 0 },
  open: { type: 'deep', sun: 0 },
  ridge: { type: 'snow', sun: 0, sunBands: [[128, 205]] },
  camp: { type: 'snow', sun: 0, dirtBands: [[300, 320], [350, 368], [392, 405]] },
  creek: { type: 'deep', sun: 0 },
  resort: { type: 'packed', sun: 1 },
  tunnel: { type: 'snow', sun: 0, inner: 'packed' },
  sunslope: { type: 'slush', sun: 1 },
  onsen: { type: 'stone', sun: 0 },
  shrine: { type: 'stone', sun: 0 },
  field: { type: 'deep', sun: 0 },
  school: { type: 'packed', sun: 1 },
}
export const SURF = {
  snow: { grow: 1.0, drag: 0.0 },
  deep: { grow: 1.55, drag: 0.35 },
  packed: { grow: 0.3, drag: -0.1 },
  slush: { grow: 0.25, drag: 0.25 },
  dirt: { grow: 0, drag: 0.5 },
  stone: { grow: 0, drag: 0.15 },
  ice: { grow: 0, drag: -0.3 },
}
const _sf = { type: 'snow', sun: 0, lane: null, steam: 0, fire: 0 }
export function surfaceAt(x, z) {
  const s = z, u = x - cx(s)
  const ln = laneOf(x, z)
  _sf.lane = ln ? ln.key : null; _sf.sun = 0; _sf.type = 'snow'
  if (ln) {
    const ls = LANE_SURF[ln.key]; _sf.type = ls.type; _sf.sun = ls.sun
    if (ls.sunBands) for (const [a, b] of ls.sunBands) if (s > a && s < b) { _sf.sun = 1; _sf.type = 'slush' }
    if (ls.dirtBands) { const la = lanesAt(s); const du = Math.abs(u - la.offs[0]); for (const [a, b] of ls.dirtBands) if (s > a && s < b && du < 2.6) _sf.type = 'dirt' }
    if (ln.key === 'tunnel' && s > TUNNEL.s0 - 2 && s < TUNNEL.s1) _sf.type = 'packed'
    if (ln.key === 'shrine' && s < 818) _sf.type = 'snow'
    if (ln.key === 'school' && s < 822) _sf.type = 'snow'
    if (ln.key === 'field' && s < 820) _sf.type = 'snow'
  } else {
    for (const zn of ZONES) if (s >= zn.s0 && s < zn.s1 && u >= zn.u0 && u < zn.u1) { _sf.type = zn.type; _sf.sun = zn.sun || 0 }
  }
  return _sf
}

// ---------------- 決まった乱数（配置用）
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }
export function laneX(s, key) { const la = lanesAt(s); const b = la.br; if (!b) return cx(s); const i = b.lanes.findIndex(l => l.key === key); return cx(s) + (i < 0 ? 0 : la.offs[i]) }

// ---------------- 仕掛けの場所
export const BRIDGE = { s: 370, s0: 363, s1: 377, half: 1.25, maxR: 1.0 }   // B 真ん中の丸太橋
export const TUNNEL = { s0: 590, s1: 652, half: 1.35, maxR: 1.05 }          // C 左のスノーシェッド
export const POOL = { s: 640, du: 4.0, rx: 3.0, rz: 4.2 }                    // C 右の露天風呂（道の右わき）
export const STAGE = { s: 404, minR: 1.45 }                                  // B 右の巨大雪だるま大会
export const SCHOOL = { throws: [846, 854, 862, 870, 878], add: 0.032, catchS: 882, catchR: 0.34 }
export const FIRES = []   // { x, z, R, rate }
export const STEAMS = []  // { x, z, R, rate }

// ---------------- 当たる物
// kind: tree rock fence snowman hut tent skier fire torii lantern sign cart post house
// r: 当たりの半径。need: 壊すのに要る雪玉の半径（0 = 壊れない）
export const OBJ = []
function add(o) { o.i = OBJ.length; OBJ.push(o); return o }
const NEED = { tree: 0.95, fence: 0.42, snowman: 0.52, hut: 1.3, tent: 0.72, skier: 0.3, sign: 0.3, cart: 0.85, post: 0.6, house: 1.45, barn: 1.25, lift: 1.6 }
function put(kind, x, z, r, extra = {}) { return add({ kind, x, z, r, need: NEED[kind] || 0, ...extra }) }
{
  const R = rng(7)
  // 山頂の小屋（スタートの後ろ）と最初の道しるべ
  put('hut', cx(-14) - 6, -14, 2.2, { yaw: 0.2, decor: 1 })
  // 道の外の林・分かれ道の尾根の木（当たる。大きいと倒せる）
  for (let s = -10; s < 935; s += 4.2 + R() * 3) {
    const la = lanesAt(s)
    const hw = la.n === 1 ? HW0 : Math.max(HW0, Math.abs(la.offs[0]) + la.lw, Math.abs(la.offs[la.n - 1]) + la.lw)
    for (const side of [-1, 1]) if (R() < 0.85) put('tree', cx(s) + side * (hw + 1.6 + R() * 2.2), s + R() * 2, 0.55, { h: 5 + R() * 4, edge: 1 })
    // 尾根（道と道の間）
    if (la.n > 1 && la.t > 0.75) for (let i = 0; i + 1 < la.n; i++) {
      const mid = (la.offs[i] + la.offs[i + 1]) / 2
      if (R() < 0.75) put(la.br.id === 'B' && i === 0 ? 'tree' : R() < 0.75 ? 'tree' : 'rock', cx(s) + mid + (R() - 0.5) * 3, s + R() * 2, 0.6 + R() * 0.3, { h: 6 + R() * 5 })
    }
  }
  // ---- 0–70 山頂の斜面: 柵と道しるべ
  put('sign', cx(4) + 3.5, 4, 0.25, { text: 'start' })
  for (let i = 0; i < 4; i++) put('fence', cx(46) - 9 + i * 4.6, 46, 0.0, { x2: cx(46) - 9 + i * 4.6 + 3.6, z2: 46.4 })
  put('snowman', cx(30) + 5, 30, 0.45, { kid: 0 })
  // 分かれ道の看板（入口のとがった所）
  for (const b of BRANCHES) { const s = b.s0 + 34, la = lanesAt(s); for (let i = 0; i + 1 < la.n; i++) put('sign', cx(s) + (la.offs[i] + la.offs[i + 1]) / 2, s, 0.3, { fork: b.id, lanes: [b.lanes[i].key, b.lanes[i + 1].key] }) }
  // ---- A: 左 林（深雪・日陰）／真ん中 ひらけた斜面（日なたの帯あり）／右 日なたの尾根
  for (let s = 100; s < 200; s += 14) { const x = laneX(s, 'forest') + (R() - 0.5) * 5; put('tree', x, s + R() * 4, 0.55, { h: 6 + R() * 3, inlane: 1 }) }
  for (const s of [112, 160, 196]) { const x0 = laneX(s, 'open'); for (let i = -1; i <= 1; i++) put('fence', x0 + i * 3.6 - 1.6, s, 0, { x2: x0 + i * 3.6 + 1.6, z2: s + 0.3 }) }
  put('snowman', laneX(140, 'open') - 2.5, 140, 0.45, {}); put('snowman', laneX(141, 'open') + 2.8, 141.5, 0.45, {})
  for (const s of [118, 150, 182]) put('rock', laneX(s, 'ridge') + (R() - 0.5) * 4, s, 0.75 + R() * 0.3, {})
  // ---- 215–265 岩場（合流した後）
  for (const [s, u, r] of [[226, -4.5, 1.0], [233, 3.2, 0.8], [241, -2.7, 0.9], [248, 6.5, 1.2], [252, -7.5, 1.0], [256, 2.5, 0.7]]) put('rock', cx(s) + u, s, r, {})
  for (let i = 0; i < 5; i++) put('snowman', cx(238) - 8 + i * 4, 236 + (i % 2) * 1.5, 0.45, {})
  // ---- B: 左 キャンプ場（焚き火）／真ん中 沢と丸太橋（日陰）／右 スキー場（圧雪・大会）
  for (const [s, du] of [[300, -2.8], [325, 2.6], [352, -2.4], [380, 0], [398, 2.8]]) { const x = laneX(s, 'camp') + du; FIRES.push({ x, z: s, R: 7.5, rate: 0.16, oi: put('fire', x, s, 0.55, {}).i }) }
  for (const [s, du] of [[310, 3.2], [342, -3.4], [370, 3.4]]) put('tent', laneX(s, 'camp') + du, s, 1.2, {})
  put('cart', laneX(388, 'camp') - 3.2, 388, 0.9, { yakiimo: 1 })
  for (const [s, du, r] of [[300, -2.5, 0.8], [318, 2.0, 0.9], [334, -1.2, 0.7], [348, 2.6, 1.0], [392, -2.2, 0.9], [410, 1.5, 0.8]]) put('rock', laneX(s, 'creek') + du, s, r, {})
  for (let k = 0; k < 6; k++) put('skier', laneX(330, 'resort') - 3 + k * 1.2, 330 + k * 1.6, 0.4, { line: k })
  put('lift', laneX(360, 'resort') + 4.0, 360, 1.6, {})
  for (let k = 0; k < 4; k++) put('skier', laneX(372 + k * 5, 'resort') + (k % 2 ? 2.2 : -2.0), 372 + k * 5, 0.4, {})
  put('snowman', laneX(404, 'resort') - 3.6, 404, 0.8, { contest: 1 }); put('snowman', laneX(404, 'resort') + 3.6, 404.5, 0.9, { contest: 1 })
  // ---- 432–520 ひらけた雪原（深雪）。真ん中に納屋、雪だるまの列
  put('barn', cx(478) - 0.5, 478, 2.6, {})
  for (let i = 0; i < 4; i++) put('snowman', cx(458) - 7 + i * 4.6, 458, 0.45, {})
  for (let i = 0; i < 6; i++) put('fence', cx(500) - 10 + i * 3.6, 500, 0, { x2: cx(500) - 10 + i * 3.6 + 3.0, z2: 500.2 })
  // ---- C: 左 スノーシェッド（トンネル）／真ん中 日なたの大斜面／右 温泉街の湯けむり
  for (const s of [548, 566]) put('rock', laneX(s, 'tunnel') + (s === 548 ? 2.2 : -2.0), s, 0.8, {})
  for (const [s, du] of [[560, 0], [600, -2.5], [628, 2.2], [660, 0]]) put('rock', laneX(s, 'sunslope') + du, s, 0.6, { small: 1 })
  put('snowman', laneX(580, 'sunslope') + 2.4, 580, 0.45, {}); put('snowman', laneX(612, 'sunslope') - 2.2, 612, 0.45, {})
  for (const [s, du] of [[575, -2.8], [596, 2.6], [618, -1.0], [662, 2.0], [680, -2.4]]) { const x = laneX(s, 'onsen') + du; STEAMS.push({ x, z: s, R: 5.5, rate: 0.075 }) }
  for (const [s, du] of [[566, 3.4], [608, -3.4], [652, -3.4], [674, 3.4]]) put('lantern', laneX(s, 'onsen') + du, s, 0.35, {})
  // ---- 705–800 林道（真ん中が土）
  for (const [s, u] of [[722, 5.5], [742, -6], [760, 6.4], [784, -5]]) put('tree', cx(s) + u, s, 0.55, { h: 7, inlane: 1 })
  put('hut', cx(770) + 7.5, 770, 1.9, {})
  // 村の入口の焚き火（最後の微調整に使える）
  FIRES.push({ x: cx(948) - 3.0, z: 948, R: 6.5, rate: 0.14, oi: put('fire', cx(948) - 3.0, 948, 0.55, { drum: 1 }).i })
  // ---- D: 左 神社の参道（石畳・杉の日陰）／真ん中 田んぼ（深雪・日なた）／右 校庭（雪合戦）
  for (const s of [830, 860, 890]) { const x = laneX(s, 'shrine'); put('post', x - 2.6, s, 0.32, { torii: 1 }); put('post', x + 2.6, s, 0.32, { torii: 1 }) }
  for (const s of [842, 872, 902]) { const x = laneX(s, 'shrine'); put('lantern', x - 3.4, s, 0.35, {}); put('lantern', x + 3.4, s, 0.35, {}) }
  for (const [s, du] of [[845, -2.2], [870, 2.4], [892, 0]]) put('snowman', laneX(s, 'field') + du, s, 0.45, { scarecrow: s === 870 ? 1 : 0 })
  for (const s of [838, 884]) { const x0 = laneX(s, 'field'); put('fence', x0 - 4, s, 0, { x2: x0 - 0.6, z2: s }); put('fence', x0 + 0.6, s, 0, { x2: x0 + 4, z2: s }) }
  for (const s of [848, 878]) put('snowman', laneX(s, 'school') + (s === 848 ? -3 : 3), s, 0.5, { fort: 1 })
  // ---- 925–975 村の通り: 家（道の外）
  for (let s = 928; s < 1000; s += 11) for (const side of [-1, 1]) { if (s > 960 && side === 1) continue; put('house', cx(s) + side * (9.5 + R() * 1.5), s + R() * 3, 3.2, { yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2, v: Math.floor(R() * 3) }) }
}
// 子どもの家と庭（終点）
export const YARD = { x: cx(S_END) + 0.0, z: S_END + 3, house: { x: cx(S_END) + 9.5, z: S_END + 8 } }
