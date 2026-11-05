<template>
  <component :is="to ? 'RouterLink' : 'div'" :to="to"
    class="surface group relative flex min-h-[104px] flex-col justify-between overflow-hidden p-4 transition duration-200 md:min-h-[124px] md:p-5"
    :class="to && 'hover:-translate-y-0.5 hover:shadow-lift'">
    <!-- the icon as a large faded mark in the background -->
    <span :class="[icon, marks[tone]]" aria-hidden="true"
      class="pointer-events-none absolute -bottom-3 -right-4 size-[68px] opacity-[0.09] transition duration-300 group-hover:-rotate-6 group-hover:scale-110 group-hover:opacity-[0.17] md:-bottom-4 md:-right-4 md:size-[108px]" />

    <p class="relative text-[12.5px] font-medium leading-snug text-ink-soft md:text-[13.5px]">{{ label }}</p>
    <div class="relative mt-2">
      <div class="flex items-baseline gap-1.5">
        <span class="font-display text-[34px] leading-none tabular md:text-[44px]" :class="valueTones[tone]">{{ value }}</span>
        <span v-if="unit" class="text-[12.5px] text-ink-mute">{{ unit }}</span>
      </div>
      <p v-if="hint" class="mt-1.5 flex items-center gap-1.5 text-[11.5px] leading-snug md:text-[12.5px]" :class="hintTone ? hintTones[hintTone] : 'text-ink-mute'">
        <span v-if="hintTone" class="size-1.5 shrink-0 rounded-full bg-current" />{{ hint }}
      </p>
    </div>
  </component>
</template>

<script setup>
defineProps({ label: String, value: [String, Number], unit: String, icon: { type: String, default: 'lucide-circle' },
  hint: String, hintTone: String, to: [String, Object], tone: { type: String, default: 'green' } })
const marks = { green: 'text-apo', amber: 'text-warn', red: 'text-alert', ink: 'text-ink', blue: 'text-info' }
const valueTones = { green: 'text-ink', ink: 'text-ink', blue: 'text-ink', amber: 'text-warn', red: 'text-alert' }
const hintTones = { red: 'text-alert', amber: 'text-warn', green: 'text-ink-mute' }
</script>
