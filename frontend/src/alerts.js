// Alerts shared by the bell, the mobile header and the Notifications page.
import { computed, reactive } from 'vue'
import { get, post } from './api'

export const alerts = reactive({ data: null, loading: false })

export const alertCount = computed(() => {
  const d = alerts.data
  if (!d) return 0
  return (d.expired.length ? 1 : 0) + (d.low.length ? 1 : 0) + (d.expiring.length ? 1 : 0) + (d.pending.length ? 1 : 0) + d.unread
})

export async function loadAlerts() {
  alerts.loading = true
  try {
    alerts.data = await get('notifications')
  } catch {
  } finally {
    alerts.loading = false
  }
}

export async function markAllRead() {
  await post('mark_notifications_read')
  if (alerts.data) {
    alerts.data.log.forEach((n) => (n.read = 1))
    alerts.data.unread = 0
  }
}
