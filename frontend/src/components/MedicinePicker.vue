<template>
  <!-- the combobox is shown once the list is loaded: before that it would drop a preset value it cannot find -->
  <FormControl v-if="!loaded" :label="label" :required="required" :size="size" variant="outline" disabled :placeholder="t('Loading…')" />
  <Combobox
    v-else
    :model-value="modelValue"
    :options="options"
    :label="label"
    :required="required"
    :error="error"
    :placeholder="t('Search a medicine…')"
    :empty-text="t('No medicine found')"
    :loading="loading"
    open-on-focus
    variant="outline"
    :size="size"
    class="w-full"
    @update:model-value="pick"
  >
    <template #item-suffix="{ option }">
      <span class="text-xs tabular" :class="option.stock > 0 ? 'text-ink-gray-5' : 'text-ink-red-4'">
        {{ num(option.stock) }} {{ option.unit }}
      </span>
    </template>
  </Combobox>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Combobox, FormControl } from 'frappe-ui'
import { get } from '@/api'
import { t } from '@/i18n'
import { num } from '@/format'
import { ui } from '@/ui'

const props = defineProps({ modelValue: String, label: String, required: Boolean, error: String, size: { type: String, default: 'lg' } })
const emit = defineEmits(['update:modelValue', 'select'])
const meds = ref([])
const loading = ref(false)
const loaded = ref(false)

const options = computed(() =>
  meds.value.map((m) => ({
    label: m.name,
    value: m.code,
    description: [m.strength, m.form].filter(Boolean).join(' · '),
    stock: m.stock,
    unit: m.unit,
  })),
)

function pick(value) {
  emit('update:modelValue', value)
  emit('select', meds.value.find((m) => m.code === value) || null)
}

async function load() {
  loading.value = true
  try {
    meds.value = await get('medicines')
    if (props.modelValue) emit('select', meds.value.find((m) => m.code === props.modelValue) || null)
  } catch {
  } finally {
    loading.value = false
    loaded.value = true
  }
}
onMounted(load)
// stock changed somewhere: refresh the numbers shown next to each medicine
watch(() => ui.version, load)
</script>
