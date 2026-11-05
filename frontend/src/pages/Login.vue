<template>
  <!-- phone: everything fits the screen, no scrolling -->
  <div class="flex h-[100dvh] flex-col overflow-hidden bg-paper lg:grid lg:h-auto lg:min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:overflow-visible">
    <!-- brand panel -->
    <section class="relative shrink-0 overflow-hidden bg-[#173F33] text-white lg:min-h-screen">
      <div class="absolute inset-0 bg-[radial-gradient(120%_80%_at_0%_0%,#2c6c58_0%,transparent_60%),radial-gradient(90%_70%_at_100%_100%,#123329_0%,transparent_70%)]" />
      <BlisterArt class="pointer-events-none absolute -right-[210px] top-1/2 hidden h-[72%] -translate-y-1/2 rotate-[-12deg] xl:block xl:-right-[150px] 2xl:-right-[60px]" />
      <div class="absolute inset-y-0 left-0 hidden w-2/3 bg-gradient-to-r from-[#173F33] via-[#173F33]/80 to-transparent xl:block" />
      <div class="relative flex h-full flex-col justify-between gap-3 px-6 py-4 sm:gap-10 sm:px-10 sm:py-7 lg:px-14 lg:py-12">
        <Logo inverted mark-class="size-9 rounded-[10px] ring-1 ring-white/20 sm:size-11 sm:rounded-[12px]" />
        <div class="max-w-[400px] lg:pb-0">
          <p class="eyebrow mb-4 hidden !text-[#b9dccb] sm:block">{{ t('Health center space') }}</p>
          <h1 class="max-w-[340px] font-display text-[24px] leading-[1.1] sm:max-w-none sm:text-[44px] lg:max-w-[340px] lg:text-[52px] xl:max-w-[360px]">
            {{ t('Stock and patients,') }} <em class="italic text-[#b9dccb]">{{ t('in one place.') }}</em>
          </h1>
          <ul class="mt-9 hidden space-y-4 text-[15px] text-white/80 sm:block">
            <li v-for="f in features" :key="f.icon" class="flex items-center gap-3.5">
              <span class="flex size-9 items-center justify-center rounded-full border border-white/15 bg-white/[.06]"><span :class="f.icon" class="size-4" /></span>
              {{ t(f.text) }}
            </li>
          </ul>
        </div>
        <p class="hidden text-[12.5px] text-white/50 lg:block">© {{ new Date().getFullYear() }} Healthcare Management · {{ t('Made for health centers in Cameroon') }}</p>
      </div>
    </section>

    <!-- form -->
    <section class="relative flex min-h-0 flex-1 flex-col lg:min-h-screen">
      <div class="flex justify-end p-5 max-lg:absolute max-lg:right-0 max-lg:top-0 max-lg:p-3 sm:p-7">
        <div class="flex items-center rounded-full border border-line bg-card p-0.5" role="group" :aria-label="t('Language')">
          <button v-for="l in ['fr', 'en']" :key="l" class="rounded-full px-3 py-1 text-[11.5px] font-semibold uppercase tracking-wide transition"
            :class="lang === l ? 'bg-ink text-on-ink' : 'text-ink-mute hover:text-ink'" @click="setLanguage(l)">{{ l }}</button>
        </div>
      </div>
      <div class="flex flex-1 items-center justify-center px-6 py-3 sm:pb-16 sm:pt-0">
        <form class="rise w-full max-w-[380px]" @submit.prevent="submit">
          <h2 class="font-display text-[34px] leading-none text-ink sm:text-[44px]">{{ t('Sign in') }}</h2>
          <p class="mt-2 text-[14px] text-ink-mute sm:mt-3 sm:text-[15px]">{{ t('Log in to manage your health center.') }}</p>

          <div class="mt-5 space-y-3.5 sm:mt-9 sm:space-y-5">
            <label class="block">
              <span class="mb-1.5 block text-[13px] font-semibold text-ink">{{ t('Email') }}</span>
              <input v-model="email" type="email" autocomplete="username" required :placeholder="t('you@clinic.cm')"
                class="h-12 w-full rounded-[12px] border border-line bg-card px-4 text-[15px] text-ink shadow-card outline-none transition placeholder:text-ink-faint focus:border-apo-mid focus:ring-4 focus:ring-apo/10" />
            </label>
            <label class="block">
              <span class="mb-1.5 block text-[13px] font-semibold text-ink">{{ t('Password') }}</span>
              <span class="relative block">
                <input v-model="password" :type="show ? 'text' : 'password'" autocomplete="current-password" required
                  class="h-12 w-full rounded-[12px] border border-line bg-card pl-4 pr-12 text-[15px] text-ink shadow-card outline-none transition focus:border-apo-mid focus:ring-4 focus:ring-apo/10" />
                <button type="button" class="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full text-ink-mute hover:bg-paper hover:text-ink"
                  :aria-label="show ? t('Hide password') : t('Show password')" @click="show = !show">
                  <span :class="show ? 'lucide-eye-off' : 'lucide-eye'" class="size-4" />
                </button>
              </span>
            </label>
            <p v-if="error" class="flex items-center gap-2 rounded-[12px] bg-alert-soft px-3.5 py-2.5 text-[13px] text-alert">
              <span class="lucide-circle-alert size-4 shrink-0" />{{ error }}
            </p>
            <Btn type="submit" variant="primary" size="lg" block :loading="loading" :label="t('Log in')" class="!mt-5 sm:!mt-7" />
          </div>
          <p class="mt-3 text-center text-[13px] text-ink-mute sm:mt-5">{{ t('Forgot your password? Ask your administrator.') }}</p>
          <p class="mt-4 hidden items-start gap-2 border-t border-line pt-4 text-[12px] leading-relaxed text-ink-mute min-[400px]:flex sm:mt-10 sm:pt-5">
            <span class="lucide-shield-check mt-px size-3.5 shrink-0 text-apo" />
            {{ t('For health center staff only. Every action is recorded under your name.') }}
          </p>
        </form>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Logo from '@/components/Logo.vue'
import Btn from '@/components/Btn.vue'
import BlisterArt from '@/components/BlisterArt.vue'
import { lang, setLanguage, t } from '@/i18n'
import { login } from '@/session'

const email = ref('')
const password = ref('')
const show = ref(false)
const error = ref('')
const loading = ref(false)
const features = [
  { icon: 'lucide-package-check', text: 'Know what is in stock at any time' },
  { icon: 'lucide-stethoscope', text: 'Follow every patient, from consultation to treatment' },
  { icon: 'lucide-calendar-clock', text: 'See expiring medicines before it is too late' },
  { icon: 'lucide-wifi-off', text: 'Keeps working when the internet is down' },
]

async function submit() {
  error.value = ''
  loading.value = true
  try {
    await login(email.value.trim(), password.value)
  } catch (e) {
    error.value = t(e.message)
    loading.value = false
  }
}
</script>
