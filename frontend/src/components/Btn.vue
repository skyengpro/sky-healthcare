<template>
  <component :is="to ? 'RouterLink' : 'button'" :to="to" :type="to ? undefined : type" :disabled="disabled || loading"
    class="inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition duration-150 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
    :class="[sizes[size], variants[variant], block && 'w-full']">
    <LoadingIndicator v-if="loading" class="size-4" />
    <span v-else-if="icon" :class="icon" class="size-4 shrink-0" />
    <span v-if="label || $slots.default"><slot>{{ label }}</slot></span>
  </component>
</template>

<script setup>
import { LoadingIndicator } from 'frappe-ui'

defineProps({
  label: String,
  icon: String,
  to: [String, Object],
  type: { type: String, default: 'button' },
  variant: { type: String, default: 'secondary' },
  size: { type: String, default: 'md' },
  loading: Boolean,
  disabled: Boolean,
  block: Boolean,
})
const sizes = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-10 px-[18px] text-sm',
  lg: 'h-12 px-6 text-[15px]',
  icon: 'size-10 text-sm',
}
const variants = {
  primary: 'bg-ink text-on-ink shadow-[0_1px_0_rgba(255,255,255,.08)_inset,0_6px_16px_-8px_rgba(22,24,29,.6)] hover:bg-ink/85 active:translate-y-px',
  secondary: 'border border-line bg-card text-ink shadow-card hover:border-line-strong hover:bg-paper active:translate-y-px',
  ghost: 'text-ink-soft hover:bg-paper-deep hover:text-ink',
  brand: 'bg-apo text-on-apo shadow-[0_6px_16px_-8px_rgba(35,90,73,.7)] hover:bg-apo-deep active:translate-y-px',
  danger: 'border border-alert/20 bg-alert-soft text-alert hover:bg-alert-soft/70',
}
</script>
