<template>
  <div>
    <PageHeader :eyebrow="t('Care')" :title="t('Treatment types')" :subtitle="t('The cares you give, and the medicines each one uses. Record a treatment from the patient’s file.')">
      <template #actions>
        <Btn variant="primary" icon="lucide-plus" :label="t('New treatment type')" @click="openTemplate()" />
      </template>
    </PageHeader>

      <div v-if="!templates" class="grid gap-2.5 md:grid-cols-2"><div v-for="i in 4" :key="i" class="surface h-36 animate-pulse" /></div>
      <div v-else-if="!templates.length" class="surface">
        <EmptyState icon="lucide-list-plus" :title="t('No treatment types yet')"
          :text="t('First create the cares you give, like a wound dressing, with the medicines they use.')">
          <Btn variant="primary" icon="lucide-plus" :label="t('New treatment type')" @click="openTemplate()" />
        </EmptyState>
      </div>
      <template v-else>
      <div v-if="!activeTemplates.length" class="surface mb-3">
        <EmptyState icon="lucide-list-plus" :title="t('No active treatment type')"
          :text="t('All your treatment types are hidden. Create a new one, or show a hidden one again below.')">
          <Btn variant="primary" icon="lucide-plus" :label="t('New treatment type')" @click="openTemplate()" />
        </EmptyState>
      </div>
      <div class="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        <article v-for="tp in shownTemplates" :key="tp.name" class="surface flex flex-col p-5" :class="tp.disabled && 'opacity-60'">
          <div class="flex items-start justify-between gap-3">
            <h3 class="font-display text-[20px] leading-tight text-ink">{{ tp.template }}</h3>
            <span v-if="tp.disabled" class="rounded-full bg-paper-deep px-2 py-0.5 text-[11px] text-ink-mute">{{ t('Hidden') }}</span>
          </div>
          <p v-if="tp.description && tp.description !== tp.template" class="mt-1 text-[13px] text-ink-mute">{{ tp.description }}</p>
          <ul class="mt-3 flex-1 space-y-1.5">
            <li v-for="i in tp.items" :key="i.medicine" class="flex items-baseline justify-between gap-3 text-[13px]">
              <span class="truncate text-ink-soft">{{ i.medicine_name }}</span>
              <span class="shrink-0 font-semibold text-ink tabular">× {{ num(i.qty) }} <span class="font-normal text-ink-mute">{{ t(i.unit) }}</span></span>
            </li>
            <li v-if="!tp.items.length" class="text-[13px] text-ink-mute">{{ t('Uses no medicine') }}</li>
          </ul>
          <div class="mt-4 flex items-center justify-between gap-2 border-t border-line/70 pt-3.5">
            <span class="text-[12px] text-ink-mute">{{ t('Done {0} time(s)', tp.used) }}</span>
            <div class="flex gap-1.5">
              <Btn size="sm" variant="ghost" icon="lucide-pencil" :label="t('Edit')" @click="openTemplate(tp.name)" />
              <Btn v-if="!tp.disabled" size="sm" icon="lucide-plus" :label="t('Use')" @click="openProcedure(null, tp.name)" />
              <Btn v-else size="sm" icon="lucide-eye" :label="t('Show again')" @click="reactivate(tp)" />
            </div>
          </div>
        </article>
      </div>
      <button v-if="hiddenTemplates.length" class="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[13px] font-medium text-ink-mute transition hover:bg-paper-deep hover:text-ink"
        @click="showHidden = !showHidden">
        <span :class="showHidden ? 'lucide-eye-off' : 'lucide-eye'" class="size-4" />
        {{ showHidden ? t('Hide the hidden ones') : t('Show hidden types ({0})', hiddenTemplates.length) }}
      </button>
      </template>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { toast } from 'frappe-ui'
import Btn from '@/components/Btn.vue'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import { get, write } from '@/api'
import { saved } from '@/offline/notify'
import { t } from '@/i18n'
import { num } from '@/format'
import { ui, changed, H, openProcedure, openTemplate } from '@/ui'

const templates = ref(null)
const showHidden = ref(false)
const activeTemplates = computed(() => (templates.value || []).filter((x) => !x.disabled))
const hiddenTemplates = computed(() => (templates.value || []).filter((x) => x.disabled))
const shownTemplates = computed(() => (showHidden.value || !activeTemplates.value.length ? templates.value : activeTemplates.value))

async function reactivate(tp) {
  try {
    const res = await write(H('save_procedure_template'), { name: tp.name, template: tp.template, description: tp.description, disabled: 0,
      items: tp.items.map((i) => ({ medicine: i.medicine, qty: i.qty })) }, t('Edit treatment type'), { summary: tp.template })
    saved(res, t('Treatment type shown again'), tp.template)
    changed()
  } catch (e) {
    toast.error(e.message)
  }
}

async function load() {
  try {
    templates.value = await get(H('procedure_templates'), { include_disabled: 1 })
  } catch (e) {
    toast.error(e.message)
  }
}
watch(() => ui.version, load, { immediate: true })
</script>
