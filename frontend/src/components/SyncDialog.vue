<template>
  <Sheet v-model:open="ui.sync.open" :title="t('Changes saved on this device')" icon="lucide-refresh-cw" theme="blue" size="lg"
    :message="t('These changes were made without a connection. They are sent automatically when you are online.')">
    <div v-if="!net.outbox.length" class="py-6 text-center text-sm text-ink-gray-5">{{ t('Everything is sent.') }}</div>
    <ul v-else class="divide-y divide-outline-gray-1 rounded-4 border border-outline-gray-1">
      <li v-for="item in net.outbox" :key="item.id" class="flex items-start justify-between gap-3 p-3">
        <div class="min-w-0">
          <div class="text-base font-medium text-ink-gray-8">{{ item.label }} · {{ item.data.medicine }}</div>
          <div class="text-sm text-ink-gray-5">{{ t('Quantity') }} {{ num(item.data.qty) }} · {{ date(new Date(item.at), { dateStyle: 'medium', timeStyle: 'short' }) }}</div>
          <div v-if="item.status === 'failed'" class="mt-1 text-sm text-ink-red-4">{{ item.error }}</div>
        </div>
        <Badge v-if="item.status === 'waiting'" theme="blue" :label="t('Waiting')" />
        <Btn v-else size="sm" variant="danger" :label="t('Discard')" @click="discard(item.id)" />
      </li>
    </ul>
    <template #actions>
        <Btn variant="ghost" :label="t('Close')" @click="ui.sync.open = false" />
        <Btn variant="primary" :label="t('Send now')" :disabled="!net.online" :loading="net.syncing" icon="lucide-upload" @click="sendNow" />
    </template>
  </Sheet>
</template>

<script setup>
import Sheet from './Sheet.vue'
import { Badge, toast } from 'frappe-ui'
import Btn from './Btn.vue'
import { net, flush, discard } from '@/api'
import { t } from '@/i18n'
import { num, date } from '@/format'
import { ui, changed } from '@/ui'

async function sendNow() {
  const sent = await flush()
  if (sent) {
    toast.success(t('{0} change(s) sent', sent))
    changed()
  }
}
</script>
