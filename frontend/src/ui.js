// Shared dialog state, so any page can open "Add stock", "New medicine" or "Medical request",
// and a counter pages watch to reload after a stock change.
import { reactive } from 'vue'

export const ui = reactive({
  version: 0,
  addStock: { open: false, medicine: null },
  medicine: { open: false, code: null },
  request: { open: false, medicine: null, qty: null },
  sync: { open: false },
  patient: { open: false, name: null },
  template: { open: false, name: null },
  procedure: { open: false, patient: null, template: null, serviceRequest: null },
  cancelProc: { open: false, procedure: null },
})

export const changed = () => ui.version++
export const openAddStock = (medicine = null) => Object.assign(ui.addStock, { open: true, medicine })
export const openMedicine = (code = null) => Object.assign(ui.medicine, { open: true, code })
export const openRequest = (medicine = null, qty = null) => Object.assign(ui.request, { open: true, medicine, qty })
export const openPatient = (name = null) => Object.assign(ui.patient, { open: true, name })
export const openTemplate = (name = null) => Object.assign(ui.template, { open: true, name })
export const openProcedure = (patient = null, template = null, serviceRequest = null) => Object.assign(ui.procedure, { open: true, patient, template, serviceRequest })
export const openCancelProcedure = (procedure) => Object.assign(ui.cancelProc, { open: true, procedure })
// Frappe Health methods
export const H = (m) => `sky_healthcare.health.${m}`
