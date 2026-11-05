<template>
  <Sheet v-model:open="ui.medicine.open" :title="editing ? t('Edit medicine') : t('Add a new medicine')"
    :message="editing ? '' : t('Add the medicine to your list and, if you have it, its first stock.')"
    icon="lucide-pill" theme="green" size="2xl">
    <form class="grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:gap-x-4" @submit.prevent="save">
      <FormControl variant="outline" v-model="form.name" class="col-span-2" :label="t('Medicine name')" required size="lg"
        :placeholder="t('e.g. Paracetamol 500mg')" />
      <FormControl variant="outline" v-model="form.category" type="select" :options="opt(session.options.categories)" :label="t('Category')"
        required size="lg" :placeholder="t('Choose…')" />
      <FormControl variant="outline" v-model="form.form" type="select" :options="opt(session.options.forms)" :label="t('Dosage form')"
        size="lg" :placeholder="t('Choose…')" />
      <FormControl variant="outline" v-model="form.strength" :label="t('Strength')" size="lg" :placeholder="t('e.g. 500mg')" />
      <FormControl variant="outline" v-model="form.unit" type="select" :options="opt(session.options.units)" :label="t('Counted in')" required
        size="lg" :disabled="editing" :description="editing ? '' : t('The unit you count when giving out.')" />
      <FormControl variant="outline" v-model="form.minimum" type="number" min="0" :label="t('Minimum stock (alert level)')" size="lg"
        :description="t('You are alerted when stock falls to this level.')" />
      <FormControl variant="outline" v-model="form.location" :label="t('Storage location')" size="lg" :placeholder="t('e.g. Shelf A2')" />

      <template v-if="!editing">
        <div class="col-span-2 mt-1 flex items-center gap-3">
          <div class="h-px flex-1 bg-outline-gray-1" />
          <span class="text-xs font-medium uppercase tracking-wide text-ink-gray-5">{{ t('Starting stock (optional)') }}</span>
          <div class="h-px flex-1 bg-outline-gray-1" />
        </div>
        <FormControl variant="outline" v-model="form.qty" type="number" min="0" :label="t('Quantity received')" size="lg" />
        <FormControl variant="outline" v-model="form.price" type="number" min="0" :label="t('Price per unit ({0})', session.currency)" size="lg" />
        <FormControl variant="outline" v-model="form.date" type="date" format="D MMM YYYY" :placeholder="t('Select a date')" :label="t('Date received')" size="lg" :max="today()"
          class="col-span-2 sm:col-span-1" />
        <FormControl variant="outline" v-model="form.expiry" type="date" format="D MMM YYYY" :placeholder="t('Select a date')" :label="t('Expiry date')" size="lg" :min="form.date"
          :required="Number(form.qty) > 0" class="col-span-2 sm:col-span-1" />
      </template>
      <ErrorMessage class="col-span-2" :message="error" />
    </form>
    <template #actions>
        <Btn variant="ghost" :label="t('Cancel')" @click="ui.medicine.open = false" />
        <Btn variant="primary" :label="editing ? t('Save changes') : t('Add medicine')" :loading="saving" icon="lucide-check" @click="save" />
    </template>
  </Sheet>
</template>

<script setup>
import Sheet from './Sheet.vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ErrorMessage, FormControl, toast, dialog } from 'frappe-ui'
import Btn from './Btn.vue'
import { get, post, ApiError } from '@/api'
import { t } from '@/i18n'
import { num, today } from '@/format'
import { session } from '@/session'
import { ui, changed, openAddStock } from '@/ui'

const router = useRouter()
const editing = computed(() => !!ui.medicine.code)
const blank = () => ({ name: '', category: null, form: 'Tablet', strength: '', unit: 'Tablet', minimum: 20, location: '',
  qty: '', price: '', date: today(), expiry: '' })
const form = reactive(blank())
const saving = ref(false)
const error = ref('')
const opt = (list) => (list || []).map((v) => ({ label: t(v), value: v }))

watch(() => ui.medicine.open, async (open) => {
  if (!open) return
  Object.assign(form, blank())
  error.value = ''
  if (ui.medicine.code) {
    const m = await get('medicine', { code: ui.medicine.code })
    Object.assign(form, { name: m.name, category: m.category, form: m.form, strength: m.strength, unit: m.unit,
      minimum: m.minimum, location: m.location })
  }
})

async function save() {
  error.value = ''
  if (!form.name.trim()) return (error.value = t('Please enter the medicine name.'))
  if (!form.category) return (error.value = t('Please choose a category.'))
  if (!editing.value && Number(form.qty) > 0) {
    if (!form.expiry) return (error.value = t('Please enter the expiry date.'))
    if (form.expiry <= form.date) return (error.value = t('The expiry date must be after the date received.'))
  }
  saving.value = true
  try {
    const res = await post('save_medicine', { ...form, code: ui.medicine.code || undefined })
    ui.medicine.open = false
    if (editing.value) toast.success(t('Medicine updated'))
    else toast.success(t('Medicine added'), Number(form.qty) > 0 ? { description: t('{0} {1} in stock', num(form.qty), t(form.unit)) } : {})
    changed()
    if (!editing.value) router.push({ name: 'medicine', params: { code: res.code } })
  } catch (e) {
    if (e instanceof ApiError && e.type === 'DuplicateEntryError') {
      ui.medicine.open = false
      dialog.confirm({
        title: t('This medicine already exists'),
        message: t('{0} is already in your list. Do you want to add stock to it instead?', form.name),
        confirmLabel: t('Add stock'),
        onConfirm: () => openAddStock(form.name.trim()),
      })
    } else error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>
