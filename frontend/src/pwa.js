// The service worker is served from /pharmacy/sw.js (see sky_healthcare/service_worker.py) so it can
// control every page under /pharmacy and keep the app working with no connection.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/pharmacy/sw.js', { scope: '/pharmacy/' }).catch(() => {})
  })
}
