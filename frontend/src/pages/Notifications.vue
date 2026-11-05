<template>
  <div class="max-w-[860px]">
    <PageHeader :eyebrow="t('Inbox')" :title="t('Notifications')" :subtitle="t('What needs your attention, and what happened recently.')">
      <template v-if="d?.unread" #actions>
        <Btn icon="lucide-check-check" :label="t('Mark all as read')" @click="markAllRead" />
      </template>
    </PageHeader>

    <div v-if="!d" class="space-y-3"><div v-for="i in 3" :key="i" class="surface h-28 animate-pulse" /></div>
    <template v-else>
      <p class="eyebrow mb-3">{{ t('Needs action') }}</p>
      <div v-if="!groups.length" class="surface mb-8 flex items-center gap-4 p-5">
        <span class="flex size-11 shrink-0 items-center justify-center rounded-full bg-apo-soft text-apo"><span class="lucide-check size-5" /></span>
        <div>
          <p class="font-display text-[19px] text-ink">{{ t('All clear') }}</p>
          <p class="text-[13px] text-ink-mute">{{ t('No alerts. Everything looks good.') }}</p>
        </div>
      </div>
      <div v-else class="mb-8 space-y-3">
        <section v-for="g in groups" :key="g.key" class="surface overflow-hidden">
          <header class="flex items-center gap-3 px-5 pb-2 pt-4">
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full" :class="g.tone"><span :class="g.icon" class="size-4" /></span>
            <h2 class="flex-1 text-[15px] font-semibold text-ink">{{ g.title }}</h2>
            <RouterLink :to="g.to" class="text-[13px] font-medium text-ink-mute hover:text-ink">{{ t('See all') }}</RouterLink>
          </header>
          <ul class="px-2 pb-2">
            <li v-for="row in g.rows" :key="row.key" class="flex items-center gap-3 rounded-[12px] px-3 py-2.5">
              <div class="min-w-0 flex-1">
                <RouterLink :to="row.to" class="block truncate text-[14px] font-semibold text-ink hover:underline">{{ row.name }}</RouterLink>
                <div class="mt-0.5 truncate text-[12.5px] text-ink-mute">{{ row.sub }}</div>
              </div>
              <Btn v-if="row.action" size="sm" :variant="row.action.variant || 'secondary'" :label="row.action.label" :icon="row.action.icon"
                :to="row.action.to" @click="row.action.click && row.action.click()" />
            </li>
          </ul>
        </section>
      </div>

      <p class="eyebrow mb-3">{{ t('History') }}</p>
      <div class="surface overflow-hidden">
        <EmptyState v-if="!d.log.length" icon="lucide-bell" :title="t('No notifications yet')"
          :text="t('Expiry reminders and request updates appear here.')" />
        <ul v-else>
          <li v-for="n in paged.items.value" :key="n.name" class="flex items-start gap-3 border-b border-line/70 px-5 py-3.5 last:border-0"
            :class="!n.read && 'bg-apo-mist/60'">
            <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="n.read ? 'bg-transparent' : 'bg-apo'" />
            <div class="min-w-0 flex-1">
              <p class="text-[14px] leading-snug text-ink" :class="!n.read && 'font-semibold'">{{ n.subject }}</p>
              <p class="mt-0.5 text-[12px] text-ink-mute">{{ ago(n.creation) }}</p>
            </div>
          </li>
        </ul>
      </div>
      <Pager v-model:page="paged.page.value" :pages="paged.pages.value" :total="paged.total.value" :size="paged.size" />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import Pager from '@/components/Pager.vue'
import { usePaged } from '@/paging'
import { alerts, loadAlerts, markAllRead } from '@/alerts'
import { t } from '@/i18n'
import { date, num } from '@/format'
import { openRequest } from '@/ui'

const d = computed(() => alerts.data)
const log = computed(() => alerts.data?.log || [])
const paged = usePaged(log, 10)
const med = (code) => `/medicines/${encodeURIComponent(code)}`

const groups = computed(() => {
  if (!d.value) return []
  const out = []
  if (d.value.expired.length)
    out.push({ key: 'expired', icon: 'lucide-octagon-alert', tone: 'bg-alert-soft text-alert', to: '/medicines?status=expired',
      title: t('{0} batch(es) have expired', d.value.expired.length),
      rows: d.value.expired.slice(0, 5).map((b) => ({ key: b.batch, name: b.medicine_name, to: med(b.medicine),
        sub: `${b.batch} · ${num(b.qty)} ${t(b.unit)} · ${t('expired {0}', date(b.expiry_date))}`,
        action: { label: t('Record as expired'), variant: 'danger', to: { path: '/give-out', query: { medicine: b.medicine, reason: 'Expired stock' } } } })) })
  if (d.value.low.length)
    out.push({ key: 'low', icon: 'lucide-trending-down', tone: 'bg-warn-soft text-warn', to: '/medicines?status=low',
      title: t('{0} medicine(s) low or out of stock', d.value.low.length),
      rows: d.value.low.slice(0, 5).map((m) => ({ key: m.code, name: m.name, to: med(m.code),
        sub: t('{0} in stock, minimum {1}', num(m.stock), num(m.minimum)),
        action: { label: t('Request'), icon: 'lucide-clipboard-list', click: () => openRequest(m.code, Math.max(m.minimum * 2 - m.stock, 1)) } })) })
  if (d.value.expiring.length)
    out.push({ key: 'expiring', icon: 'lucide-calendar-clock', tone: 'bg-warn-soft text-warn', to: '/reports?tab=expiry',
      title: t('{0} batch(es) expire within 90 days', d.value.expiring.length),
      rows: d.value.expiring.slice(0, 5).map((b) => ({ key: b.batch, name: b.medicine_name, to: med(b.medicine),
        sub: `${b.batch} · ${num(b.qty)} ${t(b.unit)} · ${t('in {0} days', b.days_left)}` })) })
  if (d.value.pending.length)
    out.push({ key: 'pending', icon: 'lucide-clipboard-list', tone: 'bg-info-soft text-info', to: '/requests?status=pending',
      title: t('{0} request(s) waiting for your approval', d.value.pending.length),
      rows: d.value.pending.slice(0, 5).map((r) => ({ key: r.name, name: `${r.medicine_name} × ${num(r.qty)}`, to: '/requests?status=pending',
        sub: `${r.requested_by} · ${t(r.urgency || 'Routine')}`, action: { label: t('Review'), to: '/requests?status=pending' } })) })
  return out
})

function ago(ts) {
  const mins = Math.round((Date.now() - new Date(ts.replace(' ', 'T')).getTime()) / 60000)
  if (mins < 1) return t('just now')
  if (mins < 60) return t('{0} min ago', mins)
  if (mins < 1440) return t('{0} h ago', Math.round(mins / 60))
  return date(ts.slice(0, 10))
}

onMounted(loadAlerts)
</script>
