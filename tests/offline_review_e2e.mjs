// Offline edge cases found in review: two tabs, discard while sending, dependent changes, a failing device,
// gateway errors, who is signed in, logging out offline, and stock shown for a finished treatment.
//   node tests/offline_review_e2e.mjs <site-url> <staff-email> <staff-pw> [<other-staff-email> <other-staff-pw>]
// The staff user's language must be English. Needs puppeteer-core and Chrome (CHROME=/path to override).
// The second staff user is only needed for the "session switch" case (skipped without it).
import { start, sleep, text, clickText, fillLabel, serverClient } from './offline_helpers.mjs'

const [SITE, S_USER, S_PW, OTHER_USER, OTHER_PW] = process.argv.slice(2)
let fails = 0
const check = (label, ok, extra = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, extra)
  if (!ok) fails++
}
const { b, p } = await start()
const server = await serverClient(SITE, S_USER, S_PW)
const rand = () => Math.random().toString(36).slice(2, 6)
const flat = async (page = p) => (await text(page)).replace(/\n+/g, ' ')
const H = (m) => 'sky_healthcare.health.' + m

const idb = (page, fn, ...args) =>
  page.evaluate(
    (fn, args) =>
      new Promise((res) => {
        const r = indexedDB.open('sky_healthcare')
        r.onsuccess = () => new Function('db', 'args', 'return (' + fn + ')(db, args)')(r.result, args).then(res)
      }),
    fn.toString(),
    args,
  )
const outbox = (page = p) =>
  idb(page, (db) => new Promise((res) => { const q = db.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => res((q.result || []).sort((a, b) => a.order - b.order)) }))
const putItem = (item, page = p) =>
  idb(page, (db, [item]) => new Promise((res) => { const t = db.transaction('outbox', 'readwrite'); t.objectStore('outbox').put(item, item.id); t.oncomplete = () => res(true) }), item)
const delItem = (id, page = p) =>
  idb(page, (db, [id]) => new Promise((res) => { const t = db.transaction('outbox', 'readwrite'); t.objectStore('outbox').delete(id); t.oncomplete = () => { new BroadcastChannel('sky_healthcare.outbox').postMessage(1); res(true) } }), id)
const waitFor = async (fn, n = 60) => { for (let i = 0; i < n; i++) { if (await fn()) return true; await sleep(1000) } return false }
let seq = 0
const item = (method, data, extra = {}) => ({
  id: 'review-' + rand() + seq, method, data: { ...data, client_id: 'cid-' + rand() + seq++ }, label: method, summary: '', attempts: 0, at: Date.now(), order: Date.now() * 1000 + seq,
  user: S_USER, status: 'waiting', ...extra,
})
const patientsLike = async (q) => await server.read(H('patients'), '?search=' + encodeURIComponent(q))
const SIGNED_IN = S_USER

async function newPatient(page, name) {
  await page.bringToFront()
  await clickText(page, 'Patients', 'a'); await sleep(500)
  await clickText(page, 'New patient'); await sleep(400)
  await fillLabel(page, 'First name', name); await fillLabel(page, 'Last name', 'Review')
  await clickText(page, 'Female'); await clickText(page, 'Register patient'); await sleep(1200)
}
async function openApp(page) {
  await page.goto(SITE + '/sky-healthcare/', { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => document.body.innerText.includes('Medicines'), { timeout: 20000 })
}
const reload = async (page = p) => { await page.reload({ waitUntil: 'networkidle0' }); await page.waitForFunction(() => document.body.innerText.includes('Medicines'), { timeout: 20000 }); await sleep(800) }

// ===================================================================== 1. two tabs share one outbox
{
  const A = 'TabA' + rand(), B = 'TabB' + rand()
  const p2 = await b.newPage(); await p2.setViewport({ width: 1280, height: 860 })
  await openApp(p2)
  await p.setOfflineMode(true); await p2.setOfflineMode(true); await sleep(1500)
  await newPatient(p, A)
  await newPatient(p2, B)
  await sleep(1500)
  check('tabs: each tab sees the change of the other', (await outbox(p)).length === 2 && (await flat(p2)).includes('2 to send'), String((await outbox(p)).length))
  await p.close() // the first tab is closed with its change still waiting
  await p2.setOfflineMode(false)
  const ok = await waitFor(async () => (await outbox(p2)).length === 0, 60)
  const a = await patientsLike(A), bb = await patientsLike(B)
  check('tabs: after closing a tab, both changes reach the server once', ok && a.length === 1 && bb.length === 1, `${a.length}/${bb.length}`)
  await p2.close()
}
const page = await b.newPage(); await page.setViewport({ width: 1280, height: 860 })
const P = page
await openApp(P)

// ===================================================================== 2. a change discarded while sending is not sent
{
  const X = 'Disc1' + rand(), Y = 'Disc2' + rand()
  await P.setOfflineMode(true)
  const one = item('sky_healthcare.health.save_patient', { first_name: X, last_name: 'Review', sex: 'Female' })
  const two = item('sky_healthcare.health.save_patient', { first_name: Y, last_name: 'Review', sex: 'Female' })
  await putItem(one, P); await putItem(two, P)
  await reload(P).catch(() => {})
  await P.setRequestInterception(true)
  let held = false
  P.on('request', async (req) => {
    if (req.method() === 'POST' && req.url().includes('save_patient') && !held) { held = true; await sleep(5000) }
    req.continue().catch(() => {})
  })
  await P.setOfflineMode(false)
  await P.evaluate(() => window.dispatchEvent(new Event('online')))
  await waitFor(async () => held, 15)
  await delItem(two.id, P) // another tab (or the person) discards the second change while the first is being sent
  await waitFor(async () => (await outbox(P)).length === 0, 30)
  await sleep(1500)
  P.removeAllListeners('request'); await P.setRequestInterception(false)
  check('discard: the first change was sent', (await patientsLike(X)).length === 1)
  check('discard: the discarded change was not sent', (await patientsLike(Y)).length === 0)
}

// ===================================================================== 3. a refused change holds back everything that needs it, and Try again releases them
{
  const D = 'Dep' + rand()
  const templates = await server.read(H('procedure_templates'))
  await P.setOfflineMode(true)
  const parent = item('sky_healthcare.health.save_patient', { first_name: '', last_name: 'Review', sex: 'Female' }, { localId: 'local:' + rand() + 'p', creates: 'patient', idField: 'name' })
  const child = item('sky_healthcare.health.record_procedure', { patient: parent.localId, template: templates[0].name, items: [], complete: 0, date: new Date().toISOString().slice(0, 10) }, { localId: 'local:' + rand() + 'c', creates: 'procedure', idField: 'name' })
  const grand = item('sky_healthcare.health.complete_procedure', { name: child.localId })
  for (const i of [parent, child, grand]) await putItem(i, P)
  await reload(P).catch(() => {})
  await P.setOfflineMode(false)
  await P.evaluate(() => window.dispatchEvent(new Event('online')))
  await waitFor(async () => (await outbox(P)).filter((x) => x.status === 'failed').length === 3, 30)
  const q = await outbox(P)
  check('dependencies: the refused change and everything that needs it are failed', q.length === 3 && q.every((x) => x.status === 'failed'), q.map((x) => x.status).join(','))
  check('dependencies: nothing was sent with a temporary id', q.every((x) => !x.error?.includes('local:')))
  // the person fixes the first change (here: the missing name) and tries again
  const fixed = { ...q[0], data: { ...q[0].data, first_name: D }, status: 'failed' }
  await putItem(fixed, P)
  await reload(P)
  await sleep(1200)
  await clickText(P, 'Review'); await sleep(600)
  await clickText(P, 'Try again', 'button', '*[@role="dialog"]'); await sleep(500)
  const ok = await waitFor(async () => (await outbox(P)).length === 0, 40)
  const patient = (await patientsLike(D))[0]
  check('dependencies: Try again on the first change sends all three', ok && !!patient, ok ? '' : JSON.stringify((await outbox(P)).map((x) => x.status)))
  if (patient) {
    const file = await server.read(H('patient'), '?name=' + encodeURIComponent(patient.name))
    check('dependencies: the treatment exists on the real patient and is done', (file.procedures || []).length === 1 && (file.procedures[0].state === 'done' || file.procedures[0].status === 'Completed'))
  }
  await P.keyboard.press('Escape')
}

// ===================================================================== 4. another person's changes are neither shown nor sent
{
  const O = 'Other' + rand()
  const theirs = item('sky_healthcare.health.save_patient', { first_name: O, last_name: 'Review', sex: 'Male' }, { user: 'someone.else@example.com' })
  await putItem(theirs, P)
  await reload(P)
  await sleep(7000)
  const bar = await flat(P)
  check("people: another person's waiting change is not counted or shown", !/\d+ to send/.test(bar) && !bar.includes(O))
  check("people: it is not sent under this account", (await patientsLike(O)).length === 0)
  check('people: it stays on the device for its owner', (await outbox(P)).some((x) => x.id === theirs.id))
  await delItem(theirs.id, P)
}

// ===================================================================== 5. the device cannot store a change
{
  const S = 'Store' + rand()
  await reload(P)
  await P.evaluate(() => { const real = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (...a) { if (this.name === 'outbox') throw new DOMException('full', 'QuotaExceededError'); return real.apply(this, a) } })
  await P.setOfflineMode(true); await sleep(1500)
  await newPatient(P, S)
  await sleep(600)
  const t = await flat(P)
  check('storage: the person is told the change is not saved on the device', t.includes('Not saved on this device') || t.includes("can't be kept on this device"), '')
  await P.setOfflineMode(false)
  await reload(P)
}

// ===================================================================== 6. gateway errors (502/503/504) are counted and spaced out, not hammered
{
  const G = 'Gate' + rand()
  await P.setOfflineMode(true)
  await putItem(item('sky_healthcare.health.save_patient', { first_name: G, last_name: 'Review', sex: 'Female' }), P)
  await reload(P).catch(() => {})
  await P.setRequestInterception(true)
  let hits = 0, block = true
  P.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('save_patient') && block) { hits++; req.respond({ status: 504, contentType: 'text/html', body: 'Gateway Time-out' }); return }
    req.continue().catch(() => {})
  })
  await P.setOfflineMode(false)
  await P.evaluate(() => window.dispatchEvent(new Event('online')))
  await sleep(14000)
  const t = await flat(P)
  check('gateway: a proxy answering 504 is tried a few times, with growing pauses', hits >= 2 && hits <= 4, `${hits} tries in 14 s`)
  check('gateway: the app does not claim to be offline', !t.includes("You're offline"))
  check('gateway: the change is kept', (await outbox(P)).length === 1)
  // the count must survive between passes, or the limit is never reached and the change is retried forever
  check('gateway: the tries are counted on the device', (await outbox(P))[0]?.attempts >= 2, `attempts=${(await outbox(P))[0]?.attempts}`)
  block = false
  const ok = await waitFor(async () => (await outbox(P)).length === 0, 60)
  P.removeAllListeners('request'); await P.setRequestInterception(false)
  check('gateway: when the server answers again it is sent once', ok && (await patientsLike(G)).length === 1)
}

// ===================================================================== 7. a slow start never shows a signed-in screen from the copy on the device
{
  await P.setRequestInterception(true)
  P.on('request', async (req) => {
    if (req.url().includes('sky_healthcare.api.boot') && !req.url().includes('login')) {
      await sleep(6000)
      return req.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ message: { user: null } }) }).catch(() => {})
    }
    req.continue().catch(() => {})
  })
  P.goto(SITE + '/sky-healthcare/', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await sleep(4500)
  const early = await flat(P)
  check('boot: while the server has not answered, the signed-in screen is not shown from the copy', !early.includes('Medicines') && !early.includes('Dashboard'), early.slice(0, 60))
  await sleep(4500)
  check('boot: when it says nobody is signed in, the login page is shown', P.url().includes('/login'), P.url())
  P.removeAllListeners('request'); await P.setRequestInterception(false)
  await openApp(P)
}

// ===================================================================== 8. finishing a planned treatment offline moves the stock shown
{
  const meds = await server.read('medicines')
  const med = meds.find((m) => m.stock >= 10) || meds[0]
  const pats = await patientsLike('')
  const patient = pats[0]
  const templates = await server.read(H('procedure_templates'))
  const planned = await server.call(H('record_procedure'), { patient: patient.name, template: templates[0].name, items: [{ medicine: med.code, qty: 3 }], complete: 0, date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) })
  const before = med.stock
  await P.goto(SITE + '/sky-healthcare/patients/' + encodeURIComponent(patient.name), { waitUntil: 'networkidle0' })
  await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith('Treatments'))?.click())
  await sleep(800)
  await P.setOfflineMode(true); await sleep(1500)
  await clickText(P, 'Mark as done', 'button', 'main'); await sleep(500)
  await clickText(P, 'Mark as done', 'button', '*[@role="dialog"]').catch(() => {}); await sleep(1200)
  const wait = (await outbox(P)).find((x) => x.method.endsWith('complete_procedure'))
  check('treatment: finishing it offline is kept as a waiting change dated today', !!wait && wait.data.date === new Date().toLocaleDateString('en-CA'), JSON.stringify(wait?.data))
  await clickText(P, 'Medicines', 'a'); await sleep(900)
  const search = await P.waitForSelector('input[placeholder^="Search"]'); await search.type(med.name); await sleep(900)
  check('treatment: the medicine list shows the stock it will use', (await flat(P)).includes(String(before - 3)), `(was ${before}, medicine ${med.name})`)
  await P.setOfflineMode(false)
  const ok = await waitFor(async () => (await outbox(P)).length === 0, 40)
  const after = (await server.read('medicines')).find((m) => m.code === med.code).stock
  check('treatment: once online it is sent and the real stock matches', ok && after === before - 3, `${before} -> ${after}`)
}

// ===================================================================== 8b. someone else signs in from another tab: this tab's changes are not sent under their account
if (OTHER_USER) {
  const N = 'Switch' + rand()
  await P.setOfflineMode(true); await sleep(1500)
  await newPatient(P, N)
  // this person's session ends, and someone else signs in from another tab of the same browser
  await P.deleteCookie({ name: 'sid', url: SITE })
  const other = await b.newPage()
  await other.goto(SITE + '/sky-healthcare/login', { waitUntil: 'domcontentloaded' })
  await other.evaluate(async (u, w) => { await fetch('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usr: u, pwd: w }) }) }, OTHER_USER, OTHER_PW)
  await P.bringToFront()
  await P.setOfflineMode(false)
  await sleep(12000)
  check('session switch: the change is not sent under the other account', (await patientsLike(N)).length === 0)
  check('session switch: the tab asks to sign in again', (await flat(P)).includes('Your session ended'))
  // the person signs in again: the change goes out under their own account
  await other.close()
  await P.evaluate(async (u, w) => { await fetch('/api/method/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usr: u, pwd: w }) }) }, S_USER, S_PW)
  await reload(P)
  await waitFor(async () => (await patientsLike(N)).length === 1, 20)
  check('session switch: once signed in again, it is sent once', (await patientsLike(N)).length === 1)
} else console.log('SKIP session switch (pass a second staff user: <other-email> <other-pw>)')

// ===================================================================== 8c. work done two days earlier is dated that day, not the day it syncs
{
  const pats = (await patientsLike('Offline')).filter((x) => x.name && !x.name.startsWith('local:'))
  const patient = pats[0]
  // a medicine whose stock arrived 6 days ago, so a give-out dated 2 days ago is valid (a movement dated before the stock existed is refused)
  const med = { name: 'ZZ Clock ' + rand() }
  const dayAgo = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA')
  await server.call('save_medicine', { name: med.name, category: 'Analgesic', unit: 'Tablet', qty: 20, date: dayAgo(6), expiry: '2030-01-01', client_id: 'cid-' + rand() })
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toLocaleDateString('en-CA')
  const back = await b.newPage(); await back.setViewport({ width: 1280, height: 860 })
  // this tab's clock runs two days behind (as on a device that was left offline, or set wrong)
  await back.evaluateOnNewDocument(() => {
    const R = Date, off = -2 * 86400000
    class D extends R { constructor(...a) { a.length ? super(...a) : super(R.now() + off) } static now() { return R.now() + off } }
    window.Date = D
  })
  await back.goto(SITE + '/sky-healthcare/patients/' + encodeURIComponent(patient.name), { waitUntil: 'networkidle0' })
  await back.waitForFunction(() => document.body.innerText.includes('New consultation'), { timeout: 20000 })
  await back.goto(SITE + '/sky-healthcare/give-out', { waitUntil: 'networkidle0' }) // keep the lists, with the new medicine, on the device
  await back.waitForFunction(() => document.body.innerText.includes('Record stock out'), { timeout: 20000 })
  await sleep(2500)
  await back.setOfflineMode(true); await sleep(1500)
  await back.goto(SITE + '/sky-healthcare/patients/' + encodeURIComponent(patient.name), { waitUntil: 'domcontentloaded' }).catch(() => {})
  await back.waitForFunction(() => document.body.innerText.includes('New consultation'), { timeout: 20000 })
  await sleep(1500)
  await clickText(back, 'New consultation'); await sleep(1200)
  await fillLabel(back, 'What the doctor observed', 'Clock test two days ago', 'textarea')
  await clickText(back, 'Finish consultation'); await sleep(1500)
  await back.goto(SITE + '/sky-healthcare/give-out', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await back.waitForFunction(() => document.body.innerText.includes('Record stock out'), { timeout: 20000 })
  await sleep(800)
  await fillLabel(back, 'Medicine', med.name.slice(0, 12))
  const opt = await back.waitForSelector(`::-p-xpath(//*[@role="option"][.//text()[normalize-space(.)=${JSON.stringify(med.name)}]])`, { visible: true, timeout: 8000 })
  await opt.click(); await sleep(400)
  await fillLabel(back, 'Quantity', '1')
  await clickText(back, 'Other authorized adjustment', 'button').catch(() => {})
  await fillLabel(back, 'Note', 'clock test').catch(() => {})
  await clickText(back, 'Record stock out'); await sleep(1500)
  await back.setOfflineMode(false)
  const sent = await waitFor(async () => (await outbox(back)).length === 0, 40)
  const file = await server.read(H('patient'), '?name=' + encodeURIComponent(patient.name))
  const c = (file.consultations || []).find((x) => x.encounter_comment === 'Clock test two days ago')
  check('clock: the consultation is recorded on that day on the server', sent && c?.encounter_date === twoDaysAgo, `${c?.encounter_date} vs ${twoDaysAgo}, sent=${sent} left=${JSON.stringify((await outbox(back)).map((x) => [x.method.split('.').pop(), x.status, x.error]))}`)
  const mv = (await server.read('movements', '?kind=out&limit=300')).find((m) => m.recipient === 'clock test')
  check('clock: the stock movement is dated that day on the server', mv && String(mv.date) === twoDaysAgo, String(mv?.date))
  await back.close()
}

// ===================================================================== 8d. cancelling a waiting treatment while the app is sending removes it for good
{
  const pat = (await patientsLike('Offline')).filter((x) => !x.name.startsWith('local:'))[0]
  const X = 'Hold' + rand()
  const before = ((await server.read(H('patient'), '?name=' + encodeURIComponent(pat.name))).procedures || []).length
  await P.goto(SITE + '/sky-healthcare/patients/' + encodeURIComponent(pat.name), { waitUntil: 'networkidle0' })
  await P.waitForFunction(() => document.body.innerText.includes('Record a treatment'), { timeout: 20000 })
  await sleep(1500)
  await P.setOfflineMode(true); await sleep(1500)
  await putItem(item('sky_healthcare.health.save_patient', { first_name: X, last_name: 'Review', sex: 'Female' }), P) // first in line: it is the one being sent
  await clickText(P, 'Record a treatment', 'button|a', 'main'); await sleep(900)
  await clickText(P, 'Fever care', 'button', '*[@role="dialog"]'); await sleep(300)
  await clickText(P, 'Planned', 'button', '*[@role="dialog"]'); await sleep(300)
  await clickText(P, 'Save as planned', 'button', '*[@role="dialog"]'); await sleep(1500)
  await P.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith('Treatments'))?.click())
  await sleep(600)
  const waiting = (await outbox(P)).filter((x) => x.method.endsWith('record_procedure'))
  check('discard: a planned treatment is waiting', waiting.length === 1)
  await P.setRequestInterception(true)
  let held = false
  P.on('request', async (req) => {
    if (req.method() === 'POST' && req.url().includes('save_patient') && !held) { held = true; await sleep(6000) }
    req.continue().catch(() => {})
  })
  await P.setOfflineMode(false)
  await P.evaluate(() => window.dispatchEvent(new Event('online')))
  await waitFor(async () => held, 15)
  // while the first change is on its way, the person cancels the waiting treatment in this same tab
  const clicked = await P.evaluate(() => { const card = [...document.querySelectorAll('article')].find((a) => a.innerText.includes('Waiting to be sent')); const b = card && [...card.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Cancel'); b?.click(); return !!b })
  check('discard: the waiting treatment has its own Cancel button', clicked)
  await sleep(600)
  await clickText(P, 'Cancel treatment', 'button', '*[@role="dialog"]').catch(() => clickText(P, 'Confirm', 'button', '*[@role="dialog"]')).catch(() => {})
  await sleep(1000)
  await waitFor(async () => (await outbox(P)).length === 0, 30)
  await sleep(1500)
  P.removeAllListeners('request'); await P.setRequestInterception(false)
  const after = ((await server.read(H('patient'), '?name=' + encodeURIComponent(pat.name))).procedures || []).length
  check('discard: the first change was sent', (await patientsLike(X)).length === 1)
  check('discard: the cancelled treatment never reached the server', after === before, `${before} -> ${after}`)
  const left = await outbox(P)
  check('discard: nothing is left waiting', left.length === 0, JSON.stringify(left.map((x) => [x.method.split('.').pop(), x.status, x.error])))
  for (const i of left) await delItem(i.id, P)
}

// ===================================================================== 8e. a tab that still holds a change another tab already sent does not send it again
{
  const made = await server.call(H('save_patient'), { first_name: 'Stale' + rand(), last_name: 'Review', sex: 'Female', client_id: 'cid-' + rand() })
  const name = made.body.message.name
  await P.setOfflineMode(true)
  const edit = item('sky_healthcare.health.save_patient', { name, first_name: 'StaleOld', last_name: 'Review', sex: 'Female' })
  await putItem(edit, P)
  const t2 = await b.newPage(); await t2.setViewport({ width: 1280, height: 860 })
  await t2.setOfflineMode(true) // offline from the start, so it cannot send the edit before the test says so
  await t2.goto(SITE + '/sky-healthcare/', { waitUntil: 'domcontentloaded' }).catch(() => {}); await t2.waitForFunction(() => document.body.innerText.includes('Medicines'), { timeout: 20000 })
  await P.reload({ waitUntil: 'domcontentloaded' }).catch(() => {}); await sleep(3000)
  await P.setOfflineMode(true)
  check('stale: both tabs hold the same waiting edit', (await outbox(P)).length === 1 && (await outbox(t2)).length === 1, `${JSON.stringify((await outbox(P)).map((x) => [x.method.split('.').pop(), x.status, x.data.first_name]))}`)
  await t2.bringToFront(); await t2.setOfflineMode(false)
  await t2.evaluate(() => window.dispatchEvent(new Event('online')))
  await waitFor(async () => (await outbox(t2)).length === 0, 30)
  const first = (await server.read(H('patient'), '?name=' + encodeURIComponent(name))).patient_name
  check('stale: the second tab sent the edit', first.startsWith('StaleOld'), first)
  await server.call(H('save_patient'), { name, first_name: 'StaleNew', last_name: 'Review', sex: 'Female', client_id: 'cid-' + rand() }) // a newer edit
  await P.bringToFront(); await P.setOfflineMode(false)
  await P.evaluate(() => window.dispatchEvent(new Event('online')))
  await sleep(8000)
  const last = (await server.read(H('patient'), '?name=' + encodeURIComponent(name))).patient_name
  check('stale: the first tab did not send the old edit again over the newer one', last.startsWith('StaleNew'), last)
  await t2.close()
}

// ===================================================================== 9. logging out with unsent changes asks first, from the Account page too
{
  await P.setOfflineMode(true); await sleep(1500)
  await putItem(item('sky_healthcare.health.save_patient', { first_name: 'LogoutKeep' + rand(), last_name: 'Review', sex: 'Female' }), P)
  await P.goto(SITE + '/sky-healthcare/account', { waitUntil: 'domcontentloaded' }).catch(() => {})
  await sleep(3000)
  await clickText(P, 'Log out', 'button', 'main'); await sleep(700)
  check('logout: the Account page warns about unsent changes', (await flat(P)).includes('not sent yet'))
  await P.keyboard.press('Escape'); await sleep(300)
  for (const i of await outbox(P)) await delItem(i.id, P)
}

// ===================================================================== 10. logging out offline ends the session as soon as the server can be reached
{
  await P.setOfflineMode(true); await sleep(1000)
  await clickText(P, 'Log out', 'button', 'main'); await sleep(2500)
  await P.setOfflineMode(false)
  await sleep(500)
  await P.goto(SITE + '/sky-healthcare/', { waitUntil: 'domcontentloaded' }).catch(() => {})
  const user = () => P.evaluate(async () => (await (await fetch('/api/method/sky_healthcare.api.boot', { cache: 'no-store' })).json()).message?.user ?? 'Guest').catch(() => '')
  await waitFor(async () => (await user()) === 'Guest', 15)
  const who = await user()
  check('logout: the next visit online has no signed-in user', who === 'Guest', 'who=' + who + ' flag=' + (await P.evaluate(() => localStorage.getItem('sky_healthcare.logout'))) + ' url=' + P.url())
  check('logout: the login page is shown', P.url().includes('/login'), P.url())
  void SIGNED_IN
}

await b.close()
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
