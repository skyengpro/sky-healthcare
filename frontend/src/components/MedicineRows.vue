<template>
  <!-- medicines a procedure uses: one row per medicine, with its quantity -->
  <div>
    <div class="mb-1.5 flex items-baseline justify-between gap-3">
      <span class="text-[13px] text-ink-soft">{{ label }}</span>
      <span v-if="hint" class="text-[12px] text-ink-mute">{{ hint }}</span>
    </div>
    <ul class="space-y-2">
      <li v-for="(row, i) in modelValue" :key="row.key" class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <MedicinePicker v-model="row.medicine" size="md" @select="(m) => pick(row, m)" />
          <p v-if="row.stock !== undefined" class="mt-1 pl-1 text-[11.5px]" :class="row.stock < Number(row.qty) ? 'text-alert' : 'text-ink-mute'">
            {{ t('In stock: {0} {1}', num(row.stock), t(row.unit || '')) }}
          </p>
        </div>
        <div class="flex h-9 w-[104px] shrink-0 items-center rounded-[10px] border border-line bg-card">
          <button type="button" class="flex h-full w-8 items-center justify-center text-ink-mute hover:text-ink" :aria-label="t('Less')"
            @click="row.qty = Math.max(1, Number(row.qty || 1) - 1)"><span class="lucide-minus size-3.5" /></button>
          <input v-model.number="row.qty" type="number" min="1" inputmode="numeric" :aria-label="t('Quantity')"
            class="h-full w-10 border-0 bg-transparent p-0 text-center text-[14px] font-semibold text-ink tabular focus:ring-0" />
          <button type="button" class="flex h-full w-8 items-center justify-center text-ink-mute hover:text-ink" :aria-label="t('More')"
            @click="row.qty = Number(row.qty || 0) + 1"><span class="lucide-plus size-3.5" /></button>
        </div>
        <button type="button" class="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-mute transition hover:bg-alert-soft hover:text-alert"
          :aria-label="t('Remove')" @click="remove(i)"><span class="lucide-x size-4" /></button>
      </li>
    </ul>
    <button type="button" class="mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] font-semibold text-apo transition hover:bg-apo-mist"
      @click="add"><span class="lucide-plus size-4" /> {{ t('Add a medicine') }}</button>
  </div>
</template>

<script setup>
import MedicinePicker from './MedicinePicker.vue'
import { t } from '@/i18n'
import { num } from '@/format'
import { newRow } from '@/care'

const props = defineProps({ modelValue: { type: Array, default: () => [] }, label: String, hint: String })
const emit = defineEmits(['update:modelValue'])

function pick(row, m) {
  row.stock = m ? m.stock : undefined
  row.unit = m ? m.unit : ''
}
const add = () => emit('update:modelValue', [...props.modelValue, newRow()])
const remove = (i) => emit('update:modelValue', props.modelValue.filter((_r, j) => j !== i))
</script>
