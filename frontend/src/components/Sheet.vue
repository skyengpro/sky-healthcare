<template>
  <!-- desktop: centred dialog; phone: bottom sheet with the same content and buttons -->
  <Dialog v-if="!mobile" :open="open" :title="title" :message="message" :icon="icon" :theme="theme" :size="size"
    @update:open="emit('update:open', $event)">
    <slot />
    <template v-if="$slots.actions" #actions>
      <div class="flex w-full justify-end gap-2"><slot name="actions" /></div>
    </template>
  </Dialog>
  <BottomSheet v-else :open="open" @update:open="emit('update:open', $event)">
    <div class="px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-1">
      <div class="mb-4 flex items-start gap-3">
        <span v-if="icon" class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full" :class="tones[theme] || tones.gray">
          <span :class="icon" class="size-4" />
        </span>
        <div class="min-w-0">
          <h3 class="font-display text-[22px] leading-tight text-ink">{{ title }}</h3>
          <p v-if="message" class="mt-1 text-[13px] leading-snug text-ink-mute">{{ message }}</p>
        </div>
      </div>
      <slot />
      <div v-if="$slots.actions" class="mt-5 grid grid-cols-[auto_1fr] gap-2 [&>*:only-child]:col-span-2 [&>*]:h-12 [&>*]:w-full"><slot name="actions" /></div>
    </div>
  </BottomSheet>
</template>

<script setup>
import { BottomSheet, Dialog } from 'frappe-ui'
import { useMediaQuery } from '@vueuse/core'

defineProps({ open: Boolean, title: String, message: String, icon: String, theme: String, size: { type: String, default: 'lg' } })
const emit = defineEmits(['update:open'])
const mobile = useMediaQuery('(max-width: 767px)')
const tones = { green: 'bg-apo-soft text-apo', blue: 'bg-info-soft text-info', red: 'bg-alert-soft text-alert', amber: 'bg-warn-soft text-warn', gray: 'bg-paper-deep text-ink-soft' }
</script>
