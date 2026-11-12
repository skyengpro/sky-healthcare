<template>
  <!-- a small, dismissible offer to put the app on the home screen (it then opens full screen and works offline) -->
  <div v-if="showInstall" class="mx-4 mb-1.5 md:mx-8 lg:mx-10">
    <div class="flex items-center gap-3 rounded-[14px] border border-apo/20 bg-apo-mist px-3.5 py-2.5 text-[13px] text-apo-deep">
      <Logo mark-only mark-class="size-8 shrink-0" />
      <span class="min-w-0 flex-1 leading-snug">
        <b class="font-semibold">{{ t('Install the app') }}</b>
        <span class="ml-1 opacity-80">{{ install.offer ? t('Opens from your home screen and works offline.') : t('Tap Share, then "Add to Home Screen".') }}</span>
      </span>
      <Btn v-if="install.offer" size="sm" variant="brand" :label="t('Install')" @click="installApp" />
      <button class="flex size-8 shrink-0 items-center justify-center rounded-full text-apo-deep/70 transition hover:bg-apo-soft hover:text-apo-deep"
        :aria-label="t('Not now')" :title="t('Not now')" @click="dismissInstall">
        <span class="lucide-x size-4" />
      </button>
    </div>
  </div>
</template>

<script setup>
import Btn from './Btn.vue'
import Logo from './Logo.vue'
import { t } from '@/i18n'
import { install, showInstall, installApp, dismissInstall } from '@/install'
</script>
