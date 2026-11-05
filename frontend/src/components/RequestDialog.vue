<template>
  <Sheet v-model:open="ui.request.open" :title="t('Medical request')"
    :message="t('Ask for medicine to be ordered. An administrator approves the request. It does not add stock.')"
    icon="lucide-clipboard-list" theme="blue" size="lg">
    <form class="grid grid-cols-2 gap-4" @submit.prevent="save">
      <div class="col-span-2">
        <MedicinePicker v-model="form.medicine" :label="t('Medicine')" required @select="(m) => (picked = m)" />
        <p v-if="picked" class="mt-1.5 text-sm text-ink-gray-5">
          {{ t('In stock: {0} {1} · minimum {2}', num(picked.stock), picked.unit, num(picked.minimum)) }}
        </p>
      </div>
      <FormControl variant="outline" v-model="form.qty" class="col-span-2" type="number" min="1" :label="t('Quantity needed')" required size="lg" />
      <div class="col-span-2">
        <div class="mb-1.5 text-[13px] text-ink-soft">{{ t('Urgency') }}</div>
        <div class="grid grid-cols-3 gap-1 rounded-full border border-line bg-card p-1">
          <button v-for="u in urgencies" :key="u.value" type="button"
            class="rounded-full px-2 py-2 text-[13px] font-medium transition"
            :class="form.urgency === u.value ? u.active : 'text-ink-mute hover:text-ink'"
            @click="form.urgency = u.value">{{ t(u.value) }}</button>
        </div>
      </div>
      <FormControl variant="outline" v-model="form.reason" class="col-span-2" type="textarea" :rows="3" :label="t('Reason (optional)')"
        :placeholder="t('e.g. Stock will run out next week')" size="lg" />
      <ErrorMessage class="col-span-2" :message="error" />
    </form>
    <template #actions>
        <Btn variant="ghost" :label="t('Cancel')" @click="ui.request.open = false" />
        <Btn variant="primary" :label="t('Send request')" :loading="saving" icon="lucide-send" @click="save" />
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
import { num } from '@/format'
import { ui, changed } from '@/ui'

const urgencies = [
  { value: 'Routine', active: 'bg-ink text-on-ink' },
  { value: 'Urgent', active: 'bg-warn-soft text-warn' },
  { value: 'Emergency', active: 'bg-alert-soft text-alert' },
]
const blank = () => ({ medicine: ui.request.medicine, qty: ui.request.qty || '', urgency: 'Routine', reason: '' })
const form = reactive(blank())
const picked = ref(null)
const saving = ref(false)
const error = ref('')

watch(() => ui.request.open, (open) => {
  if (open) {
    Object.assign(form, blank())
    error.value = ''
  }
})

async function save() {
  error.value = ''
  if (!form.medicine) return (error.value = t('Please choose a medicine.'))
  if (!(Number(form.qty) > 0)) return (error.value = t('Please enter a quantity above 0.'))
  saving.value = true
  try {
    const res = await write('request_stock', { ...form }, t('Medical request'))
    ui.request.open = false
    if (res.queued) toast.info(t('Saved offline'), { description: t('The request will be sent when you are back online.') })
    else toast.success(t('Request sent'), { description: t('It is waiting for approval.') })
    changed()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>
