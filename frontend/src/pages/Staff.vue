<template>
  <div>
    <PageHeader :eyebrow="t('Team')" :title="t('Staff')" :subtitle="session.health ? t('People who can use the app. Each one is also a doctor, so they can run consultations.') : t('People who can use the pharmacy app.')">
      <template #actions>
        <Btn variant="primary" icon="lucide-user-plus" :label="t('Add a person')" @click="edit()" />
      </template>
    </PageHeader>

    <div v-if="!rows" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><div v-for="i in 3" :key="i" class="surface h-44 animate-pulse" /></div>
    <div v-else-if="!rows.length" class="surface"><EmptyState icon="lucide-users-round" :title="t('No staff yet')" /></div>
    <ul v-else class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <li v-for="u in rows" :key="u.name" class="surface flex flex-col p-5" :class="!u.enabled && 'opacity-60'">
        <div class="flex items-start justify-between gap-3">
          <Initials :name="u.full_name" size="lg" />
          <span class="rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
            :class="u.role === 'Pharmacy Admin' ? 'bg-ink text-on-ink' : 'bg-apo-soft text-apo-deep'">
            {{ u.role === 'Pharmacy Admin' ? t('Administrator') : t('Staff') }}
          </span>
        </div>
        <div class="mt-4 font-display text-[21px] leading-tight text-ink">
          {{ u.full_name }} <span v-if="u.name === session.user.name" class="font-body text-[12px] text-ink-mute">({{ t('you') }})</span>
        </div>
        <div class="mt-1 truncate text-[13px] text-ink-mute">{{ u.email }}</div>
        <div class="mt-5 flex items-center justify-between border-t border-line pt-4">
          <span class="flex items-center gap-1.5 text-[12.5px]" :class="u.enabled ? 'text-ink-mute' : 'text-alert'">
            <span class="size-1.5 rounded-full" :class="u.enabled ? (u.last_login ? 'bg-apo-mid' : 'bg-ink-faint') : 'bg-alert'" />
            {{ !u.enabled ? t('Disabled') : u.last_login ? t('last seen {0}', date(u.last_login)) : t('never logged in') }}
          </span>
          <Btn size="sm" icon="lucide-pencil" :label="t('Edit')" @click="edit(u)" />
        </div>
      </li>
    </ul>

    <Sheet v-model:open="open" :title="form.existing ? t('Edit {0}', form.full_name) : t('Add a person')" icon="lucide-user-round" size="lg">
      <form class="space-y-5" @submit.prevent="save">
        <FormControl v-model="form.full_name" :label="t('Full name')" required size="lg" variant="outline" />
        <FormControl v-model="form.email" type="email" :label="t('Email (used to log in)')" required size="lg" variant="outline" :disabled="form.existing" />
        <div>
          <div class="mb-2 text-[13px] font-semibold text-ink">{{ t('Role') }}</div>
          <div class="grid gap-2 sm:grid-cols-2">
            <button v-for="r in roles" :key="r.value" type="button" class="rounded-[14px] border p-3.5 text-left transition"
              :class="form.role === r.value ? 'border-apo/40 bg-apo-mist ring-1 ring-apo/30' : 'border-line bg-card hover:border-line-strong'"
              @click="form.role = r.value">
              <div class="text-[14px] font-semibold text-ink">{{ t(r.label) }}</div>
              <div class="mt-0.5 text-[12.5px] text-ink-mute">{{ t(r.text) }}</div>
            </button>
          </div>
        </div>
        <FormControl v-model="form.password" type="password" size="lg" variant="outline" :required="!form.existing"
          :label="form.existing ? t('New password (leave empty to keep)') : t('Password')"
          :description="t('At least 8 characters, with letters and numbers. Share it with the person privately.')" />
        <FormControl v-if="form.existing" v-model="form.enabled" type="checkbox" :label="t('Can log in')" />
        <p v-if="error" class="flex items-center gap-2 rounded-[12px] bg-alert-soft px-3.5 py-2.5 text-[13px] text-alert">
          <span class="lucide-circle-alert size-4 shrink-0" />{{ error }}
        </p>
      </form>
      <template #actions>
        <Btn variant="ghost" :label="t('Cancel')" @click="open = false" />
          <Btn variant="primary" :label="t('Save')" :loading="saving" @click="save" />
    </template>
    </Sheet>
  </div>
</template>

<script setup>
import Sheet from '@/components/Sheet.vue'
import { onMounted, reactive, ref } from 'vue'
import { FormControl, toast } from 'frappe-ui'
import Initials from '@/components/Initials.vue'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { get, post } from '@/api'
import { t } from '@/i18n'
import { date } from '@/format'
import { session } from '@/session'

const rows = ref(null)
const open = ref(false)
const saving = ref(false)
const error = ref('')
const form = reactive({})
const roles = [
  { value: 'Pharmacy Staff', label: 'Staff', text: 'Adds and gives out stock, sends requests.' },
  { value: 'Pharmacy Admin', label: 'Administrator', text: 'Also approves requests and manages staff.' },
]

function edit(u) {
  Object.assign(form, u
    ? { existing: true, full_name: u.full_name, email: u.email, role: u.role, password: '', enabled: !!u.enabled }
    : { existing: false, full_name: '', email: '', role: 'Pharmacy Staff', password: '', enabled: true })
  error.value = ''
  open.value = true
}

async function save() {
  error.value = ''
  if (!form.full_name?.trim() || !form.email?.trim()) return (error.value = t('Please enter the name and email.'))
  if (!form.existing && !form.password) return (error.value = t('Please set a password.'))
  saving.value = true
  try {
    await post('save_staff', { email: form.email, full_name: form.full_name, role: form.role, password: form.password || undefined,
      enabled: form.enabled ? 1 : 0 })
    open.value = false
    toast.success(form.existing ? t('Saved') : t('{0} can now log in', form.full_name))
    load()
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}

async function load() {
  try {
    rows.value = await get('staff')
  } catch (e) {
    toast.error(e.message)
    rows.value = []
  }
}
onMounted(load)
</script>
