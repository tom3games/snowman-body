// 結末の分布を数える。node tools/sim.mjs [回数=16]
import { playOut, DEC } from '../js/bot.js'
import { rng } from '../js/course.js'
import { bodyRange } from '../js/phys.js'
const N = +(process.argv[2] || 16)
const MODE = process.argv[3] || 'all'
const KINDS = {
  idle: { kind: 'idle' },
  shade: { kind: 'lanes', plan: [0, 2, 2, 1, 0, 1, 0] },   // 林・沢・トンネル・参道（全部日陰）
  sun: { kind: 'lanes', plan: [2, 2, 4, 2, 1, 2, 1] },     // 尾根・スキー場・大斜面・田んぼ（全部日なた）
  center: { kind: 'lanes', plan: [1, 2, 2, 1, 1, 1, 1] },
  random: { kind: 'random' },
  human: { kind: 'human', delay: 0.6, noise: 1.2, perr: 0.12 },
  plan: { kind: 'plan' },
}
const out = {}
for (const [name, cfg] of Object.entries(KINDS)) {
  if (MODE !== 'all' && MODE !== name) continue
  const cnt = {}, rs = [], ts = []
  for (let i = 0; i < N; i++) {
    const R = rng(1000 + i)
    const o = { ...cfg, R }
    if (cfg.kind === 'random') { o.kind = 'lanes'; o.plan = DEC.map(d => Math.floor(R() * d.opts.length)) }
    const t0 = Date.now(); const { run } = playOut(i + 1, o.kind, o); if (process.env.V) process.stdout.write(`(${Date.now() - t0}ms) `)
    const k = run.end ? run.end.key : 'none'
    cnt[k] = (cnt[k] || 0) + 1; rs.push(run.b.r.toFixed(2)); ts.push(run.t.toFixed(0))
    if (process.env.V) console.log(name, i, k, 'r', run.b.r.toFixed(2), 'head', run.headR, bodyRange(run.headR), run.weather, 't', run.t.toFixed(1), JSON.stringify(run.st.smash))
  }
  out[name] = cnt
  console.log(name.padEnd(7), JSON.stringify(cnt), ' r:', rs.join(' '), ' t:', ts.join(' '))
}
