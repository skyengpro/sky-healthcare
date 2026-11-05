// Small helpers for patients and procedures.
import { t } from './i18n'

// "O Positive" -> "O+"
export const blood = (b) => (b ? b.replace(' Positive', '+').replace(' Negative', '−') : '')

export const ageLabel = (age) => (age === null || age === undefined ? '' : age < 1 ? t('under 1 year') : t('{0} years', age))

// "Female · 34 years · O+"
export const patientMeta = (p) => [p.sex ? t(p.sex) : '', ageLabel(p.age), blood(p.blood_group)].filter(Boolean).join(' · ')

// the medicines a procedure uses: "Paracetamol 500mg × 2, Gauze × 1"
export const usedLine = (items) => (items || []).map((i) => `${i.medicine_name} × ${i.qty}`).join(', ')

// one editable row of MedicineRows
let seq = 0
export const newRow = (medicine = null, qty = 1) => ({ key: `r${Date.now()}${seq++}`, medicine, qty })

// how often / for how long, in plain words (the stored values are the standard Frappe Health names)
export const DOSAGE_LABELS = { 'Once Daily': 'Once a day', BID: 'Twice a day', TID: '3 times a day', QID: '4 times a day', 'Once Bedtime': 'At bedtime' }
export const DURATION_LABELS = { '1 Day': '1 day', '2 Day': '2 days', '3 Day': '3 days', '5 Day': '5 days', '1 Week': '1 week', '2 Week': '2 weeks', '1 Month': '1 month' }
export const dosageLabel = (v) => t(DOSAGE_LABELS[v] || v || '')
export const durationLabel = (v) => t(DURATION_LABELS[v] || v || '')
