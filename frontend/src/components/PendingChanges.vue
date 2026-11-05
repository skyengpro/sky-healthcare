<template>
  <div v-if="items.length" class="mb-4 rounded-[16px] border border-info/20 bg-info-soft/60 p-3.5">
    <div class="mb-2 flex items-center gap-2 text-[13px] font-semibold text-info">
      <span class="lucide-cloud-upload size-4" />{{ t('Saved on this device, waiting to be sent') }}
    </div>
    <ul class="space-y-1.5">
      <li v-for="i in items" :key="i.id" class="flex items-center justify-between gap-3 rounded-[12px] bg-card px-3 py-2 text-[13px]">
        <div class="min-w-0">
          <div class="truncate font-medium text-ink">{{ i.label }}</div>
          <div v-if="i.summary" class="truncate text-ink-mute">{{ i.summary }}</div>
        </div>
        <button class="shrink-0 rounded-full px-2 py-1 text-[12px] text-ink-mute transition hover:bg-alert-soft hover:text-alert" @click="discard(i.id)">{{ t('Discard') }}</button>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { discard } from '@/api'
import { t } from '@/i18n'

defineProps({ items: { type: Array, required: true } })
</script>
