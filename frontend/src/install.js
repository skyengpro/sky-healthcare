// "Install the app" on the home screen. The browser offers it once, early (beforeinstallprompt), often
// before any page is shown, so the offer is caught here at start and kept for the banner and the Account page.
// iPhone and iPad never send it: there the banner explains Share > Add to Home Screen instead.
import { computed, reactive } from 'vue'

const DISMISSED = 'sky_healthcare.install.dismissed'
const AGAIN_AFTER = 14 * 24 * 3600 * 1000 // a dismissed banner comes back two weeks later

const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const read = () => {
  try {
    return Number(localStorage.getItem(DISMISSED)) || 0
  } catch {
    return 0
  }
}

export const install = reactive({
  offer: null, // the browser's install prompt, when it gave one
  installed: standalone(),
  dismissedAt: read(),
  ios,
})

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // keep it for our own button instead of the browser's mini bar
  install.offer = e
})
window.addEventListener('appinstalled', () => Object.assign(install, { installed: true, offer: null }))

/** Show the banner: not installed yet, the browser can install (or it is an iPhone), and not dismissed lately. */
export const showInstall = computed(
  () => !install.installed && (install.offer || install.ios) && Date.now() - install.dismissedAt > AGAIN_AFTER,
)

export async function installApp() {
  const offer = install.offer
  if (!offer) return false
  offer.prompt()
  const { outcome } = await offer.userChoice.catch(() => ({ outcome: 'dismissed' }))
  install.offer = null
  if (outcome === 'accepted') install.installed = true
  return outcome === 'accepted'
}

export function dismissInstall() {
  install.dismissedAt = Date.now()
  try {
    localStorage.setItem(DISMISSED, String(install.dismissedAt))
  } catch {}
}
