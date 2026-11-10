import { reactive } from 'vue'
import { dialog } from 'frappe-ui'
import { get, net, clearCache, clearOutbox, flush, loadOutbox, ready } from './api'
import { prefetch } from './offline/prefetch'
import { idb } from './offline/store'
import { setLanguage, t } from './i18n'

export const session = reactive({
  ready: false,
  user: null,
  isAdmin: false,
  company: null,
  currency: 'XAF',
  siteName: '',
  health: false,
  practitioner: null,
  options: { categories: [], forms: [], units: [], reasons: [], urgencies: [], genders: [], blood_groups: [], dosages: [], durations: [] },
})

// Logging out needs the server. When it could not be reached, the log out is remembered and finished
// the next time the app can reach the server, before anyone is shown a signed-in screen.
const LOGOUT_PENDING = 'sky_healthcare.logout'
const flag = {
  get: () => {
    try {
      return !!localStorage.getItem(LOGOUT_PENDING)
    } catch {
      return false
    }
  },
  set: (on) => {
    try {
      on ? localStorage.setItem(LOGOUT_PENDING, '1') : localStorage.removeItem(LOGOUT_PENDING)
    } catch {}
  },
}

async function endSession(csrf) {
  try {
    const r = await fetch('/api/method/logout', { method: 'POST', headers: { 'X-Frappe-CSRF-Token': csrf || '' } })
    return r.ok
  } catch {
    return false
  }
}

/** A log out that was cut short by a lost connection: finish it now. True when the person is signed out. */
async function finishLogout() {
  try {
    const r = await fetch('/api/method/sky_healthcare.api.boot', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } })
    const json = await r.json().catch(() => ({}))
    if (!r.ok || !json.message?.user || (await endSession(json.message.csrf_token))) return flag.set(false) || true
  } catch {}
  return false // the server cannot be reached: the person stays signed out on this device until it can
}

export async function loadSession() {
  await ready
  if (flag.get()) {
    await finishLogout()
    session.user = null
    session.ready = true
    return null
  }
  try {
    const boot = await get('boot')
    if (boot?.user) {
      Object.assign(session, {
        user: boot.user,
        isAdmin: boot.is_admin,
        company: boot.company,
        currency: boot.currency || 'XAF',
        siteName: boot.site_name,
        options: boot.options,
        health: !!boot.health,
        practitioner: boot.practitioner || null,
      })
      net.csrf = boot.csrf_token
      net.user = boot.user.email || boot.user.name
      net.authNeeded = false
      await loadOutbox()
      if (!localStorage.getItem('sky_healthcare.lang') && boot.user.language) setLanguage(boot.user.language)
      flush()
      prefetch(session)
    } else {
      session.user = null
    }
  } catch {
    session.user = null
  }
  session.ready = true
  return session.user
}

export async function login(usr, pwd) {
  const res = await fetch('/api/method/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ usr, pwd }),
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(res.status === 401 ? 'Wrong email or password.' : json.message || 'Could not log in.')
  }
  flag.set(false)
  await clearCache()
  // the page is reloaded so the session cookie and a fresh CSRF token are used everywhere
  window.location.href = '/sky-healthcare/'
}

export async function logout() {
  flag.set(true)
  await clearOutbox()
  await clearCache()
  await idb.del('meta', 'ids')
  if (await endSession(net.csrf)) flag.set(false)
  window.location.href = '/sky-healthcare/login'
}

/** Log out, after warning when changes on this device have not been sent (they are lost). */
export function confirmLogout() {
  if (!net.outbox.length) return logout()
  dialog.danger({
    title: t('Log out?'),
    message: t('{0} change(s) on this device are not sent yet. If you log out now, they are lost.', net.outbox.length),
    confirmLabel: t('Log out'),
    onConfirm: logout,
  })
}
