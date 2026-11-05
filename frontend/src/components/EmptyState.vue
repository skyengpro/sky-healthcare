<template>
  <div class="flex flex-col items-center justify-center px-6 py-12 text-center">
    <div class="mb-4 flex size-12 items-center justify-center rounded-full bg-paper-deep">
      <span :class="icon" class="size-5 text-ink-mute" />
    </div>
    <p class="font-display text-[19px] text-ink">{{ title }}</p>
    <p v-if="text" class="mt-1.5 max-w-xs text-sm text-ink-mute">{{ text }}</p>
    <div v-if="$slots.default" class="mt-5"><slot /></div>
  </div>
</template>

<script setup>
defineProps({ title: String, text: String, icon: { type: String, default: 'lucide-inbox' } })
</script>
