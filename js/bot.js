// 自動で遊ぶ bot（sim・検証・タイトルの背景）。three を使わない
import { BRANCHES, lanesAt, cx, clamp, rng } from './course.js?v=2'
import { newRun, cloneRun, step, bodyRange, DT } from './phys.js?v=2'

// 決めどころ。opts の1つを選ぶ。lane: 分かれ道の道の番号、du: 道の中での横の位置 [[s,u]...]、u: 合流区間の横の位置、brake: [[s0,s1]...]
export const DEC = [
  { s: 40, end: 215, opts: [{ n: '林', lane: 0 }, { n: '斜面', lane: 1 }, { n: '尾根', lane: 2 }, { n: '尾根ブレーキ', lane: 2, brake: [[110, 205]] }] },
  { s: 205, end: 265, opts: [{ n: '岩よけ', u: [[215, -8.5], [262, -9]] }, { n: '岩あて', u: [[220, -4.5], [234, -3], [241, -2.7], [252, -7.5], [262, -4]] }, { n: '真ん中', u: [[215, 0], [262, 0]] }] },
  { s: 236, end: 432, opts: [{ n: '焚火', lane: 0 }, { n: '焚火寄り', lane: 0, du: [[290, -2.8], [300, -2.8], [312, 2.6], [325, 2.6], [340, -2.4], [352, -2.4], [368, 0], [380, 0], [390, 2.8], [398, 2.8]] }, { n: '沢の橋', lane: 1 }, { n: '沢に落ちる', lane: 1, du: [[355, 0], [366, 2.6], [374, 2.6], [380, 0]] }, { n: 'スキー', lane: 2 }] },
  { s: 425, end: 520, opts: [{ n: '圧雪', u: [[440, -6.7], [518, -6.7]] }, { n: '深雪', u: [[440, 0], [518, 0]] }, { n: '日なた', u: [[440, 8.5], [518, 8.5]] }, { n: '日なたブレーキ', u: [[440, 8.5], [518, 8.5]], brake: [[445, 515]] }] },
  { s: 492, end: 705, opts: [{ n: 'トンネル', lane: 0 }, { n: '大斜面', lane: 1 }, { n: '大斜面ブレーキ', lane: 1, brake: [[560, 690]] }, { n: '湯けむり', lane: 2, du: [[565, -2.8], [578, -2.8], [590, 2.6], [600, 2.6], [612, -1.0], [622, -1.0], [656, 2.0], [666, 2.0], [676, -2.4], [684, -2.4]] }] },
  { s: 690, end: 800, opts: [{ n: '土の道', u: [[712, 6], [798, 6]] }, { n: '雪', u: [[712, 0], [798, 0]] }, { n: '日なた', u: [[712, -6.5], [798, -6.5]] }] },
  { s: 772, end: 925, opts: [{ n: '参道', lane: 0 }, { n: '田んぼ', lane: 1 }, { n: '校庭', lane: 2 }] },
]
function interp(pts, s) { if (s <= pts[0][0]) return pts[0][1]; for (let i = 1; i < pts.length; i++) if (s < pts[i][0]) { const a = pts[i - 1], b = pts[i]; return a[1] + (b[1] - a[1]) * (s - a[0]) / (b[0] - a[0]) } return pts[pts.length - 1][1] }
function decAt(s) { for (let i = DEC.length - 1; i >= 0; i--) if (s >= DEC[i].s - 30 && s < DEC[i].end) { if (DEC[i].opts[0].lane != null || i === 0) { if (s > DEC[i].s - 30) return i } else if (s > DEC[i].s) return i } return -1 }
// 今の s で目指す横位置とブレーキ
export function target(plan, s) {
  let u = 0, brake = 0
  const la = lanesAt(s + 8)
  for (let i = 0; i < DEC.length; i++) {
    const d = DEC[i], o = d.opts[plan[i] ?? 0]
    if (o.lane != null) { if (la.br && BRANCHES.indexOf(la.br) === [0, 2, 4, 6].indexOf(i) && la.n > 1) u = la.offs[o.lane] + (o.du ? interp(o.du, s) : 0) }
    else if (s > d.s + 8 && s < d.end) u = interp(o.u, s)
    if (o.brake) for (const [a, b] of o.brake) if (s > a && s < b) brake = 1
  }
  return { u, brake }
}
export function makeBot(kind = 'plan', o = {}) {
  return { kind, delay: o.delay ?? 0, noise: o.noise ?? 0, perr: o.perr ?? 0, plan: o.plan ? o.plan.slice() : DEC.map(() => defaultOpt(DEC.indexOf)), R: o.R || rng(o.seed || 1), hist: [], uErr: 0, decided: {}, endU: 0, endBrake: 0, tries: o.tries ?? 10 }
}
function defaultOpt() { return 0 }
const CENTER = [1, 2, 2, 1, 1, 1, 1] // 何もしない時と同じ道（真ん中）
export function centerPlan() { return CENTER.slice() }
// 1コマ分の入力を決める
export function botInput(bot, run) {
  const b = run.b
  bot.hist.push(b.x, b.z, b.vx, b.vz)
  const lag = Math.round(bot.delay / DT)
  const k = Math.max(0, bot.hist.length / 4 - 1 - lag) * 4
  const sx = bot.hist[k], sz = bot.hist[k + 1], svx = bot.hist[k + 2], svz = bot.hist[k + 3]
  if (bot.hist.length > 4 * 200) bot.hist.splice(0, 4)
  if (bot.kind === 'idle') return { steer: 0, brake: 0 }
  if (bot.kind === 'plan' || bot.kind === 'human') decide(bot, run)
  let { u: tu, brake } = target(bot.plan, sz)
  if (sz > 925 && (bot.kind === 'plan' || bot.kind === 'human')) { tu = bot.endU; brake = bot.endBrake }
  if (bot.noise) { if (bot.R() < 0.02) bot.uErr = (bot.R() - 0.5) * 2 * bot.noise; tu += bot.uErr }
  const u = sx - cx(sz), dcx = (cx(sz + 1) - cx(sz - 1)) / 2, vlat = svx - dcx * svz
  const steer = clamp(-((tu - u) * 0.32 - vlat * 0.32), -1, 1)
  return { steer, brake }
}
// 決めどころの少し前で、選び方ごとに先を何通りか試し、胴体の真ん中に一番近づく物を選ぶ（人は見積もりに誤差がある）
function decide(bot, run) {
  const b = run.b
  const [lo, hi] = bodyRange(run.headR), mid = (lo + hi) / 2
  for (let i = 0; i < DEC.length; i++) {
    const d = DEC[i]
    if (bot.decided[i] || b.z < d.s - 2) continue
    bot.decided[i] = 1
    const perc = bot.perr ? 1 + (bot.R() - 0.5) * 2 * bot.perr : 1
    let bestJ = 0, bestScore = 1e9
    for (let j = 0; j < d.opts.length; j++) {
      let sc = 1e9
      for (let t = 0; t < bot.tries; t++) {
        const plan = bot.plan.slice(); plan[i] = j
        for (let k = i + 1; k < DEC.length; k++) plan[k] = Math.floor(bot.R() * DEC[k].opts.length)
        const sim = cloneRun(run); sim.b.r *= perc
        const sb = makeBot('lanes', { plan })
        let n = 0; while (!sim.done && sim.b.z < 925 && n++ < 9000) step(sim, botInput(sb, sim))
        // 村の手前の大きさで見る（村では最後に少し調整できる）
        const r = sim.done ? (sim.end.key === 'body' ? sim.b.r : -9) : sim.b.r
        const s1 = Math.abs(r - mid)
        if (s1 < sc) sc = s1
      }
      if (sc < bestScore) { bestScore = sc; bestJ = j }
    }
    bot.plan[i] = bestJ
  }
  // 村: 小さければ雪の土手（深雪）、大きければ焚き火のそばを通ってブレーキ
  if (b.z > 905) {
    const r = b.r * (bot.perr ? 1 + bot.uErr * 0.02 : 1)
    bot.endU = r < mid - 0.04 ? 5.8 : r > mid + 0.05 ? -2.2 : 0
    bot.endBrake = r > mid + 0.05 && b.z > 938 && b.z < 960 ? 1 : 0
  }
}
export function playOut(seed, kind, o = {}) {
  const run = newRun(seed, o.run || {})
  const bot = makeBot(kind, o)
  let n = 0; while (!run.done && n++ < 12000) step(run, botInput(bot, run))
  return { run, bot }
}
