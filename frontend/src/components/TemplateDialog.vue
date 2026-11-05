<template>
  <Sheet v-model:open="ui.template.open" :title="editing ? t('Edit treatment type') : t('New treatment type')"
    :message="t('A care you give often, like a wound dressing or an injection, and the medicines it uses each time.')"
    icon="lucide-stethoscope" theme="green" size="xl">
    <form class="space-y-4" @submit.prevent="save">
      <FormControl variant="outline" v-model="form.template" :label="t('Name')" required size="lg" :disabled="editing"
        :placeholder="t('e.g. Wound dressing')" />
      <FormControl variant="outline" v-model="form.description" type="textarea" :rows="2" :label="t('Description (optional)')" size="lg"
        :placeholder="t('e.g. Clean the wound and apply a sterile dressing')" />
      <MedicineRows v-model="form.items" :label="t('Medicines used each time')" :hint="t('Can be changed for each patient')" />
      <label v-if="editing" class="flex items-center gap-2.5 text-[13.5px] text-ink-soft">
        <input v-model="form.disabled" type="checkbox" class="rounded border-line text-ink focus:ring-apo/30" />
        {{ t('No longer used (hide it from the list)') }}
      </label>
      <ErrorMessage :message="error" />
    </form>
    <template #actions>
      <Btn variant="ghost" :label="t('Cancel')" @click="ui.template.open = false" />
      <Btn variant="primary" :label="editing ? t('Save changes') : t('Create')" :loading="saving" icon="lucide-check" @click="save" />
    </template>
  </Sheet>
</template>

<script setup>
import Sheet from './Sheet.vue'
import { computed, reactive, ref, watch } from 'vue'
import { ErrorMessage, FormControl, toast } from 'frappe-ui'
import Btn from './Btn.vue'
import MedicineRows from './MedicineRows.vue'
import { get, post } from '@/api'
import { t } from '@/i18n'
import { newRow } from '@/care'
import { ui, changed, H } from '@/ui'

const editing = computed(() => !!ui.template.name)
const blank = () => ({ template: '', description: '', items: [newRow()], disabled: false })
const form = reactive(blank())
const saving = ref(false)
const error = ref('')

watch(() => ui.template.open, async (open) => {
  if (!open) return
  Object.assign(form, blank())
  error.value = ''
  if (ui.template.name) {
    const all = await get(H('procedure_templates'), { include_disabled: 1 })
    const tpl = all.find((x) => x.name === ui.template.name)
    if (tpl) Object.assign(form, { template: tpl.template, description: tpl.description === tpl.template ? '' : tpl.description,
      disabled: !!tpl.disabled, items: tpl.items.length ? tpl.items.map((i) => newRow(i.medicine, i.qty)) : [newRow()] })
  }
})

async function save() {
  error.value = ''
  if (!form.template.trim()) return (error.value = t('Please enter the name of the treatment type.'))
  const items = form.items.filter((r) => r.medicine)
  if (items.some((r) => !(Number(r.qty) > 0))) return (error.value = t('Please enter a quantity above 0.'))
  saving.value = true
  try {
    await post(H('save_procedure_template'), { name: ui.template.name || undefined, template: form.template, description: form.description,
      disabled: form.disabled ? 1 : 0, items: items.map((r) => ({ medicine: r.medicine, qty: Number(r.qty) })) })
    ui.template.open = false
    toast.success(editing.value ? t('Treatment type updated') : t('Treatment type created'), { description: form.template })
    changed()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>
