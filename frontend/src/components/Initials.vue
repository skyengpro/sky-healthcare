<template>
  <span class="inline-flex shrink-0 select-none items-center justify-center rounded-full font-display leading-none" :class="[tone, sizes[size]]">
    {{ letters }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({ name: String, size: { type: String, default: 'md' } })
const sizes = { sm: 'size-8 text-[13px]', md: 'size-10 text-[15px]', lg: 'size-12 text-[18px]', xl: 'size-16 text-[24px]' }
const tones = ['bg-apo-soft text-apo-deep', 'bg-warn-soft text-warn', 'bg-info-soft text-info', 'bg-paper-deep text-ink-soft']
const letters = computed(() => (props.name || '?').split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase())
// same person, same colour
const tone = computed(() => tones[[...(props.name || '')].reduce((a, c) => a + c.charCodeAt(0), 0) % tones.length])
</script>
