<template>
  <div class="pb-24 md:pb-8">
    <div v-if="loading" class="space-y-4"><div class="h-24 animate-pulse rounded-[18px] bg-paper-deep" /><div class="surface h-72 animate-pulse" /></div>
    <template v-else>
      <PageHeader :title="isNew ? t('New consultation') : d.patient_name" :back="backTo" :back-label="backLabel">
        <template #meta>
          <div v-if="!isNew" class="mt-3 flex flex-wrap items-center gap-2">
            <StatusBadge :status="d.state" />
            <span class="text-[13px] text-ink-mute">{{ date(d.encounter_date) }} · {{ d.time }} · {{ d.practitioner_name }}</span>
          </div>
        </template>
        <template v-if="!isNew" #actions>
          <Btn v-if="readonly && !editing" icon="lucide-pencil" :label="t('Edit')" @click="editing = true" />
          <Btn icon="lucide-user-round" :label="t('Patient file')" :to="{ name: 'patient', params: { name: d.patient } }" />
        </template>
      </PageHeader>

      <!-- finished: read only -->
      <div v-if="readonly && !editing" class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div class="space-y-4">
          <Panel :title="t('What the doctor found')" padded>
            <div v-if="d.symptoms.length" class="mb-3"><p class="eyebrow mb-1.5">{{ t('Symptoms') }}</p>
              <div class="flex flex-wrap gap-1.5"><span v-for="s in d.symptoms" :key="s" class="rounded-full bg-paper-deep px-3 py-1 text-[13px] text-ink-soft">{{ s }}</span></div></div>
            <p v-if="d.encounter_comment" class="font-display text-[17px] italic leading-snug text-ink-soft">“{{ d.encounter_comment }}”</p>
            <div v-if="d.diagnoses.length" class="mt-3"><p class="eyebrow mb-1.5">{{ t('Diagnosis') }}</p>
              <div class="flex flex-wrap gap-1.5"><span v-for="s in d.diagnoses" :key="s" class="rounded-full bg-info-soft px-3 py-1 text-[13px] font-medium text-info">{{ s }}</span></div></div>
          </Panel>
          <Panel :title="t('Prescription')" :count="d.prescriptions.length || null">
            <EmptyState v-if="!d.prescriptions.length" icon="lucide-pill" :title="t('No medicine prescribed')" />
            <ul v-else class="px-2 pb-2">
              <li v-for="p in d.prescriptions" :key="p.medicine" class="flex items-center gap-3 rounded-[12px] px-3 py-3">
                <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-apo-soft text-apo"><span class="lucide-pill size-4" /></span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[14.5px] font-semibold text-ink">{{ p.medicine_name }}</div>
                  <div class="text-[12.5px] text-ink-mute">{{ dosageLabel(p.dosage) }} · {{ durationLabel(p.period) }}<template v-if="p.comment"> · {{ p.comment }}</template></div>
                </div>
                <div v-if="p.quantity" class="text-right"><div class="font-display text-[20px] leading-none tabular text-ink">{{ num(p.quantity) }}</div><div class="mt-0.5 text-[11px] text-ink-mute">{{ t('to give') }}</div></div>
              </li>
            </ul>
          </Panel>
          <Panel :title="t('Treatments asked')" :count="d.treatments.length || null">
            <EmptyState v-if="!d.treatments.length" icon="lucide-stethoscope" :title="t('No treatment asked')" />
            <ul v-else class="px-2 pb-2">
              <li v-for="x in d.treatments" :key="x.template" class="flex items-center gap-3 rounded-[12px] px-3 py-3">
                <span class="flex size-9 shrink-0 items-center justify-center rounded-full" :class="x.done ? 'bg-apo-soft text-apo' : 'bg-info-soft text-info'"><span class="lucide-stethoscope size-4" /></span>
                <div class="min-w-0 flex-1 text-[14.5px] font-semibold text-ink">{{ x.template }}</div>
                <StatusBadge v-if="x.done" status="done" />
                <Btn v-else size="sm" variant="brand" icon="lucide-plus" :label="t('Record it')" @click="openProcedure(d.patient, x.template, x.service_request)" />
              </li>
            </ul>
          </Panel>
        </div>
        <aside class="space-y-4">
          <div class="surface p-5">
            <p class="eyebrow">{{ t('Vital signs') }}</p>
            <dl v-if="d.vitals" class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5 text-[13.5px]">
              <div v-for="v in vitalRows(d.vitals)" :key="v.key"><dt class="text-[12px] text-ink-mute">{{ t(v.label) }}</dt><dd class="font-display text-[22px] leading-tight text-ink tabular">{{ v.value }} <span class="font-sans text-[11.5px] text-ink-mute">{{ v.unit }}</span></dd></div>
            </dl>
            <p v-else class="mt-2 text-[13px] text-ink-mute">{{ t('Not measured.') }}</p>
          </div>
        </aside>
      </div>

      <!-- new or draft: the form -->
      <form v-else class="space-y-4" @submit.prevent="save(false)">
        <div class="surface grid gap-4 p-5 md:grid-cols-2 md:p-6">
          <PatientPicker v-if="!lockedPatient" v-model="form.patient" :label="t('Patient')" required />
          <div v-else>
            <div class="mb-1.5 text-[13px] text-ink-soft">{{ t('Patient') }}</div>
            <div class="flex h-12 items-center gap-3 rounded-[14px] border border-line bg-paper px-3.5">
              <Initials :name="lockedName" size="sm" /><span class="text-[14.5px] font-semibold text-ink">{{ lockedName }}</span>
            </div>
          </div>
          <FormControl variant="outline" v-model="form.practitioner" type="select" :label="t('Doctor')" size="lg"
            :options="doctors.map((x) => ({ label: x.practitioner_name + (x.me ? ' (' + t('you') + ')' : ''), value: x.name }))" :placeholder="t('Choose…')" />
        </div>

        <div class="surface space-y-5 p-5 md:p-6">
          <TagInput v-model="form.symptoms" :label="t('Why did the patient come? Symptoms')" :suggestions="symptomHints" :placeholder="t('Type a symptom, press Enter')" />
          <div>
            <div class="mb-2.5 text-[13px] text-ink-soft">{{ t('Vital signs') }} <span class="text-ink-faint">({{ t('optional') }})</span></div>
            <div class="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <label v-for="v in VITAL_FIELDS" :key="v.key" class="block">
                <span class="text-[12px] text-ink-mute">{{ t(v.label) }}</span>
                <span class="relative mt-1 block">
                  <input v-model="form.vitals[v.key]" inputmode="decimal" :placeholder="v.hint"
                    class="h-11 w-full rounded-[12px] border border-line bg-card px-3 pr-11 text-[14px] text-ink tabular outline-none transition placeholder:text-ink-faint focus:border-apo-mid focus:ring-4 focus:ring-apo/10" />
                  <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-mute">{{ v.unit }}</span>
                </span>
              </label>
            </div>
          </div>
          <FormControl variant="outline" v-model="form.notes" type="textarea" :rows="4" :label="t('What the doctor observed')" size="lg"
            :placeholder="t('e.g. Fever for 3 days, no vomiting, throat slightly red')" />
          <TagInput v-model="form.diagnoses" :label="t('Diagnosis')" :suggestions="diagnosisHints" :placeholder="t('Type a diagnosis, press Enter')" />
        </div>

        <p v-if="editing" class="rounded-[12px] bg-paper-deep px-3.5 py-2.5 text-[13px] text-ink-mute">{{ t('The prescription and the treatments were already ordered, so they cannot be changed here.') }}</p>

        <div v-if="!editing" class="surface p-5 md:p-6">
          <div class="mb-3 flex items-baseline justify-between"><h2 class="text-[15px] font-semibold text-ink">{{ t('Prescription') }}</h2>
            <span class="text-[12px] text-ink-mute">{{ t('Medicines the patient takes home') }}</span></div>
          <ul class="space-y-3">
            <li v-for="(r, i) in form.prescriptions" :key="r.key" class="rounded-[16px] border border-line bg-paper/60 p-3 md:p-4">
              <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1"><MedicinePicker v-model="r.medicine" size="md" @select="(m) => (r.stock = m ? m.stock : null)" /></div>
                <button type="button" class="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-mute transition hover:bg-alert-soft hover:text-alert" :aria-label="t('Remove')"
                  @click="form.prescriptions.splice(i, 1)"><span class="lucide-x size-4" /></button>
              </div>
              <div class="mt-2.5 grid gap-2.5 sm:grid-cols-3">
                <FormControl v-model="r.dosage" type="select" variant="outline" size="md" :options="session.options.dosages.map((v) => ({ label: dosageLabel(v), value: v }))" />
                <FormControl v-model="r.period" type="select" variant="outline" size="md" :options="session.options.durations.map((v) => ({ label: durationLabel(v), value: v }))" />
                <FormControl v-model="r.comment" variant="outline" size="md" :placeholder="t('e.g. after meals')" />
              </div>
              <p v-if="r.stock !== undefined && r.stock !== null && r.stock <= 0" class="mt-2 text-[12px] text-warn">{{ t('Out of stock right now.') }}</p>
            </li>
          </ul>
          <button type="button" class="mt-3 inline-flex items-center gap-1.5 rounded-full px-2 py-1.5 text-[13px] font-semibold text-apo transition hover:bg-apo-mist" @click="addRx">
            <span class="lucide-plus size-4" /> {{ t('Add a medicine') }}</button>
        </div>

        <div v-if="!editing" class="surface p-5 md:p-6">
          <div class="mb-3 flex items-baseline justify-between"><h2 class="text-[15px] font-semibold text-ink">{{ t('Treatments to do') }}</h2>
            <span class="text-[12px] text-ink-mute">{{ t('Care the nurse gives, like a dressing or an injection') }}</span></div>
          <p v-if="!templates.length" class="text-[13px] text-ink-mute">{{ t('No treatment type yet.') }} <RouterLink to="/procedures" class="font-medium text-apo hover:underline">{{ t('Create one') }}</RouterLink></p>
          <div v-else class="flex flex-wrap gap-1.5">
            <button v-for="x in templates" :key="x.name" type="button" class="rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition"
              :class="form.treatments.includes(x.name) ? 'border-ink bg-ink text-on-ink' : 'border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink'"
              @click="toggleTreatment(x.name)">{{ x.template }}</button>
          </div>
        </div>

        <p v-if="error" class="flex items-center gap-2 rounded-[12px] bg-alert-soft px-3.5 py-2.5 text-[13px] text-alert"><span class="lucide-circle-alert size-4 shrink-0" />{{ error }}</p>

        <div class="fixed inset-x-0 bottom-[84px] z-20 border-t border-line bg-paper/95 px-4 py-3 backdrop-blur md:static md:inset-auto md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <div class="mx-auto flex max-w-[1200px] items-center gap-2 md:justify-end">
            <Btn v-if="!isNew && !editing" variant="ghost" icon="lucide-trash-2" :label="t('Discard')" class="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" @click="discard" />
            <div v-if="editing" class="flex flex-1 gap-2 md:flex-none">
              <Btn class="flex-1 md:flex-none" :label="t('Cancel')" @click="cancelEdit" />
              <Btn class="flex-1 md:flex-none" variant="primary" icon="lucide-check" :loading="saving === 'edit'" :label="t('Save changes')" @click="saveEdit" />
            </div>
            <div v-else class="flex flex-1 gap-2 md:flex-none">
              <Btn class="flex-1 md:flex-none" :label="t('Save draft')" :loading="saving === 'draft'" @click="save(false)" />
              <Btn class="flex-1 md:flex-none" variant="primary" icon="lucide-check" :loading="saving === 'finish'" @click="save(true)">
                <span class="sm:hidden">{{ t('Finish') }}</span><span class="hidden sm:inline">{{ t('Finish consultation') }}</span>
              </Btn>
            </div>
          </div>
        </div>
      </form>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FormControl, dialog, toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import Panel from '@/components/Panel.vue'
import EmptyState from '@/components/EmptyState.vue'
import Initials from '@/components/Initials.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import TagInput from '@/components/TagInput.vue'
import PatientPicker from '@/components/PatientPicker.vue'
import MedicinePicker from '@/components/MedicinePicker.vue'
import { get, write } from '@/api'
import { saved } from '@/offline/notify'
import { t } from '@/i18n'
import { date, num } from '@/format'
import { dosageLabel, durationLabel } from '@/care'
import { session } from '@/session'
import { ui, H, openProcedure } from '@/ui'

const props = defineProps({ name: String })
const route = useRoute()
const router = useRouter()
const isNew = computed(() => props.name === 'new')
const loading = ref(true)
const d = ref(null)
const doctors = ref([])
const templates = ref([])
const symptomHints = ref([])
const diagnosisHints = ref([])
const saving = ref('')
const error = ref('')
const lockedName = ref('')
let seq = 0

const VITAL_FIELDS = [
  { key: 'temperature', label: 'Temperature', unit: '°C', hint: '37.0' },
  { key: 'pulse', label: 'Pulse', unit: '/min', hint: '80' },
  { key: 'bp_systolic', label: 'Blood pressure, high', unit: 'mmHg', hint: '120' },
  { key: 'bp_diastolic', label: 'Blood pressure, low', unit: 'mmHg', hint: '80' },
  { key: 'respiratory_rate', label: 'Breathing', unit: '/min', hint: '16' },
  { key: 'weight', label: 'Weight', unit: 'kg', hint: '' },
  { key: 'height', label: 'Height', unit: 'cm', hint: '' },
]
const blankVitals = () => Object.fromEntries(VITAL_FIELDS.map((v) => [v.key, '']))
const form = reactive({ patient: null, practitioner: null, date: null, symptoms: [], diagnoses: [], notes: '', vitals: blankVitals(), prescriptions: [], treatments: [] })

const editing = ref(false)
const readonly = computed(() => !isNew.value && d.value?.state === 'done')
const lockedPatient = computed(() => !!(form.patient && (!isNew.value || route.query.patient)))
const backTo = computed(() => { const p = form.patient || route.query.patient; return p ? { name: 'patient', params: { name: p } } : '/patients' })
const backLabel = computed(() => lockedName.value || t('Patients'))
const newRx = () => ({ key: `rx${Date.now()}${seq++}`, medicine: null, dosage: 'Once Daily', period: '1 Week', comment: '', stock: null })
const addRx = () => form.prescriptions.push(newRx())
const toggleTreatment = (n) => (form.treatments = form.treatments.includes(n) ? form.treatments.filter((x) => x !== n) : [...form.treatments, n])

function vitalRows(v) {
  const rows = [
    { key: 't', label: 'Temperature', value: v.temperature, unit: '°C' }, { key: 'p', label: 'Pulse', value: v.pulse, unit: '/min' },
    { key: 'bp', label: 'Blood pressure', value: v.bp, unit: 'mmHg' }, { key: 'r', label: 'Breathing', value: v.respiratory_rate, unit: '/min' },
    { key: 'w', label: 'Weight', value: v.weight, unit: 'kg' }, { key: 'h', label: 'Height', value: v.height, unit: 'cm' },
  ]
  return rows.filter((r) => r.value)
}

async function loadLists() {
  const [doc, tpl, sym, dia] = await Promise.all([get(H('practitioners')), get(H('procedure_templates')), get(H('suggestions'), { kind: 'symptoms' }), get(H('suggestions'), { kind: 'diagnoses' })])
  doctors.value = doc
  templates.value = tpl
  symptomHints.value = sym
  diagnosisHints.value = dia
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    await loadLists()
    if (isNew.value) {
      Object.assign(form, { patient: route.query.patient || null, practitioner: session.practitioner, symptoms: [], diagnoses: [], notes: '',
        vitals: blankVitals(), prescriptions: [], treatments: [] })
      if (form.patient) lockedName.value = (await get(H('patient'), { name: form.patient })).patient_name
    } else {
      d.value = await get(H('consultation'), { name: props.name })
      lockedName.value = d.value.patient_name
      Object.assign(form, { patient: d.value.patient, practitioner: d.value.practitioner, date: d.value.encounter_date,
        symptoms: [...d.value.symptoms], diagnoses: [...d.value.diagnoses], notes: d.value.encounter_comment || '',
        vitals: { ...blankVitals(), ...Object.fromEntries(VITAL_FIELDS.map((v) => [v.key, d.value.vitals?.[v.key] ?? ''])) },
        prescriptions: d.value.prescriptions.map((p) => ({ key: `rx${seq++}`, medicine: p.medicine, dosage: p.dosage, period: p.period, comment: p.comment || '', stock: null })),
        treatments: d.value.treatments.map((x) => x.template) })
    }
  } catch (e) {
    toast.error(e.message)
    router.replace({ name: 'patients' })
  } finally {
    loading.value = false
  }
}

async function save(finish) {
  error.value = ''
  if (!form.patient) return (error.value = t('Please choose a patient.'))
  if (!form.practitioner) return (error.value = t('Please choose the doctor.'))
  const rx = form.prescriptions.filter((r) => r.medicine)
  saving.value = finish ? 'finish' : 'draft'
  try {
    const res = await write(H('save_consultation'), {
      name: isNew.value ? undefined : props.name, patient: form.patient, practitioner: form.practitioner,
      symptoms: form.symptoms, diagnoses: form.diagnoses, notes: form.notes, vitals: form.vitals,
      prescriptions: rx.map((r) => ({ medicine: r.medicine, dosage: r.dosage, period: r.period, comment: r.comment })), treatments: form.treatments, finish: finish ? 1 : 0,
    }, finish ? t('Finish a consultation') : t('Save a draft'), { summary: [lockedName.value || form.patient, form.notes].filter(Boolean).join(' · ') })
    saved(res, finish ? t('Consultation finished') : t('Draft saved'),
      finish ? [rx.length && t('{0} medicine(s) prescribed', rx.length), form.treatments.length && t('{0} treatment(s) asked', form.treatments.length)].filter(Boolean).join(' · ') : '')
    ui.version++
    // a consultation kept on the device has no page yet: its patient's file shows it as waiting
    if (res.queued) router.replace({ name: 'patient', params: { name: form.patient } })
    else if (isNew.value) router.replace({ name: 'consultation', params: { name: res.name } })
    else load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = ''
  }
}

function cancelEdit() {
  editing.value = false
  load()
}

async function saveEdit() {
  error.value = ''
  if (!form.practitioner) return (error.value = t('Please choose the doctor.'))
  saving.value = 'edit'
  try {
    const res = await write(H('update_consultation'), { name: props.name, practitioner: form.practitioner, symptoms: form.symptoms, diagnoses: form.diagnoses, notes: form.notes, vitals: form.vitals },
      t('Edit a consultation'), { summary: lockedName.value || form.patient })
    saved(res, t('Consultation updated'))
    editing.value = false
    ui.version++
    await load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = ''
  }
}

function discard() {
  dialog.danger({
    title: t('Discard this draft?'), message: t('Nothing has been ordered yet. The draft is deleted.'), confirmLabel: t('Discard'),
    onConfirm: async () => {
      try {
        const res = await write(H('discard_consultation'), { name: props.name }, t('Discard a draft'), { summary: lockedName.value || form.patient })
        saved(res, t('Draft discarded'))
        router.replace({ name: 'patient', params: { name: form.patient } })
      } catch (e) {
        toast.error(e.message)
      }
    },
  })
}

onMounted(load)
watch(() => props.name, () => { editing.value = false; load() })
watch(() => ui.version, () => { if (readonly.value && !editing.value) load() })
</script>
