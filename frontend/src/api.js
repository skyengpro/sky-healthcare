// Talks to sky_healthcare.api on the same site.
//
// Reads are cached in localStorage, so the last data still shows when the device is offline.
// Writes carry a client_id. When the network is down they wait in an outbox and are sent again
// later; the server ignores a client_id it has already recorded, so nothing is counted twice.

import { reactive } from 'vue'

const OUTBOX_KEY = 'sky_healthcare.outbox'
const CACHE_PREFIX = 'sky_healthcare.cache:'

export const net = reactive({
  online: navigator.onLine,
  syncing: false,
  outbox: readOutbox(),
  csrf: null,
})

export class ApiError extends Error {
  constructor(message, status, type) {
    super(message)
    this.status = status
    this.type = type
  }
}
export class OfflineError extends Error {}

function readOutbox() {
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY)) || []
  } catch {
    return []
  }
}
function saveOutbox() {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(net.outbox))
  } catch {}
}
function cacheSet(key, value) {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value))
  } catch {}
}
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key)
    return raw === null ? undefined : JSON.parse(raw)
  } catch {
    return undefined
  }
}
export function clearCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(CACHE_PREFIX))
    .forEach((k) => localStorage.removeItem(k))
}

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

async function request(url, options = {}) {
  let res
  try {
    res = await fetch(url, { credentials: 'same-origin', ...options })
  } catch {
    net.online = false
    throw new OfflineError('offline')
  }
  net.online = true
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(messageFrom(json, res.status), res.status, json.exc_type)
  return json.message
}

const methodUrl = (m) => (m.includes('.') ? `/api/method/${m}` : `/api/method/sky_healthcare.api.${m}`)

export async function get(method, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ).toString()
  const url = methodUrl(method) + (query ? `?${query}` : '')
  try {
    const data = await request(url, { headers: { Accept: 'application/json' } })
    cacheSet(url, data)
    return data
  } catch (e) {
    if (e instanceof OfflineError) {
      const cached = cacheGet(url)
      if (cached !== undefined) return cached
    }
    throw e
  }
}

export async function post(method, data = {}, retried = false) {
  try {
    return await request(methodUrl(method), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-Frappe-CSRF-Token': net.csrf || '',
      },
      body: JSON.stringify(data),
    })
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

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Send a stock write. Returns the server result, or `{ queued: true }` when the device is
 * offline and the write was kept for later.
 */
export async function write(method, data, label) {
  const item = { id: uuid(), method, data: { ...data, client_id: uuid() }, label, at: Date.now() }
  if (!navigator.onLine) return enqueue(item)
  try {
    return await post(method, item.data)
  } catch (e) {
    if (e instanceof OfflineError) return enqueue(item)
    throw e
  }
}

function enqueue(item) {
  net.outbox.push({ ...item, status: 'waiting' })
  saveOutbox()
  return { queued: true }
}

/** Send everything in the outbox, oldest first. Stops at the first network failure. */
export async function flush() {
  if (net.syncing || !net.outbox.some((i) => i.status === 'waiting')) return 0
  net.syncing = true
  let sent = 0
  try {
    for (const item of [...net.outbox]) {
      if (item.status !== 'waiting') continue
      try {
        await post(item.method, item.data)
        net.outbox = net.outbox.filter((i) => i.id !== item.id)
        sent++
      } catch (e) {
        if (e instanceof OfflineError) break
        const failed = net.outbox.find((i) => i.id === item.id)
        if (failed) Object.assign(failed, { status: 'failed', error: e.message })
      }
      saveOutbox()
    }
  } finally {
    net.syncing = false
  }
  return sent
}

export function discard(id) {
  net.outbox = net.outbox.filter((i) => i.id !== id)
  saveOutbox()
}

window.addEventListener('online', () => {
  net.online = true
  flush()
})
window.addEventListener('offline', () => (net.online = false))
setInterval(() => navigator.onLine && flush(), 30000)
