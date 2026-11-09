<template>
  <div>
    <PageHeader :eyebrow="t('Care')" :title="t('Patients')" :subtitle="rows ? t('{0} patients registered', rows.length) : ''">
      <template #actions>
        <Btn icon="lucide-stethoscope" :label="t('Record a treatment')" @click="openProcedure()" />
        <Btn variant="primary" icon="lucide-user-round-plus" :label="t('New patient')" @click="openPatient()" />
      </template>
    </PageHeader>

    <label class="relative mb-5 block">
      <span class="lucide-search pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-mute" />
      <input v-model="search" type="search" :placeholder="t('Search by name or phone…')"
        class="h-11 w-full rounded-full border border-line bg-card pl-11 pr-4 text-[14px] text-ink shadow-card outline-none transition placeholder:text-ink-faint focus:border-apo-mid focus:ring-4 focus:ring-apo/10" />
    </label>

    <div v-if="!rows" class="surface divide-y divide-line"><div v-for="i in 5" :key="i" class="h-[68px] animate-pulse" /></div>
    <div v-else-if="!filtered.length" class="surface">
      <EmptyState icon="lucide-users-round" :title="search ? t('No patient matches') : t('No patients yet')"
        :text="search ? t('Try another name or phone number.') : t('Register a patient to record the care they receive.')">
        <Btn v-if="!search" variant="primary" icon="lucide-user-round-plus" :label="t('New patient')" @click="openPatient()" />
      </EmptyState>
    </div>
    <template v-else>
      <!-- desktop table -->
      <div class="surface hidden overflow-hidden lg:block">
        <table class="w-full text-left">
          <thead>
            <tr class="border-b border-line text-[12px] text-ink-mute">
              <th class="py-3.5 pl-6 pr-3 font-medium">{{ t('Patient') }}</th>
              <th class="px-3 py-3.5 font-medium">{{ t('Phone') }}</th>
              <th class="px-3 py-3.5 font-medium">{{ t('Treatments') }}</th>
              <th class="px-3 py-3.5 font-medium">{{ t('Last visit') }}</th>
              <th class="w-px py-3.5 pl-1 pr-6" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in paged.items.value" :key="p.name" class="cursor-pointer border-b border-line/70 transition last:border-0 hover:bg-paper/60" @click="open(p)">
              <td class="py-3.5 pl-6 pr-3">
                <div class="flex items-center gap-3">
                  <Initials :name="p.patient_name" />
                  <div class="min-w-0">
                    <div class="flex items-center gap-2 truncate text-[14.5px] font-semibold text-ink">{{ p.patient_name }} <PendingTag :show="p.pending" /></div>
                    <div class="mt-0.5 text-[12.5px] text-ink-mute">{{ patientMeta(p) }}</div>
                  </div>
                </div>
              </td>
              <td class="px-3 py-3.5 text-[13.5px] text-ink-soft tabular">{{ p.mobile || '—' }}</td>
              <td class="px-3 py-3.5"><span class="font-display text-[20px] text-ink tabular">{{ p.procedures }}</span></td>
              <td class="px-3 py-3.5 text-[13.5px] text-ink-soft">{{ p.last_visit ? date(p.last_visit) : '—' }}</td>
              <td class="py-3.5 pl-1 pr-6">
                <Btn size="sm" icon="lucide-plus" :label="t('Treatment')" @click.stop="openProcedure(p.name)" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- phone and tablet cards -->
      <ul class="grid gap-2.5 sm:grid-cols-2 lg:hidden">
        <li v-for="p in paged.items.value" :key="p.name" class="surface cursor-pointer p-4 active:bg-paper" @click="open(p)">
          <div class="flex items-center gap-3">
            <Initials :name="p.patient_name" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2 truncate text-[15px] font-semibold text-ink">{{ p.patient_name }} <PendingTag :show="p.pending" /></div>
              <div class="mt-0.5 truncate text-[12.5px] text-ink-mute">{{ patientMeta(p) }}</div>
            </div>
          </div>
          <div class="mt-3.5 flex items-center justify-between gap-3 border-t border-line/70 pt-3">
            <span class="truncate text-[12px] text-ink-mute">
              {{ p.last_visit ? t('Last visit {0}', date(p.last_visit)) : t('No treatment yet') }}
            </span>
            <Btn size="sm" icon="lucide-plus" :label="t('Treatment')" @click.stop="openProcedure(p.name)" />
          </div>
        </li>
      </ul>
      <Pager v-model:page="paged.page.value" :pages="paged.pages.value" :total="paged.total.value" :size="paged.size" />
    </template>
  </div>
</template>

<script setup>
import PendingTag from '@/components/PendingTag.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import Initials from '@/components/Initials.vue'
import Pager from '@/components/Pager.vue'
import { usePaged } from '@/paging'
import { get } from '@/api'
import { t } from '@/i18n'
import { date } from '@/format'
import { patientMeta } from '@/care'
import { ui, H, openPatient, openProcedure } from '@/ui'

const router = useRouter()
const rows = ref(null)
const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (rows.value || []).filter((p) => !q || p.patient_name.toLowerCase().includes(q) || (p.mobile || '').replace(/\s/g, '').includes(q.replace(/\s/g, '')))
})
const paged = usePaged(filtered, 12)
const open = (p) => router.push({ name: 'patient', params: { name: p.name } })

async function load() {
  try {
    rows.value = await get(H('patients'))
  } catch (e) {
    toast.error(e.message)
    rows.value = rows.value || []
  }
}
onMounted(load)
watch(() => ui.version, load)
</script>
