<template>
  <div>
    <div v-if="!m" class="space-y-4">
      <div class="h-20 w-1/2 animate-pulse rounded-[18px] bg-paper-deep" />
      <div class="surface h-44 animate-pulse" />
    </div>
    <template v-else>
      <PageHeader :title="m.name" back="/medicines" :back-label="t('Medicines')">
        <template #meta>
          <div class="mt-3 flex flex-wrap items-center gap-2.5 text-[13px] text-ink-mute">
            <StatusBadge :status="m.status" />
            <span>{{ t(m.category) }}</span>
            <span v-if="m.form || m.strength" class="text-ink-faint">·</span>
            <span v-if="m.form || m.strength">{{ [m.strength, t(m.form || '')].filter(Boolean).join(' · ') }}</span>
          </div>
        </template>
        <template #actions>
          <Btn variant="ghost" icon="lucide-pencil" :label="t('Edit')" @click="openMedicine(m.code)" />
          <Btn variant="ghost" icon="lucide-trash-2" :label="t('Delete')" @click="confirmDelete" />
          <Btn icon="lucide-clipboard-list" :label="t('Request')" @click="openRequest(m.code, Math.max(m.minimum * 2 - m.stock, 1))" />
          <Btn icon="lucide-hand-heart" :label="t('Give out')" :to="{ path: '/give-out', query: { medicine: m.code } }" />
          <Btn variant="primary" icon="lucide-plus" :label="t('Add stock')" @click="openAddStock(m.code)" />
        </template>
      </PageHeader>

      <!-- shelf label -->
      <section class="surface rise grid overflow-hidden xl:grid-cols-[1.3fr_1fr_1fr_1fr]">
        <div class="border-b border-line p-6 xl:border-b-0 xl:border-r">
          <p class="eyebrow">{{ t('In stock') }}</p>
          <div class="mt-3 flex items-baseline gap-2">
            <span class="font-display text-[56px] leading-none tabular" :class="m.is_out ? 'text-alert' : m.is_low ? 'text-warn' : 'text-ink'">{{ num(m.stock) }}</span>
            <span class="text-[15px] text-ink-mute">{{ t(m.unit) }}</span>
          </div>
          <BlisterGauge class="mt-4" :stock="m.stock" :minimum="m.minimum" :cells="10" size="lg" />
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 xl:contents">
          <div class="border-b border-line p-5 sm:border-b-0 sm:border-r md:p-6">
            <p class="eyebrow">{{ t('Minimum') }}</p>
            <p class="mt-3 font-display text-[30px] leading-none text-ink tabular">{{ num(m.minimum) }}</p>
            <p class="mt-2 text-[12.5px]" :class="m.is_low || m.is_out ? 'text-warn' : 'text-ink-mute'">
              {{ m.is_low || m.is_out ? t('Below minimum — request more') : t('Alert when stock reaches it') }}</p>
          </div>
          <div class="border-b border-line p-5 sm:border-b-0 sm:border-r md:p-6">
            <p class="eyebrow">{{ t('Nearest expiry') }}</p>
            <p class="mt-3 font-display text-[30px] leading-none text-ink">{{ m.nearest_expiry ? date(m.nearest_expiry, { month: 'short', year: 'numeric' }) : '—' }}</p>
            <ExpiryChip v-if="m.nearest_expiry" class="mt-2" :date="m.nearest_expiry" :show-date="false" />
          </div>
          <div class="p-5 md:p-6">
            <p class="eyebrow">{{ t('Storage location') }}</p>
            <p class="font-label mt-3 text-[20px] leading-none text-ink">{{ m.location || '—' }}</p>
            <p class="mt-2 text-[12.5px] text-ink-mute">{{ t('{0} batch(es) on the shelf', m.batches.length) }}</p>
          </div>
        </div>
      </section>

      <div v-if="m.has_expired" class="mt-4 flex flex-wrap items-center gap-3 rounded-[18px] border border-alert/15 bg-alert-soft p-4 text-alert">
        <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-card/70"><span class="lucide-octagon-alert size-4" /></span>
        <div class="min-w-0 flex-1 text-[13.5px]">
          <div class="font-semibold">{{ t('{0} {1} have expired', num(m.expired_qty), t(m.unit)) }}</div>
          <div class="text-alert/80">{{ t('Expired stock cannot be given to patients. Remove it from the shelf and record it as expired.') }}</div>
        </div>
        <Btn variant="danger" size="sm" :label="t('Record as expired')" :to="{ path: '/give-out', query: { medicine: m.code, reason: 'Expired stock' } }" />
      </div>

      <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <Panel :title="t('Batches on the shelf')" :count="m.batches.length">
          <EmptyState v-if="!m.batches.length" icon="lucide-package-open" :title="t('No stock')" :text="t('Add stock when a delivery arrives.')" />
          <ul v-else class="space-y-2 px-4 pb-4">
            <li v-for="(b, i) in m.batches" :key="b.batch"
              class="flex items-center gap-4 rounded-[14px] border px-4 py-3.5" :class="i === firstValid ? 'border-apo/25 bg-apo-mist' : b.expired ? 'border-alert/20 bg-alert-soft/50' : 'border-line bg-card'">
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="font-label text-[13px] font-medium text-ink">{{ b.batch }}</span>
                  <span v-if="i === firstValid" class="rounded-full bg-apo px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-on-apo">{{ t('Give out first') }}</span>
                </div>
                <div class="font-label mt-1 text-[11.5px] uppercase text-ink-mute">{{ t('Exp') }} {{ b.expiry_date.slice(5, 7) }}/{{ b.expiry_date.slice(0, 4) }}</div>
              </div>
              <div class="text-right">
                <div class="font-display text-[24px] leading-none text-ink tabular">{{ num(b.qty) }}</div>
                <ExpiryChip class="mt-1" :date="b.expiry_date" :days="b.days_left" :show-date="false" align="end" />
              </div>
            </li>
          </ul>
        </Panel>

        <Panel :title="t('History')">
          <EmptyState v-if="!m.movements.length" icon="lucide-history" :title="t('No movements yet')" />
          <ol v-else class="relative px-5 pb-4">
            <li v-for="(x, i) in m.movements" :key="i" class="relative flex gap-4 pb-4 last:pb-1">
              <div class="flex flex-col items-center">
                <span class="mt-1 size-2.5 shrink-0 rounded-full ring-4" :class="x.direction === 'in' ? 'bg-apo-mid ring-apo-soft' : 'bg-warn-mid ring-warn-soft'" />
                <span v-if="i < m.movements.length - 1" class="mt-1 w-px flex-1 bg-line" />
              </div>
              <div class="flex min-w-0 flex-1 items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="text-[14px] font-semibold text-ink">{{ t(x.reason) }}<span v-if="x.recipient" class="font-normal text-ink-mute"> · {{ x.recipient }}</span> <CancelledTag v-if="x.cancelled" class="ml-1 align-middle" /></div>
                  <div class="mt-0.5 truncate text-[12.5px] text-ink-mute">{{ date(x.date) }} · {{ x.by }}<template v-if="x.batch"> · <span class="font-label text-[11.5px]">{{ x.batch }}</span></template></div>
                </div>
                <div class="text-right">
                  <div class="font-display text-[19px] leading-none tabular" :class="[x.direction === 'in' ? 'text-apo' : 'text-ink', x.cancelled && 'line-through opacity-50']">
                    {{ x.direction === 'in' ? '+' : '−' }}{{ num(x.qty) }}
                  </div>
                  <div v-if="!x.cancelled" class="mt-1 text-[11.5px] text-ink-mute tabular">{{ t('left') }} {{ num(x.balance) }}</div>
                </div>
              </div>
            </li>
          </ol>
        </Panel>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { toast, dialog } from 'frappe-ui'
import { useRouter } from 'vue-router'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import Panel from '@/components/Panel.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import CancelledTag from '@/components/CancelledTag.vue'
import ExpiryChip from '@/components/ExpiryChip.vue'
import BlisterGauge from '@/components/BlisterGauge.vue'
import { get, post } from '@/api'
import { t } from '@/i18n'
import { date, num } from '@/format'
import { ui, changed, openAddStock, openMedicine, openRequest } from '@/ui'

const props = defineProps({ code: String })
const m = ref(null)
const firstValid = computed(() => (m.value?.batches || []).findIndex((b) => !b.expired))

async function load() {
  try {
    m.value = await get('medicine', { code: props.code })
  } catch (e) {
    toast.error(e.message)
  }
}

const router = useRouter()
function confirmDelete() {
  dialog.danger({
    title: t('Delete {0}?', m.value.name),
    message: t('It disappears from the medicine list. Its past movements stay in the records.'),
    confirmLabel: t('Delete'),
    onConfirm: async () => {
      try {
        await post('delete_medicine', { code: m.value.code })
        toast.success(t('{0} was deleted', m.value.name))
        router.push('/medicines')
        changed()
      } catch (e) {
        toast.error(e.message)
      }
    },
  })
}
onMounted(load)
watch(() => ui.version, load)
</script>
