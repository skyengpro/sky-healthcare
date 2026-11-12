// "Install the app" on the home screen. The browser offers it once, early (beforeinstallprompt), often
// before any page is shown, so the offer is caught here at start and kept for the banner and the Account page.
// iPhone and iPad never send it: there the banner explains Share > Add to Home Screen instead.
import { computed, reactive } from 'vue'


const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export const install = reactive({
  offer: null, // the browser's install prompt, when it gave one
  installed: standalone(),
  dismissed: false, // closed with X: hidden until the page is loaded again
  ios,
})

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault() // keep it for our own button instead of the browser's mini bar
  install.offer = e
})
window.addEventListener('appinstalled', () => Object.assign(install, { installed: true, offer: null }))

/** Show the banner: not installed yet, the browser can install (or it is an iPhone), and not closed on this page. */
export const showInstall = computed(() => !install.installed && (install.offer || install.ios) && !install.dismissed)

export async function installApp() {
  const offer = install.offer
  if (!offer) return false
  offer.prompt()
  const { outcome } = await offer.userChoice.catch(() => ({ outcome: 'dismissed' }))
  install.offer = null
  if (outcome === 'accepted') install.installed = true
  return outcome === 'accepted'
}

// the banner comes back on the next load: installing is what makes the app work offline, so it keeps asking
export function dismissInstall() {
  install.dismissed = true
}
