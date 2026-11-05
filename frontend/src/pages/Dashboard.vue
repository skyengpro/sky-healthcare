<template>
  <div>
    <div class="rise mb-8 flex flex-wrap items-end justify-between gap-5">
      <div>
        <p class="eyebrow mb-2">{{ date(new Date(), { weekday: 'long', day: 'numeric', month: 'long' }) }}</p>
        <h1 class="font-display text-[30px] leading-[1.08] text-ink md:text-[44px]">{{ greeting }}, <em class="italic text-apo">{{ firstName }}</em></h1>
        <p v-if="data" class="mt-2 text-[14px] text-ink-mute md:text-[15px]">{{ summary }}</p>
      </div>
      <div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto">
        <Btn icon="lucide-clipboard-list" :label="t('Medical request')" @click="openRequest()" />
        <Btn class="hidden sm:inline-flex" icon="lucide-hand-heart" :label="t('Give out')" to="/give-out" />
        <Btn v-if="session.health" class="hidden md:inline-flex" icon="lucide-stethoscope" :label="t('Record a treatment')" @click="openProcedure()" />
        <Btn variant="primary" icon="lucide-plus" :label="t('Add stock')" @click="openAddStock()" />
      </div>
    </div>

    <div v-if="!data" class="grid grid-cols-3 gap-4">
      <div v-for="i in 3" :key="i" class="surface h-[130px] animate-pulse" />
    </div>
    <template v-else>
      <div class="grid gap-3 md:gap-4" :class="data.care ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'">
        <StatCard :label="t('Medicines')" :value="num(c.medicines)" icon="lucide-pill" to="/medicines" :hint="t('{0} units in total', num(c.units))" />
        <StatCard :label="t('To restock')" :value="num(c.low)" icon="lucide-trending-down" to="/medicines?status=low"
          :tone="c.low ? 'red' : 'green'" :hint-tone="c.low ? 'red' : null" :hint="c.low ? t('need restocking') : t('All stocked')" />
        <StatCard :label="t('Expiring soon')" :value="num(c.expiring + c.expired)" icon="lucide-calendar-clock" to="/medicines?status=expiring"
          :tone="c.expired ? 'red' : c.expiring ? 'amber' : 'green'" :hint-tone="c.expired ? 'red' : c.expiring ? 'amber' : null"
          :hint="c.expired ? t('{0} with expired stock', c.expired) : c.expiring ? t('within 90 days') : t('Nothing to throw away')" />
        <StatCard v-if="data.care" :label="t('Patients')" :value="num(data.care.patients)" to="/patients" icon="lucide-users-round" tone="blue"
          :hint="data.care.new_patients ? t('{0} new this month', data.care.new_patients) : t('None yet')" />
      </div>

      <!-- care: only with Frappe Health -->
      <template v-if="data.care">
        <p class="eyebrow mb-3 mt-8">{{ t('Care') }}</p>
        <div>
          <Panel :title="t('Recent consultations')">
                        <EmptyState v-if="!data.care.consultations.length" icon="lucide-notebook-pen" :title="t('No consultation yet')" :text="t('Open a patient and start a consultation.')">
              <Btn variant="primary" icon="lucide-users-round" :label="t('Patients')" to="/patients" />
            </EmptyState>
            <ul v-else class="px-2 pb-2">
              <li v-for="c in data.care.consultations" :key="c.name">
                <RouterLink :to="{ name: 'consultation', params: { name: c.name } }" class="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition hover:bg-paper">
                  <Initials :name="c.patient_name" size="sm" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[14px] font-semibold text-ink">{{ c.patient_name }}</div>
                    <div class="truncate text-[12.5px] text-ink-mute">{{ c.diagnoses[0] || c.symptoms[0] || t('Consultation') }} · {{ shortDate(c.encounter_date) }}</div>
                  </div>
                  <StatusBadge :status="c.state" />
                </RouterLink>
              </li>
            </ul>
          </Panel>
        </div>
        <div v-if="data.care.requested" class="mt-4 flex flex-wrap items-center gap-3 rounded-[16px] border border-warn/20 bg-warn-soft px-4 py-3 text-warn">
          <span class="lucide-stethoscope size-5 shrink-0" />
          <div class="min-w-0 flex-1 text-[13.5px]"><b>{{ t('{0} treatment(s) asked by a doctor, not recorded yet', data.care.requested) }}</b></div>
          <Btn size="sm" variant="brand" :label="t('See them')" to="/patients" />
        </div>
        <div class="mt-4">
          <Panel :title="t('Recent treatments')">
            <EmptyState v-if="!data.care.recent.length" icon="lucide-stethoscope" :title="t('No treatment yet')" :text="t('Record the care you give, and the medicines used leave the stock.')">
              <Btn variant="primary" icon="lucide-plus" :label="t('Record a treatment')" @click="openProcedure()" />
            </EmptyState>
            <ul v-else class="px-2 pb-2">
              <li v-for="x in data.care.recent" :key="x.name">
                <RouterLink :to="{ name: 'patient', params: { name: x.patient } }" class="flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition hover:bg-paper">
                  <Initials :name="x.patient_name" size="sm" />
                  <div class="min-w-0 flex-1">
                    <div class="truncate text-[14px] font-semibold text-ink">{{ x.patient_name }}</div>
                    <div class="truncate text-[12.5px] text-ink-mute">{{ x.procedure_template }} · {{ shortDate(x.start_date) }}</div>
                  </div>
                  <StatusBadge :status="x.state" />
                </RouterLink>
              </li>
            </ul>
          </Panel>
        </div>
      </template>

      <p v-if="data.care" class="eyebrow mb-3 mt-8">{{ t('Pharmacy') }}</p>
      <div class="grid gap-4 lg:grid-cols-2" :class="data.care ? '' : 'mt-4'">
        <Panel :title="t('Needs attention')">
          <template #actions><RouterLink to="/medicines?status=low" class="text-[13px] font-medium text-ink-mute hover:text-ink">{{ t('See all') }}</RouterLink></template>
          <EmptyState v-if="!attention.length" icon="lucide-circle-check" :title="t('All good')" :text="t('Nothing to restock and nothing expiring.')" />
          <ul v-else class="px-2 pb-2">
            <li v-for="a in attention" :key="a.key">
              <RouterLink :to="`/medicines/${encodeURIComponent(a.code)}`" class="flex items-center gap-3 rounded-[12px] px-3 py-3 transition hover:bg-paper">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[14px] font-semibold text-ink">{{ a.name }}</div>
                  <div class="mt-0.5 text-[12.5px] text-ink-mute">{{ a.detail }}</div>
                </div>
                <span class="shrink-0 text-[13px] font-medium text-alert">{{ a.tag }}</span>
              </RouterLink>
            </li>
          </ul>
        </Panel>

        <Panel :title="t('Recent movements')">
          <template #actions><RouterLink to="/reports" class="text-[13px] font-medium text-ink-mute hover:text-ink">{{ t('See all') }}</RouterLink></template>
          <EmptyState v-if="!data.recent.length" icon="lucide-arrow-left-right" :title="t('No movements yet')" :text="t('Stock you add or give out appears here.')" />
          <ul v-else class="px-2 pb-2">
            <li v-for="(m, i) in data.recent.slice(0, 5)" :key="i" class="flex items-center gap-3 rounded-[12px] px-3 py-2.5">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2"><span class="truncate text-[14px] font-semibold text-ink">{{ m.medicine_name }}</span><CancelledTag v-if="m.cancelled" /></div>
                <div class="truncate text-[12.5px] text-ink-mute">{{ t(m.reason) }} · {{ shortDate(m.date) }}</div>
              </div>
              <div class="font-display text-[19px] leading-none text-ink tabular" :class="m.cancelled && 'line-through opacity-50'">{{ m.direction === 'in' ? '+' : '−' }}{{ num(m.qty) }}</div>
            </li>
          </ul>
        </Panel>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import StatCard from '@/components/StatCard.vue'
import Panel from '@/components/Panel.vue'
import EmptyState from '@/components/EmptyState.vue'
import CancelledTag from '@/components/CancelledTag.vue'
import Initials from '@/components/Initials.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { get } from '@/api'
import { t } from '@/i18n'
import { date, num, shortDate } from '@/format'
import { session } from '@/session'
import { ui, openAddStock, openProcedure, openRequest } from '@/ui'

const data = ref(null)
const c = computed(() => data.value?.counts || {})
const firstName = computed(() => (session.user.full_name || '').split(' ')[0])
const greeting = computed(() => {
  const h = new Date().getHours()
  return h < 12 ? t('Good morning') : h < 18 ? t('Good afternoon') : t('Good evening')
})
// one plain sentence about today, so the dashboard starts with what matters
const summary = computed(() => {
  const parts = []
  if (c.value.low) parts.push(t('{0} medicine(s) to restock', c.value.low))
  if (c.value.expired) parts.push(t('{0} with expired stock', c.value.expired))
  else if (c.value.expiring) parts.push(t('{0} expiring soon', c.value.expiring))
  if (session.isAdmin && c.value.pending) parts.push(t('{0} request(s) to approve', c.value.pending))
  if (data.value?.care?.planned) parts.push(t('{0} treatment(s) planned', data.value.care.planned))
  return parts.length ? parts.join(' · ') : t('Everything is in order today.')
})
// low or out of stock first, then batches about to expire: at most six lines in all
const attention = computed(() => {
  const low = (data.value?.low || []).map((m) => ({
    key: `low-${m.code}`, code: m.code, name: m.name,
    detail: `${num(m.stock)} ${t(m.unit)} · ${t('min')} ${num(m.minimum)}`, tag: m.is_out ? t('Out of stock') : t('Low stock'),
  }))
  const exp = (data.value?.expiring || []).map((b) => ({
    key: `exp-${b.batch}`, code: b.medicine, name: b.medicine_name,
    detail: `${b.batch} · ${num(b.qty)} ${t(b.unit)}`, tag: b.expired ? t('Expired') : t('{0} days', b.days_left),
  }))
  return [...low, ...exp].slice(0, 6)
})

async function load() {
  try {
    data.value = await get('dashboard')
  } catch (e) {
    toast.error(e.message)
  }
}
onMounted(load)
watch(() => ui.version, load)
</script>
