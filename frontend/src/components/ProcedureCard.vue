<template>
  <article class="surface p-4 md:p-5" :class="p.state === 'cancelled' && 'bg-paper/60'">
    <div class="flex items-start gap-3.5">
      <span class="flex size-10 shrink-0 items-center justify-center rounded-full" :class="p.state === 'done' ? 'bg-apo-soft text-apo' : p.state === 'planned' ? 'bg-info-soft text-info' : 'bg-paper-deep text-ink-mute'">
        <span :class="p.state === 'cancelled' ? 'lucide-undo-2' : 'lucide-stethoscope'" class="size-[18px]" />
      </span>
      <div class="min-w-0 flex-1" :class="p.state === 'cancelled' && 'opacity-75'">
        <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <div class="min-w-0">
            <h3 class="text-[15px] font-semibold leading-snug text-ink" :class="p.state === 'cancelled' && 'line-through decoration-ink-faint'">{{ p.procedure_template }}</h3>
            <p class="mt-0.5 text-[12.5px] text-ink-mute">
              <RouterLink v-if="showPatient" :to="{ name: 'patient', params: { name: p.patient } }" class="font-medium text-ink-soft hover:underline">{{ p.patient_name }}</RouterLink>
              <template v-if="showPatient"> · </template>{{ date(p.start_date) }} · {{ p.by }}
            </p>
          </div>
          <span class="flex items-center gap-1.5"><PendingTag :show="p.pending" /><StatusBadge :status="p.state" /></span>
        </div>
        <ul v-if="p.items.length" class="mt-3 flex flex-wrap gap-1.5">
          <li v-for="i in p.items" :key="i.medicine" class="inline-flex items-center gap-1.5 rounded-full bg-paper-deep px-2.5 py-1 text-[12px] text-ink-soft">
            <span class="lucide-pill size-3 text-ink-mute" />{{ i.medicine_name }}
            <span class="font-semibold text-ink tabular">× {{ num(i.qty) }}</span>
          </li>
        </ul>
        <p v-if="p.notes" class="mt-2.5 font-display text-[15.5px] italic leading-snug text-ink-soft">“{{ p.notes }}”</p>
        <p v-if="p.state === 'cancelled' && p.custom_cancel_reason" class="mt-2.5 flex items-start gap-1.5 text-[12.5px] text-ink-mute">
          <span class="lucide-info mt-0.5 size-3.5 shrink-0" />
          <span>{{ t('Cancelled') }}<template v-if="p.cancelled_by"> · {{ p.cancelled_by }}</template> : {{ p.custom_cancel_reason }}</span>
        </p>
      </div>
    </div>
    <div v-if="p.state === 'planned'" class="mt-3.5 flex flex-wrap gap-2 pl-[54px]">
      <Btn size="sm" variant="brand" icon="lucide-check" :label="t('Mark as done')" :loading="busy" @click="complete" />
      <Btn size="sm" variant="ghost" :label="t('Cancel')" @click="openCancelProcedure(p)" />
    </div>
    <div v-else-if="p.state === 'done'" class="mt-3 flex justify-end">
      <button class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium text-ink-mute transition hover:bg-alert-soft hover:text-alert"
        @click="openCancelProcedure(p)"><span class="lucide-undo-2 size-3.5" /> {{ t('Cancel treatment') }}</button>
    </div>
  </article>
</template>

<script setup>
import { ref } from 'vue'
import { dialog, toast } from 'frappe-ui'
import Btn from './Btn.vue'
import StatusBadge from './StatusBadge.vue'
import PendingTag from './PendingTag.vue'
import { write } from '@/api'
import { saved } from '@/offline/notify'
import { t } from '@/i18n'
import { date, num } from '@/format'
import { usedLine } from '@/care'
import { changed, H, openCancelProcedure } from '@/ui'

const props = defineProps({ p: Object, showPatient: { type: Boolean, default: true } })
const busy = ref(false)

function complete() {
  dialog.confirm({
    title: t('Mark this treatment as done?'),
    message: props.p.items.length ? t('These medicines leave the stock: {0}', usedLine(props.p.items)) : props.p.procedure_template,
    confirmLabel: t('Mark as done'),
    onConfirm: async () => {
      busy.value = true
      try {
        const res = await write(H('complete_procedure'), { name: props.p.name }, t('Mark as done'), { summary: props.p.procedure_template })
        saved(res, t('Treatment recorded'))
        changed()
      } catch (e) {
        toast.error(e.message)
      } finally {
        busy.value = false
      }
    },
  })
}
</script>
