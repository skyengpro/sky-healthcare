<template>
  <div class="max-w-[720px]">
    <PageHeader :eyebrow="t('Settings')" :title="t('My account')" />

    <section class="surface mb-4 flex items-center gap-5 p-6">
      <Initials :name="session.user.full_name" size="xl" />
      <div class="min-w-0">
        <div class="font-display text-[26px] leading-tight text-ink">{{ session.user.full_name }}</div>
        <div class="mt-0.5 truncate text-[13.5px] text-ink-mute">{{ session.user.email }}</div>
        <span class="mt-3 inline-block rounded-full px-2.5 py-1 text-[11.5px] font-semibold" :class="session.isAdmin ? 'bg-ink text-on-ink' : 'bg-apo-soft text-apo-deep'">
          {{ session.isAdmin ? t('Pharmacy administrator') : t('Pharmacy staff') }}</span>
      </div>
    </section>

    <Panel class="mb-4" :title="t('Language')" padded>
      <div class="grid grid-cols-2 gap-2">
        <button v-for="l in [{ v: 'fr', n: 'Français' }, { v: 'en', n: 'English' }]" :key="l.v" class="flex items-center justify-between rounded-[14px] border px-4 py-3.5 text-left text-[14px] font-semibold transition"
          :class="lang === l.v ? 'border-apo/40 bg-apo-mist text-apo-deep ring-1 ring-apo/30' : 'border-line bg-card text-ink-soft hover:border-line-strong'"
          @click="setLanguage(l.v)">{{ l.n }}<span v-if="lang === l.v" class="lucide-check size-4" /></button>
      </div>
    </Panel>

    <Panel class="mb-4" :title="t('Appearance')" padded>
      <div class="grid grid-cols-3 gap-2">
        <button v-for="m in themes" :key="m.v" class="flex flex-col items-center gap-2 rounded-[14px] border px-3 py-3.5 text-[13px] font-semibold transition"
          :class="themeMode === m.v ? 'border-apo/40 bg-apo-mist text-apo-deep ring-1 ring-apo/30' : 'border-line bg-card text-ink-soft hover:border-line-strong'"
          @click="setTheme(m.v)">
          <span :class="m.icon" class="size-5" />{{ t(m.label) }}
        </button>
      </div>
    </Panel>

    <Panel class="mb-4" :title="t('Change password')" padded>
      <form class="space-y-4" @submit.prevent="changePassword">
        <FormControl v-model="pw.old" type="password" :label="t('Current password')" size="lg" variant="outline" autocomplete="current-password" />
        <FormControl v-model="pw.new" type="password" :label="t('New password')" size="lg" variant="outline" autocomplete="new-password"
          :description="t('At least 8 characters, with letters and numbers.')" />
        <p v-if="pwError" class="flex items-center gap-2 rounded-[12px] bg-alert-soft px-3.5 py-2.5 text-[13px] text-alert">
          <span class="lucide-circle-alert size-4 shrink-0" />{{ pwError }}
        </p>
        <Btn type="submit" variant="primary" :loading="pwSaving" :label="t('Update password')" />
      </form>
    </Panel>

    <Panel class="mb-4" :title="t('Install the app')" padded>
      <div class="flex items-start gap-4">
        <Logo mark-only mark-class="size-12" />
        <p class="text-[13.5px] leading-relaxed text-ink-soft">{{ t('On Android, open the browser menu and tap "Install app" or "Add to Home screen". On iPhone, tap Share, then "Add to Home Screen". The app then opens like any other app and keeps working offline.') }}</p>
      </div>
      <Btn v-if="installEvent" class="mt-4" variant="brand" icon="lucide-download" :label="t('Install now')" @click="install" />
    </Panel>

    <Panel :title="t('This device')" padded>
      <div class="flex items-center justify-between gap-3 text-[13.5px]">
        <span class="flex items-center gap-2 text-ink-soft">
          <span class="size-1.5 rounded-full" :class="net.outbox.length ? 'bg-info' : 'bg-apo-mid'" />
          {{ net.outbox.length ? t('{0} change(s) waiting to be sent', net.outbox.length) : t('Everything is sent.') }}
        </span>
        <Btn size="sm" :label="t('Details')" @click="ui.sync.open = true" />
      </div>
      <div class="mt-5 border-t border-line pt-5">
        <Btn variant="danger" icon="lucide-log-out" :label="t('Log out')" @click="logout" />
      </div>
    </Panel>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { FormControl, toast } from 'frappe-ui'
import Initials from '@/components/Initials.vue'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import Panel from '@/components/Panel.vue'
import Logo from '@/components/Logo.vue'
import { net, post } from '@/api'
import { lang, setLanguage, t } from '@/i18n'
import { session, logout } from '@/session'
import { setTheme, themeMode } from '@/theme'
import { ui } from '@/ui'

const themes = [
  { v: 'light', label: 'Light', icon: 'lucide-sun' },
  { v: 'dark', label: 'Dark', icon: 'lucide-moon' },
  { v: 'system', label: 'Automatic', icon: 'lucide-smartphone' },
]
const pw = reactive({ old: '', new: '' })
const pwError = ref('')
const pwSaving = ref(false)
const installEvent = ref(null)
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault()
  installEvent.value = e
})

async function install() {
  installEvent.value?.prompt()
  installEvent.value = null
}

async function changePassword() {
  pwError.value = ''
  if (!pw.old || !pw.new) return (pwError.value = t('Please fill in both passwords.'))
  pwSaving.value = true
  try {
    await post('frappe.core.doctype.user.user.update_password', { old_password: pw.old, new_password: pw.new, logout_all_sessions: 0 })
    toast.success(t('Password updated'))
    pw.old = pw.new = ''
  } catch (e) {
    pwError.value = e.message
  } finally {
    pwSaving.value = false
  }
}
</script>
