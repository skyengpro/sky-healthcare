// End-to-end test of the Healthcare Management PWA in headless Chrome.
//
// Usage: node tests/e2e.mjs <site-url> <staff-email> <staff-pw> <admin-email> <admin-pw> [screenshot-dir]
// Needs `puppeteer-core` and Google Chrome. Creates a medicine called "E2E Ceftriaxone <random>".
import puppeteer from 'puppeteer-core'
import fs from 'fs'

const [SITE, S_USER, S_PW, A_USER, A_PW, SHOTS = 'screenshots'] = process.argv.slice(2)
fs.mkdirSync(SHOTS, { recursive: true })
const MED = `E2E Ceftriaxone ${Math.random().toString(36).slice(2, 6)}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let passed = 0
const errors = []

async function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}`)
  if (!ok) {
    try {
      await current.screenshot({ path: `${SHOTS}/FAILED.png` })
      console.log((await current.evaluate(() => document.body.innerText)).slice(0, 1200))
    } catch {}
    throw new Error(`failed: ${label}`)
  }
  passed++
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--lang=en-GB'],
})

async function newPage(width = 1366, height = 860) {
  const ctx = await browser.createBrowserContext()
  const page = await ctx.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  page.on('console', (m) => m.type() === 'error' && !/socket\.io|favicon/i.test(m.text()) && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  return page
}

// ---- helpers that drive the real UI ------------------------------------------------------
const byText = (page, text, tag = '*') =>
  page.waitForSelector(`::-p-xpath(//${tag}[normalize-space(.)=${JSON.stringify(text)} or .//text()[normalize-space(.)=${JSON.stringify(text)}]][not(ancestor::*[@aria-hidden="true"])])`, { visible: true, timeout: 10000 })
async function click(page, text, tag = 'button') {
  const el = await byText(page, text, tag)
  await el.click()
  await sleep(350)
}
async function field(page, label, scope = 'body') {
  return page.evaluateHandle((label, scope) => {
    const root = document.querySelector(scope === 'dialog' ? '[role="dialog"]' : 'body')
    const labels = [...root.querySelectorAll('label, .text-xs, div, span')].filter((l) => !l.closest('aside, nav') && l.childElementCount <= 2 && l.textContent.replace('*', '').trim().startsWith(label) && l.textContent.length < label.length + 40)
    for (const l of labels) {
      let el = l
      for (let i = 0; i < 5 && el; i++, el = el.parentElement) {
        const input = el.querySelector('input:not([type="hidden"]), textarea, button[role="combobox"]')
        if (input) return input
      }
    }
    return null
  }, label, scope)
}
async function fill(page, label, value, scope = 'body') {
  const h = await field(page, label, scope)
  const ok = await page.evaluate((el, value) => {
    if (!el) return false
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    el.focus()
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    el.blur() // date pickers commit typed text on blur
    return true
  }, h, String(value))
  if (!ok) throw new Error(`field not found: ${label}`)
}
async function choose(page, label, option, scope = 'body') {
  const h = await field(page, label, scope)
  await h.click()
  await sleep(300)
  const opt = await page.waitForSelector(`::-p-xpath(//*[@role="option"][.//text()[normalize-space(.)=${JSON.stringify(option)}]])`, { visible: true, timeout: 5000 })
  await opt.click()
  await sleep(300)
}
async function pickMedicine(page, name, scope = 'body') {
  const h = await field(page, 'Medicine', scope)
  await h.click()
  await sleep(200)
  await page.keyboard.type(name.slice(0, 12))
  const opt = await page.waitForSelector(`::-p-xpath(//*[@role="option"][.//text()[normalize-space(.)=${JSON.stringify(name)}]])`, { visible: true, timeout: 8000 })
  await opt.click()
  await sleep(400)
}
const text = (page) => page.evaluate(() => document.querySelector('main')?.innerText || document.body.innerText)
async function waitText(page, needle, timeout = 10000) {
  try {
    await page.waitForFunction((n) => (document.querySelector('main')?.innerText || document.body.innerText).includes(n), { timeout }, needle)
  } catch (e) {
    await page.screenshot({ path: `${SHOTS}/FAILED.png` })
    console.log(`Did not find "${needle}" on ${page.url()}. Page text:\n` + (await page.evaluate(() => document.body.innerText)).slice(0, 1200))
    console.log('Console errors:', [...new Set(errors)].join(' | '))
    throw e
  }
}
const api = (page, method, args = {}) =>
  page.evaluate(async (method, args) => {
    const r = await fetch(`/api/method/sky_healthcare.api.${method}?${new URLSearchParams(args)}`)
    return (await r.json()).message
  }, method, args)
async function login(page, user, pw) {
  await page.goto(`${SITE}/sky-healthcare/login`, { waitUntil: 'networkidle0' })
  await fill(page, 'Email', user)
  await fill(page, 'Password', pw)
  await sleep(400)
  await click(page, 'Log in')
  await page.waitForFunction(() => !location.pathname.endsWith('/login'), { timeout: 30000 })
  await waitText(page, 'Good')
}
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` })

let current
process.on('unhandledRejection', async (e) => {
  console.log('ERROR', e.message)
  try {
    await current.screenshot({ path: `${SHOTS}/FAILED.png` })
    console.log('PAGE TEXT:', (await current.evaluate(() => document.body.innerText)).slice(0, 1500))
  } catch {}
  console.log('Console errors:', [...new Set(errors)].join(' | '))
  process.exit(1)
})

// ---- staff journey (desktop) ------------------------------------------------------------
const staff = await newPage()
current = staff
await login(staff, S_USER, S_PW)
await check('staff logs in and lands on the dashboard', (await text(staff)).includes('Good'))
await shot(staff, '01-dashboard')

const swScope = await staff.evaluate(() => Promise.race([
  navigator.serviceWorker.ready.then((r) => r.scope),
  new Promise((r) => setTimeout(() => r(null), 8000)),
]))
await check('service worker installed for /sky-healthcare/', swScope?.endsWith('/sky-healthcare/'), swScope)
const manifest = await staff.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json())
await check('web app manifest is valid', manifest.start_url === '/sky-healthcare/' && manifest.icons.length === 3)

// add a medicine with starting stock
await click(staff, 'Medicines', 'a')
await waitText(staff, 'medicines on your list')
await shot(staff, '02-medicines')
await click(staff, 'New medicine')
await fill(staff, 'Medicine name', MED, 'dialog')
await choose(staff, 'Category', 'Antibiotic', 'dialog')
await choose(staff, 'Dosage form', 'Injection', 'dialog')
await fill(staff, 'Strength', '1g', 'dialog')
await choose(staff, 'Counted in', 'Vial', 'dialog')
await fill(staff, 'Minimum stock', '10', 'dialog')
await fill(staff, 'Storage location', 'Fridge 1', 'dialog')
await fill(staff, 'Quantity received', '50', 'dialog')
await fill(staff, 'Price per unit', '1500', 'dialog')
await fill(staff, 'Expiry date', '2029-05-31', 'dialog')
await shot(staff, '03-add-medicine')
await click(staff, 'Add medicine')
await waitText(staff, 'Batches on the shelf')
let med = await api(staff, 'medicine', { code: MED })
await check('new medicine created with 50 in stock', med.stock === 50 && med.batches.length === 1 && med.unit === 'Vial')

// add stock with an earlier expiry, from the medicine page (the medicine must come pre-selected)
await click(staff, 'Add stock', 'main//button')
await sleep(1200)
const preset = await staff.evaluate(() => document.querySelector('[role="dialog"] button[role="combobox"], [role="dialog"] input[role="combobox"]')?.textContent || document.querySelector('[role="dialog"] [role="combobox"]')?.value)
await check('add stock from a medicine page pre-selects it', (preset || '').includes('E2E Ceftriaxone'), preset)
await fill(staff, 'Quantity received', '30', 'dialog')
await fill(staff, 'Expiry date', '2028-02-29', 'dialog')
await fill(staff, 'Lot / batch number', `LOT-${MED.slice(-4)}`, 'dialog')
const dialogs = await staff.$$('[role="dialog"] button')
await click(staff, 'Add stock', '*[@role="dialog"]//button')
await sleep(1500)
med = await api(staff, 'medicine', { code: MED })
await check('add stock: 80 in two batches, lot number kept', med.stock === 80 && med.batches.some((b) => b.batch === `LOT-${MED.slice(-4)}`))
await shot(staff, '04-medicine-detail')

// give out 35: the 2028 lot (30) must be used first, then 5 from the 2029 lot
await click(staff, 'Give out stock', 'a')
await waitText(staff, 'Record stock out')
await pickMedicine(staff, MED)
await fill(staff, 'Quantity', '35')
await click(staff, 'Other authorized adjustment', 'button')
await fill(staff, 'Note', 'Jean Test')
await shot(staff, '05-give-out')
await click(staff, 'Record stock out')
await sleep(1500)
med = await api(staff, 'medicine', { code: MED })
await check('give out uses the earliest expiry first (80 - 35 = 45, 2028 lot emptied)',
  med.stock === 45 && med.batches.length === 1 && med.batches[0].expiry_date === '2029-05-31')
await check('stock out shows patient and real user in history',
  med.movements.some((m) => m.direction === 'out' && m.recipient === 'Jean Test' && m.by === 'Grace Mbarga'))

// cannot give out more than valid stock
await pickMedicine(staff, MED)
await fill(staff, 'Quantity', '999')
await click(staff, 'Record stock out')
await waitText(staff, 'Not enough valid stock')
await check('giving out more than available is refused', true)

// request stock
await click(staff, 'Medical requests', 'a')
await click(staff, 'New request')
await pickMedicine(staff, MED, 'dialog')
await fill(staff, 'Quantity needed', '100', 'dialog')
await click(staff, 'Urgent', '*[@role="dialog"]//button')
await fill(staff, 'Reason', 'Running low before the vaccination campaign', 'dialog')
await click(staff, 'Send request')
await waitText(staff, 'Waiting for approval')
await shot(staff, '06-requests')
await check('staff request appears as waiting for approval', true)
await check('staff has no Staff menu', !(await staff.evaluate(() => [...document.querySelectorAll('aside a')].some((a) => a.textContent.includes('Staff')))))
await staff.goto(`${SITE}/sky-healthcare/staff`, { waitUntil: 'networkidle0' })
await check('staff is redirected away from /sky-healthcare/staff', !staff.url().endsWith('/staff'))
const desk = await staff.goto(`${SITE}/desk`, { waitUntil: 'networkidle0' })
await check('staff cannot open the ERPNext desk', !(await staff.evaluate(() => !!document.querySelector('.desk-sidebar, #page-desktop, .layout-main-section'))), staff.url())

// reports
await staff.goto(`${SITE}/sky-healthcare/reports`, { waitUntil: 'networkidle0' })
await waitText(staff, 'rows')
await shot(staff, '07-reports')
await check('movements report lists the new medicine', (await text(staff)).includes(MED))

// ---- offline ----------------------------------------------------------------------------
// the changes waiting to be sent are kept in IndexedDB
const waitingCount = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const open = indexedDB.open('sky_healthcare')
        open.onsuccess = () => {
          const get = open.result.transaction('meta').objectStore('meta').get('outbox')
          get.onsuccess = () => resolve((get.result || []).length)
        }
      }),
  )
await staff.goto(`${SITE}/sky-healthcare/give-out`, { waitUntil: 'networkidle0' })
await sleep(1500)
await staff.setOfflineMode(true)
await staff.reload({ waitUntil: 'domcontentloaded' })
await waitText(staff, 'Record stock out', 15000)
await check('app opens with no connection (served by the service worker)', true)
await staff.waitForFunction(() => document.body.innerText.includes("You're offline"), { timeout: 10000 })
await check('offline banner is shown', true)
await pickMedicine(staff, MED)
await fill(staff, 'Quantity', '5')
await click(staff, 'Record stock out')
await sleep(800)
const queued = await waitingCount(staff)
await check('stock out made offline is kept on the device', queued === 1)
await shot(staff, '08-offline')
await staff.setOfflineMode(false)
await staff.evaluate(() => window.dispatchEvent(new Event('online')))
for (let i = 0; i < 30 && (await waitingCount(staff)); i++) await sleep(500)
med = await api(staff, 'medicine', { code: MED })
await check('offline stock out is sent when back online (45 - 5 = 40), exactly once', med.stock === 40)

// ---- admin ------------------------------------------------------------------------------
const admin = await newPage()
current = admin
await login(admin, A_USER, A_PW)
await admin.goto(`${SITE}/sky-healthcare/requests?status=pending`, { waitUntil: 'networkidle0' })
await waitText(admin, MED)
const card = await admin.waitForSelector(`::-p-xpath(//li[.//text()[normalize-space(.)=${JSON.stringify(MED)}]]//button[normalize-space(.)="Approve"])`)
await card.click()
await sleep(500)
await click(admin, 'Approve', '*[@role="dialog"]//button')
await sleep(1500)
const reqs = await api(admin, 'requests')
await check('admin approves the request', reqs.find((r) => r.medicine === MED)?.state === 'approved')
await admin.goto(`${SITE}/sky-healthcare/staff`, { waitUntil: 'networkidle0' })
await waitText(admin, 'Add a person')
await shot(admin, '09-staff')
await check('admin sees the staff page', (await text(admin)).includes('Grace Mbarga'))

// ---- mobile + French --------------------------------------------------------------------
const mobile = await newPage(390, 844)
current = mobile
await login(mobile, S_USER, S_PW)
await shot(mobile, '10-mobile-dashboard')
await mobile.evaluate(() => localStorage.setItem('sky_healthcare.lang', 'fr'))
await mobile.goto(`${SITE}/sky-healthcare/medicines`, { waitUntil: 'networkidle0' })
await waitText(mobile, 'Médicaments')
await shot(mobile, '11-mobile-medicines-fr')
await mobile.goto(`${SITE}/sky-healthcare/give-out`, { waitUntil: 'networkidle0' })
await waitText(mobile, 'Sortie de stock')
await shot(mobile, '12-mobile-give-out-fr')
await check('French translation and mobile layout render', true)

console.log(`\n${passed} checks passed`)
console.log(errors.length ? `Console errors:\n- ${[...new Set(errors)].join('\n- ')}` : 'No console errors')
await browser.close()
