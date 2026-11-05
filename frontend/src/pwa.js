// The service worker is served from /sky-healthcare/sw.js (see sky_healthcare/service_worker.py) so it can
// control every page under /sky-healthcare and keep the app working with no connection.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const register = () => navigator.serviceWorker.register('/sky-healthcare/sw.js', { scope: '/sky-healthcare/' }).catch(() => {})
  // the app starts after the offline copy is read, which can be after the page's load event
  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register)
}
