// Unit tests for the offline overlay: what the screens show while changes wait to be sent.
//   npm run test:offline   (Node 20+, no browser needed)
import test from 'node:test'
import assert from 'node:assert/strict'
import { overlay, pendingForPatient } from '../src/offline/pending.js'

const item = (method, data, extra = {}) => ({ id: Math.random().toString(36), method, data, at: Date.now(), status: 'waiting', ...extra })
const med = { code: 'Para', name: 'Para', category: 'Analgesic', form: 'Tablet', strength: '500mg', location: '', unit: 'Tablet', stock: 10, minimum: 5, nearest_expiry: '2028-01-01', expired_qty: 0, expiring_qty: 0 }

test('nothing waiting: data is returned as it is', () => {
  const data = [med]
  assert.equal(overlay('medicines', {}, data, []), data)
})

test('stock in and out move the numbers, and the status follows', () => {
  const out = [item('sky_healthcare.api.give_out', { medicine: 'Para', qty: 8 })]
  const [row] = overlay('medicines', {}, [med], out)
  assert.equal(row.stock, 2)
  assert.equal(row.status, 'low')
  assert.equal(row.pending, true)
  const more = [...out, item('add_stock', { medicine: 'Para', qty: 30 })]
  assert.equal(overlay('medicines', {}, [med], more)[0].stock, 32)
  const all = [item('give_out', { medicine: 'Para', qty: 99 })]
  assert.equal(overlay('medicines', {}, [med], all)[0].status, 'out')
})

test('stock is never counted twice when code and name are the same text', () => {
  const [row] = overlay('medicines', {}, [med], [item('add_stock', { medicine: 'Para', qty: 5 })])
  assert.equal(row.stock, 15)
})

test('a completed treatment takes its medicines out of the stock', () => {
  const rec = item('record_procedure', { patient: 'P', template: 'T', complete: 1, items: [{ medicine: 'Para', qty: 3 }] })
  assert.equal(overlay('medicines', {}, [med], [rec])[0].stock, 7)
  const planned = item('record_procedure', { patient: 'P', template: 'T', complete: 0, items: [{ medicine: 'Para', qty: 3 }] })
  assert.equal(overlay('medicines', {}, [med], [planned])[0].stock, 10)
})

test('a medicine made offline appears in the list, with the stock added to it afterwards', () => {
  const create = item('save_medicine', { name: 'Newmed', category: 'Analgesic', unit: 'Tablet', minimum: 2, qty: 5 }, { localId: 'local:m1', creates: 'medicine' })
  const add = item('add_stock', { medicine: 'local:m1', qty: 20 })
  const rows = overlay('medicines', {}, [med], [create, add])
  const fresh = rows.find((r) => r.code === 'local:m1')
  assert.equal(fresh.stock, 25)
  assert.equal(fresh.pending, true)
  assert.deepEqual(rows.map((r) => r.name), ['Newmed', 'Para'])
})

test('the page of a medicine made offline is built from the waiting change', () => {
  const create = item('save_medicine', { name: 'Newmed', category: 'Analgesic', unit: 'Tablet', minimum: 2 }, { localId: 'local:m1' })
  const m = overlay('medicine', { code: 'local:m1' }, undefined, [create])
  assert.equal(m.name, 'Newmed')
  assert.deepEqual(m.batches, [])
  assert.equal(overlay('medicine', { code: 'local:zzz' }, undefined, [create]), undefined)
})

test('stock movements made offline are listed first, tagged as waiting', () => {
  const rows = overlay('movements', { kind: 'out' }, [{ date: '2026-01-01', medicine: 'Para', qty: 1, direction: 'out' }], [
    item('give_out', { medicine: 'Para', qty: 4, reason: 'Damaged stock' }),
    item('add_stock', { medicine: 'Para', qty: 9 }),
  ])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].qty, 4)
  assert.equal(rows[0].pending, true)
  const onlyOther = overlay('movements', { kind: 'out', medicine: 'Other' }, [], [item('give_out', { medicine: 'Para', qty: 4 })])
  assert.equal(onlyOther.length, 0)
})

test('a patient made offline is listed first and found by search', () => {
  const create = item('save_patient', { first_name: 'Awa', last_name: 'Ndong', sex: 'Female' }, { localId: 'local:p1' })
  const rows = overlay('patients', {}, [{ name: 'Old', patient_name: 'Old One', mobile: '' }], [create])
  assert.equal(rows[0].name, 'local:p1')
  assert.equal(rows[0].patient_name, 'Awa Ndong')
  assert.equal(overlay('patients', { search: 'ndong' }, [], [create]).length, 1)
  assert.equal(overlay('patients', { search: 'zzz' }, [], [create]).length, 0)
})

test('the file of a patient made offline shows the consultation and the treatment that wait', () => {
  const create = item('save_patient', { first_name: 'Awa', sex: 'Female' }, { localId: 'local:p1' })
  const consult = item('save_consultation', { patient: 'local:p1', practitioner: 'D1', notes: 'Fever', finish: 1, symptoms: ['Fever'], diagnoses: ['Malaria'], prescriptions: [{ medicine: 'Para' }] }, { localId: 'local:c1', meta: { practitioner_name: 'Dr Who' } })
  const treat = item('record_procedure', { patient: 'local:p1', template: 'Dressing', complete: 0, items: [{ medicine: 'Para', qty: 2 }] }, { localId: 'local:t1' })
  const file = overlay('patient', { name: 'local:p1' }, undefined, [create, consult, treat])
  assert.equal(file.patient_name, 'Awa')
  assert.equal(file.consultations.length, 1)
  assert.equal(file.consultations[0].state, 'done')
  assert.equal(file.consultations[0].practitioner_name, 'Dr Who')
  assert.deepEqual(file.consultations[0].diagnoses, ['Malaria'])
  assert.equal(file.consultations[0].prescription_count, 1)
  assert.equal(file.procedures[0].state, 'planned')
  assert.equal(file.procedures[0].procedure_template, 'Dressing')
  assert.equal(pendingForPatient([create, consult, treat], 'local:p1').length, 3)
})

test('a consultation made offline opens as a page, as a draft or finished', () => {
  const draft = item('save_consultation', { patient: 'P', practitioner: 'D1', notes: 'x', finish: 0, vitals: { bp_systolic: 120, bp_diastolic: 80, temperature: 38 } }, { localId: 'local:c1' })
  const c = overlay('consultation', { name: 'local:c1' }, undefined, [draft])
  assert.equal(c.state, 'draft')
  assert.equal(c.vitals.bp, '120/80')
  assert.equal(c.pending, true)
  const done = { ...draft, data: { ...draft.data, finish: 1 } }
  assert.equal(overlay('consultation', { name: 'local:c1' }, undefined, [done]).state, 'done')
})

test('finishing a draft that exists on the server shows it as finished while it waits', () => {
  const server = { name: 'ENC-1', patient: 'P', state: 'draft', encounter_comment: '', symptoms: [], diagnoses: [], prescriptions: [], treatments: [] }
  const finish = item('save_consultation', { name: 'ENC-1', patient: 'P', notes: 'Done', finish: 1 })
  const c = overlay('consultation', { name: 'ENC-1' }, server, [finish])
  assert.equal(c.state, 'done')
  assert.equal(c.encounter_comment, 'Done')
})

test('completing or cancelling a treatment shows the new state in the patient file', () => {
  const file = { name: 'P', patient_name: 'P', procedures: [{ name: 'CP1', state: 'planned' }, { name: 'CP2', state: 'done' }], consultations: [] }
  const out = overlay('patient', { name: 'P' }, file, [item('complete_procedure', { name: 'CP1' }), item('cancel_procedure', { name: 'CP2' })])
  assert.equal(out.procedures.find((r) => r.name === 'CP1').state, 'done')
  assert.equal(out.procedures.find((r) => r.name === 'CP2').state, 'cancelled')
})

test('a category made offline is offered in the forms', () => {
  const boot = { user: {}, options: { categories: ['Antibiotic'] } }
  const out = overlay('boot', {}, boot, [item('add_category', { name: 'Antiparasitic' })])
  assert.deepEqual(out.options.categories, ['Antibiotic', 'Antiparasitic'])
})

test('treatment types made offline are listed, and hidden ones follow the filter', () => {
  const create = item('save_procedure_template', { template: 'Dressing', items: [{ medicine: 'Para', qty: 2 }], disabled: 0 }, { localId: 'local:t1' })
  assert.equal(overlay('procedure_templates', {}, [], [create]).length, 1)
  const hidden = item('save_procedure_template', { template: 'Old', items: [], disabled: 1 }, { localId: 'local:t2' })
  assert.equal(overlay('procedure_templates', {}, [], [hidden]).length, 0)
  assert.equal(overlay('procedure_templates', { include_disabled: 1 }, [], [hidden]).length, 1)
})

test('medical requests: a new one is listed first, a changed one replaces the server row', () => {
  const server = [{ name: 'MR-1', items: [{ medicine: 'Para', qty: 1 }], state: 'pending' }]
  const ask = item('request_stock', { items: [{ medicine: 'Para', qty: 5 }], urgency: 'Urgent' })
  const change = item('request_stock', { name: 'MR-1', items: [{ medicine: 'Para', qty: 9 }], urgency: 'Routine' })
  const rows = overlay('requests', {}, server, [ask, change])
  assert.equal(rows.length, 2)
  assert.equal(rows[0].items[0].qty, 5)
  assert.equal(rows[1].items[0].qty, 9)
  // a change saved by an older version holds one medicine and no rows
  const old = overlay('requests', {}, [], [item('request_stock', { medicine: 'Para', qty: 2, urgency: 'Routine' })])
  assert.equal(old[0].items[0].medicine, 'Para')
})

test('the dashboard counts follow the waiting changes', () => {
  const data = { counts: { units: 100, medicines: 10, pending: 1 } }
  const out = overlay('dashboard', {}, data, [item('add_stock', { medicine: 'Para', qty: 20 }), item('give_out', { medicine: 'Para', qty: 5 }), item('save_medicine', { name: 'N', category: 'A', unit: 'Tablet' }, { localId: 'local:m' }), item('request_stock', { items: [{ medicine: 'Para', qty: 1 }] })])
  assert.equal(out.counts.units, 115)
  assert.equal(out.counts.medicines, 11)
  assert.equal(out.counts.pending, 2)
})

test('changes that failed or are not waiting any more are not shown', () => {
  const failed = item('give_out', { medicine: 'Para', qty: 8 }, { status: 'failed' })
  assert.equal(overlay('medicines', {}, [med], [failed])[0].stock, 10)
})

test('finishing a planned treatment offline uses up the medicines it names', () => {
  const done = [item('health.complete_procedure', { name: 'CP-1' }, { meta: { items: [{ medicine: 'Para', qty: 3 }] } })]
  assert.equal(overlay('medicines', {}, [med], done)[0].stock, 7)
  const moves = overlay('movements', { kind: 'out' }, [], done)
  assert.equal(moves.length, 1)
  assert.equal(moves[0].qty, 3)
})
