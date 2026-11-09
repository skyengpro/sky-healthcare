// Runs the Desk form script against stubs. Called by sky_healthcare/tests/test_record_sharing.py.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(
	new URL("../sky_healthcare/public/js/clinical_defaults.js", import.meta.url),
	"utf8",
);

async function open(doctype, { isNew = true, doc = {}, canRead = true, practitioner = "Dr A" } = {}) {
	const handlers = {};
	const lookups = [];
	const frappe = {
		session: { user: "nurse@example.com" },
		model: { can_read: () => canRead },
		ui: { form: { on: (dt, events) => (handlers[dt] ??= []).push(events) } },
		db: {
			get_value: async (dt, filters) => {
				lookups.push({ dt, filters });
				return { message: practitioner ? { name: practitioner } : {} };
			},
		},
	};
	vm.runInNewContext(source, { frappe });
	const values = {};
	const frm = { doc, is_new: () => isNew, set_value: (field, value) => (values[field] = value) };
	await Promise.all((handlers[doctype] ?? []).map((events) => events.onload(frm)));
	return { values, lookups };
}

for (const doctype of ["Patient Encounter", "Clinical Procedure", "Medication Request", "Service Request"]) {
	const { values, lookups } = await open(doctype);
	assert.equal(values.practitioner, "Dr A", doctype);
	assert.deepEqual({ ...lookups[0].filters }, { user_id: "nurse@example.com", status: "Active" });
}

assert.equal((await open("Patient Encounter")).values.appointment_type, "Consultation");
assert.equal((await open("Clinical Procedure")).values.appointment_type, undefined);
assert.equal(Object.keys((await open("Patient Encounter", { isNew: false })).values).length, 0);
assert.equal(
	(await open("Patient Encounter", { doc: { practitioner: "Dr B" } })).values.practitioner,
	undefined,
);
assert.equal(
	(await open("Patient Encounter", { doc: { appointment_type: "Follow up" } })).values.appointment_type,
	undefined,
);
assert.equal((await open("Clinical Procedure", { canRead: false })).lookups.length, 0);
assert.equal((await open("Clinical Procedure", { practitioner: null })).values.practitioner, undefined);
