<template>
  <!-- share of medicines in each state, as a ring; the centre shows how many are fine -->
  <div class="flex items-center gap-6">
    <div class="relative shrink-0" :style="{ width: size + 'px', height: size + 'px' }">
      <svg :viewBox="`0 0 ${size} ${size}`" class="-rotate-90">
        <circle :cx="c" :cy="c" :r="r" fill="none" class="stroke-paper-deep" :stroke-width="stroke" />
        <circle v-for="s in arcs" :key="s.key" :cx="c" :cy="c" :r="r" fill="none" :class="s.stroke" :stroke-width="stroke"
          stroke-linecap="butt" :stroke-dasharray="`${s.len} ${circ}`" :stroke-dashoffset="-s.offset" />
      </svg>
      <div class="absolute inset-0 flex flex-col items-center justify-center">
        <span class="font-display text-[34px] leading-none text-ink tabular">{{ pct }}<span class="text-[18px]">%</span></span>
        <span class="mt-1 text-[11.5px] text-ink-mute">{{ t('in good order') }}</span>
      </div>
    </div>
    <ul class="min-w-0 flex-1 space-y-2.5">
      <li v-for="s in parts" :key="s.key" class="flex items-center gap-2.5 text-[13px]">
        <span class="size-2.5 shrink-0 rounded-full" :class="s.dot" />
        <span class="flex-1 truncate text-ink-soft">{{ t(s.label) }}</span>
        <span class="font-semibold text-ink tabular">{{ s.value }}</span>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '@/i18n'

const props = defineProps({ health: Object, size: { type: Number, default: 132 } })
const stroke = 14
const c = computed(() => props.size / 2)
const r = computed(() => props.size / 2 - stroke / 2 - 1)
const circ = computed(() => 2 * Math.PI * r.value)
const parts = computed(() => [
  { key: 'ok', label: 'In stock', value: props.health.ok || 0, stroke: 'stroke-apo-mid', dot: 'bg-apo-mid' },
  { key: 'expiring', label: 'Expiring soon', value: props.health.expiring || 0, stroke: 'stroke-warn-mid', dot: 'bg-warn-mid' },
  { key: 'low', label: 'Low stock', value: props.health.low || 0, stroke: 'stroke-warn', dot: 'bg-warn' },
  { key: 'out', label: 'Out of stock', value: props.health.out || 0, stroke: 'stroke-alert', dot: 'bg-alert' },
  { key: 'expired', label: 'Expired', value: props.health.expired || 0, stroke: 'stroke-alert/60', dot: 'bg-alert/60' },
])
const total = computed(() => parts.value.reduce((a, p) => a + p.value, 0) || 1)
const pct = computed(() => Math.round(((props.health.ok || 0) / total.value) * 100))
const arcs = computed(() => {
  let offset = 0
  const gap = 3
  return parts.value.filter((p) => p.value).map((p) => {
    const full = (p.value / total.value) * circ.value
    const arc = { key: p.key, stroke: p.stroke, len: Math.max(full - gap, 1), offset }
    offset += full
    return arc
  })
})
</script>
