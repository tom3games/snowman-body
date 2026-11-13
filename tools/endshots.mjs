import '../mute-auto.mjs'
// 結末ごとに演出の途中と絵日記を撮る。node tools/endshots.mjs [key,...]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname, OUT = ROOT + 'shots/end'
mkdirSync(OUT, { recursive: true })
const PORT = 5000 + Math.floor(Math.random() * 900)
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const KEYS = (process.argv[2] || 'body,head,rabbit,house,avalanche,puddle,bullet,contest,tunnel,onsen').split(',')
// どこで・どの大きさで終わるか
const AT = { body: [960, 0, 0.6], head: [960, 0, 0.42], rabbit: [960, 0, 0.16], house: [962, 0, 1.3], avalanche: [955, 0, 2.2], puddle: [600, 0, 0.09], bullet: [878, 'school', 0.25], contest: [403, 'resort', 1.6], tunnel: [589, 'tunnel', 1.3], onsen: [638, 'onsenpool', 0.5] }
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: process.env.LANG2 || 'ja-JP', hasTouch: true, isMobile: true })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()) })
await p.goto(`http://localhost:${PORT}/?seed=5&w=sunny&h=0.32`)
await p.waitForFunction(() => window.__snowReady, null, { timeout: 30000 })
await p.waitForTimeout(1200)
for (const key of KEYS) {
  const [z, lane, r] = AT[key]
  await p.evaluate(({ z, lane, r }) => new Promise(async res => {
    const s = window.snowman
    s.start(5)
    const C = await import('./js/course.js?v=1')
    let x = C.cx(z)
    if (lane === 'onsenpool') x = C.laneX(C.POOL.s, 'onsen') + C.POOL.du - 1.2
    else if (lane) x = C.laneX(z, lane)
    s.setRun({ x, z, r, vx: 0, vz: 8 })
    res()
  }), { z, lane, r })
  // 実際の物理で結末まで進める（仕掛けは本物の判定で起こす）
  let st = ''
  for (let i = 0; i < 40; i++) { st = await p.evaluate(k => { const s = window.snowman; if (s.G.state === 'play') { const inp = k === 'onsen' ? { steer: -1, brake: 0 } : { steer: 0, brake: 0 }; s.stepN(30, inp) } return s.G.state + ':' + (window.__lastEnd ? window.__lastEnd.key : '') + ':' + s.G.endKey }, key); if (!st.startsWith('play')) break }
  await p.waitForTimeout(1800)
  await p.screenshot({ path: `${OUT}/${key}-mid.png` })
  await p.waitForFunction(() => window.snowman.G.state === 'result', null, { timeout: 15000 }).catch(() => {})
  await p.waitForTimeout(700)
  await p.screenshot({ path: `${OUT}/${key}-res.png` })
  console.log(key, '->', await p.evaluate(() => JSON.stringify(window.__lastEnd)), st)
}
console.log(errs.length ? errs.join('\n') : 'no errors')
await b.close(); srv.kill()
