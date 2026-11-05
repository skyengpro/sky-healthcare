<template>
  <FrappeUIProvider>
    <RouterView v-if="route.meta.public" />
    <AppShell v-else-if="session.user">
      <RouterView v-slot="{ Component }">
        <component :is="Component" :key="route.path" />
      </RouterView>
    </AppShell>
    <div v-else class="flex h-screen items-center justify-center">
      <LoadingIndicator class="size-6 text-ink-gray-5" />
    </div>
  </FrappeUIProvider>
</template>

<script setup>
import { useRoute } from 'vue-router'
import { FrappeUIProvider, LoadingIndicator } from 'frappe-ui'
import AppShell from './components/AppShell.vue'
import { session } from './session'

const route = useRoute()
</script>
