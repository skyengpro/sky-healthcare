import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from sky_healthcare import api, health
from sky_healthcare.tests.utils import (
	make_medicine,
	make_patient,
	make_staff,
	receive,
	run_as,
	unique,
)


def stamps(doctype, name):
	return tuple(frappe.db.get_value(doctype, name, ["owner", "modified_by"]))


class TestAudit(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.staff = make_staff()
		cls.other = make_staff()
		cls.medicine = make_medicine()

	def test_stock_receipt_and_generated_postings_name_the_real_user(self):
		result = run_as(self.staff, receive, self.medicine)
		entry = result["stock_entry"]
		self.assertEqual(stamps("Stock Entry", entry), (self.staff, self.staff))
		# ERPNext refreshes the batch quantity with a direct write, which stamps the session user
		self.assertEqual(frappe.db.get_value("Batch", result["batch"], "owner"), self.staff)
		ledger = frappe.get_all("Stock Ledger Entry", filters={"voucher_no": entry}, pluck="name")
		self.assertTrue(ledger)
		for name in ledger:
			self.assertEqual(stamps("Stock Ledger Entry", name), (self.staff, self.staff))
		for name in frappe.get_all("Serial and Batch Bundle", filters={"voucher_no": entry}, pluck="name"):
			self.assertEqual(stamps("Serial and Batch Bundle", name), (self.staff, self.staff))

	def test_clinical_documents_name_the_real_user(self):
		patient = run_as(self.staff, make_patient)
		self.assertEqual(stamps("Patient", patient), (self.staff, self.staff))
		encounter = run_as(
			self.staff, health.save_consultation, patient=patient, notes="Observation", finish=1
		)["name"]
		self.assertEqual(stamps("Patient Encounter", encounter), (self.staff, self.staff))

	def test_procedure_and_its_stock_entry_name_the_real_user(self):
		run_as(self.staff, receive, self.medicine)
		template = unique("ZZ Treatment")
		run_as(
			self.staff,
			health.save_procedure_template,
			template=template,
			items=[{"medicine": self.medicine, "qty": 1}],
		)
		patient = run_as(self.staff, make_patient)
		result = run_as(self.staff, health.record_procedure, patient=patient, template=template)
		self.assertEqual(stamps("Clinical Procedure", result["name"]), (self.staff, self.staff))
		self.assertEqual(stamps("Stock Entry", result["stock_entry"]), (self.staff, self.staff))

	def test_an_edit_keeps_the_creator_and_records_the_editor(self):
		patient = run_as(self.staff, make_patient)
		run_as(self.other, health.save_patient, first_name="Edited", sex="Female", name=patient)
		self.assertEqual(stamps("Patient", patient), (self.staff, self.other))

	def test_change_history_names_the_real_user(self):
		patient = run_as(self.staff, make_patient)
		with patch("frappe.in_test", False):  # Frappe keeps no change history during tests
			run_as(self.other, health.save_patient, first_name="Changed", sex="Female", name=patient)
		version = frappe.get_all(
			"Version",
			filters={"ref_doctype": "Patient", "docname": patient},
			fields=["owner", "data"],
			order_by="creation desc",
			limit=1,
		)[0]
		self.assertEqual(version.owner, self.other)
		self.assertEqual(json.loads(version.data)["audit_user"], self.other)

	def test_writes_outside_an_elevated_call_are_left_alone(self):
		todo = frappe.get_doc({"doctype": "ToDo", "description": unique("audit")}).insert()
		self.assertEqual(stamps("ToDo", todo.name), ("Administrator", "Administrator"))

	def test_single_doctypes_are_skipped(self):
		frappe.flags.sky_healthcare_user = self.staff
		self.addCleanup(frappe.flags.pop, "sky_healthcare_user", None)
		api.record_real_user(frappe.get_single("Stock Settings"))

	def test_a_failed_write_restores_the_session(self):
		frappe.set_user(self.staff)
		self.addCleanup(frappe.set_user, "Administrator")
		with self.assertRaises(frappe.ValidationError):
			api.give_out(medicine=self.medicine, qty=1, reason="Not a reason")
		self.assertEqual(frappe.session.user, self.staff)
		self.assertFalse(frappe.flags.sky_healthcare_elevated)
		self.assertIsNone(frappe.flags.sky_healthcare_user)
		self.assertNotIn("audit_user", frappe.session.data)
