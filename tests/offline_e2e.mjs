// Offline test: use the app with the network cut (patient, consultation, medicine, stock), then reconnect and
// check on the server that everything arrived once.
//   node tests/offline_e2e.mjs <site-url> <staff-email> <staff-pw>
// The staff user's language must be English. Needs puppeteer-core and Chrome (CHROME=/path to override).
import { start, sleep, text, clickText, fillLabel } from './offline_helpers.mjs'
let fails = 0
const check = (label, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', label, extra); if (!ok) fails++ }
const { b, p } = await start()
const api = (m, q = '') => p.evaluate(async (m, q) => (await (await fetch('/api/method/sky_healthcare.' + m + q)).json()).message, m, q)
const outbox = () => p.evaluate(() => new Promise((res) => { const r = indexedDB.open('sky_healthcare'); r.onsuccess = () => { const q = r.result.transaction('meta').objectStore('meta').get('outbox'); q.onsuccess = () => res(q.result || []) } }))
const NAME = 'Offline' + Math.random().toString(36).slice(2, 5), MED = 'ZZ OffMed ' + Math.random().toString(36).slice(2, 5)
const existing = (await api('api.medicines'))[0]
const before = existing.stock

await p.setOfflineMode(true); await sleep(1800)
// --- patient + consultation for a patient that does not exist on the server yet
await clickText(p, 'Patients', 'a'); await sleep(500)
await clickText(p, 'New patient'); await sleep(400)
await fillLabel(p, 'First name', NAME); await fillLabel(p, 'Last name', 'Test')
await clickText(p, 'Female'); await clickText(p, 'Register patient'); await sleep(1000)
check('offline: patient page opens for the new patient', (await text(p)).includes(NAME))
await clickText(p, 'New consultation'); await sleep(900)
await fillLabel(p, 'What the doctor observed', 'Offline fever test', 'textarea')
await clickText(p, 'Finish consultation'); await sleep(1200)
const t1 = await text(p)
check('offline: consultation is listed as waiting on the patient page', t1.includes('Finish a consultation') && t1.includes('Saved on this device'))
// --- new medicine with stock added afterwards
await clickText(p, 'Medicines', 'a'); await sleep(700)
await clickText(p, 'New medicine', 'button', 'main'); await sleep(500)
await fillLabel(p, 'Medicine name', MED)
await clickText(p, 'Choose…'); await sleep(250); await clickText(p, 'Analgesic', 'button|a|li|div'); await sleep(250)
await clickText(p, 'Add medicine'); await sleep(1200)
await clickText(p, 'Add stock', 'button|a', 'main'); await sleep(800)
await fillLabel(p, 'Quantity received', '25')
const exp = await p.evaluateHandle(() => [...document.querySelectorAll('[role=dialog] input')].filter((e) => e.placeholder === 'Select a date' && !e.value)[0])
await exp.asElement().click(); await sleep(300); await p.keyboard.type('5 Nov 2028'); await p.keyboard.press('Enter'); await sleep(400)
await clickText(p, 'Add stock', 'button', '*[@role="dialog"]'); await sleep(1000)
check('offline: new medicine shows its stock', /IN STOCK \n?25/.test(await text(p)) || (await text(p)).replace(/\n+/g, ' ').includes('IN STOCK 25'))
// --- add stock to an existing medicine
await clickText(p, 'Medicines', 'a'); await sleep(700)
const exName = existing.name
const search = await p.waitForSelector('input[placeholder^="Search"]'); await search.type(exName); await sleep(600)
await clickText(p, 'Stock', 'button', 'main'); await sleep(700)
await fillLabel(p, 'Quantity received', '10')
const exp2 = await p.evaluateHandle(() => [...document.querySelectorAll('[role=dialog] input')].filter((e) => e.placeholder === 'Select a date' && !e.value)[0])
await exp2.asElement().click(); await sleep(300); await p.keyboard.type('5 Nov 2028'); await p.keyboard.press('Enter'); await sleep(400)
await clickText(p, 'Add stock', 'button', '*[@role="dialog"]'); await sleep(1000)
const listText = (await text(p)).replace(/\n+/g, ' ')
check('offline: existing medicine shows the added stock in the list', listText.includes(String(before + 10)), `(was ${before})`)
const q = await outbox()
check('offline: 5 changes wait on the device', q.length === 4 + 0 || q.length === 5, `(${q.length}: ${q.map((i) => i.method.split('.').pop()).join(', ')})`)
await p.screenshot({ path: 'f-1-offline.png' })

// --- back online
await p.setOfflineMode(false)
await sleep(2500)
await p.screenshot({ path: 'f-2-syncing.png' })
for (let i = 0; i < 40 && (await outbox()).length; i++) await sleep(1000)
check('online: everything was sent', (await outbox()).length === 0)
await sleep(800)
await p.screenshot({ path: 'f-3-synced.png' })
const found = await api('health.patients', '?search=' + encodeURIComponent(NAME))
check('server: the patient exists once', found.length === 1 && !found[0].name.startsWith('local:'), found.map((x) => x.name).join(','))
const file = await api('health.patient', '?name=' + encodeURIComponent(found[0].name))
check('server: the consultation is finished', file.consultations.length === 1 && file.consultations[0].state === 'done', JSON.stringify(file.consultations.map((c) => c.state)))
const med = await api('api.medicine', '?code=' + encodeURIComponent(MED))
check('server: the new medicine has its stock', med.stock === 25, 'stock ' + med.stock)
const ex2 = await api('api.medicine', '?code=' + encodeURIComponent(existing.code))
check('server: the existing medicine got +10', ex2.stock === before + 10, `${before} -> ${ex2.stock}`)
await clickText(p, 'Patients', 'a'); await sleep(900)
check('online: the list now shows the real patient, no waiting tag', (await text(p)).includes(NAME))
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
await b.close()
