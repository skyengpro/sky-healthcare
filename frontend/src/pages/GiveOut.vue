<template>
  <div>
    <PageHeader :eyebrow="t('Stock out')" :title="t('Give out stock')" :subtitle="t('Record medicine that leaves the store without a patient: damaged, expired or adjusted.')">
      <template v-if="session.health" #meta>
        <p class="mt-2 flex items-center gap-1.5 text-[13px] text-ink-mute">
          <span class="lucide-info size-3.5 shrink-0" /> {{ t('Medicine given to a patient is recorded as a treatment.') }}
          <RouterLink to="/procedures" class="font-medium text-apo hover:underline">{{ t('Open treatments') }}</RouterLink>
        </p>
      </template>
    </PageHeader>

    <div class="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <form class="surface rise p-5 md:p-7" @submit.prevent="save">
        <MedicinePicker v-model="form.medicine" :label="t('Medicine')" required @select="(m) => (picked = m)" />
        <div v-if="picked" class="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
          <span class="rounded-full bg-apo-soft px-2.5 py-1 font-medium text-apo-deep tabular">{{ t('Available: {0} {1}', num(available), t(picked.unit)) }}</span>
          <span v-if="picked.expired_qty > 0" class="rounded-full bg-alert-soft px-2.5 py-1 font-medium text-alert">{{ t('{0} expired (cannot be given to patients)', num(picked.expired_qty)) }}</span>
          <span v-if="picked.nearest_expiry" class="text-ink-mute">{{ t('Oldest valid batch expires {0}', date(picked.nearest_expiry)) }}</span>
        </div>

        <div class="mt-7">
          <div class="mb-2.5 text-[13px] font-semibold text-ink">{{ t('Quantity') }} <span class="text-alert">*</span></div>
          <div class="flex items-center gap-3">
            <button type="button" class="flex size-14 shrink-0 items-center justify-center rounded-full border border-line bg-card text-ink-soft shadow-card transition hover:border-line-strong hover:text-ink active:scale-95"
              :aria-label="t('Less')" @click="step(-1)"><span class="lucide-minus size-5" /></button>
            <label class="flex h-[72px] min-w-0 flex-1 items-center justify-center rounded-[18px] bg-paper">
              <span class="sr-only">{{ t('Quantity') }}</span>
              <input v-model.number="form.qty" type="number" min="1" inputmode="numeric"
                class="w-full !border-0 !bg-transparent text-center font-display !text-[44px] leading-none text-ink !shadow-none outline-none !ring-0 tabular [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
            </label>
            <button type="button" class="flex size-14 shrink-0 items-center justify-center rounded-full bg-ink text-on-ink shadow-card transition hover:bg-ink/85 active:scale-95"
              :aria-label="t('More')" @click="step(1)"><span class="lucide-plus size-5" /></button>
          </div>
          <div class="mt-3 flex flex-wrap justify-center gap-1.5">
            <button v-for="n in [1, 5, 10, 20, 30]" :key="n" type="button"
              class="h-8 min-w-11 rounded-full border px-3 text-[13px] font-medium tabular transition"
              :class="form.qty === n ? 'border-ink bg-ink text-on-ink' : 'border-line bg-card text-ink-soft hover:border-line-strong'"
              @click="form.qty = n">{{ n }}</button>
          </div>
        </div>

        <div class="mt-7">
          <div class="mb-2.5 text-[13px] font-semibold text-ink">{{ t('Reason') }} <span class="text-alert">*</span></div>
          <div class="grid gap-2 sm:grid-cols-2">
            <button v-for="r in reasons" :key="r.value" type="button"
              class="flex items-center gap-3 rounded-[14px] border px-3.5 py-3 text-left text-[13.5px] transition"
              :class="form.reason === r.value ? 'border-apo/40 bg-apo-mist font-semibold text-apo-deep ring-1 ring-apo/30' : 'border-line bg-card text-ink-soft hover:border-line-strong'"
              @click="form.reason = r.value">
              <span class="flex size-8 shrink-0 items-center justify-center rounded-full" :class="form.reason === r.value ? 'bg-apo text-on-apo' : 'bg-paper text-ink-mute'">
                <span :class="r.icon" class="size-4" />
              </span>
              {{ t(r.value) }}
            </button>
          </div>
        </div>

        <FormControl v-model="form.recipient" class="mt-7" :label="t('Note')" size="lg" variant="outline" :placeholder="t('Optional')" />

        <p v-if="error" class="mt-5 flex items-center gap-2 rounded-[12px] bg-alert-soft px-3.5 py-2.5 text-[13px] text-alert">
          <span class="lucide-circle-alert size-4 shrink-0" />{{ error }}
        </p>
        <div class="mt-7 flex justify-end gap-2 border-t border-line pt-5">
          <Btn variant="ghost" :label="t('Clear')" @click="reset" />
          <Btn type="submit" variant="primary" size="lg" icon="lucide-check" :loading="saving" :label="t('Record stock out')" />
        </div>
      </form>

      <Panel :title="t('Given out recently')" :count="recent.length || null">
        <EmptyState v-if="!recent.length" icon="lucide-hand-heart" :title="t('Nothing given out yet')" />
        <ul v-else class="px-2 pb-2">
          <li v-for="(x, i) in recent" :key="i" class="flex items-center gap-3 rounded-[12px] px-3 py-2.5">
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2"><span class="truncate text-[14px] font-semibold text-ink">{{ x.medicine_name }}</span><CancelledTag v-if="x.cancelled" /></div>
              <div class="truncate text-[12.5px] text-ink-mute">{{ t(x.reason || '') }}<template v-if="x.recipient"> · {{ x.recipient }}</template></div>
            </div>
            <div class="text-right">
              <div class="font-display text-[19px] leading-none text-ink tabular" :class="x.cancelled && 'line-through opacity-50'">−{{ num(x.qty) }}</div>
              <div class="mt-1 text-[11.5px] text-ink-mute">{{ shortDate(x.date) }}</div>
            </div>
          </li>
        </ul>
      </Panel>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { FormControl, toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import CancelledTag from '@/components/CancelledTag.vue'
import PageHeader from '@/components/PageHeader.vue'
import Panel from '@/components/Panel.vue'
import EmptyState from '@/components/EmptyState.vue'
import MedicinePicker from '@/components/MedicinePicker.vue'
import { get, write } from '@/api'
import { t } from '@/i18n'
import { saved } from '@/offline/notify'
import { date, num, shortDate } from '@/format'
import { session } from '@/session'
import { ui, changed } from '@/ui'

const route = useRoute()
const reasons = [
  { value: 'Damaged stock', icon: 'lucide-package-x' },
  { value: 'Expired stock', icon: 'lucide-calendar-x' },
  { value: 'Other authorized adjustment', icon: 'lucide-sliders-horizontal' },
]
const blank = () => ({ medicine: route.query.medicine || null, qty: 1, reason: route.query.reason || 'Damaged stock', recipient: '' })
const form = reactive(blank())
const picked = ref(null)
const saving = ref(false)
const error = ref('')
const recent = ref([])

const expiredReason = computed(() => form.reason === 'Expired stock')
const available = computed(() => (picked.value ? (expiredReason.value ? picked.value.expired_qty : picked.value.stock - picked.value.expired_qty) : 0))

const step = (d) => (form.qty = Math.max(1, (Number(form.qty) || 0) + d))
function reset() {
  Object.assign(form, { ...blank(), medicine: null })
  picked.value = null
  error.value = ''
}

async function save() {
  error.value = ''
  if (!form.medicine) return (error.value = t('Please choose a medicine.'))
  if (!(Number(form.qty) > 0)) return (error.value = t('Please enter a quantity above 0.'))
  if (picked.value && Number(form.qty) > available.value)
    return (error.value = expiredReason.value ? t('Only {0} expired units are in stock.', num(available.value))
      : t('Not enough valid stock. Only {0} available.', num(available.value)))
  saving.value = true
  try {
    const name = picked.value?.name || form.medicine
    const res = await write('give_out', { ...form }, t('Give out'), { summary: `${name} × ${num(form.qty)}` })
    saved(res, t('Stock out recorded'), `${num(form.qty)} × ${name}`)
    reset()
    changed()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function loadRecent() {
  try {
    recent.value = await get('movements', { kind: 'out', limit: 12 })
  } catch {}
}
onMounted(loadRecent)
watch(() => ui.version, loadRecent)
</script>
