<template>
  <span v-if="show" class="inline-flex shrink-0 items-center gap-1 rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-medium text-info" :title="t('Saved on this device, waiting to be sent')">
    <span class="lucide-cloud-upload size-3" />{{ t('Waiting to be sent') }}
  </span>
</template>

<script setup>
import { t } from '@/i18n'

defineProps({ show: { type: Boolean, default: false } })
</script>
