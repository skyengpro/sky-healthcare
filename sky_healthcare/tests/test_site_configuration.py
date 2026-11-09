from pathlib import Path
from unittest.mock import patch

import frappe
from frappe.installer import install_app, is_required_by
from frappe.tests import IntegrationTestCase
from frappe.utils.password import check_password, update_password

from sky_healthcare import api, health
from sky_healthcare.setup import install
from sky_healthcare.tests.utils import make_medicine, make_patient, make_staff, receive, run_as


class TestRequiredApps(IntegrationTestCase):
	def test_both_apps_are_declared(self):
		self.assertEqual(
			frappe.get_hooks("required_apps", app_name="sky_healthcare"),
			["frappe/erpnext", "frappe/healthcare"],
		)

	def test_install_fails_when_a_required_app_is_not_on_the_bench(self):
		self.addCleanup(setattr, frappe.flags, "in_install", None)
		for absent in ("erpnext", "healthcare"):
			apps = [app for app in frappe.get_all_apps() if app != absent]
			with patch("frappe.get_all_apps", return_value=apps):
				with self.assertRaisesRegex(Exception, f"App {absent} not in apps.txt"):
					install_app("sky_healthcare", force=True)

	def test_required_apps_cannot_be_uninstalled_first(self):
		for app in ("erpnext", "healthcare"):
			self.assertTrue(is_required_by(app, "sky_healthcare"))


class TestPermissionRules(IntegrationTestCase):
	def test_no_permission_rule_is_changed(self):
		before = frappe.db.count("Custom DocPerm")
		install.after_migrate()
		self.assertEqual(frappe.db.count("Custom DocPerm"), before)
		for doctype in ("DocPerm", "Custom DocPerm"):
			self.assertEqual(frappe.db.count(doctype, {"role": ["in", install.ROLES]}), 0)


class TestSiteSettings(IntegrationTestCase):
	def test_settings_are_applied(self):
		install.after_migrate()
		for field, value in install.STOCK_SETTINGS.items():
			self.assertEqual(frappe.db.get_single_value("Stock Settings", field), value, field)
		self.assertEqual(install.STOCK_SETTINGS["pick_serial_and_batch_based_on"], "Expiry")
		self.assertTrue(frappe.db.exists("Appointment Type", health.APPOINTMENT_TYPE))

	def test_stock_issue_takes_the_batch_that_expires_first(self):
		staff = make_staff()
		medicine = make_medicine()
		run_as(staff, receive, medicine, days_to_expiry=300)
		first = run_as(staff, receive, medicine, days_to_expiry=100)["batch"]
		result = run_as(staff, api.give_out, medicine=medicine, qty=5, reason="Other authorized adjustment")
		self.assertEqual(result["batches"], [first])

	def test_consultation_is_saved_without_an_appointment(self):
		staff = make_staff()
		patient = run_as(staff, make_patient)
		name = run_as(staff, health.save_consultation, patient=patient, notes="Walk-in")["name"]
		appointment, appointment_type = frappe.db.get_value(
			"Patient Encounter", name, ["appointment", "appointment_type"]
		)
		self.assertIsNone(appointment)
		self.assertEqual(appointment_type, health.APPOINTMENT_TYPE)


class TestMigration(IntegrationTestCase):
	def test_changed_settings_are_restored(self):
		frappe.db.set_single_value(
			"Stock Settings",
			{
				"enable_serial_and_batch_no_for_item": 0,
				"use_serial_batch_fields": 0,
				"pick_serial_and_batch_based_on": "FIFO",
				"auto_indent": 0,
			},
		)
		install.after_migrate()
		for field, value in install.STOCK_SETTINGS.items():
			self.assertEqual(frappe.db.get_single_value("Stock Settings", field), value, field)

	def test_changed_appointment_type_is_restored(self):
		frappe.db.set_value("Appointment Type", health.APPOINTMENT_TYPE, "default_duration", 5)
		install.after_migrate()
		self.assertEqual(
			frappe.db.get_value("Appointment Type", health.APPOINTMENT_TYPE, "default_duration"),
			health.APPOINTMENT_TYPE_SETTINGS["default_duration"],
		)

	def test_deleted_appointment_type_is_created_again(self):
		frappe.delete_doc("Appointment Type", health.APPOINTMENT_TYPE, force=True, ignore_permissions=True)
		install.after_migrate()
		self.assertTrue(frappe.db.exists("Appointment Type", health.APPOINTMENT_TYPE))

	def test_role_desk_access_is_restored(self):
		frappe.db.set_value("Role", "Clinic Staff", "desk_access", 1)
		install.after_migrate()
		self.assertEqual(frappe.db.get_value("Role", "Clinic Staff", "desk_access"), 0)

	def test_settings_are_not_saved_when_nothing_changed(self):
		install.configure_stock()
		before = frappe.db.get_single_value("Stock Settings", "modified")
		install.configure_stock()
		self.assertEqual(frappe.db.get_single_value("Stock Settings", "modified"), before)

	def test_running_twice_creates_no_duplicates(self):
		install.after_migrate()
		doctypes = (
			"Custom Field",
			"Role",
			"Appointment Type",
			"Notification",
			"Item Group",
			"UOM",
			"User Permission",
		)
		before = {doctype: frappe.db.count(doctype) for doctype in doctypes}
		install.after_migrate()
		self.assertEqual({doctype: frappe.db.count(doctype) for doctype in doctypes}, before)


class TestDefaultAdmin(IntegrationTestCase):
	email = install.DEFAULT_ADMIN["email"]

	def setUp(self):
		if frappe.db.exists("User", self.email):
			frappe.delete_doc("User", self.email, force=True, ignore_permissions=True)

	def test_created_with_the_admin_role_and_password_whatever_the_policy(self):
		refused = {"feedback": {"password_policy_validation_passed": False, "suggestions": []}}
		with patch("frappe.core.doctype.user.user.test_password_strength", return_value=refused):
			install.create_default_admin()

		self.assertEqual(frappe.get_roles(self.email).count("Clinic Admin"), 1)
		self.assertEqual(check_password(self.email, install.DEFAULT_ADMIN["password"]), self.email)

	def test_existing_user_is_left_as_it_is(self):
		install.create_default_admin()
		update_password(self.email, "another password 7!")
		frappe.db.set_value("User", self.email, "first_name", "Renamed")

		install.create_default_admin()

		self.assertEqual(frappe.db.get_value("User", self.email, "first_name"), "Renamed")
		self.assertEqual(check_password(self.email, "another password 7!"), self.email)

	def test_a_migration_does_not_bring_it_back(self):
		install.after_migrate()
		self.assertFalse(frappe.db.exists("User", self.email))


class TestConfigurationDocument(IntegrationTestCase):
	def test_document_lists_the_configuration(self):
		path = Path(frappe.get_app_path("sky_healthcare", "..", "docs", "default_install_configuration.md"))
		text = path.read_text()
		for expected in (*install.ROLES, *install.STOCK_SETTINGS, health.APPOINTMENT_TYPE):
			self.assertIn(expected, text)
		self.assertIn("User Permission", text)
		self.assertIn("overwrites local changes", text)
