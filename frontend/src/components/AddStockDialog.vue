<template>
  <Sheet v-model:open="ui.addStock.open" :title="t('Add stock')" :message="t('Record medicine that has arrived at the pharmacy.')"
    icon="lucide-package-plus" theme="green" size="lg">
    <form class="grid grid-cols-2 gap-4" @submit.prevent="save">
      <div class="col-span-2">
        <MedicinePicker v-model="form.medicine" :label="t('Medicine')" required @select="(m) => (picked = m)" />
        <p v-if="picked" class="mt-1.5 text-sm text-ink-gray-5">
          {{ t('Currently in stock: {0} {1}', num(picked.stock), picked.unit) }}
        </p>
      </div>
      <FormControl variant="outline" v-model="form.qty" type="number" min="1" :label="t('Quantity received')" required size="lg" />
      <FormControl variant="outline" v-model="form.price" type="number" min="0" :label="t('Price per unit ({0})', session.currency)" size="lg" />
      <FormControl variant="outline" v-model="form.date" type="date" format="D MMM YYYY" :placeholder="t('Select a date')" :label="t('Date received')" required size="lg" :max="today()" />
      <FormControl variant="outline" v-model="form.expiry" type="date" format="D MMM YYYY" :placeholder="t('Select a date')" :label="t('Expiry date')" required size="lg" :min="form.date" />
      <FormControl variant="outline" v-model="form.lot" class="col-span-2" :label="t('Lot / batch number (optional)')"
        :description="t('As printed on the box. Leave empty to number it automatically.')" size="lg" />
      <ErrorMessage class="col-span-2" :message="error" />
    </form>
    <template #actions>
        <Btn variant="ghost" :label="t('Cancel')" @click="ui.addStock.open = false" />
        <Btn variant="primary" :label="t('Add stock')" :loading="saving" icon="lucide-check" @click="save" />
    </template>
  </Sheet>
</template>

<script setup>
import Sheet from './Sheet.vue'
import { reactive, ref, watch } from 'vue'
import { ErrorMessage, FormControl, toast } from 'frappe-ui'
import Btn from './Btn.vue'
import MedicinePicker from './MedicinePicker.vue'
import { write } from '@/api'
import { t } from '@/i18n'
import { num, today } from '@/format'
import { session } from '@/session'
import { ui, changed } from '@/ui'

const blank = () => ({ medicine: ui.addStock.medicine, qty: '', price: '', date: today(), expiry: '', lot: '' })
const form = reactive(blank())
const picked = ref(null)
const saving = ref(false)
const error = ref('')

watch(() => ui.addStock.open, (open) => {
  if (open) {
    Object.assign(form, blank())
    error.value = ''
  }
})

async function save() {
  error.value = ''
  if (!form.medicine) return (error.value = t('Please choose a medicine.'))
  if (!(Number(form.qty) > 0)) return (error.value = t('Please enter a quantity above 0.'))
  if (!form.expiry) return (error.value = t('Please enter the expiry date.'))
  if (form.expiry <= form.date) return (error.value = t('The expiry date must be after the date received.'))
  saving.value = true
  try {
    const res = await write('add_stock', { ...form }, t('Add stock'))
    ui.addStock.open = false
    const name = picked.value?.name || form.medicine
    if (res.queued) toast.info(t('Saved offline'), { description: t('{0} × {1} will be sent when you are back online.', num(form.qty), name) })
    else toast.success(t('Stock added'), { description: `${num(form.qty)} × ${name}` })
    changed()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>
