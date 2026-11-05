<template>
  <Sheet v-model:open="ui.patient.open" :title="editing ? t('Edit patient') : t('New patient')"
    :message="editing ? '' : t('The patient is registered in the health records, so every treatment is kept in their file.')"
    icon="lucide-user-round-plus" theme="green" size="xl">
    <form class="grid grid-cols-2 items-start gap-x-3 gap-y-4 sm:gap-x-4" @submit.prevent="save">
      <FormControl variant="outline" v-model="form.first_name" :label="t('First name')" required size="lg" :placeholder="t('e.g. Awa')" />
      <FormControl variant="outline" v-model="form.last_name" :label="t('Last name')" size="lg" :placeholder="t('e.g. Ndong')" />
      <div class="col-span-2 sm:col-span-1">
        <div class="mb-1.5 text-[13px] text-ink-soft">{{ t('Sex') }} <span class="text-alert">*</span></div>
        <div class="grid grid-cols-2 gap-1 rounded-full border border-line bg-card p-1">
          <button v-for="g in session.options.genders" :key="g" type="button" class="rounded-full px-2 py-2 text-[13.5px] font-medium transition"
            :class="form.sex === g ? 'bg-ink text-on-ink' : 'text-ink-mute hover:text-ink'" @click="form.sex = g">{{ t(g) }}</button>
        </div>
      </div>
      <FormControl variant="outline" v-model="form.dob" type="date" format="D MMM YYYY" :placeholder="t('Select a date')" :label="t('Date of birth')"
        size="lg" :max="today()" class="col-span-2 sm:col-span-1" />
      <FormControl variant="outline" v-model="form.mobile" type="tel" :label="t('Phone')" size="lg" placeholder="+237 6…" />
      <FormControl variant="outline" v-model="form.blood_group" type="select" :label="t('Blood group')" size="lg"
        :options="[{ label: t('Unknown'), value: '' }, ...session.options.blood_groups.map((b) => ({ label: blood(b), value: b }))]" />
      <FormControl variant="outline" v-model="form.allergies" class="col-span-2" type="textarea" :rows="2" :label="t('Allergies')"
        :placeholder="t('e.g. Penicillin')" size="lg" />
      <ErrorMessage class="col-span-2" :message="error" />
    </form>
    <template #actions>
      <Btn variant="ghost" :label="t('Cancel')" @click="ui.patient.open = false" />
      <Btn variant="primary" :label="editing ? t('Save changes') : t('Register patient')" :loading="saving" icon="lucide-check" @click="save" />
    </template>
  </Sheet>
</template>

<script setup>
import Sheet from './Sheet.vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { ErrorMessage, FormControl, toast } from 'frappe-ui'
import Btn from './Btn.vue'
import { get, write } from '@/api'
import { saved } from '@/offline/notify'
import { t } from '@/i18n'
import { today } from '@/format'
import { blood } from '@/care'
import { session } from '@/session'
import { ui, changed, H } from '@/ui'

const router = useRouter()
const editing = computed(() => !!ui.patient.name)
const blank = () => ({ first_name: '', last_name: '', sex: '', dob: '', mobile: '', blood_group: '', allergies: '' })
const form = reactive(blank())
const saving = ref(false)
const error = ref('')

watch(() => ui.patient.open, async (open) => {
  if (!open) return
  Object.assign(form, blank())
  error.value = ''
  if (ui.patient.name) {
    const p = await get(H('patient'), { name: ui.patient.name })
    Object.assign(form, { first_name: p.first_name, last_name: p.last_name || '', sex: p.sex, dob: p.dob || '', mobile: p.mobile || '',
      blood_group: p.blood_group || '', allergies: p.allergies || '' })
  }
})

async function save() {
  error.value = ''
  if (!form.first_name.trim()) return (error.value = t("Please enter the patient's first name."))
  if (!form.sex) return (error.value = t("Please choose the patient's sex."))
  saving.value = true
  try {
    const fullName = [form.first_name, form.last_name].filter(Boolean).join(' ')
    const res = await write(H('save_patient'), { ...form, name: ui.patient.name || undefined }, editing.value ? t('Edit patient') : t('Register patient'),
      { creates: editing.value ? undefined : 'patient', summary: fullName, stub: () => ({ patient_name: fullName }) })
    ui.patient.open = false
    saved(res, editing.value ? t('Patient updated') : t('Patient registered'), res.patient_name)
    changed()
    if (!editing.value) router.push({ name: 'patient', params: { name: res.name } })
  } catch (e) {
    error.value = e.message
  } finally {
    saving.value = false
  }
}
</script>
