import frappe
from frappe.tests import IntegrationTestCase

from sky_healthcare import api
from sky_healthcare.tests.utils import make_medicine, make_staff, run_as


class TestMedicalRequests(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.staff = make_staff()
		cls.admin = make_staff("Clinic Admin")
		cls.first, cls.second, cls.third = make_medicine(), make_medicine(), make_medicine()

	def send(self, *rows, **kwargs):
		items = [{"medicine": code, "qty": qty} for code, qty in rows]
		return run_as(self.staff, api.request_stock, items=items, **kwargs)["request"]

	def row_of(self, name):
		return next(r for r in run_as(self.staff, api.requests) if r.name == name)

	def test_one_request_holds_every_medicine_in_order(self):
		name = self.send((self.first, 10), (self.second, 20))

		row = self.row_of(name)
		self.assertEqual([(i.medicine, i.qty) for i in row["items"]], [(self.first, 10), (self.second, 20)])
		self.assertEqual((row.medicine, row.qty), (self.first, 10))

	def test_a_waiting_request_can_be_changed(self):
		name = self.send((self.first, 10), (self.second, 20), reason="Before")
		kept_row = frappe.get_doc("Material Request", name).items[1].name

		run_as(
			self.staff,
			api.request_stock,
			name=name,
			items=[{"medicine": self.second, "qty": 5}, {"medicine": self.third, "qty": 7}],
			urgency="Urgent",
			reason="After",
		)

		doc = frappe.get_doc("Material Request", name)
		self.assertEqual(
			[(d.idx, d.item_code, d.qty, d.stock_qty) for d in doc.items],
			[(1, self.second, 5, 5), (2, self.third, 7, 7)],
		)
		self.assertEqual(doc.items[0].name, kept_row)
		self.assertTrue(doc.items[1].uom)
		self.assertEqual((doc.custom_urgency, doc.custom_reason, doc.docstatus), ("Urgent", "After", 0))

	def test_only_the_creator_or_an_administrator_can_change_a_request(self):
		name = self.send((self.first, 10))
		change = {"name": name, "items": [{"medicine": self.first, "qty": 20}]}

		with self.assertRaises(frappe.PermissionError):
			run_as(make_staff(), api.request_stock, **change)
		self.assertEqual(frappe.get_doc("Material Request", name).items[0].qty, 10)

		run_as(self.admin, api.request_stock, **change)
		self.assertEqual(frappe.get_doc("Material Request", name).items[0].qty, 20)

		rows = {
			user: next(r for r in run_as(user, api.requests) if r.name == name)
			for user in (self.staff, self.admin, make_staff())
		}
		self.assertEqual([r.can_edit for r in rows.values()], [True, True, False])

	def test_a_decided_request_cannot_be_changed(self):
		for action in ("approve", "reject"):
			with self.subTest(action):
				name = self.send((self.first, 10))
				run_as(self.admin, api.decide_request, name, action)
				with self.assertRaisesRegex(frappe.ValidationError, "already been handled"):
					run_as(
						self.staff, api.request_stock, name=name, items=[{"medicine": self.first, "qty": 99}]
					)
				self.assertEqual(frappe.get_doc("Material Request", name).items[0].qty, 10)

	def test_a_medicine_cannot_be_listed_twice(self):
		with self.assertRaisesRegex(frappe.ValidationError, "listed twice"):
			self.send((self.first, 1), (self.first, 2))

	def test_a_request_from_an_older_app_version_still_goes_through(self):
		name = run_as(self.staff, api.request_stock, medicine=self.first, qty=4)["request"]
		self.assertEqual([(i.medicine, i.qty) for i in self.row_of(name)["items"]], [(self.first, 4)])
