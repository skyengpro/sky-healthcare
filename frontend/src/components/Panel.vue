<template>
  <section class="surface flex flex-col overflow-hidden">
    <header v-if="title || $slots.actions" class="flex items-center justify-between gap-2 px-5 pb-3 pt-4">
      <div class="flex items-baseline gap-2">
        <h2 class="text-[15px] font-semibold text-ink">{{ title }}</h2>
        <span v-if="count !== undefined && count !== null" class="font-label text-[12px] text-ink-mute tabular">{{ count }}</span>
      </div>
      <slot name="actions" />
    </header>
    <div class="flex-1" :class="padded && 'px-5 pb-5'"><slot /></div>
  </section>
</template>

<script setup>
defineProps({ title: String, count: [Number, String], padded: Boolean })
</script>
