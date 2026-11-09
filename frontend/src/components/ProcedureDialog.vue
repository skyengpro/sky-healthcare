<template>
  <Sheet v-model:open="ui.procedure.open" :title="t('Record a treatment')"
    :message="t('The medicines used are taken from the stock and written in the patient’s file.')"
    icon="lucide-stethoscope" theme="green" size="2xl">
    <div v-if="templates && !templates.length" class="rounded-[16px] border border-dashed border-line p-5 text-center">
      <p class="font-display text-[19px] text-ink">{{ hiddenCount ? t('No active treatment type') : t('No treatment types yet') }}</p>
      <p class="mx-auto mt-1 max-w-sm text-[13px] text-ink-mute">{{ hiddenCount ? t('All your treatment types are hidden. Create a new one, or show a hidden one again below.') : t('First create the cares you give, like a wound dressing, with the medicines they use.') }}</p>
      <div class="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Btn variant="primary" icon="lucide-plus" :label="t('New treatment type')" @click="newTemplate" />
        <Btn v-if="hiddenCount" icon="lucide-eye" :label="t('Show hidden types ({0})', hiddenCount)" @click="showHiddenTypes" />
      </div>
    </div>
    <form v-else class="space-y-4" @submit.prevent="save">
      <PatientPicker v-if="ui.procedure.open" v-model="form.patient" :label="t('Patient')" required />
      <button v-if="!ui.procedure.patient" type="button" class="-mt-2 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-apo hover:underline"
        @click="newPatient"><span class="lucide-user-round-plus size-3.5" /> {{ t('New patient') }}</button>

      <div>
        <div class="mb-1.5 text-[13px] text-ink-soft">{{ t('Treatment') }} <span class="text-alert">*</span></div>
        <div v-if="!templates" class="h-10 animate-pulse rounded-[12px] bg-paper-deep" />
        <div v-else class="flex flex-wrap gap-1.5">
          <button v-for="tp in templates" :key="tp.name" type="button"
            class="rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition"
            :class="form.template === tp.name ? 'border-ink bg-ink text-on-ink' : 'border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink'"
            @click="chooseTemplate(tp)">{{ tp.template }}</button>
        </div>
      </div>

      <MedicineRows v-if="form.template" v-model="form.items" :label="t('Medicines used')" :hint="t('Change the quantities if needed')" />

      <div class="grid grid-cols-2 items-end gap-3 sm:gap-4">
        <!-- done now: it happens today, the date cannot be changed. Planned: pick the day. -->
        <div v-if="form.complete" class="col-span-2 sm:col-span-1">
          <div class="mb-1.5 text-[13px] text-ink-soft">{{ t('Date') }}</div>
          <div class="flex h-12 items-center rounded-[14px] border border-line bg-paper px-3.5 text-[14.5px] text-ink-soft">{{ t('Today') }} · {{ date(today(), { day: 'numeric', month: 'short', year: 'numeric' }) }}</div>
        </div>
        <FormControl v-else variant="outline" v-model="form.date" type="date" format="D MMM YYYY" :label="t('Date planned')" size="lg" :min="today()"
          class="col-span-2 sm:col-span-1" />
        <div class="col-span-2 sm:col-span-1">
          <div class="mb-1.5 text-[13px] text-ink-soft">{{ t('When') }}</div>
          <div class="grid grid-cols-2 gap-1 rounded-full border border-line bg-card p-1">
            <button type="button" class="rounded-full px-2 py-2 text-[13px] font-medium transition"
              :class="form.complete ? 'bg-ink text-on-ink' : 'text-ink-mute hover:text-ink'" @click="form.complete = true; form.date = today()">{{ t('Done now') }}</button>
            <button type="button" class="rounded-full px-2 py-2 text-[13px] font-medium transition"
              :class="!form.complete ? 'bg-info-soft text-info' : 'text-ink-mute hover:text-ink'" @click="form.complete = false">{{ t('Planned') }}</button>
          </div>
        </div>
      </div>
      <p class="-mt-1 text-[12.5px] text-ink-mute">
        {{ form.complete ? t('The medicines leave the stock now.') : t('Nothing leaves the stock until you mark it as done.') }}
      </p>
      <FormControl variant="outline" v-model="form.notes" type="textarea" :rows="2" :label="t('Notes (optional)')" size="lg"
        :placeholder="t('e.g. Left leg, wound healing well')" />
      <ErrorMessage :message="error" />
    </form>
    <template v-if="!templates || templates.length" #actions>
      <Btn variant="ghost" :label="t('Cancel')" @click="ui.procedure.open = false" />
      <Btn variant="primary" :label="form.complete ? t('Record and take from stock') : t('Save as planned')" :loading="saving"
        icon="lucide-check" @click="save" />
    </template>
  </Sheet>
</template>

<script setup>
import Sheet from './Sheet.vue'
import { reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ErrorMessage, FormControl, toast } from 'frappe-ui'
import Btn from './Btn.vue'
import MedicineRows from './MedicineRows.vue'
import PatientPicker from './PatientPicker.vue'
import { get, write } from '@/api'
import { saved } from '@/offline/notify'
import { t } from '@/i18n'
import { date, today } from '@/format'
import { newRow } from '@/care'
import { ui, changed, H, openPatient, openTemplate } from '@/ui'

const templates = ref(null)
const hiddenCount = ref(0)
const router = useRouter()
const blank = () => ({ patient: ui.procedure.patient, template: null, items: [], date: today(), complete: true, notes: '' })
const form = reactive(blank())
const saving = ref(false)
const error = ref('')

function chooseTemplate(tp) {
  form.template = tp.name
  form.items = tp.items.map((i) => newRow(i.medicine, i.qty))
}

watch(() => ui.procedure.open, async (open) => {
  if (!open) return
  Object.assign(form, blank())
  error.value = ''
  templates.value = null
  try {
    templates.value = await get(H('procedure_templates'))
    hiddenCount.value = templates.value.length ? 0 : (await get(H('procedure_templates'), { include_disabled: 1 })).length
    const preset = templates.value.find((x) => x.name === ui.procedure.template)
    if (preset) chooseTemplate(preset)
  } catch (e) {
    templates.value = []
    error.value = e.message
  }
})

function showHiddenTypes() {
  ui.procedure.open = false
  router.push({ name: 'procedures', query: { tab: 'types' } })
}
function newTemplate() {
  ui.procedure.open = false
  openTemplate()
}
function newPatient() {
  ui.procedure.open = false
  openPatient()
}

async function save() {
  error.value = ''
  if (!form.patient) return (error.value = t('Please choose a patient.'))
  if (!form.template) return (error.value = t('Please choose a treatment.'))
  const items = form.items.filter((r) => r.medicine)
  if (items.some((r) => !(Number(r.qty) > 0))) return (error.value = t('Please enter a quantity above 0.'))
  saving.value = true
  try {
    const done = !!form.complete
    const res = await write(H('record_procedure'), {
      patient: form.patient, template: form.template, date: form.date, notes: form.notes, complete: done ? 1 : 0, service_request: ui.procedure.serviceRequest || undefined,
      items: items.map((r) => ({ medicine: r.medicine, qty: Number(r.qty) })),
    }, done ? t('Record a treatment') : t('Plan a treatment'), { summary: form.template, stub: () => ({ status: done ? 'Completed' : 'Pending' }) })
    ui.procedure.open = false
    saved(res, res.status === 'Completed' ? t('Treatment recorded') : t('Treatment planned'),
      res.status === 'Completed' && items.length ? t('{0} medicine(s) taken from stock', items.length) : '')
    changed()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>
