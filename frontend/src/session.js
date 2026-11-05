import { reactive } from 'vue'
import { get, net, clearCache, flush } from './api'
import { setLanguage } from './i18n'

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

export async function loadSession() {
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
      if (!localStorage.getItem('sky_healthcare.lang') && boot.user.language) setLanguage(boot.user.language)
      flush()
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
  clearCache()
  // the page is reloaded so the session cookie and a fresh CSRF token are used everywhere
  window.location.href = '/sky-healthcare/'
}

export async function logout() {
  await fetch('/api/method/logout', { method: 'POST', headers: { 'X-Frappe-CSRF-Token': net.csrf || '' } }).catch(() => {})
  clearCache()
  window.location.href = '/sky-healthcare/login'
}
