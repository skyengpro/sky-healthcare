// What the user did without a connection is still waiting in the outbox. These helpers show it
// as if it was already done, so the app feels the same offline: stock numbers move, a new patient
// or medicine appears in the lists (tagged "waiting"), and a patient's file shows what was recorded.
// Nothing here is sent to the server; when the outbox is sent, the real data replaces it.

const LOCAL = 'local:'
export const isLocal = (v) => typeof v === 'string' && v.startsWith(LOCAL)

const live = (outbox) => outbox.filter((i) => i.status === 'waiting' || i.status === 'sending')
const num = (v) => Number(v) || 0
const short = (m) => String(m || '').split('.').pop()

export const pendingOf = (outbox, ...methods) => live(outbox).filter((i) => methods.includes(short(i.method)))

/** Stock change per medicine (by code and by name) made by the waiting changes. */
function stockDeltas(items) {
  const d = {}
  const add = (k, n) => k && (d[k] = (d[k] || 0) + n)
  for (const i of items) {
    const m = short(i.method)
    if (m === 'add_stock') add(i.data.medicine, num(i.data.qty))
    else if (m === 'give_out') add(i.data.medicine, -num(i.data.qty))
    else if (m === 'record_procedure' && i.data.complete) for (const r of i.data.items || []) add(r.medicine, -num(r.qty))
    // finishing a planned treatment: the medicines it uses are named by the screen that asked (meta.items)
    else if (m === 'complete_procedure') for (const r of (i.meta || {}).items || []) add(r.medicine, -num(r.qty))
  }
  return d
}

function withStatus(row) {
  const out = row.stock <= 0
  const low = !out && row.stock <= (row.minimum || 0)
  const status = out ? 'out' : row.has_expired ? 'expired' : row.is_expiring ? 'expiring' : low ? 'low' : 'ok'
  return { ...row, is_out: out, is_low: low, status }
}

function medicineRow(i, code) {
  const d = i.data
  return withStatus({
    code, name: d.name, category: d.category, form: d.form || '', strength: d.strength || '', location: d.location || '',
    unit: d.unit, description: '', stock: num(d.qty), minimum: num(d.minimum), nearest_expiry: d.expiry || null,
    expired_qty: 0, expiring_qty: 0, has_expired: false, is_expiring: false, pending: true,
  })
}

function templateRow(i, name, old = {}) {
  const d = i.data
  return {
    ...old, name, template: d.template, description: d.description || d.template, disabled: Number(d.disabled) || 0,
    items: (d.items || []).map((r) => ({ medicine: r.medicine, medicine_name: r.medicine, qty: r.qty, unit: '' })), used: old.used || 0, pending: true,
  }
}

function requestRow(i, old = {}) {
  const d = i.data
  // a change saved by an older version of the app holds one medicine and no rows
  const lines = (d.items || [d]).map((r) => ({ medicine: r.medicine, medicine_name: r.medicine_name || r.medicine, qty: r.qty, unit: r.unit || '' }))
  return {
    name: i.localId || i.id, date: new Date(i.at).toISOString().slice(0, 10), requested_by: '', can_edit: true, ...old,
    ...lines[0], items: lines, urgency: d.urgency, reason: d.reason, state: 'pending', status: 'Pending', pending: true,
  }
}

function patientRow(i, name) {
  const d = i.data
  const patient_name = [d.first_name, d.last_name].filter(Boolean).join(' ')
  let age = null
  if (d.dob) {
    const b = new Date(d.dob), n = new Date()
    const y = n.getFullYear() - b.getFullYear() - (n < new Date(n.getFullYear(), b.getMonth(), b.getDate()) ? 1 : 0)
    age = y > 0 ? `${y}y` : `${Math.max(0, (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth())}m`
  }
  return {
    name, patient_name, first_name: d.first_name, last_name: d.last_name || '', sex: d.sex, dob: d.dob || null, mobile: d.mobile || '',
    blood_group: d.blood_group || '', allergies: d.allergies || '', medical_history: d.medical_history || '', age,
    procedures: 0, last_visit: null, creation: new Date(i.at).toISOString(), pending: true,
  }
}

export const localDate = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const localTime = (ts) => new Date(ts).toTimeString().slice(0, 5)

function consultationRow(i, name, old = {}) {
  const d = i.data
  const m = i.meta || {}
  const done = Number(d.finish) ? 1 : 0
  return {
    ...old, name, patient: d.patient, patient_name: m.patient_name || old.patient_name || d.patient,
    practitioner: d.practitioner || old.practitioner, practitioner_name: m.practitioner_name || old.practitioner_name || '',
    encounter_date: old.encounter_date || d.date || localDate(i.at), time: old.time || localTime(i.at),
    encounter_comment: d.notes || '', docstatus: done, state: done ? 'done' : 'draft',
    symptoms: d.symptoms || [], diagnoses: d.diagnoses || [],
    prescription_count: (d.prescriptions || []).length, treatment_count: (d.treatments || []).length, pending: true,
  }
}

function vitalsOf(v = {}) {
  const bp = v.bp_systolic && v.bp_diastolic ? `${v.bp_systolic}/${v.bp_diastolic}` : ''
  return { temperature: v.temperature || '', pulse: v.pulse || '', bp, respiratory_rate: v.respiratory_rate || '', weight: v.weight || '', height: v.height || '' }
}

function consultationDetail(i, name, old = {}) {
  const d = i.data
  const row = consultationRow(i, name, old)
  return {
    ...row,
    prescriptions: (d.prescriptions || []).map((p) => ({ medicine: p.medicine, medicine_name: p.medicine_name || p.medicine, dosage: p.dosage, period: p.period, comment: p.comment || '', quantity: null, request_status: null })),
    treatments: (d.treatments || []).map((t) => ({ template: t, service_request: null, status: null, done: false })),
    vitals: Object.values(d.vitals || {}).some(Boolean) ? vitalsOf(d.vitals) : null,
  }
}

function procedureRow(i, name, patientName) {
  const d = i.data
  const m = i.meta || {}
  const done = Number(d.complete) ? 1 : 0
  return {
    name, patient: d.patient, patient_name: m.patient_name || patientName || d.patient, procedure_template: d.template, start_date: d.date || localDate(i.at),
    status: done ? 'Completed' : 'Pending', state: done ? 'done' : 'planned', notes: d.notes || '', docstatus: 1, by: '',
    items: (d.items || []).map((r) => ({ medicine: r.medicine, medicine_name: (m.medicines || {})[r.medicine] || r.medicine, qty: r.qty, unit: '' })), pending: true,
  }
}

function movementRows(items, filter = {}) {
  const rows = []
  const push = (i, direction, medicine, qty, reason, recipient) => {
    if (filter.kind && filter.kind !== 'all' && filter.kind !== direction) return
    if (filter.medicine && filter.medicine !== medicine) return
    rows.push({
      date: localDate(i.at), creation: new Date(i.at).toISOString(), medicine, medicine_name: (i.meta || {}).medicine_name || medicine, qty: num(qty), unit: '',
      batch: '', entry: '', owner: '', reason, recipient: recipient || null, type: direction === 'in' ? 'Material Receipt' : 'Material Issue',
      se_status: 0, balance: null, cancelled: false, direction, by: '', pending: true,
    })
  }
  for (const i of items) {
    const m = short(i.method)
    if (m === 'add_stock') push(i, 'in', i.data.medicine, i.data.qty, 'Received')
    else if (m === 'give_out') push(i, 'out', i.data.medicine, i.data.qty, i.data.reason, i.data.recipient)
    else if (m === 'record_procedure' && Number(i.data.complete)) for (const r of i.data.items || []) push(i, 'out', r.medicine, r.qty, 'Used in a procedure', (i.meta || {}).patient_name)
    else if (m === 'complete_procedure') for (const r of (i.meta || {}).items || []) push(i, 'out', r.medicine, r.qty, 'Used in a procedure', (i.meta || {}).patient_name)
  }
  return rows.reverse()
}

// a change names its medicine by code or by name (the same text for medicines made here)
const deltaFor = (d, code, name) => (d[code] || 0) + (name !== code ? d[name] || 0 : 0)

export function overlay(method, params, data, outbox) {
  const items = live(outbox)
  if (!items.length) return data
  switch (short(method)) {
    case 'medicines': {
      if (!Array.isArray(data)) return data
      const deltas = stockDeltas(items)
      const edits = items.filter((i) => short(i.method) === 'save_medicine' && i.data.code)
      let rows = data.map((r) => {
        let row = r
        for (const e of edits) if (e.data.code === r.code)
          row = { ...row, name: e.data.name, category: e.data.category, form: e.data.form || '', strength: e.data.strength || '', location: e.data.location || '', minimum: num(e.data.minimum), pending: true }
        const n = deltaFor(deltas, r.code, r.name)
        return n || row !== r ? withStatus({ ...row, stock: Math.max(0, r.stock + n), pending: true }) : r
      })
      for (const i of items) if (short(i.method) === 'save_medicine' && !i.data.code) {
        const code = i.localId
        const extra = deltaFor(deltas, code, i.data.name)
        const row = medicineRow(i, code)
        rows.push(withStatus({ ...row, stock: Math.max(0, row.stock + extra) }))
      }
      return rows.sort((a, b) => a.name.localeCompare(b.name))
    }
    case 'medicine': {
      const code = params.code
      const created = items.find((i) => short(i.method) === 'save_medicine' && !i.data.code && i.localId === code)
      const deltas = stockDeltas(items)
      const n = deltaFor(deltas, code, data ? data.name : created?.data.name)
      const edit = items.filter((i) => short(i.method) === 'save_medicine' && i.data.code === code).pop()
      if (!data && !created) return data
      let m = data ? { ...data } : { ...medicineRow(created, code), movements: [], batches: [] }
      if (edit) Object.assign(m, { name: edit.data.name, category: edit.data.category, form: edit.data.form || '', strength: edit.data.strength || '', location: edit.data.location || '', minimum: num(edit.data.minimum) })
      if (n) m = withStatus({ ...m, stock: Math.max(0, num(m.stock) + n) })
      const own = movementRows(items.filter((i) => [code, m.name].includes(i.data.medicine) || (i.data.items || []).concat((i.meta || {}).items || []).some((r) => [code, m.name].includes(r.medicine))), {}).filter((r) => [code, m.name].includes(r.medicine))
      return { ...m, movements: [...own, ...(m.movements || [])], pending: true }
    }
    case 'patients': {
      if (!Array.isArray(data)) return data
      const edits = items.filter((i) => short(i.method) === 'save_patient' && i.data.name)
      let rows = data.map((r) => {
        const e = edits.filter((x) => x.data.name === r.name).pop()
        return e ? { ...patientRow(e, r.name), procedures: r.procedures, last_visit: r.last_visit, creation: r.creation } : r
      })
      const fresh = items.filter((i) => short(i.method) === 'save_patient' && !i.data.name).map((i) => patientRow(i, i.localId)).reverse()
      rows = [...fresh, ...rows]
      const q = (params.search || '').toLowerCase()
      return q ? rows.filter((r) => [r.patient_name, r.mobile, r.name].some((v) => String(v || '').toLowerCase().includes(q))) : rows
    }
    case 'patient': {
      const name = params.name
      const created = items.find((i) => short(i.method) === 'save_patient' && !i.data.name && i.localId === name)
      const edit = items.filter((i) => short(i.method) === 'save_patient' && i.data.name === name).pop()
      if (!data && !created) return data
      let p = data ? { ...data } : { ...patientRow(created, name), procedures: [], consultations: [], prescriptions: [], treatments_requested: [], vitals: [] }
      if (edit) Object.assign(p, { ...patientRow(edit, name), procedures: p.procedures, consultations: p.consultations, prescriptions: p.prescriptions, treatments_requested: p.treatments_requested, vitals: p.vitals, creation: p.creation })
      const saves = items.filter((i) => short(i.method) === 'save_consultation')
      const fixes = items.filter((i) => short(i.method) === 'update_consultation')
      p.consultations = [
        ...saves.filter((i) => !i.data.name && i.data.patient === name).map((i) => consultationRow(i, i.localId, { patient_name: p.patient_name })).reverse(),
        ...(p.consultations || []).map((r) => {
          const e = saves.filter((x) => x.data.name === r.name).pop()
          const f = fixes.filter((x) => x.data.name === r.name).pop()
          const row = e ? consultationRow(e, r.name, r) : r
          return f ? { ...row, encounter_comment: f.data.notes || '', symptoms: f.data.symptoms || [], diagnoses: f.data.diagnoses || [], pending: true } : row
        }),
      ]
      const recorded = items.filter((i) => short(i.method) === 'record_procedure' && i.data.patient === name)
      p.procedures = [...recorded.map((i) => procedureRow(i, i.localId || i.id, p.patient_name)).reverse(), ...(p.procedures || [])]
      const moved = items.filter((i) => ['complete_procedure', 'cancel_procedure'].includes(short(i.method)))
      if (moved.length && p.procedures) {
        p.procedures = p.procedures.map((r) => {
          const m = moved.filter((i) => i.data.name === r.name).pop()
          return m ? { ...r, state: short(m.method) === 'complete_procedure' ? 'done' : 'cancelled', pending: true } : r
        })
      }
      return { ...p, pending: true }
    }
    case 'consultation': {
      const name = params.name
      const saves = items.filter((i) => short(i.method) === 'save_consultation')
      const created = saves.find((i) => !i.data.name && i.localId === name)
      if (!data && !created) return data
      if (created) return consultationDetail(created, name)
      const e = saves.filter((x) => x.data.name === name).pop()
      const f = items.filter((x) => short(x.method) === 'update_consultation' && x.data.name === name).pop()
      let c = data
      if (e) c = consultationDetail(e, name, data)
      if (f) c = { ...c, practitioner: f.data.practitioner || c.practitioner, encounter_comment: f.data.notes || '', symptoms: f.data.symptoms || [], diagnoses: f.data.diagnoses || [], pending: true }
      return c
    }
    case 'movements': {
      if (!Array.isArray(data)) return data
      const mine = movementRows(items, { kind: params.kind, medicine: params.medicine })
      return [...mine, ...data].slice(0, Number(params.limit) || 1000)
    }
    case 'dashboard': {
      if (!data?.counts) return data
      const deltas = stockDeltas(items)
      const units = Object.values(deltas).reduce((a, b) => a + b, 0)
      const fresh = items.filter((i) => short(i.method) === 'save_medicine' && !i.data.code).length
      const asks = items.filter((i) => short(i.method) === 'request_stock' && !i.data.name).length
      return { ...data, counts: { ...data.counts, units: Math.max(0, num(data.counts.units) + units), medicines: num(data.counts.medicines) + fresh, pending: num(data.counts.pending) + asks }, pending_changes: items.length }
    }
    case 'boot': {
      const made = items.filter((i) => short(i.method) === 'add_category').map((i) => i.data.name)
      if (!data?.options || !made.length) return data
      const categories = [...new Set([...(data.options.categories || []), ...made])].sort((a, b) => a.localeCompare(b))
      return { ...data, options: { ...data.options, categories } }
    }
    case 'procedure_templates': {
      if (!Array.isArray(data)) return data
      const edits = items.filter((i) => short(i.method) === 'save_procedure_template')
      let rows = data.map((r) => {
        const e = edits.filter((x) => x.data.name === r.name).pop()
        return e ? templateRow(e, r.name, r) : r
      })
      rows = [...rows, ...edits.filter((i) => !i.data.name).map((i) => templateRow(i, i.localId))]
      return params.include_disabled && Number(params.include_disabled) ? rows : rows.filter((r) => !r.disabled)
    }
    case 'requests': {
      if (!Array.isArray(data)) return data
      const saves = items.filter((i) => short(i.method) === 'request_stock')
      const rows = data.map((r) => {
        const e = saves.filter((x) => x.data.name === r.name).pop()
        return e ? requestRow(e, r) : r
      })
      return [...saves.filter((i) => !i.data.name).map((i) => requestRow(i)).reverse(), ...rows]
    }
    default:
      return data
  }
}

/** Waiting changes that belong to a patient (a consultation, a treatment), for the patient's file. */
export function pendingForPatient(outbox, patient) {
  return live(outbox).filter(
    (i) => (['save_consultation', 'record_procedure'].includes(short(i.method)) && i.data.patient === patient) || i.localId === patient,
  )
}
export const waitingTemplates = (outbox) => pendingOf(outbox, 'save_procedure_template')
