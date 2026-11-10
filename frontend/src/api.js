// Talks to sky_healthcare.api on the same site, and keeps the app usable with no connection.
//
// Reads: every answer is kept on the device (IndexedDB). When the network is down the last answer is
// shown, with the changes still waiting to be sent applied on top (see offline/pending.js).
//
// Writes: every change carries a client_id. With no connection (or a lost answer) it waits in the
// outbox and is sent later, oldest first. The server ignores a client_id it already recorded, so
// nothing is done twice. A record made offline (a patient, a medicine...) gets a temporary
// "local:" id; later changes that mention it are rewritten with the real id once it exists.

import { reactive } from 'vue'
import { idb } from './offline/store'
import { overlay, isLocal, localDate } from './offline/pending'
import { changed } from './ui'
import { t } from './i18n'

const LEGACY_OUTBOX = 'sky_healthcare.outbox'
const LEGACY_CACHE = 'sky_healthcare.cache:'
const OUTBOX_BACKUP = 'sky_healthcare.outbox.backup'
const READ_TIMEOUT = 15000
const OFFLINE_READ_TIMEOUT = 3000
const WRITE_TIMEOUT = 25000
// on a slow connection the copy kept on the device is shown after this long, and updated when the answer arrives
const SLOW_READ = 2500
// a change the server could not process right now (server error, busy) is tried again, then reported
const MAX_ATTEMPTS = 6
const GATEWAY = [502, 503, 504]

export const net = reactive({
  online: navigator.onLine,
  syncing: false,
  outbox: [],
  ids: {}, // local id -> real id, for records that were made offline
  csrf: null,
  user: null,
  authNeeded: false, // the session ended while changes were waiting: sign in again to send them
  syncedAt: 0, // when the last batch of changes was sent (drives the "all synced" message)
  wroteAt: 0, // when a change last went through (a screen must not show an older copy right after)
  freshAt: 0, // when data was last read from the server (shown while offline: "updated at 14:32")
  storageFailed: false, // a change could not be kept on the device (storage full or blocked)
})

export class ApiError extends Error {
  constructor(message, status, type) {
    super(message)
    this.status = status
    this.type = type
  }
}
// shown when something that needs the server (an approval, a password...) is tried with no connection
export class OfflineError extends Error {
  constructor() {
    super(t('You are offline. This needs a connection, please try again when you are back online.'))
  }
}

// ------------------------------------------------------------------ storage

// Every waiting change is its own record in IndexedDB (store "outbox"), so two tabs never overwrite
// each other's list. A tab only ever writes or deletes the record it is working on, and tells the
// other tabs, which then read the list again. Nothing about patients is kept in localStorage.
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sky_healthcare.outbox') : null
let lastOrder = 0
const nextOrder = () => (lastOrder = Math.max(lastOrder + 1, Date.now() * 1000))
const byOrder = (a, b) => (a.order || a.at) - (b.order || b.at)
// "sending" is only true in the tab that is sending (a tab that closes mid-send must not leave it behind)
const plain = (item) => JSON.parse(JSON.stringify({ ...item, status: item.status === 'sending' ? 'waiting' : item.status, unsaved: undefined }))

/** Keep a change on the device. Resolves false when it could not be stored for good (storage full or blocked). */
async function store(item) {
  const ok = await idb.set('outbox', item.id, plain(item))
  if (!ok) net.storageFailed = true
  channel?.postMessage(1)
  return ok
}
async function unstore(id) {
  await idb.del('outbox', id)
  channel?.postMessage(1)
}
const saveIds = async () => {
  const stored = (await idb.get('meta', 'ids')) || {}
  await idb.set('meta', 'ids', { ...stored, ...net.ids })
}
const cacheSet = (key, value) => idb.set('cache', key, value)
const cacheGet = async (key) => (await idb.get('cache', key)) // undefined when never read

export async function clearCache() {
  await idb.clear('cache')
  await idb.del('meta', 'prefetchedAt')
}

/**
 * Read the waiting changes of the signed-in person from the device. Changes of someone else who used
 * this device stay where they are, hidden, and are sent only when that person signs in.
 */
export async function loadOutbox() {
  if (!net.user) return
  const all = ((await idb.all('outbox')) || []).filter((i) => i?.id).sort(byOrder)
  const here = new Map(net.outbox.map((i) => [i.id, i]))
  const mine = all.filter((i) => !i.user || i.user === net.user).map((i) => {
    const open = here.get(i.id)
    if (open) return open.status === 'sending' ? open : Object.assign(open, i)
    return i
  })
  // changes that could not be stored are only in this tab
  const loose = net.outbox.filter((i) => i.unsaved && !mine.some((m) => m.id === i.id))
  net.outbox = [...mine, ...loose]
  for (const i of net.outbox) if (!i.user) Object.assign(i, { user: net.user })
}
channel &&
  (channel.onmessage = () => {
    clearTimeout(channel.timer)
    channel.timer = setTimeout(() => loadOutbox().then(changed), 50)
  })

/** Load what a previous visit left on the device. Called once before the app starts. */
export const ready = (async () => {
  try {
    net.ids = (await idb.get('meta', 'ids')) || {}
    net.freshAt = (await idb.get('meta', 'freshAt')) || 0
    // changes kept by older versions of the app (one list in IndexedDB, or in localStorage) become one record each
    const parse = (k) => {
      try {
        return JSON.parse(localStorage.getItem(k) || '[]')
      } catch {
        return []
      }
    }
    const stored = await idb.get('meta', 'outbox')
    const old = [...(stored || parse(OUTBOX_BACKUP)), ...parse(LEGACY_OUTBOX)]
    for (const i of old) if (i?.id && (await idb.get('outbox', i.id)) === undefined) await idb.set('outbox', i.id, i)
    await idb.del('meta', 'outbox')
    for (const k of [LEGACY_OUTBOX, OUTBOX_BACKUP]) localStorage.removeItem(k)
    Object.keys(localStorage).filter((k) => k.startsWith(LEGACY_CACHE)).forEach((k) => localStorage.removeItem(k))
  } catch {}
})()

// ------------------------------------------------------------------ connection

let probeTimer = null
let probeDelay = 1500

async function ping() {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const r = await fetch('/api/method/ping', { cache: 'no-store', credentials: 'omit', signal: ctrl.signal })
    return r.ok
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

function startProbe() {
  if (probeTimer) return
  const tick = async () => {
    probeTimer = null
    if (await ping()) return markOnline()
    probeDelay = Math.min(probeDelay * 1.4, 8000)
    probeTimer = setTimeout(tick, probeDelay)
  }
  probeTimer = setTimeout(tick, probeDelay)
}

function markOffline() {
  net.online = false
  startProbe()
}

function markOnline() {
  clearTimeout(probeTimer)
  probeTimer = null
  probeDelay = 1500
  if (!net.online) net.online = true
  flush()
}

window.addEventListener('online', async () => {
  if (await ping()) markOnline()
  else markOffline()
})
window.addEventListener('offline', markOffline)
if (!navigator.onLine) startProbe()
setInterval(() => net.online && flush(), 30000)
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && net.outbox.length && flush())

// ------------------------------------------------------------------ requests

function stripHtml(s) {
  const el = document.createElement('div')
  el.innerHTML = s
  return el.textContent || ''
}

function messageFrom(json, status) {
  try {
    const msgs = JSON.parse(json._server_messages || '[]').map((m) => JSON.parse(m).message)
    if (msgs.length) return stripHtml(msgs[msgs.length - 1])
  } catch {}
  if (json.message && typeof json.message === 'string') return stripHtml(json.message)
  if (json.exception) return stripHtml(String(json.exception).split(':').slice(1).join(':').trim())
  return status === 403 ? 'You are not allowed to do this.' : 'Something went wrong. Please try again.'
}

async function request(url, options = {}, timeout = READ_TIMEOUT) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  let res
  try {
    res = await fetch(url, { credentials: 'same-origin', signal: ctrl.signal, ...options })
  } catch {
    clearTimeout(timer)
    // one request that failed (a page change, a slow answer) is not a lost connection: only say "offline"
    // when the server cannot be reached at all
    if (!(net.online && (await ping()))) markOffline()
    throw new OfflineError()
  } finally {
    clearTimeout(timer)
  }
  // the server (or the proxy in front of it) is not answering: the connection is fine, so this is not "offline".
  // It is a failed try, counted like a server error, so the change is retried with a growing pause and then reported
  if (GATEWAY.includes(res.status)) throw new ApiError(t('The server is not answering. Please try again in a moment.'), res.status)
  if (!net.online) markOnline()
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(messageFrom(json, res.status), res.status, json.exc_type)
  return json.message
}

const unreachable = (e) => e instanceof OfflineError || (e instanceof ApiError && GATEWAY.includes(e.status))

const methodUrl = (m) => (m.includes('.') ? `/api/method/${m}` : `/api/method/sky_healthcare.api.${m}`)

/** Replace local ids (records made offline) by their real ids, once the server has given them. */
function resolve(value) {
  if (typeof value === 'string') return isLocal(value) && net.ids[value] ? net.ids[value] : value
  if (Array.isArray(value)) return value.map(resolve)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolve(v)]))
  return value
}
const mentionsLocal = (value) => {
  if (typeof value === 'string') return isLocal(value)
  if (Array.isArray(value)) return value.some(mentionsLocal)
  if (value && typeof value === 'object') return Object.values(value).some(mentionsLocal)
  return false
}

export async function get(method, params = {}) {
  params = resolve(params)
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString()
  const url = methodUrl(method) + (query ? `?${query}` : '')
  const show = (data) => overlay(method, params, data, net.outbox)
  // a record that only exists on this device is built from what is waiting to be sent
  if (mentionsLocal(params)) {
    const local = show(undefined)
    if (local !== undefined) return local
    throw new ApiError('This is not available yet. It appears once your changes are sent.', 404, 'DoesNotExistError')
  }
  try {
    const fetching = request(url, { headers: { Accept: 'application/json' } }, net.online ? READ_TIMEOUT : OFFLINE_READ_TIMEOUT).then((data) => {
      if (Date.now() - net.freshAt > 10000) idb.set('meta', 'freshAt', Date.now())
      net.freshAt = Date.now()
      cacheSet(url, data)
      return data
    })
    fetching.catch(() => {}) // the failure is handled below; this only keeps an early return from leaving it unhandled
    const cached = await cacheGet(url)
    // slow connection: show the copy kept on the device now, and refresh the screen when the answer comes
    // (not for the session itself: a copy of who was signed in must never stand in for the real answer)
    if (cached !== undefined && net.online && method !== 'boot' && Date.now() - net.wroteAt > 60000) {
      const slow = Symbol('slow')
      const first = await Promise.race([fetching, new Promise((r) => setTimeout(() => r(slow), SLOW_READ))])
      if (first === slow) {
        fetching.then((fresh) => JSON.stringify(fresh) !== JSON.stringify(cached) && changed()).catch(() => {})
        return show(cached)
      }
      return show(first)
    }
    return show(await fetching)
  } catch (e) {
    if (unreachable(e)) {
      const cached = await cacheGet(url)
      if (cached !== undefined) return show(cached)
    }
    throw e
  }
}

export async function post(method, data = {}, retried = false) {
  try {
    return await request(
      methodUrl(method),
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Frappe-CSRF-Token': net.csrf || '',
        },
        body: JSON.stringify(data),
      },
      WRITE_TIMEOUT,
    )
  } catch (e) {
    // a cached page can hold an old token: fetch a fresh one once and retry
    if (!retried && e instanceof ApiError && e.type === 'CSRFTokenError') {
      const boot = await get('boot')
      net.csrf = boot?.csrf_token
      return post(method, data, true)
    }
    throw e
  }
}

// ------------------------------------------------------------------ the outbox

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

const waiting = () => net.outbox.some((i) => i.status === 'waiting' || i.status === 'sending')

/**
 * Do a change. Returns the server's answer, or a stand-in answer with `queued: true` when the change
 * was kept on the device to be sent later.
 *
 * opts.creates  the record this makes (a local id is made for it and used until the real one exists)
 * opts.idField  which field of the server's answer holds the new record's id (default "name")
 * opts.stub     (localId) => fields to put in the stand-in answer, for example the patient's name
 * opts.summary  a short line shown in the list of waiting changes
 * opts.meta     names to show for the waiting change (not sent to the server)
 */
export async function write(method, data, label, opts = {}) {
  const item = {
    id: uuid(),
    method,
    data: resolve({ ...data, client_id: uuid() }),
    label,
    summary: opts.summary || '',
    meta: opts.meta || undefined, // names shown for the change while it waits (patient, doctor, medicines)
    attempts: 0,
    at: Date.now(),
    user: net.user,
    status: 'waiting',
    order: nextOrder(),
  }
  if (opts.creates) Object.assign(item, { localId: `local:${uuid()}`, creates: opts.creates, idField: opts.idField || 'name' })
  const stand = (saved = true) => ({ queued: true, ...(saved ? {} : { unsaved: true }), ...(item.localId ? { [item.idField]: item.localId, name: item.localId } : {}), ...(opts.stub ? opts.stub(item.localId, item.data) : {}) })

  // a change to a record that only exists on this device (not sent yet) is folded into the change that creates it
  const folded = foldIntoPending(method, item.data)
  if (folded) {
    changed()
    return { queued: true, name: folded.localId, [folded.idField]: folded.localId, ...(opts.stub ? opts.stub(folded.localId, folded.data) : {}) }
  }
  // behind other waiting changes, or with no connection: wait in line (keeps the order of what was done)
  if (!net.online || waiting()) return stand(await enqueue(item))
  try {
    const res = await post(method, item.data)
    net.wroteAt = Date.now()
    return res
  } catch (e) {
    if (unreachable(e)) return stand(await enqueue(item))
    throw e
  }
}

const short = (m) => String(m || '').split('.').pop()

/**
 * A change to something that was made offline and is not sent yet does not need its own entry:
 * it is applied to the waiting change that creates it (edit, finish, complete), or removes it (cancel, discard).
 */
function foldIntoPending(method, data) {
  const ref = [data.name, data.code].find(isLocal)
  const target = ref && net.outbox.find((i) => i.localId === ref && i.status === 'waiting')
  if (!target) return null
  const m = short(method)
  const base = short(target.method)
  const { name, code, client_id, ...rest } = data
  if (m === base || (m === 'update_consultation' && base === 'save_consultation')) Object.assign(target.data, rest)
  else if (m === 'complete_procedure' && base === 'record_procedure') Object.assign(target.data, { complete: 1, date: localDate(Date.now()) })
  else if ((m === 'cancel_procedure' && base === 'record_procedure') || (m === 'discard_consultation' && base === 'save_consultation')) discard(target.id)
  else return null
  store(target)
  return target
}

// work done without a connection is dated the day it was done, not the day it reaches the server
function stamp(item) {
  const m = short(item.method)
  const d = item.data
  const dated =
    ['give_out', 'add_stock', 'complete_procedure'].includes(m) ||
    (m === 'save_consultation' && !d.name) ||
    (m === 'record_procedure' && (d.complete === undefined || Number(d.complete)))
  if (dated && !d.date) d.date = localDate(item.at)
}

/** Keep a change on the device, to be sent later. Resolves false when it could not be stored for good. */
async function enqueue(item) {
  stamp(item)
  net.outbox.push(item)
  changed()
  const ok = await store(item)
  if (!ok) item.unsaved = true
  if (net.online) setTimeout(flush, 0)
  return ok
}

/** Is the person still signed in? (a refused change may only mean the session ended while offline) */
async function sessionEnded(e) {
  if (!(e instanceof ApiError) || !([401, 403].includes(e.status) || e.type === 'CSRFTokenError')) return false
  try {
    const r = await fetch('/api/method/frappe.auth.get_logged_user', { credentials: 'same-origin', cache: 'no-store' })
    if (!r.ok) return true
    return (await r.json()).message === 'Guest'
  } catch {
    return false
  }
}

const transient = (e) => e instanceof ApiError && (e.status >= 500 || [408, 429].includes(e.status))
let retryTimer = null

/** The changes that need the change `root` (they mention its temporary id), and those that need them in turn. */
function dependents(root) {
  const found = []
  const ids = new Set(root.localId ? [root.localId] : [])
  for (let grew = true; grew; ) {
    grew = false
    for (const o of net.outbox) {
      if (o === root || found.includes(o)) continue
      const text = JSON.stringify(o.data)
      if ([...ids].some((id) => text.includes(id))) {
        found.push(o)
        if (o.localId) ids.add(o.localId)
        grew = true
      }
    }
  }
  return found
}

/** A change is refused: it stays with the reason, and so does everything that depends on it. */
function fail(item, error) {
  Object.assign(item, { status: 'failed', error })
  store(item)
  for (const o of dependents(item)) {
    if (o.status === 'failed') continue
    Object.assign(o, { status: 'failed', error: t('It depends on a change that could not be sent.'), blockedBy: item.id })
    store(o)
  }
}

/** Send everything in the outbox, oldest first. Stops at the first network failure. */
export async function flush() {
  // no one is signed in yet (the page is still starting): changes must not go out under an unknown account
  if (net.syncing || !net.online || net.authNeeded || !net.user || !net.outbox.some((i) => i.status === 'waiting')) return 0
  // two tabs of the app must not send the same changes at the same time
  if (navigator.locks) return (await navigator.locks.request('sky_healthcare.flush', { ifAvailable: true }, (lock) => (lock ? run() : 0))) || 0
  return run()
}

async function run() {
  net.syncing = true
  let sent = 0
  let again = false
  try {
    await loadOutbox() // what other tabs did meanwhile (sent, changed, discarded)
    net.ids = { ...((await idb.get('meta', 'ids')) || {}), ...net.ids }
    for (const item of [...net.outbox]) {
      if (item.status !== 'waiting') continue
      // look at the stored copy right before sending: it may have been sent, changed or discarded since
      const saved = await idb.get('outbox', item.id)
      if (!net.outbox.includes(item)) continue // discarded while this loop was running
      if (saved === undefined && !item.unsaved) {
        net.outbox = net.outbox.filter((i) => i !== item)
        continue
      }
      if (saved && saved.status !== 'waiting') continue
      if (saved) Object.assign(item, saved)
      const body = resolve(item.data)
      if (mentionsLocal(body)) {
        // it needs a record that is not on the server yet: the change that makes it comes first, or it is gone
        if (net.outbox.some((o) => o !== item && o.localId && JSON.stringify(item.data).includes(o.localId) && o.status !== 'failed')) continue
        fail(item, t('It depends on a change that could not be sent.'))
        continue
      }
      item.status = 'sending'
      try {
        const res = await post(item.method, body)
        if (item.localId && res?.[item.idField]) {
          net.ids[item.localId] = res[item.idField]
          await saveIds()
        }
        net.outbox = net.outbox.filter((i) => i.id !== item.id)
        await unstore(item.id)
        net.wroteAt = Date.now()
        sent++
      } catch (e) {
        item.status = 'waiting'
        if (e instanceof OfflineError) break
        if (await sessionEnded(e)) {
          net.authNeeded = true
          break
        }
        if (transient(e) && (item.attempts = (item.attempts || 0) + 1) < MAX_ATTEMPTS) {
          // the server is busy or had an error: keep the order, try again in a moment
          again = true
          break
        }
        // refused by the server (for example the stock was already used): it stays, with the reason
        fail(item, transient(e) ? t('The server could not process this change. Try again later.') : e.message)
      }
    }
  } finally {
    net.syncing = false
  }
  if (!net.outbox.length) net.storageFailed = false
  if (sent) {
    net.syncedAt = Date.now()
    changed()
  }
  const pending = net.online && net.outbox.some((i) => i.status === 'waiting')
  if (pending && (again || sent)) {
    clearTimeout(retryTimer)
    const attempts = Math.max(...net.outbox.filter((i) => i.status === 'waiting').map((i) => i.attempts || 0))
    retryTimer = setTimeout(flush, again ? Math.min(2000 * 2 ** attempts, 60000) : 500)
  }
  return sent
}

/** Try a change again after it was refused (and the changes that were held back because of it). */
export function retry(id) {
  const item = net.outbox.find((i) => i.id === id)
  if (!item) return
  for (const i of [item, ...net.outbox.filter((o) => o.blockedBy === id)]) {
    Object.assign(i, { status: 'waiting', error: undefined, attempts: 0, blockedBy: undefined })
    store(i)
  }
  flush()
}

/** Drop a change, and the changes that need it. */
export async function discard(id) {
  const item = net.outbox.find((i) => i.id === id)
  if (!item) return
  const gone = [item, ...dependents(item)]
  net.outbox = net.outbox.filter((i) => !gone.includes(i))
  changed()
  await Promise.all(gone.map((i) => unstore(i.id)))
}

/** Forget this person's waiting changes (they chose to log out and lose them). */
export async function clearOutbox() {
  const gone = net.outbox
  net.outbox = []
  await Promise.all(gone.map((i) => unstore(i.id)))
}
