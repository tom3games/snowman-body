// 81 通りの道の組み合わせで、着いた時の大きさと結末を出す。node tools/combos.mjs [天気] [head]
import { newRun, step, endingBySize, bodyRange } from '../js/phys.js'
import { makeBot, botInput } from '../js/bot.js'
const w = process.argv[2] || 'cloudy', h = +(process.argv[3] || 0.32)
const NAMES = [['林', '斜面', '尾根'], ['焚火', '沢', 'スキー'], ['トンネル', '大斜面', '温泉'], ['参道', '田んぼ', '校庭']]
const cnt = {}, rows = []
for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 3; c++) for (let d = 0; d < 3; d++) {
  const plan = [a, b, c, d], run = newRun(1, { weather: w, headR: h }), bot = makeBot('lanes', { plan })
  while (!run.done) step(run, botInput(bot, run))
  const k = run.end.key; cnt[k] = (cnt[k] || 0) + 1
  rows.push(`${plan.map((p, i) => NAMES[i][p]).join('-').padEnd(16, '　')} ${k.padEnd(9)} r=${run.b.r.toFixed(2)} t=${run.t.toFixed(0)}`)
}
if (process.env.V) console.log(rows.join('\n'))
console.log(w, 'head', h, 'body', bodyRange(h), JSON.stringify(cnt))
