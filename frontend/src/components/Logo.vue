<template>
  <div class="flex items-center gap-3">
    <img :src="MARK" :class="markClass" class="shrink-0" alt="" />
    <div v-if="!markOnly" class="min-w-0 leading-none">
      <div class="font-display text-[19px] leading-[1.02]" :class="inverted ? 'text-white' : 'text-ink'">
        Healthcare<br /><em class="italic" :class="inverted ? 'text-[#b9dccb]' : 'text-apo'">Management</em>
      </div>
      <div v-if="subtitle" class="eyebrow mt-1.5 truncate !text-[10px]" :class="inverted && '!text-white/60'">{{ subtitle }}</div>
    </div>
  </div>
</template>

<script setup>
// served from the app's own build folder, so the offline copy of the app includes it
const MARK = `${import.meta.env.BASE_URL}logo-mark.svg`
defineProps({ markOnly: Boolean, subtitle: String, inverted: Boolean, markClass: { type: String, default: 'size-10' } })
</script>
