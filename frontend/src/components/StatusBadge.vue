<template>
  <span class="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium" :class="meta.cls">
    <span class="size-1.5 rounded-full" :class="meta.dot" />{{ t(meta.label) }}
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '@/i18n'

const props = defineProps({ status: String })
const green = { cls: 'bg-paper-deep text-ink-soft', dot: 'bg-ink-faint' }
const amber = { cls: 'bg-warn-soft text-warn', dot: 'bg-warn-mid' }
const red = { cls: 'bg-alert-soft text-alert', dot: 'bg-alert' }
const blue = { cls: 'bg-info-soft text-info', dot: 'bg-info' }
const gray = { cls: 'bg-paper-deep text-ink-soft', dot: 'bg-ink-faint' }
const STATUS = {
  ok: { ...green, label: 'In stock' },
  low: { ...amber, label: 'Low stock' },
  out: { ...red, label: 'Out of stock' },
  expiring: { ...amber, label: 'Expiring soon' },
  expired: { ...red, label: 'Expired' },
  pending: { ...blue, label: 'Waiting for approval' },
  approved: { ...green, label: 'Approved' },
  rejected: { ...red, label: 'Rejected' },
  ordered: { ...blue, label: 'Ordered' },
  received: { ...green, label: 'Received' },
  cancelled: { ...gray, label: 'Cancelled' },
  done: { ...green, label: 'Done' },
  planned: { ...blue, label: 'Planned' },
  draft: { ...amber, label: 'Draft' },
  waiting: { ...blue, label: 'Waiting' },
  active: { ...blue, label: 'To give' },
}
const meta = computed(() => STATUS[props.status] || { ...gray, label: props.status || '—' })
</script>
