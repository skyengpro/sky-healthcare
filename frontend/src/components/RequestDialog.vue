<template>
  <Sheet v-model:open="ui.request.open" :title="t('Medical request')"
    :message="doc ? '' : t('Ask for medicines to be ordered. An administrator approves the request. It does not add stock.')"
    icon="lucide-clipboard-list" theme="blue" size="2xl">
    <form class="space-y-4" @submit.prevent="save">
      <div v-if="doc" class="space-y-1.5">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12.5px] text-ink-mute">
          <StatusBadge :status="doc.state" />
          <span v-if="doc.requested_by">{{ doc.requested_by }}</span>
          <span>{{ date(doc.date) }}</span>
          <span v-if="doc.needed_by">{{ t('needed by {0}', date(doc.needed_by)) }}</span>
        </div>
        <p class="text-[13px] text-ink-mute">{{ hint }}</p>
      </div>

      <div class="rounded-[14px] border border-line">
        <table class="w-full table-fixed text-[14px]">
          <thead>
            <tr class="border-b border-line text-left text-[12px] text-ink-mute">
              <th v-if="editable" class="w-8 py-2 pl-2.5">
                <input v-model="allChecked" type="checkbox" class="rounded border-line text-ink focus:ring-apo/30" :aria-label="t('Select all rows')" />
              </th>
              <th class="w-8 py-2 pl-2.5 font-medium">{{ t('No.') }}</th>
              <th class="px-2 py-2 font-medium">{{ t('Medicine') }}</th>
              <th class="w-[76px] px-2 py-2 text-right font-medium">{{ t('Quantity') }}</th>
              <th class="w-[68px] py-2 pl-1 pr-2.5 font-medium">{{ t('UOM') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, i) in rows" :key="row.key" class="border-b border-line align-middle last:border-b-0">
              <td v-if="editable" class="py-1.5 pl-2.5">
                <input v-model="row.checked" type="checkbox" class="rounded border-line text-ink focus:ring-apo/30" :aria-label="t('Select row {0}', i + 1)" />
              </td>
              <td class="py-1.5 pl-2.5 text-ink-mute tabular">{{ i + 1 }}</td>
              <td class="px-2 py-1.5">
                <MedicinePicker v-if="editable" v-model="row.medicine" size="md" @select="(m) => pick(row, m)" />
                <span v-else class="block break-words font-medium text-ink">{{ row.medicine_name || row.medicine }}</span>
              </td>
              <td class="px-2 py-1.5 text-right">
                <input v-if="editable" v-model.number="row.qty" type="number" min="1" inputmode="numeric" :aria-label="t('Quantity')" @focus="$event.target.select()"
                  class="h-9 w-full rounded-[10px] border border-line bg-card px-2 text-right text-[14px] font-semibold text-ink tabular focus:ring-apo/30" />
                <span v-else class="font-semibold text-ink tabular">{{ num(row.qty) }}</span>
              </td>
              <td class="truncate py-1.5 pl-1 pr-2.5 text-[13px] text-ink-soft">{{ t(row.unit || '') }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="editable" class="flex flex-wrap items-center gap-2">
        <Btn size="sm" icon="lucide-plus" :label="t('Add row')" @click="addRow" />
        <Btn v-if="checkedCount" size="sm" variant="danger" icon="lucide-trash-2" :label="t('Delete ({0})', checkedCount)" @click="removeChecked" />
      </div>

      <div v-if="editable">
        <div class="mb-1.5 text-[13px] text-ink-soft">{{ t('Urgency') }}</div>
        <div class="grid grid-cols-3 gap-1 rounded-full border border-line bg-card p-1">
          <button v-for="u in urgencies" :key="u.value" type="button"
            class="rounded-full px-2 py-2 text-[13px] font-medium transition"
            :class="form.urgency === u.value ? u.active : 'text-ink-mute hover:text-ink'"
            @click="form.urgency = u.value">{{ t(u.value) }}</button>
        </div>
      </div>
      <FormControl v-if="editable" variant="outline" v-model="form.reason" type="textarea" :rows="3" :label="t('Reason (optional)')"
        :placeholder="t('e.g. Stock will run out next week')" size="lg" />

      <dl v-if="!editable" class="space-y-2 text-[14px]">
        <div class="flex gap-2"><dt class="text-ink-mute">{{ t('Urgency') }}:</dt><dd class="text-ink">{{ t(form.urgency) }}</dd></div>
        <div v-if="form.reason" class="flex gap-2"><dt class="text-ink-mute">{{ t('Reason') }}:</dt><dd class="min-w-0 break-words text-ink">{{ form.reason }}</dd></div>
        <div v-if="doc.note" class="flex gap-2"><dt class="text-ink-mute">{{ t('Note') }}:</dt><dd class="min-w-0 break-words text-ink">{{ doc.note }}</dd></div>
      </dl>
      <ErrorMessage :message="error" />
    </form>
    <template #actions>
      <template v-if="editable">
        <Btn variant="ghost" :label="t('Cancel')" @click="ui.request.open = false" />
        <Btn variant="primary" :label="doc ? t('Save changes') : t('Send request')" :loading="saving" :icon="doc ? 'lucide-check' : 'lucide-send'" @click="save" />
      </template>
      <Btn v-else variant="ghost" :label="t('Close')" @click="ui.request.open = false" />
    </template>
  </Sheet>
</template>

<script setup>
import Sheet from './Sheet.vue'
import { computed, reactive, ref, watch } from 'vue'
import { ErrorMessage, FormControl } from 'frappe-ui'
import Btn from './Btn.vue'
import MedicinePicker from './MedicinePicker.vue'
import StatusBadge from './StatusBadge.vue'
import { write } from '@/api'
import { newRow } from '@/care'
import { t } from '@/i18n'
import { saved } from '@/offline/notify'
import { date, num } from '@/format'
import { ui, changed } from '@/ui'

const urgencies = [
  { value: 'Routine', active: 'bg-ink text-on-ink' },
  { value: 'Urgent', active: 'bg-warn-soft text-warn' },
  { value: 'Emergency', active: 'bg-alert-soft text-alert' },
]
const doc = computed(() => ui.request.doc)
const editable = computed(() => !doc.value || (doc.value.state === 'pending' && doc.value.can_edit))
const hint = computed(() => {
  if (editable.value) return t('You can change this request until it is approved or rejected.')
  return doc.value.state === 'pending'
    ? t('Only the person who created this request or an administrator can change it.')
    : t('This request has been handled and can no longer be changed.')
})

const blankRow = (medicine = null, qty = 1) => ({ ...newRow(medicine, qty), unit: '', medicine_name: '', checked: false })
const form = reactive({ urgency: 'Routine', reason: '' })
const rows = ref([])
const saving = ref(false)
const error = ref('')

const checkedCount = computed(() => rows.value.filter((r) => r.checked).length)
const allChecked = computed({
  get: () => rows.value.length > 0 && checkedCount.value === rows.value.length,
  set: (on) => rows.value.forEach((r) => (r.checked = on)),
})

watch(() => ui.request.open, (open) => {
  if (!open) return
  const d = doc.value
  form.urgency = d?.urgency || 'Routine'
  form.reason = d?.reason || ''
  rows.value = d
    ? d.items.map((r) => ({ ...blankRow(r.medicine, r.qty), unit: r.unit, medicine_name: r.medicine_name }))
    : [blankRow(ui.request.medicine, ui.request.qty || 1)]
  error.value = ''
})

function pick(row, m) {
  if (m) Object.assign(row, { unit: m.unit, medicine_name: m.name })
  else if (!row.medicine) Object.assign(row, { unit: '', medicine_name: '' })
}

const addRow = () => rows.value.push(blankRow())

function removeChecked() {
  rows.value = rows.value.filter((r) => !r.checked)
  if (!rows.value.length) addRow()
}

async function save() {
  error.value = ''
  const filled = rows.value.filter((r) => r.medicine)
  if (!filled.length) return (error.value = t('Please choose a medicine.'))
  if (filled.some((r) => !(Number(r.qty) > 0))) return (error.value = t('Please enter a quantity above 0.'))
  const twice = filled.find((r, i) => filled.findIndex((o) => o.medicine === r.medicine) !== i)
  if (twice) return (error.value = t('{0} is listed twice. Keep one row and add up the quantity.', twice.medicine_name || twice.medicine))

  const items = filled.map(({ medicine, medicine_name, qty, unit }) => ({ medicine, medicine_name, qty, unit }))
  const first = `${items[0].medicine_name || items[0].medicine} × ${num(items[0].qty)}`
  saving.value = true
  try {
    const res = await write(
      'request_stock',
      { ...(doc.value ? { name: doc.value.name } : {}), items, urgency: form.urgency, reason: form.reason },
      t('Medical request'),
      {
        summary: items.length > 1 ? `${first} ${t('+{0} more', items.length - 1)}` : first,
        ...(doc.value ? {} : { creates: 'request', idField: 'request' }),
      },
    )
    ui.request.open = false
    if (doc.value) saved(res, t('Request updated'))
    else saved(res, t('Request sent'), t('It is waiting for approval.'))
    changed()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>
