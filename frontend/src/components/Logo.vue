<template>
  <div class="flex items-center gap-3">
    <img :src="MARK" :class="markClass" class="shrink-0" alt="" />
    <div v-if="!markOnly" class="min-w-0 leading-none">
      <div class="font-display text-[23px] leading-none" :class="inverted ? 'text-white' : 'text-ink'">
        Pharma<em class="italic" :class="inverted ? 'text-[#b9dccb]' : 'text-apo'">stock</em>
      </div>
      <div v-if="subtitle" class="eyebrow mt-1.5 truncate !text-[10px]" :class="inverted && '!text-white/60'">{{ subtitle }}</div>
    </div>
  </div>
</template>

<script setup>
const MARK = '/assets/sky_healthcare/images/logo-mark.svg'
defineProps({ markOnly: Boolean, subtitle: String, inverted: Boolean, markClass: { type: String, default: 'size-10' } })
</script>
