<template>
  <div>
    <div v-if="!items.length" class="flex flex-col items-center px-4 py-8 text-center">
      <span class="mb-2 flex size-10 items-center justify-center rounded-full bg-apo-soft text-apo"><span class="lucide-check size-5" /></span>
      <p class="text-[13.5px] font-semibold text-ink">{{ t('All clear') }}</p>
      <p class="mt-0.5 text-[12.5px] text-ink-mute">{{ t('No alerts. Everything looks good.') }}</p>
    </div>
    <RouterLink v-for="a in items" :key="a.key" :to="a.to" class="flex items-start gap-3 rounded-[14px] p-3 transition hover:bg-paper" @click="emit('navigate')">
      <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full" :class="a.tone"><span :class="a.icon" class="size-4" /></span>
      <span class="min-w-0 flex-1">
        <span class="block text-[13.5px] font-semibold text-ink">{{ a.title }}</span>
        <span class="mt-0.5 block text-[12.5px] leading-snug text-ink-mute">{{ a.text }}</span>
      </span>
      <span class="lucide-chevron-right mt-2 size-4 text-ink-faint" />
    </RouterLink>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { alerts } from '@/alerts'
import { t } from '@/i18n'

const emit = defineEmits(['navigate'])
const items = computed(() => {
  const d = alerts.data
  if (!d) return []
  const names = (list, key = 'medicine_name') => [...new Set(list.map((x) => x[key] || x.name))].slice(0, 3).join(', ')
  return [
    d.expired.length && { key: 'expired', to: '/medicines?status=expired', icon: 'lucide-octagon-alert', tone: 'bg-alert-soft text-alert',
      title: t('{0} medicine(s) with expired stock', new Set(d.expired.map((x) => x.medicine)).size), text: names(d.expired) },
    d.low.length && { key: 'low', to: '/medicines?status=low', icon: 'lucide-trending-down', tone: 'bg-warn-soft text-warn',
      title: t('{0} medicine(s) low or out of stock', d.low.length), text: names(d.low, 'name') },
    d.expiring.length && { key: 'expiring', to: '/medicines?status=expiring', icon: 'lucide-calendar-clock', tone: 'bg-warn-soft text-warn',
      title: t('{0} medicine(s) expiring within 90 days', new Set(d.expiring.map((x) => x.medicine)).size), text: names(d.expiring) },
    d.pending.length && { key: 'pending', to: '/requests?status=pending', icon: 'lucide-clipboard-list', tone: 'bg-info-soft text-info',
      title: t('{0} request(s) waiting for your approval', d.pending.length), text: names(d.pending) },
  ].filter(Boolean)
})
</script>
