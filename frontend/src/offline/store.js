// Small IndexedDB key-value store. It holds the offline copy of what the app has read and the
// changes waiting to be sent. IndexedDB is used instead of localStorage because it is much larger
// (the lists and patient files would fill localStorage) and does not block the page.
// When IndexedDB is not available (a private window), a plain in-memory map keeps the app working.

const DB = 'sky_healthcare'
let dbPromise
const memory = { cache: new Map(), meta: new Map(), outbox: new Map() }

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 2)
        req.onupgradeneeded = () => {
          // one record per waiting change, so two tabs never overwrite each other's list
          for (const name of ['cache', 'meta', 'outbox']) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name)
        }
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => resolve(null)
        req.onblocked = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
  }
  return dbPromise
}

async function run(store, mode, fn) {
  const db = await open()
  if (!db) return { ok: false }
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, mode)
      const result = fn(tx.objectStore(store))
      tx.oncomplete = () => resolve({ ok: true, value: result?.result })
      tx.onerror = tx.onabort = () => resolve({ ok: false })
    } catch {
      resolve({ ok: false })
    }
  })
}

export const idb = {
  async get(store, key) {
    const db = await open()
    if (!db) return memory[store].get(key)
    return (await run(store, 'readonly', (s) => s.get(key))).value
  },
  /** Resolves true when the value is stored on the device for good (false: only kept in memory, or the write failed). */
  async set(store, key, value) {
    const db = await open()
    if (!db) return void memory[store].set(key, value) || false
    return (await run(store, 'readwrite', (s) => s.put(value, key))).ok
  },
  async del(store, key) {
    const db = await open()
    if (!db) return void memory[store].delete(key) || false
    return (await run(store, 'readwrite', (s) => s.delete(key))).ok
  },
  async keys(store) {
    const db = await open()
    if (!db) return [...memory[store].keys()]
    return (await run(store, 'readonly', (s) => s.getAllKeys())).value || []
  },
  async all(store) {
    const db = await open()
    if (!db) return [...memory[store].values()]
    return (await run(store, 'readonly', (s) => s.getAll())).value || []
  },
  async clear(store) {
    const db = await open()
    if (!db) return void memory[store].clear()
    await run(store, 'readwrite', (s) => s.clear())
  },
}
