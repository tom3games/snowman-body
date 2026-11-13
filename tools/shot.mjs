import '../mute-auto.mjs'
// 画面を撮る。node tools/shot.mjs [w] [h] [名前]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = new URL('..', import.meta.url).pathname
const OUT = process.env.OUT || ROOT + 'shots'
mkdirSync(OUT, { recursive: true })
const PORT = 5000 + Math.floor(Math.random() * 900)
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const W = +(process.argv[2] || 390), H = +(process.argv[3] || 844), NAME = process.argv[4] || 'p'
const plan = process.env.PLAN ? JSON.parse(process.env.PLAN) : null
const stops = (process.env.STOPS || '20,95,150,240,300,360,470,600,640,760,850,950').split(',').map(Number)
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, locale: process.env.LANG2 || 'ja-JP', hasTouch: W < 700, isMobile: W < 700 })
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push('pageerror ' + e.message)); p.on('console', m => { if (m.type() === 'error') errs.push('console ' + m.text()) })
p.on('requestfailed', r => { if (!/fonts\.g/.test(r.url())) errs.push('reqfail ' + r.url()) })
await p.goto(`http://localhost:${PORT}/?seed=${process.env.SEED || 3}${process.env.Q || ''}`)
await p.waitForFunction(() => window.__snowReady, null, { timeout: 30000 })
await p.waitForTimeout(1500)
await p.screenshot({ path: `${OUT}/${NAME}-title.png` })
await p.evaluate(() => window.snowman.start())
await p.evaluate(() => window.snowman.pause(true))
await p.evaluate(pl => window.snowman.bot(pl ? 'lanes' : 'plan', pl ? { plan: pl } : {}), plan)
for (const z of stops) {
  const st = await p.evaluate(async z => { const s = window.snowman; let n = 0; while (s.run.b.z < z && s.G.state === 'play' && n < 6000) { s.stepN(30); n += 30 } for (let i = 0; i < 12; i++) { s.stepN(1); await new Promise(r => requestAnimationFrame(r)) } return { z: s.run.b.z, r: s.run.b.r, state: s.G.state } }, z)
  if (st.state !== 'play') break
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
  await p.screenshot({ path: `${OUT}/${NAME}-z${z}.png` })
  console.log('z', z, JSON.stringify(st))
}
await p.evaluate(() => window.snowman.pause(false))
await p.waitForFunction(() => window.snowman.G.state === 'result' || window.snowman.G.state === 'play', null, { timeout: 5000 }).catch(() => {})
for (let i = 0; i < 60; i++) { const s = await p.evaluate(() => window.snowman.G.state); if (s === 'result') break; if (s === 'play') await p.evaluate(() => window.snowman.stepN(60)); await p.waitForTimeout(250) }
await p.waitForTimeout(800)
await p.screenshot({ path: `${OUT}/${NAME}-result.png` })
console.log('end', JSON.stringify(await p.evaluate(() => window.__lastEnd)))
console.log(errs.length ? errs.join('\n') : 'no errors')
await b.close(); srv.kill()
