<template>
  <div v-if="pages > 1" class="flex flex-wrap items-center justify-between gap-3 pt-4">
    <p class="text-[13px] text-ink-mute tabular">{{ t('{0}–{1} of {2}', from, to, total) }}</p>
    <nav class="flex items-center gap-1" :aria-label="t('Pages')">
      <button class="flex size-9 items-center justify-center rounded-full border border-line bg-card text-ink-soft transition hover:text-ink disabled:opacity-40"
        :disabled="page <= 1" :aria-label="t('Previous page')" @click="go(page - 1)"><span class="lucide-chevron-left size-4" /></button>
      <template v-for="(p, i) in numbers" :key="i">
        <span v-if="p === '…'" class="px-1 text-[13px] text-ink-faint">…</span>
        <button v-else class="h-9 min-w-9 rounded-full px-3 text-[13px] font-semibold tabular transition"
          :class="p === page ? 'bg-ink text-on-ink' : 'text-ink-soft hover:bg-paper-deep hover:text-ink'"
          :aria-current="p === page ? 'page' : undefined" @click="go(p)">{{ p }}</button>
      </template>
      <button class="flex size-9 items-center justify-center rounded-full border border-line bg-card text-ink-soft transition hover:text-ink disabled:opacity-40"
        :disabled="page >= pages" :aria-label="t('Next page')" @click="go(page + 1)"><span class="lucide-chevron-right size-4" /></button>
    </nav>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { t } from '@/i18n'

const props = defineProps({ page: Number, pages: Number, total: Number, size: Number })
const emit = defineEmits(['update:page'])
const from = computed(() => (props.page - 1) * props.size + 1)
const to = computed(() => Math.min(props.page * props.size, props.total))
// first, last, and the pages around the current one
const numbers = computed(() => {
  const out = []
  for (let p = 1; p <= props.pages; p++) {
    if (p === 1 || p === props.pages || Math.abs(p - props.page) <= 1) out.push(p)
    else if (out[out.length - 1] !== '…') out.push('…')
  }
  return out
})
function go(p) {
  emit('update:page', Math.min(Math.max(1, p), props.pages))
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
</script>
