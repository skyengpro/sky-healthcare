// Small IndexedDB key-value store. It holds the offline copy of what the app has read and the
// changes waiting to be sent. IndexedDB is used instead of localStorage because it is much larger
// (the lists and patient files would fill localStorage) and does not block the page.
// When IndexedDB is not available (a private window), a plain in-memory map keeps the app working.

const DB = 'sky_healthcare'
let dbPromise
const memory = { cache: new Map(), meta: new Map() }

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB, 1)
        req.onupgradeneeded = () => {
          req.result.createObjectStore('cache')
          req.result.createObjectStore('meta')
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
  if (!db) return undefined
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, mode)
      const result = fn(tx.objectStore(store))
      tx.oncomplete = () => resolve(result?.result)
      tx.onerror = tx.onabort = () => resolve(undefined)
    } catch {
      resolve(undefined)
    }
  })
}

export const idb = {
  async get(store, key) {
    const db = await open()
    if (!db) return memory[store].get(key)
    return run(store, 'readonly', (s) => s.get(key))
  },
  async set(store, key, value) {
    const db = await open()
    if (!db) return void memory[store].set(key, value)
    await run(store, 'readwrite', (s) => s.put(value, key))
  },
  async del(store, key) {
    const db = await open()
    if (!db) return void memory[store].delete(key)
    await run(store, 'readwrite', (s) => s.delete(key))
  },
  async keys(store) {
    const db = await open()
    if (!db) return [...memory[store].keys()]
    return (await run(store, 'readonly', (s) => s.getAllKeys())) || []
  },
  async clear(store) {
    const db = await open()
    if (!db) return void memory[store].clear()
    await run(store, 'readwrite', (s) => s.clear())
  },
}
