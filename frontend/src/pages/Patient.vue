<template>
  <div>
    <div v-if="!p" class="space-y-4"><div class="h-28 animate-pulse rounded-[18px] bg-paper-deep" /><div class="surface h-64 animate-pulse" /></div>
    <template v-else>
      <PageHeader :title="p.patient_name" back="/patients" :back-label="t('Patients')">
        <template #meta>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <span v-for="chip in chips" :key="chip" class="rounded-full bg-paper-deep px-2.5 py-1 text-[12.5px] text-ink-soft">{{ chip }}</span>
          </div>
        </template>
        <template #actions>
          <Btn icon="lucide-pencil" :label="t('Edit')" @click="openPatient(p.name)" />
          <Btn icon="lucide-stethoscope" :label="t('Record a treatment')" @click="openProcedure(p.name)" />
          <Btn variant="primary" icon="lucide-notebook-pen" :label="t('New consultation')" :to="{ name: 'consultation', params: { name: 'new' }, query: { patient: p.name } }" />
        </template>
      </PageHeader>

      <PendingChanges :items="waitingHere" />

      <!-- care that was asked and is not done yet -->
      <div v-if="p.treatments_requested.length" class="mb-4 space-y-2">
        <div v-for="r in p.treatments_requested" :key="r.name" class="flex flex-wrap items-center gap-3 rounded-[16px] border border-warn/20 bg-warn-soft px-4 py-3 text-warn">
          <span class="lucide-stethoscope size-5 shrink-0" />
          <div class="min-w-0 flex-1 text-[13.5px]"><b>{{ t('Treatment to record') }}</b> · {{ r.template }} · {{ date(r.order_date) }}</div>
          <Btn size="sm" variant="brand" icon="lucide-plus" :label="t('Record it')" @click="openProcedure(p.name, r.template, r.name)" />
        </div>
      </div>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section class="order-2 min-w-0 lg:order-1">
          <div class="scrollbar-none -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
            <button v-for="x in tabs" :key="x.value" class="flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition"
              :class="tab === x.value ? 'border-ink bg-ink text-on-ink' : 'border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink'" @click="tab = x.value">
              {{ t(x.label) }}<span v-if="x.count !== null" class="tabular" :class="tab === x.value ? 'text-on-ink/60' : 'text-ink-faint'">{{ x.count }}</span>
            </button>
          </div>

          <!-- timeline: everything, newest first -->
          <div v-if="tab === 'timeline'" class="surface overflow-hidden">
            <EmptyState v-if="!timeline.length" icon="lucide-history" :title="t('Nothing yet')" :text="t('Consultations, treatments and prescriptions appear here.')">
              <Btn variant="primary" icon="lucide-notebook-pen" :label="t('New consultation')" :to="{ name: 'consultation', params: { name: 'new' }, query: { patient: p.name } }" />
            </EmptyState>
            <ol v-else>
              <li v-for="e in timeline" :key="e.key" class="border-b border-line/70 last:border-0">
                <component :is="e.to ? 'RouterLink' : 'div'" :to="e.to" class="flex items-start gap-3.5 px-5 py-3.5 transition" :class="e.to && 'hover:bg-paper/60'">
                  <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full" :class="e.tone"><span :class="e.icon" class="size-4" /></span>
                  <div class="min-w-0 flex-1">
                    <div class="text-[14px] font-semibold text-ink" :class="e.struck && 'line-through decoration-ink-faint'">{{ e.title }}</div>
                    <div class="mt-0.5 text-[12.5px] text-ink-mute">{{ e.sub }}</div>
                  </div>
                  <div class="shrink-0 text-right text-[12px] text-ink-mute tabular">{{ date(e.date) }}<template v-if="e.time"> · {{ e.time }}</template></div>
                </component>
              </li>
            </ol>
          </div>

          <div v-else-if="tab === 'consultations'" class="space-y-2.5">
            <div v-if="!p.consultations.length" class="surface"><EmptyState icon="lucide-notebook-pen" :title="t('No consultation yet')" /></div>
            <ConsultationCard v-for="c in p.consultations" :key="c.name" :c="c" :show-patient="false" />
          </div>

          <div v-else-if="tab === 'treatments'" class="space-y-2.5">
            <div v-if="!p.procedures.length" class="surface">
              <EmptyState icon="lucide-stethoscope" :title="t('No treatment yet')" :text="t('Treatments you record for this patient appear here.')">
                <Btn variant="primary" icon="lucide-plus" :label="t('Record a treatment')" @click="openProcedure(p.name)" />
              </EmptyState>
            </div>
            <ProcedureCard v-for="x in p.procedures" :key="x.name" :p="x" :show-patient="false" />
          </div>

          <div v-else-if="tab === 'prescriptions'" class="surface overflow-hidden">
            <EmptyState v-if="!p.prescriptions.length" icon="lucide-pill" :title="t('No prescription yet')" :text="t('Medicines a doctor prescribes appear here.')" />
            <ul v-else>
              <li v-for="r in p.prescriptions" :key="r.name" class="flex items-center gap-3.5 border-b border-line/70 px-5 py-3.5 last:border-0">
                <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-apo-soft text-apo"><span class="lucide-pill size-4" /></span>
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[14.5px] font-semibold text-ink">{{ r.medicine_name }}</div>
                  <div class="text-[12.5px] text-ink-mute">{{ dosageLabel(r.dosage) }} · {{ durationLabel(r.period) }} · {{ r.practitioner_name }}</div>
                </div>
                <div class="text-right"><div class="font-display text-[19px] leading-none tabular text-ink">{{ num(r.quantity) }}</div><div class="mt-1 text-[11.5px] text-ink-mute">{{ date(r.order_date) }}</div></div>
              </li>
            </ul>
          </div>

          <div v-else-if="tab === 'vitals'" class="surface overflow-x-auto">
            <EmptyState v-if="!p.vitals.length" icon="lucide-activity" :title="t('No vital signs yet')" :text="t('They are recorded during a consultation.')" />
            <table v-else class="w-full text-left text-[13.5px]">
              <thead><tr class="border-b border-line text-[12px] text-ink-mute">
                <th class="py-3 pl-5 pr-3 font-medium">{{ t('Date') }}</th><th class="px-3 py-3 font-medium">{{ t('Temperature') }}</th><th class="px-3 py-3 font-medium">{{ t('Pulse') }}</th>
                <th class="px-3 py-3 font-medium">{{ t('Blood pressure') }}</th><th class="px-3 py-3 font-medium">{{ t('Weight') }}</th><th class="py-3 pl-3 pr-5 font-medium">{{ t('Height') }}</th></tr></thead>
              <tbody><tr v-for="v in p.vitals" :key="v.name" class="border-b border-line/70 last:border-0">
                <td class="whitespace-nowrap py-3 pl-5 pr-3 text-ink-mute">{{ date(v.signs_date) }}</td>
                <td class="px-3 py-3 tabular">{{ v.temperature ? v.temperature + ' °C' : '—' }}</td><td class="px-3 py-3 tabular">{{ v.pulse || '—' }}</td>
                <td class="px-3 py-3 tabular">{{ v.bp || '—' }}</td><td class="px-3 py-3 tabular">{{ v.weight ? v.weight + ' kg' : '—' }}</td><td class="py-3 pl-3 pr-5 tabular">{{ v.height ? v.height + ' cm' : '—' }}</td>
              </tr></tbody>
            </table>
          </div>

        </section>

        <aside class="order-1 space-y-3 lg:order-2">
          <div class="surface p-5">
            <p class="eyebrow">{{ t('Patient file') }}</p>
            <dl class="mt-3 space-y-3 text-[13.5px]">
              <div class="flex justify-between gap-3"><dt class="text-ink-mute">{{ t('Phone') }}</dt><dd class="text-right font-medium text-ink tabular">{{ p.mobile || '—' }}</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-ink-mute">{{ t('Date of birth') }}</dt><dd class="text-right font-medium text-ink">{{ p.dob ? date(p.dob) : '—' }}</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-ink-mute">{{ t('Blood group') }}</dt><dd class="text-right font-medium text-ink">{{ blood(p.blood_group) || '—' }}</dd></div>
              <div class="flex justify-between gap-3"><dt class="text-ink-mute">{{ t('Registered') }}</dt><dd class="text-right font-medium text-ink">{{ date(p.creation.slice(0, 10)) }}</dd></div>
            </dl>
          </div>
          <div class="rounded-[18px] border p-4" :class="p.allergies ? 'border-alert/15 bg-alert-soft text-alert' : 'border-line bg-card text-ink-mute'">
            <p class="flex items-center gap-2 text-[13px] font-semibold"><span class="lucide-triangle-alert size-4" /> {{ t('Allergies') }}</p>
            <p class="mt-1 text-[13.5px]">{{ p.allergies || t('None recorded') }}</p>
          </div>
          <div v-if="p.vitals.length" class="surface p-5">
            <p class="eyebrow">{{ t('Last vital signs') }} · {{ date(p.vitals[0].signs_date) }}</p>
            <dl class="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
              <div v-for="v in lastVitals" :key="v.label"><dt class="text-[12px] text-ink-mute">{{ t(v.label) }}</dt><dd class="font-display text-[21px] leading-tight text-ink tabular">{{ v.value }} <span class="font-sans text-[11px] text-ink-mute">{{ v.unit }}</span></dd></div>
            </dl>
          </div>
        </aside>
      </div>
    </template>
  </div>
</template>

<script setup>
import PendingChanges from '@/components/PendingChanges.vue'
import { pendingForPatient } from '@/offline/pending'
import { net } from '@/api'
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ProcedureCard from '@/components/ProcedureCard.vue'
import ConsultationCard from '@/components/ConsultationCard.vue'
import { get } from '@/api'
import { t } from '@/i18n'
import { date, num } from '@/format'
import { ageLabel, blood, dosageLabel, durationLabel, usedLine } from '@/care'
import { ui, H, openPatient, openProcedure } from '@/ui'

const props = defineProps({ name: String })
const waitingHere = computed(() => pendingForPatient(net.outbox, props.name))
const router = useRouter()
const p = ref(null)
const tab = ref('timeline')
const chips = computed(() => [p.value.sex && t(p.value.sex), ageLabel(p.value.age), blood(p.value.blood_group)].filter(Boolean))
const treatments = computed(() => p.value.procedures.filter((x) => x.state !== 'cancelled'))
const tabs = computed(() => [
  { value: 'timeline', label: 'Timeline', count: null },
  { value: 'consultations', label: 'Consultations', count: p.value.consultations.length },
  { value: 'treatments', label: 'Treatments', count: treatments.value.length },
  { value: 'prescriptions', label: 'Prescriptions', count: p.value.prescriptions.length },
  { value: 'vitals', label: 'Vital signs', count: p.value.vitals.length },
])
const lastVitals = computed(() => {
  const v = p.value.vitals[0]
  return [{ label: 'Temperature', value: v.temperature, unit: '°C' }, { label: 'Pulse', value: v.pulse, unit: '/min' }, { label: 'Blood pressure', value: v.bp, unit: 'mmHg' },
    { label: 'Weight', value: v.weight, unit: 'kg' }].filter((x) => x.value)
})
const timeline = computed(() => {
  const x = p.value
  const out = [
    ...x.consultations.map((c) => ({ key: `c${c.name}`, date: c.encounter_date, icon: 'lucide-notebook-pen', tone: 'bg-info-soft text-info', to: { name: 'consultation', params: { name: c.name } },
      title: `${t('Consultation')} · ${c.state === 'draft' ? t('Draft') : (c.diagnoses[0] || c.symptoms[0] || '')}`.replace(/ · $/, ''), sub: c.practitioner_name, time: c.time })),
    ...x.procedures.map((r) => ({ key: `p${r.name}`, date: r.start_date, icon: r.state === 'cancelled' ? 'lucide-undo-2' : 'lucide-stethoscope', tone: r.state === 'cancelled' ? 'bg-paper-deep text-ink-mute' : 'bg-apo-soft text-apo',
      struck: r.state === 'cancelled', title: `${t('Treatment')} · ${r.procedure_template}`, sub: r.state === 'cancelled' ? t('Cancelled') : (usedLine(r.items) || r.by) })),
    ...x.prescriptions.map((r) => ({ key: `m${r.name}`, date: r.order_date, icon: 'lucide-pill', tone: 'bg-apo-soft text-apo', title: `${t('Prescription')} · ${r.medicine_name}`,
      sub: `${dosageLabel(r.dosage)} · ${durationLabel(r.period)} · ${num(r.quantity)}` })),
    ...x.vitals.map((v) => ({ key: `v${v.name}`, date: v.signs_date, icon: 'lucide-activity', tone: 'bg-warn-soft text-warn', title: t('Vital signs'), time: String(v.signs_time || '').slice(0, 5),
      sub: [v.temperature && `${v.temperature} °C`, v.pulse && `${v.pulse}/min`, v.bp && `${v.bp} mmHg`, v.weight && `${v.weight} kg`].filter(Boolean).join(' · ') })),
  ]
  return out.sort((a, b) => `${b.date} ${b.time || ''}`.localeCompare(`${a.date} ${a.time || ''}`))
})

async function load() {
  try {
    p.value = await get(H('patient'), { name: props.name })
  } catch (e) {
    toast.error(e.message)
    router.replace({ name: 'patients' })
  }
}
watch(() => [props.name, ui.version], load, { immediate: true })
</script>
