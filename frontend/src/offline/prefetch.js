// While the device is online and idle, read the data people need most into the offline copy, so a
// screen that was never opened still works the first time the connection drops: the lists, the
// reference data used in forms, and the files of the most recent patients and medicines.
import { get, net } from '../api'
import { idb } from './store'

const EVERY = 20 * 60 * 1000
const H = (m) => `sky_healthcare.health.${m}`
const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 6000 }) : setTimeout(fn, 1500))

async function pool(items, size, fn) {
  const queue = [...items]
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (queue.length && net.online) {
        try {
          await fn(queue.shift())
        } catch {}
      }
    }),
  )
}

async function run(session) {
  const first = [
    () => get('dashboard'),
    () => get('notifications'),
    () => get('medicines'),
    () => get('requests'),
    () => get('movements', { kind: 'out', limit: 12 }),
    () => get('expiring', { days: 90 }),
    session.isAdmin && (() => get('staff')),
    session.health && (() => get(H('patients'))),
    session.health && (() => get(H('practitioners'))),
    session.health && (() => get(H('procedure_templates'))),
    session.health && (() => get(H('procedure_templates'), { include_disabled: 1 })),
    session.health && (() => get(H('suggestions'), { kind: 'symptoms' })),
    session.health && (() => get(H('suggestions'), { kind: 'diagnoses' })),
  ].filter(Boolean)
  await pool(first, 3, (f) => f())

  const medicines = (await get('medicines').catch(() => [])) || []
  await pool(medicines.slice(0, 80), 3, (m) => get('medicine', { code: m.code }))

  if (session.health) {
    const patients = ((await get(H('patients')).catch(() => [])) || []).filter((p) => !p.pending).slice(0, 40)
    await pool(patients, 3, async (p) => {
      const file = await get(H('patient'), { name: p.name })
      for (const c of (file.consultations || []).slice(0, 3)) await get(H('consultation'), { name: c.name })
    })
  }
}

export async function prefetch(session) {
  if (!net.online) return
  const last = (await idb.get('meta', 'prefetchedAt')) || 0
  if (Date.now() - last < EVERY) return
  await idb.set('meta', 'prefetchedAt', Date.now())
  idle(() => run(session).catch(() => {}))
}
