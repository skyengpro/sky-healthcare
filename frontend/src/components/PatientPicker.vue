<template>
  <FormControl v-if="!loaded" :label="label" :required="required" size="lg" variant="outline" disabled :placeholder="t('Loading…')" />
  <Combobox v-else :model-value="modelValue" :options="options" :label="label" :required="required" :placeholder="t('Search a patient…')"
    :empty-text="t('No patient found')" open-on-focus variant="outline" size="lg" class="w-full" @update:model-value="(v) => emit('update:modelValue', v)" />
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { Combobox, FormControl } from 'frappe-ui'
import { get } from '@/api'
import { t } from '@/i18n'
import { patientMeta } from '@/care'
import { H } from '@/ui'

defineProps({ modelValue: String, label: String, required: Boolean })
const emit = defineEmits(['update:modelValue'])
const rows = ref([])
const loaded = ref(false)
const options = computed(() => rows.value.map((p) => ({ label: p.patient_name, value: p.name, description: [patientMeta(p), p.mobile].filter(Boolean).join(' · ') })))

onMounted(async () => {
  try {
    rows.value = await get(H('patients'))
  } catch {
  } finally {
    loaded.value = true
  }
})
</script>
