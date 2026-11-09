// Healthcare's User Permission used to prefill the practitioner on these forms. The app removes it so
// the care team shares its records, so the form fills in the practitioner of the signed-in user.
(() => {
	const WITH_PRACTITIONER = [
		"Patient Encounter",
		"Clinical Procedure",
		"Medication Request",
		"Service Request",
	];

	const fill_practitioner = async (frm) => {
		if (!frm.is_new() || frm.doc.practitioner || !frappe.model.can_read("Healthcare Practitioner")) {
			return;
		}
		const { message } = await frappe.db.get_value(
			"Healthcare Practitioner",
			{ user_id: frappe.session.user, status: "Active" },
			"name",
		);
		if (message && message.name) {
			frm.set_value("practitioner", message.name);
		}
	};

	WITH_PRACTITIONER.forEach((doctype) => {
		frappe.ui.form.on(doctype, { onload: fill_practitioner });
	});

	// lets a consultation be saved without an appointment
	frappe.ui.form.on("Patient Encounter", {
		onload(frm) {
			if (frm.is_new() && !frm.doc.appointment_type) {
				frm.set_value("appointment_type", "Consultation");
			}
		},
	});
})();
