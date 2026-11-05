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
import { overlay, isLocal } from './offline/pending'
import { changed } from './ui'
import { t } from './i18n'

const LEGACY_OUTBOX = 'sky_healthcare.outbox'
const LEGACY_CACHE = 'sky_healthcare.cache:'
const READ_TIMEOUT = 15000
const OFFLINE_READ_TIMEOUT = 3000
const WRITE_TIMEOUT = 25000

export const net = reactive({
  online: navigator.onLine,
  syncing: false,
  outbox: [],
  ids: {}, // local id -> real id, for records that were made offline
  csrf: null,
  user: null,
  authNeeded: false, // the session ended while changes were waiting: sign in again to send them
  syncedAt: 0, // when the last batch of changes was sent (drives the "all synced" message)
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

const saveOutbox = () => idb.set('meta', 'outbox', JSON.parse(JSON.stringify(net.outbox)))
const saveIds = () => idb.set('meta', 'ids', { ...net.ids })
const cacheSet = (key, value) => idb.set('cache', key, value)
const cacheGet = async (key) => (await idb.get('cache', key)) // undefined when never read

export async function clearCache() {
  await idb.clear('cache')
  await idb.del('meta', 'prefetchedAt')
}

/** Load what a previous visit left on the device. Called once before the app starts. */
export const ready = (async () => {
  try {
    net.outbox = (await idb.get('meta', 'outbox')) || []
    net.ids = (await idb.get('meta', 'ids')) || {}
    // changes kept by an older version of the app (localStorage)
    const old = JSON.parse(localStorage.getItem(LEGACY_OUTBOX) || '[]')
    if (old.length) {
      net.outbox.push(...old.filter((o) => !net.outbox.some((n) => n.id === o.id)))
      saveOutbox()
    }
    localStorage.removeItem(LEGACY_OUTBOX)
    Object.keys(localStorage).filter((k) => k.startsWith(LEGACY_CACHE)).forEach((k) => localStorage.removeItem(k))
    // a change that was being sent when the page closed is sent again (the server ignores a repeat)
    net.outbox.forEach((i) => i.status === 'sending' && (i.status = 'waiting'))
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
  // the server (or the proxy in front of it) is not answering
  if ([502, 503, 504].includes(res.status)) {
    markOffline()
    throw new OfflineError()
  }
  if (!net.online) markOnline()
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(messageFrom(json, res.status), res.status, json.exc_type)
  return json.message
}

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
    const data = await request(url, { headers: { Accept: 'application/json' } }, net.online ? READ_TIMEOUT : OFFLINE_READ_TIMEOUT)
    cacheSet(url, data)
    return show(data)
  } catch (e) {
    if (e instanceof OfflineError) {
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
 */
export async function write(method, data, label, opts = {}) {
  const item = {
    id: uuid(),
    method,
    data: resolve({ ...data, client_id: uuid() }),
    label,
    summary: opts.summary || '',
    at: Date.now(),
    user: net.user,
    status: 'waiting',
  }
  if (opts.creates) Object.assign(item, { localId: `local:${uuid()}`, creates: opts.creates, idField: opts.idField || 'name' })
  const stand = () => ({ queued: true, ...(item.localId ? { [item.idField]: item.localId, name: item.localId } : {}), ...(opts.stub ? opts.stub(item.localId, item.data) : {}) })

  // a change to a record that only exists on this device (not sent yet) is folded into the change that creates it
  const ref = [data.name, data.code].find(isLocal)
  const target = ref && net.outbox.find((i) => i.localId === ref && i.status === 'waiting' && i.method === method)
  if (target) {
    const { name, code, client_id, ...rest } = item.data
    Object.assign(target.data, rest)
    if (item.summary) target.summary = item.summary
    saveOutbox()
    changed()
    return { queued: true, name: target.localId, [target.idField]: target.localId, ...(opts.stub ? opts.stub(target.localId, target.data) : {}) }
  }
  // behind other waiting changes, or with no connection: wait in line (keeps the order of what was done)
  if (!net.online || waiting()) {
    enqueue(item)
    return stand()
  }
  try {
    const res = await post(method, item.data)
    return res
  } catch (e) {
    if (e instanceof OfflineError) {
      enqueue(item)
      return stand()
    }
    throw e
  }
}

function enqueue(item) {
  net.outbox.push(item)
  saveOutbox()
  changed()
  if (net.online) setTimeout(flush, 0)
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

/** Send everything in the outbox, oldest first. Stops at the first network failure. */
export async function flush() {
  if (net.syncing || !net.online || net.authNeeded || !net.outbox.some((i) => i.status === 'waiting')) return 0
  net.syncing = true
  let sent = 0
  try {
    for (const item of [...net.outbox]) {
      if (item.status !== 'waiting') continue
      if (item.user && net.user && item.user !== net.user) continue // another person's changes wait for them
      item.status = 'sending'
      try {
        const res = await post(item.method, resolve(item.data))
        if (item.localId && res?.[item.idField]) {
          net.ids[item.localId] = res[item.idField]
          saveIds()
        }
        net.outbox = net.outbox.filter((i) => i.id !== item.id)
        sent++
      } catch (e) {
        if (e instanceof OfflineError) {
          item.status = 'waiting'
          break
        }
        if (await sessionEnded(e)) {
          item.status = 'waiting'
          net.authNeeded = true
          break
        }
        // refused by the server (for example the stock was already used): it stays, with the reason
        Object.assign(item, { status: 'failed', error: e.message })
        net.outbox.forEach((o) => o.status === 'waiting' && JSON.stringify(o.data).includes(item.localId || '\0') && Object.assign(o, { status: 'failed', error: 'It depends on a change that could not be sent.' }))
      }
      saveOutbox()
    }
  } finally {
    net.syncing = false
    saveOutbox()
  }
  if (sent) {
    net.syncedAt = Date.now()
    changed()
  }
  if (net.online && net.outbox.some((i) => i.status === 'waiting')) setTimeout(flush, 500)
  return sent
}

/** Try a change again after it was refused. */
export function retry(id) {
  const item = net.outbox.find((i) => i.id === id)
  if (!item) return
  Object.assign(item, { status: 'waiting', error: undefined })
  saveOutbox()
  flush()
}

export function discard(id) {
  const item = net.outbox.find((i) => i.id === id)
  net.outbox = net.outbox.filter((i) => i.id !== id && !(item?.localId && JSON.stringify(i.data).includes(item.localId)))
  saveOutbox()
  changed()
}

export function clearOutbox() {
  net.outbox = []
  saveOutbox()
}
