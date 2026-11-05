<template>
  <Sheet v-model:open="ui.cancelProc.open" :title="completed ? t('Cancel this treatment?') : t('Cancel this planned treatment?')"
    :message="completed ? t('The medicines go back into the same batches. The record stays in the history, marked as cancelled.')
      : t('Nothing leaves the stock. It stays in the patient’s file as cancelled.')"
    icon="lucide-undo-2" theme="red" size="lg">
    <div v-if="p" class="space-y-4">
      <div class="rounded-[14px] bg-paper-deep px-4 py-3">
        <p class="text-[14px] font-semibold text-ink">{{ p.procedure_template }}</p>
        <p class="mt-0.5 text-[12.5px] text-ink-mute">{{ p.patient_name }} · {{ date(p.start_date) }}</p>
        <p v-if="completed && p.items.length" class="mt-2 text-[12.5px] text-ink-soft">{{ t('Back in stock: {0}', usedLine(p.items)) }}</p>
      </div>
      <div v-if="completed">
        <div class="mb-1.5 text-[13px] text-ink-soft">{{ t('Reason') }} <span class="text-alert">*</span></div>
        <div class="mb-2.5 flex flex-wrap gap-1.5">
          <button v-for="r in reasons" :key="r" type="button" class="rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition"
            :class="reason === t(r) ? 'border-ink bg-ink text-on-ink' : 'border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink'"
            @click="reason = t(r)">{{ t(r) }}</button>
        </div>
        <FormControl variant="outline" v-model="reason" type="textarea" :rows="2" size="lg" :placeholder="t('Write the reason')" />
      </div>
      <ErrorMessage :message="error" />
    </div>
    <template #actions>
      <Btn variant="ghost" :label="t('Keep it')" @click="ui.cancelProc.open = false" />
      <Btn variant="danger" icon="lucide-undo-2" :label="t('Cancel treatment')" :loading="saving" @click="save" />
    </template>
  </Sheet>
</template>

<script setup>
import Sheet from './Sheet.vue'
import { computed, ref, watch } from 'vue'
import { ErrorMessage, FormControl, toast } from 'frappe-ui'
import Btn from './Btn.vue'
import { post } from '@/api'
import { t } from '@/i18n'
import { date } from '@/format'
import { usedLine } from '@/care'
import { ui, changed, H } from '@/ui'

const reasons = ['Recorded for the wrong patient', 'Wrong medicine or quantity', 'Care was not given']
const p = computed(() => ui.cancelProc.procedure)
const completed = computed(() => p.value?.state === 'done')
const reason = ref('')
const error = ref('')
const saving = ref(false)
watch(reason, () => (error.value = ''))

watch(() => ui.cancelProc.open, (open) => {
  if (open) {
    reason.value = ''
    error.value = ''
  }
})

async function save() {
  error.value = ''
  if (completed.value && !reason.value.trim()) return (error.value = t('Please give the reason for cancelling.'))
  saving.value = true
  try {
    const res = await post(H('cancel_procedure'), { name: p.value.name, reason: reason.value })
    ui.cancelProc.open = false
    toast.success(t('Treatment cancelled'), { description: res.stock_returned ? t('The medicines are back in stock.') : '' })
    changed()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>
