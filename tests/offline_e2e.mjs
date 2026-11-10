// Offline test: use the app with the network cut, reconnect, and check on the server that everything arrived once.
//   node tests/offline_e2e.mjs <site-url> <staff-email> <staff-pw>
// The staff user's language must be English. Needs puppeteer-core and Chrome (CHROME=/path to override).
//
//  A. offline: patient, consultation, medicine, stock. Each shows at once, still shows after a reload, and is sent once.
//  B. a change the server refuses is kept with its reason and can be discarded.
//  C. the server answers with an error: the change is kept and sent again, then goes through.
//  D. (runs first) slow connection: the copy kept on the device is shown without waiting for the server.
import { start, sleep, text, clickText, fillLabel, serverClient } from './offline_helpers.mjs'

const [SITE, S_USER, S_PW] = process.argv.slice(2)
let fails = 0
const check = (label, ok, extra = '') => {
  console.log(ok ? 'PASS' : 'FAIL', label, extra)
  if (!ok) fails++
}
const { b, p } = await start()
const server = await serverClient(SITE, S_USER, S_PW)
const api = (m, q = '') => p.evaluate(async (m, q) => (await (await fetch('/api/method/sky_healthcare.' + m + q)).json()).message, m, q)
const outbox = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('sky_healthcare'); r.onsuccess = () => { const q = r.result.transaction('outbox').objectStore('outbox').getAll(); q.onsuccess = () => res((q.result || []).sort((a, b) => (a.order || a.at) - (b.order || b.at))) } }))
const drain = async (n = 40) => { for (let i = 0; i < n && (await outbox()).filter((x) => x.status === 'waiting' || x.status === 'sending').length; i++) await sleep(1000) }
const flat = async () => (await text(p)).replace(/\n+/g, ' ')
const pickDate = async (value) => {
  const el = await p.evaluateHandle(() => [...document.querySelectorAll('[role=dialog] input')].filter((e) => e.placeholder === 'Select a date' && !e.value)[0])
  await el.asElement().click(); await sleep(300); await p.keyboard.type(value); await p.keyboard.press('Enter'); await sleep(400)
}
const rand = () => Math.random().toString(36).slice(2, 5)

const NAME = 'Offline' + rand(), MED = 'ZZ OffMed ' + rand()
const existing = (await api('api.medicines'))[0]
const before = existing.stock

// ============================================================ D. slow connection (first: it is not used within a minute of a change, so the person never sees a copy older than their own work)
await p.setRequestInterception(true)
p.removeAllListeners('request')
p.on('request', async (req) => {
  if (req.url().includes('sky_healthcare.api.medicines')) await sleep(9000)
  req.continue().catch(() => {})
})
const t0 = Date.now()
await clickText(p, 'Dashboard', 'a'); await sleep(300)
await clickText(p, 'Medicines', 'a')
await p.waitForSelector('::-p-text(Inventory)', { timeout: 20000 }).catch(() => {})
await p.waitForFunction(() => document.body.innerText.includes('medicines on your list'), { timeout: 20000 })
const took = Date.now() - t0
check('slow: the list shows from the device without waiting for the server', took < 6500, `${took} ms`)
await p.setRequestInterception(false)
p.removeAllListeners('request')
await sleep(9500) // the delayed answer arrives and refreshes the screen

// ============================================================ A. offline
await p.setOfflineMode(true)
await sleep(1800)
check('offline: the connection bar is shown', (await flat()).includes("You're offline"))
await clickText(p, 'Patients', 'a'); await sleep(500)
await clickText(p, 'New patient'); await sleep(400)
await fillLabel(p, 'First name', NAME); await fillLabel(p, 'Last name', 'Test')
await clickText(p, 'Female'); await clickText(p, 'Register patient'); await sleep(1000)
check('offline: the new patient opens, tagged as waiting', (await flat()).includes(NAME) && (await flat()).includes('Waiting to be sent'))
await sleep(5000) // let the confirmation message go, it covers the buttons below it
await clickText(p, 'New consultation'); await sleep(900)
await fillLabel(p, 'What the doctor observed', 'Offline fever test', 'textarea')
await clickText(p, 'Finish consultation'); await sleep(1500)
check('offline: the consultation opens as a page, finished and tagged as waiting', p.url().includes('/consultations/local') && (await flat()).includes('Waiting to be sent') && (await flat()).includes('Offline fever test'))
await p.goBack(); await sleep(900) // the consultation page replaced the form, so back is the patient's file
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith('Consultations'))?.click())
await sleep(500)
check("offline: the consultation is in the patient's list", (await flat()).includes('Offline fever test'))
// a reload with no connection must not lose what is waiting, or how it is shown
await p.reload({ waitUntil: 'domcontentloaded' }); await sleep(3000)
check('offline: after a reload the waiting changes are still there and still shown', (await outbox()).length === 2 && (await flat()).includes(NAME))

// a treatment planned for that patient, then marked as done, all offline
await sleep(4000)
await clickText(p, 'Record a treatment', 'button|a', 'main'); await sleep(900)
await clickText(p, 'Fever care', 'button', '*[@role="dialog"]'); await sleep(300)
await clickText(p, 'Planned', 'button', '*[@role="dialog"]'); await sleep(300)
await clickText(p, 'Save as planned', 'button', '*[@role="dialog"]'); await sleep(1200)
await p.evaluate(() => [...document.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith('Treatments'))?.click())
await sleep(500)
check('offline: the planned treatment is in the patient file, tagged as waiting', (await flat()).includes('Fever care') && (await flat()).includes('Waiting to be sent') && (await flat()).includes('Planned'))
await clickText(p, 'Mark as done', 'button', 'main'); await sleep(500)
await clickText(p, 'Mark as done', 'button', '*[@role="dialog"]').catch(() => clickText(p, 'Mark as done', 'button')); await sleep(1000)
check('offline: marking it as done shows it as done at once', (await flat()).includes('Done') && !(await flat()).includes('Mark as done'))
const folded = (await outbox()).filter((i) => i.method.endsWith('record_procedure'))
check('offline: marking it as done changes the waiting treatment, no extra change is queued', folded.length === 1 && Number(folded[0].data.complete) === 1 && (await outbox()).length === 3)
await sleep(2000)

// a medicine made offline, with stock added to it
await clickText(p, 'Medicines', 'a'); await sleep(700)
await clickText(p, 'New medicine', 'button', 'main'); await sleep(500)
await fillLabel(p, 'Medicine name', MED)
await clickText(p, 'Choose…'); await sleep(250); await clickText(p, 'Analgesic', 'button|a|li|div'); await sleep(250)
await clickText(p, 'Add medicine'); await sleep(1200)
await sleep(5000)
await clickText(p, 'Add stock', 'button|a', 'main'); await sleep(800)
await fillLabel(p, 'Quantity received', '25')
await pickDate('5 Nov 2028')
await clickText(p, 'Add stock', 'button', '*[@role="dialog"]'); await sleep(1000)
check('offline: the new medicine shows its stock', (await flat()).includes('IN STOCK 25'))
check('offline: its history shows the stock that was added', (await flat()).includes('Received') && (await flat()).includes('25'))

// stock added to an existing medicine
await clickText(p, 'Medicines', 'a'); await sleep(700)
const search = await p.waitForSelector('input[placeholder^="Search"]'); await search.type(existing.name); await sleep(600)
await sleep(4000)
await clickText(p, 'Stock', 'button', 'main'); await sleep(700)
await fillLabel(p, 'Quantity received', '10')
await pickDate('5 Nov 2028')
await clickText(p, 'Add stock', 'button', '*[@role="dialog"]'); await sleep(1000)
check('offline: the existing medicine shows the added stock in the list', (await flat()).includes(String(before + 10)), `(was ${before})`)
await clickText(p, 'Dashboard', 'a'); await sleep(900)
check('offline: the top bar counts the waiting changes', /[5-9] to send/.test(await flat()), (await flat()).match(/\d+ to send/)?.[0])
const q = await outbox()
check('offline: the changes wait on the device, in order', q.map((i) => i.method.split('.').pop()).join(',') === 'save_patient,save_consultation,record_procedure,save_medicine,add_stock,add_stock', q.map((i) => i.method.split('.').pop()).join(','))
await p.screenshot({ path: 'f-1-offline.png' })

// reconnect
await p.setOfflineMode(false)
await sleep(2500)
await p.screenshot({ path: 'f-2-syncing.png' })
await drain()
check('online: everything was sent', (await outbox()).length === 0)
await sleep(800)
const found = await api('health.patients', '?search=' + encodeURIComponent(NAME))
check('server: the patient exists once', found.length === 1 && !found[0].name.startsWith('local:'), found.map((x) => x.name).join(','))
const file = await api('health.patient', '?name=' + encodeURIComponent(found[0].name))
check('server: the consultation is finished', file.consultations.length === 1 && file.consultations[0].state === 'done')
const med = await api('api.medicine', '?code=' + encodeURIComponent(MED))
check('server: the new medicine has its stock', med.stock === 25, 'stock ' + med.stock)
const ex2 = await api('api.medicine', '?code=' + encodeURIComponent(existing.code))
check('server: the existing medicine got +10', ex2.stock === before + 10, `${before} -> ${ex2.stock}`)
check('server: the treatment exists once and is done', file.procedures.length === 1 && file.procedures[0].state === 'done', JSON.stringify(file.procedures.map((r) => r.state)))

// ============================================================ B. a change the server refuses
const GONE = 'ZZ Gone ' + rand()
await server.call('save_medicine', { name: GONE, category: 'Analgesic', unit: 'Tablet', minimum: 1, client_id: 'e2e-' + rand() + rand() })
await clickText(p, 'Medicines', 'a'); await sleep(1500) // the list now holds the medicine, offline too
await p.setOfflineMode(true); await sleep(1500)
const s2 = await p.waitForSelector('input[placeholder^="Search"]'); await s2.click({ clickCount: 3 }); await s2.type(GONE); await sleep(600)
await clickText(p, 'Stock', 'button', 'main'); await sleep(700)
await fillLabel(p, 'Quantity received', '5')
await pickDate('5 Nov 2028')
await clickText(p, 'Add stock', 'button', '*[@role="dialog"]'); await sleep(1000)
check('refused: the stock shows offline', (await outbox()).length === 1)
await server.call('delete_medicine', { code: GONE }) // while the page is offline, the medicine is removed
await p.setOfflineMode(false)
for (let i = 0; i < 30 && !(await outbox()).some((x) => x.status === 'failed'); i++) await sleep(1000)
const refused = (await outbox()).find((x) => x.status === 'failed')
check('refused: the change is kept with the reason', !!refused && !!refused.error, refused?.error)
await sleep(800)
check('refused: the bar says a change could not be sent', (await flat()).includes('could not be sent'))
await clickText(p, 'Review', 'button'); await sleep(600)
check('refused: the list offers Try again and Discard', (await flat()).includes('Try again') && (await flat()).includes('Discard'))
await clickText(p, 'Discard', 'button'); await sleep(600)
check('refused: discarding removes it', (await outbox()).length === 0)

// ============================================================ C. the server answers with an error
await p.keyboard.press('Escape'); await sleep(400)
await clickText(p, 'Medicines', 'a'); await sleep(800)
const s3 = await p.waitForSelector('input[placeholder^="Search"]'); await s3.click(); await p.keyboard.down('Control'); await p.keyboard.press('KeyA'); await p.keyboard.up('Control'); await p.keyboard.press('Backspace'); await s3.type(existing.name); await sleep(600)
await p.setOfflineMode(true); await sleep(1500)
await sleep(3000)
await clickText(p, 'Stock', 'button', 'main'); await sleep(700)
await fillLabel(p, 'Quantity received', '7')
await pickDate('5 Nov 2028')
await clickText(p, 'Add stock', 'button', '*[@role="dialog"]'); await sleep(1000)
let hits = 0
await p.setRequestInterception(true)
p.on('request', (req) => {
  if (req.method() === 'POST' && req.url().includes('add_stock') && hits < 2) {
    hits++
    return req.respond({ status: 500, contentType: 'application/json', body: JSON.stringify({ exc_type: 'OperationalError', exception: 'OperationalError: database is busy' }) })
  }
  req.continue()
})
await p.setOfflineMode(false)
for (let i = 0; i < 40 && (await outbox()).length; i++) await sleep(1000)
check('server error: the change was tried again and went through', hits === 2 && (await outbox()).length === 0, `refused ${hits} times`)
const ex3 = await api('api.medicine', '?code=' + encodeURIComponent(existing.code))
check('server error: it was recorded once', ex3.stock === before + 10 + 7, `${before + 10} -> ${ex3.stock}`)
await p.setRequestInterception(false)
p.removeAllListeners('request')

console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await b.close()
process.exit(fails ? 1 : 0)
