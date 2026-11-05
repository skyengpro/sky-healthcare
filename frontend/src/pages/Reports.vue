<template>
  <div>
    <PageHeader :eyebrow="t('Records')" :title="t('Reports')" :subtitle="t('Movements, expiry and stock levels. Download any report for Excel.')">
      <template #actions>
        <Btn class="no-print" icon="lucide-printer" :label="t('Print')" @click="print" />
        <Btn class="no-print" variant="primary" icon="lucide-download" :label="t('Download (Excel)')" :disabled="!current.length" @click="exportCsv" />
      </template>
    </PageHeader>

    <div class="no-print mb-4 inline-flex rounded-full border border-line bg-card p-1 shadow-card">
      <button v-for="x in tabs" :key="x.value" class="flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition"
        :class="tab === x.value ? 'bg-ink text-on-ink' : 'text-ink-soft hover:text-ink'" @click="tab = x.value">
        <span :class="x.icon" class="size-4" /> <span :class="tab === x.value ? '' : 'hidden sm:inline'">{{ t(x.label) }}</span>
      </button>
    </div>

    <!-- filters -->
    <div class="no-print mb-4 flex flex-wrap items-end gap-3">
      <template v-if="tab === 'movements'">
        <div class="w-[calc(50%-6px)] sm:w-44"><FormControl v-model="from" type="date" format="D MMM YYYY" :placeholder="t('Select a date')" variant="outline" :label="t('From')" size="md" /></div>
        <div class="w-[calc(50%-6px)] sm:w-44"><FormControl v-model="to" type="date" format="D MMM YYYY" :placeholder="t('Select a date')" variant="outline" :label="t('To')" size="md" /></div>
        <div class="w-[calc(50%-6px)] sm:w-40">
          <FormControl v-model="kind" type="select" :label="t('Type')" variant="outline" size="md"
            :options="[{ label: t('All'), value: '' }, { label: t('Stock in'), value: 'in' }, { label: t('Stock out'), value: 'out' }]" />
        </div>
        <div class="w-full sm:w-72"><MedicinePicker v-model="medicine" :label="t('Medicine')" size="md" /></div>
        <Btn v-if="medicine" variant="ghost" icon="lucide-x" :label="t('Any medicine')" @click="medicine = null" />
      </template>
      <div v-else-if="tab === 'expiry'" class="w-52">
        <FormControl v-model="days" type="select" :label="t('Expiring within')" variant="outline" size="md"
          :options="[30, 60, 90, 180, 365].map((d) => ({ label: t('{0} days', d), value: String(d) }))" />
      </div>
      <div v-else class="w-60">
        <FormControl v-model="stockFilter" type="select" :label="t('Show')" variant="outline" size="md"
          :options="[{ label: t('All medicines'), value: 'all' }, { label: t('Low or out of stock'), value: 'low' }]" />
      </div>
      <div class="ml-auto pb-2 text-[13px] text-ink-mute tabular">{{ t('{0} rows', current.length) }}</div>
    </div>

    <div class="surface overflow-hidden">
      <div v-if="loading" class="p-12 text-center"><LoadingIndicator class="mx-auto size-5 text-ink-mute" /></div>
      <EmptyState v-else-if="!current.length" icon="lucide-file-search" :title="t('Nothing to show')" :text="t('Change the filters to see more.')" />

      <template v-else-if="tab === 'movements'">
      <ul class="divide-y divide-line/70 lg:hidden">
        <li v-for="(r, i) in paged.items.value" :key="i" class="flex items-center gap-3 px-4 py-3.5">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full" :class="r.direction === 'in' ? 'bg-apo-soft text-apo' : 'bg-paper-deep text-ink-soft'">
            <span :class="r.direction === 'in' ? 'lucide-arrow-down-to-line' : 'lucide-arrow-up-from-line'" class="size-4" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2"><span class="truncate text-[14px] font-semibold text-ink">{{ r.medicine_name }}</span><CancelledTag v-if="r.cancelled" /></div>
            <div class="mt-0.5 truncate text-[12px] text-ink-mute">{{ date(r.date) }} · {{ t(r.reason || '') }}<template v-if="r.recipient"> · {{ r.recipient }}</template></div>
          </div>
          <div class="shrink-0 text-right">
            <div class="font-display text-[19px] leading-none tabular" :class="[r.direction === 'in' ? 'text-apo' : 'text-ink', r.cancelled && 'line-through opacity-50']">{{ r.direction === 'in' ? '+' : '−' }}{{ num(r.qty) }}</div>
            <div v-if="!r.cancelled" class="mt-1 text-[11px] text-ink-faint tabular">{{ t('Balance') }} {{ num(r.balance) }}</div>
          </div>
        </li>
      </ul>
      <table class="hidden w-full text-left lg:table text-[13.5px]">
        <thead><tr class="border-b border-line text-[12px] text-ink-mute">
          <th class="py-3.5 pl-6 pr-3 font-medium">{{ t('Date') }}</th><th class="px-3 py-3.5 font-medium">{{ t('Medicine') }}</th>
          <th class="px-3 py-3.5 text-right font-medium">{{ t('Quantity') }}</th><th class="px-3 py-3.5 font-medium">{{ t('Reason') }}</th>
          <th class="hidden px-3 py-3.5 font-medium xl:table-cell">{{ t('Lot') }}</th><th class="hidden px-3 py-3.5 font-medium xl:table-cell">{{ t('By') }}</th>
          <th class="py-3.5 pl-3 pr-6 text-right font-medium">{{ t('Balance') }}</th></tr></thead>
        <tbody>
          <tr v-for="(r, i) in paged.items.value" :key="i" class="border-b border-line/70 last:border-0">
            <td class="whitespace-nowrap py-3 pl-6 pr-3 text-ink-mute">{{ date(r.date) }}</td>
            <td class="px-3 py-3 font-semibold text-ink">{{ r.medicine_name }} <CancelledTag v-if="r.cancelled" class="ml-1.5 align-middle" /></td>
            <td class="px-3 py-3 text-right font-display text-[17px] tabular" :class="[r.direction === 'in' ? 'text-apo' : 'text-ink', r.cancelled && 'line-through opacity-50']">
              {{ r.direction === 'in' ? '+' : '−' }}{{ num(r.qty) }}</td>
            <td class="px-3 py-3 text-ink-soft">{{ t(r.reason || '') }}<span v-if="r.recipient" class="text-ink-mute"> · {{ r.recipient }}</span></td>
            <td class="font-label hidden px-3 py-3 text-[11.5px] text-ink-mute xl:table-cell">{{ r.batch || '—' }}</td>
            <td class="hidden px-3 py-3 text-ink-soft xl:table-cell">{{ r.by }}</td>
            <td class="py-3 pl-3 pr-6 text-right text-ink-mute tabular">{{ r.cancelled ? '—' : num(r.balance) }}</td>
          </tr>
        </tbody>
      </table>
      </template>

      <template v-else-if="tab === 'expiry'">
      <ul class="divide-y divide-line/70 lg:hidden">
        <li v-for="r in paged.items.value" :key="r.batch" class="flex items-center gap-3 px-4 py-3.5" :class="r.expired && 'bg-alert-soft/40'">
          <div class="min-w-0 flex-1">
            <div class="truncate text-[14px] font-semibold text-ink">{{ r.medicine_name }}</div>
            <div class="font-label mt-0.5 truncate text-[11px] text-ink-mute">{{ r.batch }} · {{ date(r.expiry_date) }}</div>
          </div>
          <div class="shrink-0 text-right">
            <ExpiryChip :date="r.expiry_date" :days="r.days_left" :show-date="false" align="end" />
            <div class="mt-1 text-[12px] text-ink-mute"><span class="font-display text-[16px] text-ink tabular">{{ num(r.qty) }}</span> {{ t(r.unit) }}</div>
          </div>
        </li>
      </ul>
      <table class="hidden w-full text-left text-[13.5px] lg:table">
        <thead><tr class="border-b border-line text-[12px] text-ink-mute">
          <th class="py-3.5 pl-6 pr-3 font-medium">{{ t('Medicine') }}</th><th class="px-3 py-3.5 font-medium">{{ t('Lot') }}</th>
          <th class="px-3 py-3.5 font-medium">{{ t('Expiry date') }}</th><th class="px-3 py-3.5 font-medium">{{ t('Time left') }}</th>
          <th class="px-3 py-3.5 text-right font-medium">{{ t('Quantity') }}</th><th class="hidden py-3.5 pl-3 pr-6 font-medium xl:table-cell">{{ t('Location') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in paged.items.value" :key="r.batch" class="border-b border-line/70 last:border-0" :class="r.expired && 'bg-alert-soft/40'">
            <td class="py-3 pl-6 pr-3 font-semibold text-ink">{{ r.medicine_name }}</td>
            <td class="font-label px-3 py-3 text-[11.5px] text-ink-mute">{{ r.batch }}</td>
            <td class="px-3 py-3 text-ink-soft">{{ date(r.expiry_date) }}</td>
            <td class="px-3 py-3"><ExpiryChip :date="r.expiry_date" :days="r.days_left" :show-date="false" /></td>
            <td class="px-3 py-3 text-right"><span class="font-display text-[17px] text-ink tabular">{{ num(r.qty) }}</span> <span class="text-ink-mute">{{ t(r.unit) }}</span></td>
            <td class="hidden py-3 pl-3 pr-6 xl:table-cell"><span v-if="r.location" class="font-label rounded-md bg-paper-deep px-2 py-1 text-[11.5px] text-ink-soft">{{ r.location }}</span><span v-else class="text-ink-faint">—</span></td>
          </tr>
        </tbody>
      </table>
      </template>

      <template v-else>
      <ul class="divide-y divide-line/70 lg:hidden">
        <li v-for="r in paged.items.value" :key="r.code" class="flex items-center gap-3 px-4 py-3.5">
          <div class="min-w-0 flex-1">
            <div class="truncate text-[14px] font-semibold text-ink">{{ r.name }}</div>
            <div class="mt-0.5 truncate text-[12px] text-ink-mute">{{ t(r.category) }} · {{ t('Minimum') }} {{ num(r.minimum) }}</div>
            <BlisterGauge class="mt-2" :stock="r.stock" :minimum="r.minimum" />
          </div>
          <div class="shrink-0 text-right">
            <div><span class="font-display text-[20px] leading-none tabular text-ink">{{ num(r.stock) }}</span> <span class="text-[11px] text-ink-mute">{{ t(r.unit) }}</span></div>
            <StatusBadge class="mt-1.5" :status="r.status" />
          </div>
        </li>
      </ul>
      <table class="hidden w-full text-left text-[13.5px] lg:table">
        <thead><tr class="border-b border-line text-[12px] text-ink-mute">
          <th class="py-3.5 pl-6 pr-3 font-medium">{{ t('Medicine') }}</th><th class="hidden px-3 py-3.5 font-medium xl:table-cell">{{ t('Category') }}</th>
          <th class="px-3 py-3.5 font-medium">{{ t('In stock') }}</th><th class="px-3 py-3.5 text-right font-medium">{{ t('Minimum') }}</th>
          <th class="px-3 py-3.5 font-medium">{{ t('Nearest expiry') }}</th><th class="py-3.5 pl-3 pr-6 font-medium">{{ t('Status') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in paged.items.value" :key="r.code" class="border-b border-line/70 last:border-0">
            <td class="py-3 pl-6 pr-3 font-semibold text-ink">{{ r.name }}</td>
            <td class="hidden px-3 py-3 text-ink-soft xl:table-cell">{{ t(r.category) }}</td>
            <td class="px-3 py-3">
              <span class="font-display text-[17px] text-ink tabular">{{ num(r.stock) }}</span> <span class="text-ink-mute">{{ t(r.unit) }}</span>
              <BlisterGauge class="mt-1.5" :stock="r.stock" :minimum="r.minimum" />
            </td>
            <td class="px-3 py-3 text-right text-ink-mute tabular">{{ num(r.minimum) }}</td>
            <td class="px-3 py-3"><ExpiryChip :date="r.nearest_expiry" /></td>
            <td class="py-3 pl-3 pr-6"><StatusBadge :status="r.status" /></td>
          </tr>
        </tbody>
      </table>
      </template>
    </div>
    <Pager v-model:page="paged.page.value" :pages="paged.pages.value" :total="paged.total.value" :size="paged.size" />
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FormControl, LoadingIndicator, toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ExpiryChip from '@/components/ExpiryChip.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import BlisterGauge from '@/components/BlisterGauge.vue'
import MedicinePicker from '@/components/MedicinePicker.vue'
import Pager from '@/components/Pager.vue'
import CancelledTag from '@/components/CancelledTag.vue'
import { usePaged } from '@/paging'
import { get } from '@/api'
import { t } from '@/i18n'
import { date, downloadCsv, num, today } from '@/format'
import { ui } from '@/ui'

const route = useRoute()
const router = useRouter()
const tabs = [
  { value: 'movements', label: 'Movements', icon: 'lucide-arrow-left-right' },
  { value: 'expiry', label: 'Expiry', icon: 'lucide-calendar-clock' },
  { value: 'stock', label: 'Stock levels', icon: 'lucide-boxes' },
]
const tab = ref(route.query.tab || 'movements')
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10) }
const from = ref(monthAgo())
const to = ref(today())
const kind = ref('')
const medicine = ref(null)
const days = ref('90')
const stockFilter = ref('all')
const movements = ref([])
const expiry = ref([])
const allStock = ref([])
const loading = ref(false)

const stock = computed(() => (stockFilter.value === 'low' ? allStock.value.filter((r) => r.is_low || r.is_out) : allStock.value))
const current = computed(() => (tab.value === 'movements' ? movements.value : tab.value === 'expiry' ? expiry.value : stock.value))

const paged = usePaged(current, 15)

async function load() {
  loading.value = true
  try {
    if (tab.value === 'movements')
      movements.value = await get('movements', { from_date: from.value, to_date: to.value, kind: kind.value, medicine: medicine.value, limit: 1000 })
    else if (tab.value === 'expiry') expiry.value = await get('expiring', { days: days.value })
    else allStock.value = await get('medicines')
  } catch (e) {
    toast.error(e.message)
  } finally {
    loading.value = false
  }
}

function exportCsv() {
  if (tab.value === 'movements')
    downloadCsv(`movements_${from.value}_${to.value}.csv`,
      [t('Date'), t('Medicine'), t('Direction'), t('Quantity'), t('Reason'), t('Recipient'), t('Lot'), t('By'), t('Balance'), t('Status')],
      movements.value.map((r) => [r.date, r.medicine_name, r.direction === 'in' ? t('In') : t('Out'), r.qty, t(r.reason || ''), r.recipient, r.batch, r.by, r.balance, r.cancelled ? t('Cancelled') : '']))
  else if (tab.value === 'expiry')
    downloadCsv(`expiry_${today()}.csv`, [t('Medicine'), t('Lot'), t('Expiry date'), t('Days left'), t('Quantity'), t('Unit'), t('Location')],
      expiry.value.map((r) => [r.medicine_name, r.batch, r.expiry_date, r.days_left, r.qty, r.unit, r.location]))
  else
    downloadCsv(`stock_${today()}.csv`, [t('Medicine'), t('Category'), t('In stock'), t('Unit'), t('Minimum'), t('Nearest expiry'), t('Status')],
      stock.value.map((r) => [r.name, t(r.category), r.stock, r.unit, r.minimum, r.nearest_expiry, r.status]))
}

const print = () => window.print()

watch(tab, () => router.replace({ query: { tab: tab.value } }))
watch([tab, from, to, kind, medicine, days], load, { immediate: true })
watch(() => ui.version, load)
</script>
