<template>
  <div>
    <PageHeader :eyebrow="t('Inventory')" :title="t('Medicines')" :subtitle="rows ? t('{0} medicines on your list', rows.length) : ''">
      <template #actions>
        <Btn icon="lucide-package-plus" :label="t('Add stock')" @click="openAddStock()" />
        <Btn variant="primary" icon="lucide-plus" :label="t('New medicine')" @click="openMedicine()" />
      </template>
    </PageHeader>

    <div class="mb-4 flex flex-col gap-2.5 lg:flex-row lg:items-center">
      <label class="relative block flex-1">
        <span class="lucide-search pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
        <input v-model="search" type="search" :placeholder="t('Search by name…')"
          class="h-11 w-full rounded-full border border-line bg-card pl-11 pr-4 text-[14px] text-ink shadow-card outline-none transition placeholder:text-ink-faint focus:border-apo-mid focus:ring-4 focus:ring-apo/10" />
      </label>
      <div class="grid gap-2.5 sm:grid-cols-2 lg:flex">
        <Select v-model="category" :options="categoryOptions" class="lg:w-52" variant="outline" size="md" />
        <FormControl v-model="expiryBefore" type="date" format="D MMM YYYY" variant="outline" size="md" :placeholder="t('Expires before…')" class="lg:w-48" />
      </div>
    </div>

    <div class="scrollbar-none -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
      <button v-for="s in statuses" :key="s.value" class="flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition"
        :class="status === s.value ? 'border-ink bg-ink text-on-ink' : 'border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink'"
        @click="status = s.value">
        <span v-if="s.dot" class="size-1.5 rounded-full" :class="status === s.value ? 'bg-card' : s.dot" />
        {{ t(s.label) }}
        <span class="tabular" :class="status === s.value ? 'text-on-ink/60' : 'text-ink-faint'">{{ counts[s.value] }}</span>
      </button>
    </div>

    <div v-if="!rows" class="surface divide-y divide-line">
      <div v-for="i in 6" :key="i" class="h-[72px] animate-pulse" />
    </div>
    <div v-else-if="!filtered.length" class="surface">
      <EmptyState icon="lucide-pill" :title="search || status !== 'all' || category || expiryBefore ? t('No medicine matches') : t('No medicines yet')"
        :text="search || status !== 'all' ? t('Try another search or filter.') : t('Add your first medicine to start tracking stock.')">
        <Btn v-if="!search && status === 'all'" variant="primary" icon="lucide-plus" :label="t('New medicine')" @click="openMedicine()" />
      </EmptyState>
    </div>
    <template v-else>
      <!-- desktop table -->
      <div class="surface hidden overflow-hidden lg:block">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-line text-[12px] font-medium text-ink-mute">
              <th class="py-3.5 pl-6 pr-3 font-medium">{{ t('Medicine') }}</th>
              <th class="px-3 py-3.5 font-medium">{{ t('In stock') }}</th>
              <th class="px-3 py-3.5 font-medium">{{ t('Nearest expiry') }}</th>
              <th class="hidden px-3 py-3.5 font-medium xl:table-cell">{{ t('Location') }}</th>
              <th class="px-3 py-3.5 font-medium">{{ t('Status') }}</th>
              <th class="w-px py-3.5 pl-1 pr-6" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="m in paged.items.value" :key="m.code" class="group cursor-pointer border-b border-line/70 transition last:border-0 hover:bg-paper/60" @click="open(m)">
              <td class="py-4 pl-6 pr-3">
                <div class="text-[14.5px] font-semibold text-ink">{{ m.name }}</div>
                <div class="mt-0.5 text-[12.5px] text-ink-mute">{{ [t(m.category), m.strength, t(m.form || '')].filter(Boolean).join(' · ') }}</div>
              </td>
              <td class="px-3 py-4">
                <div class="flex items-baseline gap-1.5">
                  <span class="font-display text-[22px] leading-none tabular" :class="m.is_out ? 'text-alert' : m.is_low ? 'text-warn' : 'text-ink'">{{ num(m.stock) }}</span>
                  <span class="text-[12px] text-ink-mute">{{ t(m.unit) }}</span>
                </div>
                <BlisterGauge class="mt-2" :stock="m.stock" :minimum="m.minimum" />
              </td>
              <td class="px-3 py-4"><ExpiryChip :date="m.nearest_expiry" /></td>
              <td class="hidden px-3 py-4 xl:table-cell">
                <span v-if="m.location" class="font-label rounded-md bg-paper-deep px-2 py-1 text-[11.5px] text-ink-soft">{{ m.location }}</span>
                <span v-else class="text-ink-faint">—</span>
              </td>
              <td class="px-3 py-4"><StatusBadge :status="m.status" /></td>
              <td class="py-4 pl-3 pr-6">
                <Btn size="sm" icon="lucide-plus" :label="t('Stock')" @click.stop="openAddStock(m.code)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- mobile cards -->
      <ul class="grid gap-2.5 sm:grid-cols-2 lg:hidden">
        <li v-for="m in paged.items.value" :key="m.code" class="surface cursor-pointer p-4 active:bg-paper" @click="open(m)">
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="truncate text-[15px] font-semibold text-ink">{{ m.name }}</div>
              <div class="mt-0.5 truncate text-[12.5px] text-ink-mute">{{ [t(m.category), m.strength].filter(Boolean).join(' · ') }}</div>
            </div>
            <StatusBadge :status="m.status" />
          </div>
          <div class="mt-3.5 flex items-end justify-between gap-3">
            <div>
              <div class="flex items-baseline gap-1.5">
                <span class="font-display text-[26px] leading-none tabular" :class="m.is_out ? 'text-alert' : m.is_low ? 'text-warn' : 'text-ink'">{{ num(m.stock) }}</span>
                <span class="text-[12px] text-ink-mute">{{ t(m.unit) }}</span>
              </div>
              <BlisterGauge class="mt-2" :stock="m.stock" :minimum="m.minimum" />
            </div>
            <ExpiryChip :date="m.nearest_expiry" align="end" />
          </div>
          <div class="mt-3.5 flex items-center justify-between gap-3 border-t border-line/70 pt-3">
            <span class="truncate text-[12px] text-ink-mute">{{ m.location || '' }}</span>
            <Btn size="sm" icon="lucide-plus" :label="t('Add stock')" @click.stop="openAddStock(m.code)" />
          </div>
        </li>
      </ul>
      <Pager v-model:page="paged.page.value" :pages="paged.pages.value" :total="paged.total.value" :size="paged.size" />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { FormControl, Select, toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import ExpiryChip from '@/components/ExpiryChip.vue'
import BlisterGauge from '@/components/BlisterGauge.vue'
import Pager from '@/components/Pager.vue'
import { usePaged } from '@/paging'
import { get } from '@/api'
import { t } from '@/i18n'
import { num } from '@/format'
import { session } from '@/session'
import { ui, openAddStock, openMedicine } from '@/ui'

const route = useRoute()
const router = useRouter()
const rows = ref(null)
const search = ref(route.query.q || '')
const status = ref(route.query.status || 'all')
const category = ref(route.query.category || '')
const expiryBefore = ref(route.query.before || '')

const statuses = [
  { value: 'all', label: 'All' },
  { value: 'low', label: 'Low stock', dot: 'bg-warn-mid' },
  { value: 'out', label: 'Out of stock', dot: 'bg-alert' },
  { value: 'expiring', label: 'Expiring soon', dot: 'bg-warn-mid' },
  { value: 'expired', label: 'Expired', dot: 'bg-alert' },
  { value: 'ok', label: 'In stock', dot: 'bg-apo-mid' },
]
const categoryOptions = computed(() => [
  { label: t('All categories'), value: '' },
  ...session.options.categories.map((c) => ({ label: t(c), value: c })),
])

const match = (m, s) =>
  s === 'all' ? true : s === 'ok' ? m.status === 'ok' : s === 'low' ? m.is_low || m.is_out : s === 'out' ? m.is_out :
    s === 'expiring' ? m.is_expiring : s === 'expired' ? m.has_expired : true

const base = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (rows.value || []).filter((m) =>
    (!q || m.name.toLowerCase().includes(q) || m.code.toLowerCase().includes(q)) &&
    (!category.value || m.category === category.value) &&
    (!expiryBefore.value || (m.nearest_expiry && m.nearest_expiry <= expiryBefore.value)))
})
const filtered = computed(() => base.value.filter((m) => match(m, status.value)))
const paged = usePaged(filtered, 12)
const counts = computed(() => Object.fromEntries(statuses.map((s) => [s.value, base.value.filter((m) => match(m, s.value)).length])))
const open = (m) => router.push({ name: 'medicine', params: { code: m.code } })

watch([search, status, category, expiryBefore], () => {
  router.replace({ query: { ...(search.value && { q: search.value }), ...(status.value !== 'all' && { status: status.value }),
    ...(category.value && { category: category.value }), ...(expiryBefore.value && { before: expiryBefore.value }) } })
})

async function load() {
  try {
    rows.value = await get('medicines')
  } catch (e) {
    toast.error(e.message)
    rows.value = rows.value || []
  }
}
onMounted(load)
watch(() => ui.version, load)
</script>
