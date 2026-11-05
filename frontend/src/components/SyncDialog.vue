<template>
  <Sheet v-model:open="ui.sync.open" :title="t('Changes saved on this device')" icon="lucide-refresh-cw" theme="blue" size="lg"
    :message="t('These changes are saved on this device. They are sent automatically when you are online.')">
    <div v-if="!net.outbox.length" class="py-6 text-center text-sm text-ink-gray-5">{{ t('Everything is sent.') }}</div>
    <ul v-else class="divide-y divide-outline-gray-1 rounded-4 border border-outline-gray-1">
      <li v-for="item in net.outbox" :key="item.id" class="flex items-start justify-between gap-3 p-3">
        <div class="min-w-0">
          <div class="text-base font-medium text-ink-gray-8">{{ item.label }}<template v-if="item.summary"> · {{ item.summary }}</template></div>
          <div class="text-sm text-ink-gray-5">{{ date(new Date(item.at), { dateStyle: 'medium', timeStyle: 'short' }) }}</div>
          <div v-if="item.status === 'failed'" class="mt-1 text-sm text-ink-red-4">{{ item.error }}</div>
        </div>
        <Badge v-if="item.status !== 'failed'" theme="blue" :label="item.status === 'sending' ? t('Sending') : t('Waiting')" />
        <div v-else class="flex shrink-0 gap-1.5">
          <Btn size="sm" variant="ghost" :label="t('Try again')" @click="retry(item.id)" />
          <Btn size="sm" variant="danger" :label="t('Discard')" @click="discard(item.id)" />
        </div>
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
import { net, flush, discard, retry } from '@/api'
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
