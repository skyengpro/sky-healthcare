<template>
  <div>
    <PageHeader :eyebrow="t('Ordering')" :title="t('Medical requests')"
      :subtitle="session.isAdmin ? t('Approve or reject what your team asks for.') : t('Ask for medicines you need before ordering.')">
      <template #actions>
        <Btn variant="primary" icon="lucide-plus" :label="t('New request')" @click="openRequest()" />
      </template>
    </PageHeader>

    <div class="mb-5 flex items-start gap-3 rounded-[16px] border border-line bg-card/60 px-4 py-3.5 text-[13.5px] text-ink-soft">
      <span class="lucide-info mt-0.5 size-4 shrink-0 text-apo" />
      <p>{{ t('A request means "we need it". Stock only goes up when the delivery arrives and someone records it with Add stock.') }}</p>
    </div>

    <div class="scrollbar-none -mx-4 mb-5 flex gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0">
      <button v-for="s in tabs" :key="s.value" class="flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition"
        :class="status === s.value ? 'border-ink bg-ink text-on-ink' : 'border-line bg-card text-ink-soft hover:border-line-strong hover:text-ink'"
        @click="status = s.value">
        {{ t(s.label) }} <span class="tabular" :class="status === s.value ? 'text-on-ink/60' : 'text-ink-faint'">{{ count(s.value) }}</span>
      </button>
    </div>

    <div v-if="!rows" class="space-y-2.5"><div v-for="i in 4" :key="i" class="surface h-24 animate-pulse" /></div>
    <div v-else-if="!shown.length" class="surface">
      <EmptyState icon="lucide-clipboard-list" :title="t('No requests here')" :text="t('Requests you send appear in this list.')">
        <Btn variant="primary" icon="lucide-plus" :label="t('New request')" @click="openRequest()" />
      </EmptyState>
    </div>
    <ul v-else class="space-y-2.5">
      <li v-for="r in paged.items.value" :key="r.name" class="surface cursor-pointer p-4 transition hover:border-line-strong md:p-5"
        role="button" tabindex="0" @click="viewRequest(r)" @keydown.enter.self="viewRequest(r)">
        <div class="flex flex-wrap items-start gap-4">
          <div class="flex size-11 shrink-0 items-center justify-center rounded-full" :class="urgencyTone(r.urgency, r.automatic)">
            <span :class="r.automatic ? 'lucide-repeat' : 'lucide-clipboard-list'" class="size-[18px]" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span class="text-[15px] font-semibold text-ink">{{ r.medicine_name || r.medicine }}</span>
              <span class="font-display text-[19px] leading-none text-ink-soft tabular">× {{ num(r.qty) }}</span>
              <span v-if="r.items?.length > 1" class="text-[13px] font-medium text-ink-mute">{{ t('+{0} more', r.items.length - 1) }}</span>
              <span v-if="r.urgency && r.urgency !== 'Routine'" class="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide"
                :class="r.urgency === 'Emergency' ? 'bg-alert-soft text-alert' : 'bg-warn-soft text-warn'">{{ t(r.urgency) }}</span>
            </div>
            <div class="mt-1 text-[12.5px] text-ink-mute">
              {{ r.requested_by }} · {{ date(r.date) }} · {{ t('needed by {0}', date(r.needed_by)) }}
            </div>
            <p v-if="r.reason" class="mt-2.5 font-display text-[16px] italic leading-snug text-ink-soft">“{{ r.reason }}”</p>
            <p v-if="r.note" class="mt-2 text-[12.5px] text-ink-mute"><span class="font-semibold">{{ t('Note') }}:</span> {{ r.note }}</p>
          </div>
          <div class="flex w-full items-center justify-between gap-2 sm:w-auto sm:flex-col sm:items-end">
            <StatusBadge :status="r.state" />
            <PendingTag :show="r.pending" />
            <div v-if="session.isAdmin && r.state === 'pending'" class="flex gap-2" @click.stop @keydown.enter.stop>
              <Btn size="sm" variant="danger" :label="t('Reject')" @click="decide(r, 'reject')" />
              <Btn size="sm" variant="brand" icon="lucide-check" :label="t('Approve')" @click="decide(r, 'approve')" />
            </div>
          </div>
        </div>
      </li>
    </ul>
    <Pager v-if="shown.length" v-model:page="paged.page.value" :pages="paged.pages.value" :total="paged.total.value" :size="paged.size" />
  </div>
</template>

<script setup>
import PendingTag from '@/components/PendingTag.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { dialog, toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import EmptyState from '@/components/EmptyState.vue'
import Pager from '@/components/Pager.vue'
import { usePaged } from '@/paging'
import { get, post } from '@/api'
import { t } from '@/i18n'
import { date, num } from '@/format'
import { session } from '@/session'
import { ui, changed, openRequest, viewRequest } from '@/ui'

const route = useRoute()
const router = useRouter()
const rows = ref(null)
const status = ref(route.query.status || 'all')
const tabs = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
]
const shown = computed(() => (rows.value || []).filter((r) => status.value === 'all' || r.state === status.value))
const paged = usePaged(shown, 8)
const count = (s) => (rows.value || []).filter((r) => s === 'all' || r.state === s).length
const urgencyTone = (u, auto) => (auto ? 'bg-paper-deep text-ink-soft' : u === 'Emergency' ? 'bg-alert-soft text-alert' : u === 'Urgent' ? 'bg-warn-soft text-warn' : 'bg-apo-soft text-apo')

watch(status, () => router.replace({ query: status.value === 'all' ? {} : { status: status.value } }))

function decide(r, action) {
  const approve = action === 'approve'
  dialog.prompt({
    title: approve ? t('Approve this request?') : t('Reject this request?'),
    message: (r.items || [r]).map((i) => `${i.medicine_name} × ${num(i.qty)}`).join(', '),
    theme: approve ? 'green' : 'red',
    confirmLabel: approve ? t('Approve') : t('Reject'),
    fields: [{ name: 'note', label: t('Note (optional)'), type: 'textarea' }],
    onConfirm: async ({ values }) => {
      await post('decide_request', { name: r.name, action, note: values?.note || '' })
      toast.success(approve ? t('Request approved') : t('Request rejected'))
      changed()
    },
  })
}

async function load() {
  try {
    rows.value = await get('requests')
  } catch (e) {
    toast.error(e.message)
    rows.value = rows.value || []
  }
}
onMounted(load)
watch(() => ui.version, load)
</script>
