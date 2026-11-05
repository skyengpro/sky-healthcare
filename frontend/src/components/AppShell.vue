<template>
  <div class="min-h-screen md:flex">
    <!-- desktop sidebar, folds to an icon rail -->
    <aside class="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line bg-card transition-[width] duration-200 md:flex"
      :class="folded ? 'w-[76px]' : 'w-[248px]'">
      <div class="flex items-center pb-6 pt-6" :class="folded ? 'flex-col gap-3 px-3' : 'justify-between pl-6 pr-3'">
        <RouterLink to="/" :aria-label="t('Dashboard')"><Logo :mark-only="folded" :subtitle="session.siteName" /></RouterLink>
        <button class="flex size-8 items-center justify-center rounded-full text-ink-mute transition hover:bg-paper hover:text-ink"
          :title="folded ? t('Expand menu') : t('Collapse menu')" :aria-label="folded ? t('Expand menu') : t('Collapse menu')" @click="toggleFold">
          <span :class="folded ? 'lucide-panel-left-open' : 'lucide-panel-left-close'" class="size-[17px]" />
        </button>
      </div>

      <nav class="flex-1 overflow-y-auto px-3">
        <template v-for="section in sections" :key="section.label">
        <p v-if="!folded" class="eyebrow mb-2 px-3" :class="section.first ? '' : 'mt-5'">{{ t(section.label) }}</p>
        <div v-else-if="!section.first" class="mx-3 my-3 h-px bg-line" />
        <RouterLink v-for="item in section.items" :key="item.to" :to="item.to" custom v-slot="{ navigate, isActive, isExactActive }">
          <a :href="'/pharmacy' + item.to" :title="folded ? t(item.label) : undefined"
            class="group relative mb-0.5 flex items-center gap-3 rounded-[12px] py-2.5 text-[14px] transition"
            :class="[folded ? 'justify-center px-0' : 'px-3',
              (item.exact ? isExactActive : isActive) ? 'bg-paper-deep font-semibold text-ink' : 'font-medium text-ink-soft hover:bg-paper hover:text-ink']"
            @click="navigate">
            <span :class="[item.icon, (item.exact ? isExactActive : isActive) ? 'text-apo' : 'text-ink-mute group-hover:text-ink-soft']" class="size-[18px] shrink-0" />
            <span v-if="!folded" class="flex-1">{{ t(item.label) }}</span>
            <span v-if="item.badge && !folded" class="rounded-full bg-ink px-1.5 py-px text-[11px] font-semibold text-on-ink tabular">{{ item.badge }}</span>
            <span v-else-if="item.badge" class="absolute right-3 top-2 size-2 rounded-full bg-alert ring-2 ring-card" />
          </a>
        </RouterLink>
        </template>
      </nav>

      <div class="p-3">
        <div v-if="!folded" class="mb-3 rounded-[16px] bg-apo-mist p-4">
          <p class="font-display text-[17px] leading-snug text-apo-deep">{{ t('A delivery just arrived?') }}</p>
          <p class="mt-1 text-[12.5px] leading-snug text-ink-mute">{{ t('Record it in a few seconds.') }}</p>
          <Btn class="mt-3" variant="brand" size="sm" icon="lucide-plus" :label="t('Add stock')" @click="openAddStock()" />
        </div>
        <button v-else class="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-apo text-on-apo shadow-card transition hover:bg-apo-deep"
          :title="t('Add stock')" :aria-label="t('Add stock')" @click="openAddStock()"><span class="lucide-plus size-5" /></button>
        <Dropdown :options="userMenu" side="top" align="start">
          <template #default>
            <button class="flex w-full items-center gap-3 rounded-[12px] p-2 text-left transition hover:bg-paper" :class="folded && 'justify-center'">
              <Initials :name="session.user.full_name" />
              <template v-if="!folded">
                <div class="min-w-0 flex-1">
                  <div class="truncate text-[13.5px] font-semibold text-ink">{{ session.user.full_name }}</div>
                  <div class="truncate text-[12px] text-ink-mute">{{ session.isAdmin ? t('Pharmacy administrator') : t('Pharmacy staff') }}</div>
                </div>
                <span class="lucide-chevrons-up-down size-4 text-ink-faint" />
              </template>
            </button>
          </template>
        </Dropdown>
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <!-- top bar -->
      <header class="sticky top-0 z-20 flex h-[60px] items-center gap-2 bg-paper/85 px-4 backdrop-blur-md md:h-16 md:px-8 lg:px-10">
        <RouterLink to="/" class="md:hidden" :aria-label="t('Dashboard')"><Logo mark-class="size-9" /></RouterLink>
        <div class="flex-1" />

        <button v-if="net.outbox.length" class="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12.5px] font-medium"
          :class="failed ? 'bg-alert-soft text-alert' : 'bg-info-soft text-info'" @click="ui.sync.open = true">
          <span :class="net.syncing ? 'lucide-loader-circle animate-spin' : failed ? 'lucide-triangle-alert' : 'lucide-cloud-upload'" class="size-3.5" />
          <span class="hidden sm:inline">{{ failed ? t('{0} not sent', failed) : t('{0} to send', net.outbox.length) }}</span>
          <span class="sm:hidden">{{ net.outbox.length }}</span>
        </button>

        <div class="hidden items-center rounded-full border border-line bg-card p-0.5 sm:flex" role="group" :aria-label="t('Language')">
          <button v-for="l in ['fr', 'en']" :key="l" class="rounded-full px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-wide transition"
            :class="lang === l ? 'bg-ink text-on-ink' : 'text-ink-mute hover:text-ink'" @click="setLanguage(l)">{{ l }}</button>
        </div>

        <button class="hidden size-10 items-center justify-center rounded-full border border-line bg-card text-ink-soft shadow-card transition hover:text-ink sm:flex"
          :title="isDark ? t('Light theme') : t('Dark theme')" :aria-label="isDark ? t('Light theme') : t('Dark theme')"
          @click="setTheme(isDark ? 'light' : 'dark')">
          <span :class="isDark ? 'lucide-sun' : 'lucide-moon'" class="size-[17px]" />
        </button>

        <!-- phone: the bell opens the Notifications page; desktop: a popover with a link to it -->
        <RouterLink to="/notifications" class="relative flex size-10 items-center justify-center rounded-full border border-line bg-card text-ink-soft shadow-card md:hidden"
          :aria-label="t('Notifications')">
          <span class="lucide-bell size-[17px]" />
          <span v-if="alertCount" class="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-alert px-1 text-[10px] font-bold text-on-ink ring-2 ring-paper">{{ alertCount > 9 ? '9+' : alertCount }}</span>
        </RouterLink>
        <div class="hidden md:block">
        <Popover side="bottom" align="end">
          <template #trigger>
            <button class="relative flex size-10 items-center justify-center rounded-full border border-line bg-card text-ink-soft shadow-card transition hover:text-ink"
              :aria-label="t('Notifications')" @click="loadAlerts">
              <span class="lucide-bell size-[17px]" />
              <span v-if="alertCount" class="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-alert px-1 text-[10px] font-bold text-on-ink ring-2 ring-paper">{{ alertCount > 9 ? '9+' : alertCount }}</span>
            </button>
          </template>
          <template #default="{ close }">
            <div class="w-[360px] p-2">
              <div class="flex items-center justify-between px-3 pb-1 pt-2">
                <p class="eyebrow">{{ t('Needs action') }}</p>
              </div>
              <AlertSummary @navigate="close" />
              <RouterLink to="/notifications" class="mt-1 flex items-center justify-center gap-1.5 rounded-[12px] border-t border-line px-3 py-3 text-[13px] font-semibold text-ink-soft transition hover:text-ink" @click="close">
                {{ t('See all notifications') }}
                <span v-if="alerts.data?.unread" class="rounded-full bg-ink px-1.5 text-[11px] text-on-ink">{{ alerts.data.unread }}</span>
                <span class="lucide-arrow-right size-3.5" />
              </RouterLink>
            </div>
          </template>
        </Popover>
        </div>

        <div class="md:hidden">
        <Dropdown :options="userMenu" align="end">
          <template #default>
            <button class="rounded-full" :aria-label="t('My account')"><Initials :name="session.user.full_name" /></button>
          </template>
        </Dropdown>
        </div>
      </header>

      <div v-if="!net.online" class="mx-4 mb-1 flex items-center gap-2.5 rounded-[14px] border border-warn/20 bg-warn-soft px-4 py-2.5 text-[13px] text-warn md:mx-8 lg:mx-10">
        <span class="lucide-wifi-off size-4 shrink-0" />
        {{ t('You are offline. You see the last saved data, and new stock movements are kept and sent later.') }}
      </div>

      <main class="mx-auto w-full max-w-[1200px] flex-1 px-4 pb-32 pt-3 md:px-8 md:pb-14 md:pt-5 lg:px-10">
        <slot />
      </main>
    </div>

    <!-- phone tab bar -->
    <nav class="fixed inset-x-3 bottom-[max(12px,env(safe-area-inset-bottom))] z-30 mx-auto max-w-[480px] md:hidden">
      <div class="grid grid-cols-5 items-center rounded-[24px] border border-line bg-card/95 px-1 py-1 shadow-lift backdrop-blur">
        <RouterLink v-for="item in mobileNav" :key="item.to" :to="item.to" custom v-slot="{ navigate, isActive, isExactActive }">
          <a v-if="item.primary" :href="'/pharmacy' + item.to" class="flex flex-col items-center" :aria-label="t(item.short)" @click="navigate">
            <span class="flex size-12 items-center justify-center rounded-full bg-ink text-on-ink shadow-card">
              <span :class="item.icon" class="size-5" />
            </span>
          </a>
          <a v-else :href="'/pharmacy' + item.to" class="relative flex flex-col items-center gap-0.5 py-1.5"
            :class="(item.exact ? isExactActive : isActive) ? 'text-ink' : 'text-ink-mute'" @click="navigate">
            <span :class="item.icon" class="size-[19px]" />
            <span class="text-[10.5px] font-semibold">{{ t(item.short) }}</span>
            <span v-if="(item.exact ? isExactActive : isActive)" class="absolute -bottom-0.5 h-[3px] w-4 rounded-full bg-apo" />
            <span v-if="item.badge" class="absolute right-[26%] top-1 size-2 rounded-full bg-alert ring-2 ring-card" />
          </a>
        </RouterLink>
      </div>
    </nav>

    <MedicineDialog />
    <AddStockDialog />
    <RequestDialog />
    <SyncDialog />
    <template v-if="session.health">
      <PatientDialog />
      <TemplateDialog />
      <ProcedureDialog />
      <CancelProcedureDialog />
    </template>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import { Dropdown, Popover, dialog } from 'frappe-ui'
import Logo from './Logo.vue'
import Btn from './Btn.vue'
import Initials from './Initials.vue'
import AlertSummary from './AlertSummary.vue'
import MedicineDialog from './MedicineDialog.vue'
import AddStockDialog from './AddStockDialog.vue'
import RequestDialog from './RequestDialog.vue'
import SyncDialog from './SyncDialog.vue'
import PatientDialog from './PatientDialog.vue'
import TemplateDialog from './TemplateDialog.vue'
import ProcedureDialog from './ProcedureDialog.vue'
import CancelProcedureDialog from './CancelProcedureDialog.vue'
import { net } from '@/api'
import { alerts, alertCount, loadAlerts } from '@/alerts'
import { lang, setLanguage, t } from '@/i18n'
import { isDark, setTheme } from '@/theme'
import { session, logout } from '@/session'
import { ui, openAddStock } from '@/ui'

// desktop remembers its own choice; tablets start as an icon rail so the page keeps its room
const tablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)')
const read = (k, d) => {
  try {
    return localStorage.getItem(k) ?? d
  } catch {
    return d
  }
}
const deskFolded = ref(read('sky_healthcare.sidebar', 'open') === 'folded')
const tabletFolded = ref(read('sky_healthcare.sidebar.tablet', 'folded') === 'folded')
const folded = computed(() => (tablet.value ? tabletFolded.value : deskFolded.value))
function toggleFold() {
  const ref_ = tablet.value ? tabletFolded : deskFolded
  ref_.value = !ref_.value
  try {
    localStorage.setItem(tablet.value ? 'sky_healthcare.sidebar.tablet' : 'sky_healthcare.sidebar', ref_.value ? 'folded' : 'open')
  } catch {}
}

const pending = computed(() => alerts.data?.pending.length || 0)
const sections = computed(() => [
  { label: 'Pharmacy', first: true, items: [
    { to: '/', label: 'Dashboard', icon: 'lucide-layout-grid', exact: true },
    { to: '/medicines', label: 'Medicines', icon: 'lucide-pill' },
    { to: '/give-out', label: 'Give out stock', icon: 'lucide-hand-heart' },
    { to: '/requests', label: 'Medical requests', icon: 'lucide-clipboard-list', badge: pending.value || null },
    { to: '/reports', label: 'Reports', icon: 'lucide-chart-no-axes-column' },
  ] },
  ...(session.health ? [{ label: 'Care', items: [
    { to: '/patients', label: 'Patients', icon: 'lucide-users-round' },
    { to: '/procedures', label: 'Treatment types', icon: 'lucide-list-checks' },
  ] }] : []),
  ...(session.isAdmin ? [{ label: 'Team', items: [{ to: '/staff', label: 'Staff', icon: 'lucide-id-card' }] }] : []),
])

// phone: with Frappe Health, patients and procedures take the last two tabs; requests and reports move to the account menu
const mobileNav = computed(() => [
  { to: '/', short: 'Home', icon: 'lucide-layout-grid', exact: true },
  { to: '/medicines', short: 'Medicines', icon: 'lucide-pill' },
  { to: '/give-out', short: 'Give out', icon: 'lucide-hand-heart', primary: true },
  ...(session.health
    ? [{ to: '/patients', short: 'Patients', icon: 'lucide-users-round' }, { to: '/procedures', short: 'Types', icon: 'lucide-list-checks' }]
    : [{ to: '/requests', short: 'Requests', icon: 'lucide-clipboard-list', badge: pending.value }, { to: '/reports', short: 'Reports', icon: 'lucide-chart-no-axes-column' }]),
])

const failed = computed(() => net.outbox.filter((i) => i.status === 'failed').length)

const userMenu = computed(() => [
  { label: t('My account'), icon: 'lucide-user-round', route: { name: 'account' } },
  { label: t('Notifications'), icon: 'lucide-bell', route: { name: 'notifications' } },
  ...(session.health ? [
    { label: pending.value ? `${t('Medical requests')} (${pending.value})` : t('Medical requests'), icon: 'lucide-clipboard-list', route: { name: 'requests' } },
    { label: t('Reports'), icon: 'lucide-chart-no-axes-column', route: { name: 'reports' } },
  ] : []),
  ...(session.isAdmin ? [{ label: t('Staff'), icon: 'lucide-users-round', route: { name: 'staff' } }] : []),
  { label: isDark.value ? t('Light theme') : t('Dark theme'), icon: isDark.value ? 'lucide-sun' : 'lucide-moon', onClick: () => setTheme(isDark.value ? 'light' : 'dark') },
  { label: lang.value === 'fr' ? 'English' : 'Français', icon: 'lucide-languages', onClick: () => setLanguage(lang.value === 'fr' ? 'en' : 'fr') },
  { label: t('Log out'), icon: 'lucide-log-out', theme: 'red', onClick: confirmLogout },
])

function confirmLogout() {
  if (!net.outbox.length) return logout()
  dialog.danger({
    title: t('Log out?'),
    message: t('{0} change(s) on this device are not sent yet. If you log out now, they are lost.', net.outbox.length),
    confirmLabel: t('Log out'),
    onConfirm: () => {
      net.outbox = []
      localStorage.removeItem('sky_healthcare.outbox')
      logout()
    },
  })
}

onMounted(loadAlerts)
watch(() => ui.version, loadAlerts)
</script>
