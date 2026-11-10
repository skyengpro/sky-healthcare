<template>
  <!-- slides in and out smoothly: offline, back online, sending, all sent, or signed out -->
  <div class="conn" :class="{ open: !!phase }" :aria-hidden="!phase" role="status" aria-live="polite">
    <div class="conn-inner">
      <div class="mx-4 pb-1.5 md:mx-8 lg:mx-10">
        <div class="flex items-center gap-2.5 rounded-[14px] border px-4 py-2.5 text-[13px] transition-colors duration-300" :class="tone[view]">
          <span :class="[icon[view], view === 'syncing' && 'animate-spin']" class="size-4 shrink-0" />
          <span class="min-w-0 flex-1 leading-snug">
            <b class="font-semibold">{{ title }}</b>
            <span v-if="detail" class="ml-1 opacity-80">{{ detail }}</span>
          </span>
          <Btn v-if="view === 'auth'" size="sm" variant="secondary" :label="t('Sign in')" @click="signIn" />
          <Btn v-else-if="view === 'failed'" size="sm" variant="secondary" :label="t('Review')" @click="ui.sync.open = true" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Btn from './Btn.vue'
import { toast } from 'frappe-ui'
import { net } from '@/api'
import { date } from '@/format'
import { t } from '@/i18n'
import { ui } from '@/ui'

const tone = {
  // offline is a normal state here, so it is calm and neutral rather than an alarm
  offline: 'border-line bg-card text-ink-soft',
  syncing: 'border-info/20 bg-info-soft text-info',
  synced: 'border-apo/20 bg-apo-soft text-apo',
  back: 'border-apo/20 bg-apo-soft text-apo',
  auth: 'border-alert/20 bg-alert-soft text-alert',
  failed: 'border-alert/20 bg-alert-soft text-alert',
  storage: 'border-alert/20 bg-alert-soft text-alert',
}
const icon = {
  offline: 'lucide-wifi-off',
  syncing: 'lucide-refresh-cw',
  synced: 'lucide-circle-check',
  back: 'lucide-wifi',
  auth: 'lucide-log-in',
  failed: 'lucide-triangle-alert',
  storage: 'lucide-hard-drive',
}

const waiting = computed(() => net.outbox.filter((i) => i.status === 'waiting' || i.status === 'sending').length)
const failed = computed(() => net.outbox.filter((i) => i.status === 'failed').length)
// tell the person once when a change is refused, with a way to see why
watch(failed, (n, before) => {
  if (n > before) toast.error(t('{0} change(s) could not be sent', n), { description: t('Open the list to see why, then try again or discard.') })
})

// a short loss of signal is not worth a message: "offline" is shown once it lasts
const offlineShown = ref(false)
const back = ref(false)
const synced = ref(false)
let offTimer, backTimer, syncTimer
watch(
  () => net.online,
  (on) => {
    clearTimeout(offTimer)
    if (!on) offTimer = setTimeout(() => (offlineShown.value = true), 900)
    else if (offlineShown.value) {
      offlineShown.value = false
      back.value = true
      clearTimeout(backTimer)
      backTimer = setTimeout(() => (back.value = false), 2600)
    }
  },
  { immediate: true },
)
watch(
  () => net.syncedAt,
  () => {
    synced.value = true
    clearTimeout(syncTimer)
    syncTimer = setTimeout(() => (synced.value = false), 3200)
  },
)

const phase = computed(() => {
  if (net.storageFailed && net.outbox.length) return 'storage'
  if (net.authNeeded && waiting.value) return 'auth'
  if (!net.online) return offlineShown.value ? 'offline' : null
  if (net.syncing || waiting.value) return 'syncing'
  if (synced.value) return 'synced'
  if (back.value) return 'back'
  if (failed.value) return 'failed'
  return null
})
// keep the last message while the bar slides away, so the text does not vanish before the bar does
const view = ref('offline')
watch(phase, (p) => p && (view.value = p), { immediate: true })

const title = computed(
  () =>
    ({
      offline: t("You're offline."),
      syncing: t('Back online.'),
      synced: t('All changes are sent.'),
      back: t('Back online.'),
      auth: t('Your session ended.'),
      failed: t('{0} change(s) could not be sent.', failed.value),
      storage: t("Changes can't be kept on this device."),
    })[view.value],
)
const detail = computed(() => {
  const n = waiting.value
  // what the screens show while offline comes from the copy on the device: say how old it is
  const stamp = net.freshAt ? ' ' + t('Data from {0}.', date(new Date(net.freshAt), { dateStyle: 'short', timeStyle: 'short' })) : ''
  return {
    offline: (n ? t('{0} change(s) saved on this device, sent automatically later.', n) : t('Everything you do is saved on this device and sent when you are back online.')) + stamp,
    failed: t('The server refused them. Review to try again or discard.'),
    storage: t('The storage of this device is full or blocked. Keep this page open until they are sent.'),
    syncing: t('Sending {0} change(s)…', n || 1),
    synced: '',
    back: '',
    auth: t('Sign in again to send your {0} saved change(s).', n),
  }[view.value]
})

function signIn() {
  window.location.href = '/sky-healthcare/login'
}
</script>

<style scoped>
.conn {
  display: grid;
  grid-template-rows: 0fr;
  opacity: 0;
  transition: grid-template-rows 0.35s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.25s ease;
}
.conn.open {
  grid-template-rows: 1fr;
  opacity: 1;
}
.conn-inner {
  min-height: 0;
  overflow: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .conn {
    transition: none;
  }
}
</style>
