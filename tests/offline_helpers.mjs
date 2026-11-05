// Offline test: use the app with the network cut (patient, consultation, medicine, stock), then reconnect and
// Helpers for offline_e2e.mjs
import puppeteer from 'puppeteer-core'
const [S, S_USER, S_PW] = process.argv.slice(2)
export { S }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
export async function start(user = S_USER, pwd = S_PW, size = { width: 1280, height: 860 }) {
  const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'], protocolTimeout: 60000 })
  const p = await b.newPage(); await p.setViewport(size)
  p.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)))
  await p.goto(S + '/sky-healthcare/login', { waitUntil: 'networkidle0' })
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true)); await sleep(1500)
  await p.evaluate(async (u, w) => { localStorage.setItem('sky_healthcare.lang', 'en'); localStorage.setItem('sky_healthcare.theme', 'light'); await fetch('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usr: u, pwd: w }) }) }, user, pwd)
  await p.goto(S + '/sky-healthcare/', { waitUntil: 'networkidle0' })
  await p.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await p.reload({ waitUntil: 'networkidle0' })
  for (let i = 0; i < 60; i++) {
    const n = await p.evaluate(() => new Promise((res) => { const r = indexedDB.open('sky_healthcare'); r.onsuccess = () => { const q = r.result.transaction('cache').objectStore('cache').count(); q.onsuccess = () => res(q.result) } }))
    if (n >= 100) break
    await sleep(1000)
  }
  return { b, p }
}
export const text = (p) => p.evaluate(() => document.body.innerText)
export async function clickText(p, label, tag = 'button|a', scope = '') {
  const sel = tag.split('|').map((t) => `self::${t}`).join(' or ')
  const el = await p.waitForSelector(`::-p-xpath(${scope ? '//' + scope : ''}//*[${sel}][normalize-space(.)="${label}" or .//span[normalize-space(.)="${label}"]])`, { visible: true, timeout: 8000 })
  await el.click(); await sleep(450)
}
const control = (p, label, kind) => p.evaluateHandle((label, kind) => {
  const l = [...document.querySelectorAll('label')].find((x) => x.innerText.trim().replace(/\s*\*$/, '').startsWith(label))
  if (!l) return null
  return (l.htmlFor && document.getElementById(l.htmlFor)) || l.parentElement.querySelector(kind) || l.querySelector(kind)
}, label, kind)
export async function fillLabel(p, label, value, kind = 'input,textarea') {
  const h = (await control(p, label, kind)).asElement()
  if (!h) throw new Error('no field ' + label)
  await h.click({ clickCount: 3 }); await h.type(String(value)); await sleep(100)
}
export async function selectLabel(p, label, value) {
  const h = (await control(p, label, 'select')).asElement()
  if (!h) throw new Error('no select ' + label)
  await h.select(value)
}
