<template>
  <RouterLink :to="{ name: 'consultation', params: { name: c.name } }" class="surface block p-4 transition hover:-translate-y-px hover:shadow-lift md:p-5">
    <div class="flex items-start gap-3.5">
      <Initials v-if="showPatient" :name="c.patient_name" />
      <span v-else class="flex size-10 shrink-0 items-center justify-center rounded-full bg-info-soft text-info"><span class="lucide-notebook-pen size-[18px]" /></span>
      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div class="min-w-0">
            <h3 class="truncate text-[15px] font-semibold text-ink">{{ showPatient ? c.patient_name : date(c.encounter_date) }}</h3>
            <p class="mt-0.5 text-[12.5px] text-ink-mute">{{ showPatient ? date(c.encounter_date) + ' · ' : '' }}{{ c.time }} · {{ c.practitioner_name }}</p>
          </div>
          <StatusBadge :status="c.state" />
        </div>
        <div v-if="c.symptoms.length || c.diagnoses.length" class="mt-2.5 flex flex-wrap gap-1.5">
          <span v-for="s in c.symptoms" :key="'s' + s" class="rounded-full bg-paper-deep px-2.5 py-0.5 text-[12px] text-ink-soft">{{ s }}</span>
          <span v-for="d in c.diagnoses" :key="'d' + d" class="rounded-full bg-info-soft px-2.5 py-0.5 text-[12px] font-medium text-info">{{ d }}</span>
        </div>
        <p v-if="c.encounter_comment" class="mt-2 line-clamp-2 font-display text-[15px] italic leading-snug text-ink-soft">“{{ c.encounter_comment }}”</p>
        <p v-if="c.prescription_count || c.treatment_count" class="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-mute">
          <span v-if="c.prescription_count" class="inline-flex items-center gap-1"><span class="lucide-pill size-3.5" />{{ t('{0} medicine(s) prescribed', c.prescription_count) }}</span>
          <span v-if="c.treatment_count" class="inline-flex items-center gap-1"><span class="lucide-stethoscope size-3.5" />{{ t('{0} treatment(s) asked', c.treatment_count) }}</span>
        </p>
      </div>
    </div>
  </RouterLink>
</template>

<script setup>
import Initials from './Initials.vue'
import StatusBadge from './StatusBadge.vue'
import { t } from '@/i18n'
import { date } from '@/format'

defineProps({ c: Object, showPatient: { type: Boolean, default: true } })
</script>
