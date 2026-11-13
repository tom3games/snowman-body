import './mute-auto.mjs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
// 検証。node verify.mjs
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = +(process.env.VPORT || 5400 + Math.floor(Math.random() * 400))
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
for (let i = 0; i < 40; i++) { try { const r = await fetch(`http://localhost:${PORT}/`); if (r.ok) break } catch (e) {} await new Promise(r => setTimeout(r, 150)) }
const URL0 = `http://localhost:${PORT}/`
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(msg) }
const GPU = { args: [...MUTE_LAUNCH.args, '--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
async function open(browser, opts = {}, q = '') {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|googletagmanager/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0 + q); await p.waitForFunction(() => window.__snowReady, null, { timeout: 40000 })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button')) { if (!el.offsetParent || getComputedStyle(el.closest('#pad') || el).visibility === 'hidden') continue; const r = el.getBoundingClientRect(); if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom)) }
  return { H, over: over.slice(0, 6) }
})
// 画面の重なり: 柱・道しるべ・ボタンが互いに重ならない
const overlaps = q => q.evaluate(() => {
  const ids = ['sign', 'post', 'sizeT', 'bL', 'bB', 'bR', 'bMute2'], R = {}
  for (const id of ids) { const e = document.getElementById(id); if (e && e.offsetParent) R[id] = e.getBoundingClientRect() }
  const bad = []
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const a = R[ids[i]], b = R[ids[j]]; if (a && b && a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) bad.push(ids[i] + '/' + ids[j]) }
  return bad
})
const canvasVar = (p, sel) => p.evaluate(sel => { const c = document.querySelector(sel), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return Math.round(s2 / n - (s / n) ** 2) }, sel)
// WebGL の画面が描けているか（ほぼ単色でない）
const glVar = p => p.evaluate(() => { window.snowman.render(); const c = document.querySelector('#view canvas'); const x = document.createElement('canvas'); x.width = 64; x.height = 128; const g = x.getContext('2d'); g.drawImage(c, 0, 0, 64, 128); const d = g.getImageData(0, 0, 64, 128).data; let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { const v = d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11; s += v; s2 += v * v; n++ } return Math.round(s2 / n - (s / n) ** 2) })

const browser = await chromium.launch(GPU)
const p = await open(browser, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?seed=7&w=sunny&h=0.32')
await t('起動時にエラーが出ない', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', JSON.stringify(r)); return r
})
await t('OGP 一式と canonical・転送がある', async () => {
  const r = await p.evaluate(() => ['og:title', 'og:description', 'og:image', 'og:url', 'og:type'].map(k => !!document.querySelector(`meta[property="${k}"]`)).concat(!!document.querySelector('meta[name="twitter:card"]'), !!document.querySelector('link[rel=canonical]'), !!document.getElementById('ghMove')))
  expect(r.every(Boolean), JSON.stringify(r))
})
await t('タイトルの3Dが描けている（輝度のばらつき）', async () => { const v = await glVar(p); expect(v > 150, v); return v })
await t('始めるボタンを指で押すと遊びが始まる・音を鳴らしても無音', async () => {
  const bx = await p.evaluate(() => { const r = document.getElementById('bStart').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await p.touchscreen.tap(bx.x, bx.y)
  await p.waitForFunction(() => window.snowman.G.state === 'play', null, { timeout: 4000 })
  const r = await p.evaluate(() => ({ calls: window.__soundCalls, ok: window.__muteOk() }))
  expect(r.ok, JSON.stringify(r)); return r
})
await t('物理は固定 60Hz（60 回進めると 1 秒）', async () => {
  const r = await p.evaluate(() => { const s = window.snowman; s.pause(true); const t0 = s.run.t; s.stepN(60, { steer: 0, brake: 0 }); return +(s.run.t - t0).toFixed(4) })
  expect(Math.abs(r - 1) < 1e-6, r); return r
})
await t('右の手袋を本物の指で押している間、雪玉が画面の右（-x）へ曲がる', async () => {
  const r = await p.evaluate(() => { const s = window.snowman; s.pause(true); return s.btnXY('bR') })
  await p.evaluate(() => window.snowman.setRun({ x: 0, z: 20, vx: 0, vz: 6, r: 0.3 }))
  const x0 = await p.evaluate(() => { const C = window.snowman.run.b; return C.x })
  await p.mouse.move(r.x, r.y); await p.mouse.down()
  const pressed = await p.evaluate(() => window.snowman.G.btn.R)
  await p.evaluate(() => window.snowman.stepN(60))
  await p.mouse.up()
  const x1 = await p.evaluate(() => window.snowman.run.b.x)
  // 同じ所から押さずに進めた場合
  await p.evaluate(() => window.snowman.setRun({ x: 0, z: 20, vx: 0, vz: 6, r: 0.3 }))
  await p.evaluate(() => window.snowman.stepN(60))
  const x2 = await p.evaluate(() => window.snowman.run.b.x)
  expect(pressed === 1 && x1 < x2 - 1, JSON.stringify({ pressed, x0, x1, x2 })); return { pressed, dx: +(x1 - x2).toFixed(2) }
})
await t('ブレーキ: 小さい玉は効き、大きい玉は効きにくい', async () => {
  const r = await p.evaluate(async () => {
    const P = await import('./js/phys.js?v=1'), C = await import('./js/course.js?v=1')
    const f = (r, br) => { const run = P.newRun(1, { weather: 'cloudy' }); Object.assign(run.b, { x: C.cx(690), z: 690, vx: 0, vz: 12, r }); for (let i = 0; i < 60; i++) P.step(run, { steer: 0, brake: br }); return run.b.sp }
    return { small: +(f(0.3, 0) - f(0.3, 1)).toFixed(2), big: +(f(1.8, 0) - f(1.8, 1)).toFixed(2) }
  })
  expect(r.small > r.big * 3 && r.big > 0, JSON.stringify(r)); return r
})
await t('キーボード ← → ↓ が入力になる', async () => {
  await p.evaluate(() => window.snowman.setRun({ x: 0, z: 20, vx: 0, vz: 6, r: 0.3 }))
  await p.keyboard.down('ArrowLeft'); await p.evaluate(() => window.snowman.stepN(40)); await p.keyboard.up('ArrowLeft')
  const xl = await p.evaluate(() => window.snowman.run.b.x)
  await p.keyboard.down('ArrowDown'); const br = await p.evaluate(() => { window.snowman.stepN(1); return window.snowman.G.inp.brake }); await p.keyboard.up('ArrowDown')
  expect(xl > 0.6 && br === 1, JSON.stringify({ xl, br })); return { xl: +xl.toFixed(2), br }
})
await t('同じ種・同じ入力なら同じ結果（決定的）', async () => {
  const r = await p.evaluate(async () => {
    const P = await import('./js/phys.js?v=1'), B = await import('./js/bot.js?v=1')
    const go = () => { const run = P.newRun(42), bot = B.makeBot('lanes', { plan: [0, 2, 1, 0, 2, 1, 2] }); while (!run.done) P.step(run, B.botInput(bot, run)); return run.end.key + ':' + run.b.r.toFixed(6) + ':' + run.steps }
    return [go(), go()]
  })
  expect(r[0] === r[1], JSON.stringify(r)); return r[0]
})
await t('何もしないと胴体にならない（天気3つ × 頭の大きさ3つ）', async () => {
  const r = await p.evaluate(async () => {
    const P = await import('./js/phys.js?v=1'), out = {}
    for (const w of ['sunny', 'cloudy', 'snowing']) for (const h of [0.27, 0.32, 0.37]) { const run = P.newRun(1, { weather: w, headR: h }); while (!run.done) P.step(run, { steer: 0, brake: 0 }); out[run.end.key] = (out[run.end.key] || 0) + 1 }
    return out
  })
  expect(!r.body, JSON.stringify(r)); return r
})
await t('遊び中: 一画面・はみ出しなし・柱とボタンが重ならない', async () => {
  await p.evaluate(() => { window.snowman.setRun({ x: 0, z: 100, vx: 0, vz: 8, r: 0.5 }); window.snowman.stepN(5) })
  const f = await fit(p), o = await overflow(p), ov = await overlaps(p)
  await p.screenshot({ path: ROOT + '/shots/v-play.png' })
  expect(!f.over.length && o.sw <= o.W && !o.bad.length && !ov.length, JSON.stringify({ f, o, ov }))
})
await t('最後まで進めると結末 → 絵日記が描けて、図鑑に残る', async () => {
  await p.evaluate(() => { window.snowman.setRun({ x: 4.2, z: 960, vx: 0, vz: 8, r: 0.6 }); window.snowman.pause(false) })
  await p.waitForFunction(() => window.snowman.G.state === 'result', null, { timeout: 20000 })
  const v = await canvasVar(p, '#res'), z = await p.evaluate(() => JSON.parse(localStorage.getItem('snowman-zukan') || '{}'))
  await p.screenshot({ path: ROOT + '/shots/v-result.png' })
  expect(v > 300 && z.body && z.body.n === 1, JSON.stringify({ v, z })); return { v, z }
})
await t('結果画面: 一画面・はみ出しなし', async () => { const f = await fit(p), o = await overflow(p); expect(!f.over.length && o.sw <= o.W && !o.bad.length, JSON.stringify({ f, o })) })
await t('Xでポストの文に結末と URL が入る', async () => {
  const u = await p.evaluate(() => new Promise(res => { const o = window.open; window.open = (u) => { window.open = o; res(u) }; document.getElementById('bPost').click() }))
  expect(/x\.com\/intent\/post/.test(u) && /tom3games\.com%2Fplay%2Fsnowman-body/.test(u) && /%E8%83%B4%E4%BD%93/.test(u), u); return u.slice(0, 80)
})
await t('英語に切り替えられる', async () => {
  await p.evaluate(() => document.getElementById('bBack').click())
  await p.evaluate(() => document.getElementById('bLang').click())
  const s = await p.evaluate(() => [document.getElementById('bStartT').textContent, document.getElementById('tH2').textContent])
  await p.evaluate(() => document.getElementById('bLang').click())
  expect(s[0] === 'Roll' && /Body/.test(s[1]), JSON.stringify(s)); return s
})
await t('エラーなし（通しのあと）', async () => { expect(p.errs.length === 0, p.errs.join('|')) })
await p.close()

// ---- スマホ縦3サイズ × タイトル・遊び・結果
for (const [w, h, name] of [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'max']]) {
  const q = await open(browser, { viewport: { width: w, height: h }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, '?seed=3&w=cloudy')
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.evaluate(() => { window.snowman.start(3); window.snowman.pause(true); window.snowman.setRun({ x: 0, z: 140, vx: 0, vz: 8, r: 0.5 }); window.snowman.stepN(3) })
  views.play = await fit(q); const ov = await overlaps(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-play.png` })
  await q.evaluate(() => { window.snowman.setRun({ x: 4.2, z: 966, vx: 0, vz: 8, r: 1.2 }); window.snowman.pause(false) })
  await q.waitForFunction(() => window.snowman.G.state === 'result', null, { timeout: 20000 })
  await q.waitForTimeout(600)
  views.result = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, JSON.stringify(r)) })
  await t(`${name}: 柱とボタンが重ならない`, async () => { expect(!ov.length, JSON.stringify(ov)) })
  await t(`${name}: はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(o.sw <= o.W && !o.bad.length && !q.errs.length, JSON.stringify(o) + q.errs.join('|')) })
  await q.close()
}
// ---- X のアプリ内（下に 52px の帯）
{
  const q = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, '?inapp=x')
  await q.evaluate(() => { window.snowman.start(3); window.snowman.pause(true) })
  const r = await q.evaluate(() => { const b = document.getElementById('bB').getBoundingClientRect(), l = document.getElementById('bL').getBoundingClientRect(); return { gap: Math.round(innerHeight - Math.max(b.bottom, l.bottom)), inapp: getComputedStyle(document.documentElement).getPropertyValue('--inapp-bot') } })
  await t('X のアプリ内: 手袋と長靴が下の帯（52px）に入らない', async () => { expect(r.gap >= 52, JSON.stringify(r)); return r })
  await q.close()
}
await browser.close()
// ---- WebKit（iPhone 相当）
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 }, '?seed=4')
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented })
  expect(r, r)
})
await t('WebKit: 指で始めて、手袋を押せて、実際には無音', async () => {
  const bx = await wp.evaluate(() => { const r = document.getElementById('bStart').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 } })
  await wp.touchscreen.tap(bx.x, bx.y)
  await wp.waitForFunction(() => window.snowman.G.state === 'play', null, { timeout: 5000 })
  const r = await wp.evaluate(() => ({ ok: window.__muteOk(), st: window.snowman.G.state }))
  expect(r.ok, JSON.stringify(r)); return r
})
await t('WebKit: 描けている・エラーなし', async () => { const v = await glVar(wp); expect(v > 100 && wp.errs.length === 0, v + ' ' + wp.errs.join('|')); return v })
await wb.close()
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
