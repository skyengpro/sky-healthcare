<template>
  <div>
    <div v-if="label" class="mb-1.5 text-[13px] text-ink-soft">{{ label }}</div>
    <div class="flex min-h-12 flex-wrap items-center gap-1.5 rounded-[14px] border border-line bg-card px-2.5 py-2 transition focus-within:border-apo-mid focus-within:ring-4 focus-within:ring-apo/10"
      @click="input?.focus()">
      <span v-for="tag in modelValue" :key="tag" class="inline-flex items-center gap-1 rounded-full bg-apo-soft py-1 pl-3 pr-1.5 text-[13px] font-medium text-apo-deep">
        {{ tag }}
        <button type="button" class="flex size-5 items-center justify-center rounded-full text-apo-deep/70 hover:bg-apo/15 hover:text-apo-deep"
          :aria-label="t('Remove')" @click.stop="remove(tag)"><span class="lucide-x size-3" /></button>
      </span>
      <input ref="input" v-model="text" :placeholder="modelValue.length ? '' : placeholder"
        class="min-w-[8rem] flex-1 border-0 bg-transparent p-1 text-[14px] text-ink outline-none ring-0 placeholder:text-ink-faint focus:ring-0"
        @keydown.enter.prevent="add(text)" @keydown.188.prevent="add(text)" @keydown.backspace="!text && modelValue.length && remove(modelValue[modelValue.length - 1])"
        @blur="add(text)" />
    </div>
    <div v-if="shown.length" class="mt-2 flex flex-wrap gap-1.5">
      <button v-for="s in shown" :key="s" type="button"
        class="rounded-full border border-dashed border-line px-2.5 py-1 text-[12px] text-ink-mute transition hover:border-apo-mid hover:bg-apo-mist hover:text-apo-deep"
        @click="add(s)">+ {{ s }}</button>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { t } from '@/i18n'

const props = defineProps({ modelValue: { type: Array, default: () => [] }, suggestions: { type: Array, default: () => [] }, label: String, placeholder: String })
const emit = defineEmits(['update:modelValue'])
const input = ref(null)
const text = ref('')
const shown = computed(() => props.suggestions.filter((s) => !props.modelValue.includes(s)).slice(0, 6))

function add(value) {
  const v = (value || '').trim().replace(/,$/, '')
  text.value = ''
  if (v && !props.modelValue.some((x) => x.toLowerCase() === v.toLowerCase())) emit('update:modelValue', [...props.modelValue, v])
}
const remove = (tag) => emit('update:modelValue', props.modelValue.filter((x) => x !== tag))
</script>
