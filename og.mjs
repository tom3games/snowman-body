import './mute-auto.mjs'
// OGP 画像（1200x630）: 大きくなりすぎた雪玉が納屋を押しつぶす瞬間＋題名。node og.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
const ROOT = import.meta.dirname
const PORT = 5000 + Math.floor(Math.random() * 900)
const srv = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 500))
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1, locale: 'ja-JP' })
await p.goto(`http://localhost:${PORT}/?seed=11&w=sunny&h=0.32`)
await p.waitForFunction(() => window.__snowReady, null, { timeout: 30000 })
await p.waitForTimeout(1200)
await p.evaluate(async () => {
  const s = window.snowman, C = await import('./js/course.js?v=1')
  s.start(11); s.pause(true)
  s.setRun({ x: C.cx(478) + 0.4, z: 463, vx: 0, vz: 15, r: 1.55 })
  for (let i = 0; i < 400 && !s.G.run.st.smash.barn; i++) s.stepN(1, { steer: 0, brake: 0 })
  s.stepN(2, { steer: 0, brake: 0 })
  // 横の少し前から、玉が納屋を突き破る所を見る
  const b = s.G.run.b, y = C.height(b.x, b.z)
  s.G.camPos.set(b.x - 5.6, y + 2.2, b.z - 4.2); s.G.camLook.set(b.x + 0.6, y + 1.6, b.z + 2.2)
})
// 破片と雪煙を少し飛ばす（実時間で 0.35 秒だけ動かす）
await p.evaluate(() => window.snowman.pause(false))
await p.waitForTimeout(260)
await p.evaluate(() => { window.snowman.pause(true); const G = window.snowman.G, b = G.run.b; G.camPos.set(b.x - 6.2, b.y + 0.9, b.z - 4.6); G.camLook.set(b.x + 0.3, b.y + 0.6, b.z + 2.0) })
await p.evaluate(() => {
  document.getElementById('vPlay').hidden = true
  const G = window.snowman.G
  const d = document.createElement('div')
  d.innerHTML = `<div style="position:fixed;left:44px;top:34px;z-index:99;font-family:'Yuji Syuku',serif;color:#fff8ec;background:linear-gradient(#a8784e,#8a5a36);padding:14px 26px 18px;border-radius:6px;box-shadow:0 10px 26px rgba(30,40,60,.35);transform:rotate(-1.5deg)">
    <div style="font-size:34px;line-height:1.1">雪だるまの</div><div style="font-size:74px;line-height:1.05">胴体になれ</div></div>
    <div style="position:fixed;left:50px;bottom:34px;z-index:99;font-family:'Zen Kaku Gothic New',sans-serif;font-weight:900;font-size:30px;color:#1d2430;background:rgba(255,255,255,.88);padding:8px 18px;border-radius:12px">大きすぎると、家をつぶす。</div>`
  document.body.appendChild(d)
})
await p.evaluate(() => document.fonts.ready)
await p.waitForTimeout(400)
await p.screenshot({ path: ROOT + '/og.png' })
console.log('og.png')
await b.close(); srv.kill()
