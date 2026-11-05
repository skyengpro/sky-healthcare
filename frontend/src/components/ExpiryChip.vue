<template>
  <span v-if="date" class="inline-flex flex-col leading-tight" :class="align === 'end' ? 'items-end' : 'items-start'">
    <span class="text-[13px] font-semibold tabular" :class="tone">{{ label }}</span>
    <span v-if="showDate" class="font-label mt-0.5 text-[11px] uppercase text-ink-mute">{{ t('Exp') }} {{ stamp }}</span>
  </span>
  <span v-else class="text-sm text-ink-faint">—</span>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '@/i18n'
import { daysUntil } from '@/format'

const props = defineProps({ date: String, days: Number, showDate: { type: Boolean, default: true }, align: { type: String, default: 'start' } })
const d = computed(() => props.days ?? daysUntil(props.date))
// printed like the expiry on a medicine box: MM/YYYY
const stamp = computed(() => (props.date ? `${props.date.slice(5, 7)}/${props.date.slice(0, 4)}` : ''))
const label = computed(() => {
  const n = d.value
  if (n < 0) return t('Expired')
  if (n === 0) return t('Today')
  if (n <= 90) return t('{0} days', n)
  if (n < 730) return t('{0} months', Math.floor(n / 30.4))
  return t('{0} years', Math.floor(n / 365))
})
const tone = computed(() => (d.value < 0 ? 'text-alert' : d.value <= 30 ? 'text-alert' : d.value <= 90 ? 'text-warn' : 'text-ink-soft'))
</script>
