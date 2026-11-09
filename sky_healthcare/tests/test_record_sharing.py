import shutil
import subprocess
from pathlib import Path

import frappe
from frappe.permissions import add_user_permission
from frappe.tests import IntegrationTestCase

from sky_healthcare import health
from sky_healthcare.tests.utils import (
	make_medicine,
	make_patient,
	make_staff,
	practitioner_of,
	run_as,
	unique,
)

HEALTHCARE_LIMIT = "Healthcare Practitioner"


def make_clinician():
	"""A Desk user with standard roles, linked to a practitioner through Healthcare's own save."""
	email = f"{frappe.generate_hash(length=10)}@example.com"
	frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": "Clinician",
			"send_welcome_email": 0,
			"roles": [{"role": "Physician"}, {"role": "Nursing User"}],
		}
	).insert(ignore_permissions=True)
	practitioner = frappe.get_doc(
		{
			"doctype": "Healthcare Practitioner",
			"first_name": unique("ZZ Doctor"),
			"status": "Active",
			"user_id": email,
		}
	).insert(ignore_permissions=True)
	return email, practitioner.name


def limits(user, practitioner):
	return frappe.db.count(
		"User Permission",
		{"user": user, "allow": HEALTHCARE_LIMIT, "for_value": practitioner, "apply_to_all_doctypes": 1},
	)


class TestRecordSharing(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.clinician, cls.practitioner = make_clinician()
		cls.colleague = make_staff()
		cls.colleague_practitioner = practitioner_of(cls.colleague)
		cls.medicine = make_medicine()
		cls.patient = make_patient()
		cls.encounter = health.save_consultation(
			patient=cls.patient,
			practitioner=cls.colleague_practitioner,
			notes="Seen by a colleague",
			prescriptions=[{"medicine": cls.medicine}],
			finish=1,
		)["name"]
		template = unique("ZZ Treatment")
		health.save_procedure_template(template=template, items=[])
		cls.procedure = health.record_procedure(patient=cls.patient, template=template, complete=0)["name"]
		frappe.db.set_value("Clinical Procedure", cls.procedure, "practitioner", cls.colleague_practitioner)

	def visible(self, doctype):
		return run_as(
			self.clinician,
			frappe.get_list,
			doctype,
			filters={"patient": self.patient, "practitioner": self.colleague_practitioner},
			pluck="name",
		)

	def test_saving_a_practitioner_removes_healthcare_limit(self):
		self.assertEqual(limits(self.clinician, self.practitioner), 0)
		frappe.get_doc("Healthcare Practitioner", self.practitioner).save(ignore_permissions=True)
		self.assertEqual(limits(self.clinician, self.practitioner), 0)

	def test_linked_user_sees_records_of_every_practitioner(self):
		self.assertIn(self.encounter, self.visible("Patient Encounter"))
		self.assertTrue(self.visible("Medication Request"))
		self.assertIn(self.procedure, self.visible("Clinical Procedure"))

	def test_records_are_readable_through_the_api(self):
		from frappe import client

		rows = run_as(
			self.clinician,
			client.get_list,
			"Patient Encounter",
			filters={"name": self.encounter},
			fields=["name", "practitioner"],
		)
		self.assertEqual(rows[0]["practitioner"], self.colleague_practitioner)
		doc = run_as(self.clinician, client.get, "Clinical Procedure", self.procedure)
		self.assertEqual(doc["name"], self.procedure)

	def test_healthcare_limit_hides_colleagues_records_until_migration_removes_it(self):
		add_user_permission(HEALTHCARE_LIMIT, self.practitioner, self.clinician, ignore_permissions=True)
		self.assertEqual(self.visible("Patient Encounter"), [])
		health.open_all_practitioner_records()
		self.assertEqual(limits(self.clinician, self.practitioner), 0)
		self.assertIn(self.encounter, self.visible("Patient Encounter"))

	def test_a_scoped_permission_is_kept(self):
		add_user_permission(
			HEALTHCARE_LIMIT,
			self.practitioner,
			self.clinician,
			ignore_permissions=True,
			applicable_for="Patient Appointment",
		)
		health.open_all_practitioner_records()
		scoped = {"user": self.clinician, "allow": HEALTHCARE_LIMIT, "applicable_for": "Patient Appointment"}
		self.assertEqual(frappe.db.count("User Permission", scoped), 1)

	def test_desk_script_is_loaded_and_fills_the_forms(self):
		self.assertIn("/assets/sky_healthcare/js/clinical_defaults.js", frappe.get_hooks("app_include_js"))
		script = Path(frappe.get_app_path("sky_healthcare", "..", "tests", "desk_defaults.mjs")).resolve()
		result = subprocess.run(
			[shutil.which("node"), str(script)], capture_output=True, text=True, timeout=60, check=False
		)
		self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
