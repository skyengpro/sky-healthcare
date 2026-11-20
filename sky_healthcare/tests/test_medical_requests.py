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


class TestRequestNumbers(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.staff = make_staff()
		cls.medicine = make_medicine()

	def send(self, **kwargs):
		items = [{"medicine": self.medicine, "qty": 1}]
		return run_as(self.staff, api.request_stock, items=items, **kwargs)["request"]

	def number(self, name):
		return frappe.db.get_value("Material Request", name, "custom_request_number")

	def desk_request(self, kind="Purchase"):
		return frappe.get_doc(
			{
				"doctype": "Material Request",
				"material_request_type": kind,
				"company": api._company(),
				"schedule_date": frappe.utils.nowdate(),
				"items": [
					{
						"item_code": self.medicine,
						"qty": 1,
						"schedule_date": frappe.utils.nowdate(),
						"warehouse": api._warehouse(),
					}
				],
			}
		).insert(ignore_permissions=True)

	def test_requests_are_numbered_one_after_the_other_within_the_year(self):
		first, second = self.send(), self.send()
		year = frappe.utils.getdate().year
		self.assertRegex(self.number(first), rf"^{year}-\d{{3,}}$")
		self.assertEqual(int(self.number(second).split("-")[1]), int(self.number(first).split("-")[1]) + 1)

	def test_the_list_shows_the_number_and_newest_first(self):
		first, second = self.send(), self.send()
		rows = [r for r in run_as(self.staff, api.requests) if r.name in (first, second)]
		self.assertEqual([r.number for r in rows], [self.number(second), self.number(first)])

	def test_changing_a_request_keeps_its_number(self):
		name = self.send()
		before = self.number(name)
		run_as(self.staff, api.request_stock, name=name, items=[{"medicine": self.medicine, "qty": 3}])
		self.assertEqual(self.number(name), before)

	def test_requests_made_outside_the_app_are_numbered_too(self):
		self.assertTrue(self.desk_request().custom_request_number)
		self.assertFalse(self.desk_request("Material Transfer").custom_request_number)

	def test_the_count_starts_again_each_year(self):
		key = api.REQUEST_SERIES.format(year=1999)
		self.addCleanup(frappe.db.delete, "Series", {"name": key})
		self.assertEqual(api._next_request_number("1999-03-01"), "1999-001")
		self.assertEqual(api._next_request_number("1999-12-31"), "1999-002")

	def test_requests_made_before_numbering_get_a_number_at_migration(self):
		older, newer = self.send(), self.send()
		for name in (older, newer):
			frappe.db.set_value("Material Request", name, "custom_request_number", None)
		api.number_existing_requests()
		self.assertLess(int(self.number(older).split("-")[1]), int(self.number(newer).split("-")[1]))
		kept = self.number(newer)
		api.number_existing_requests()
		self.assertEqual(self.number(newer), kept)


class TestNeededByDate(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cls.staff = make_staff()
		cls.medicine = make_medicine()

	def send(self, **kwargs):
		items = [{"medicine": self.medicine, "qty": 1}]
		return run_as(self.staff, api.request_stock, items=items, **kwargs)["request"]

	def needed(self, name):
		return str(frappe.db.get_value("Material Request", name, "schedule_date"))

	def test_the_chosen_date_is_kept_on_the_request_and_its_rows(self):
		day = frappe.utils.add_days(frappe.utils.nowdate(), 30)
		name = self.send(urgency="Urgent", needed_by=day)
		self.assertEqual(self.needed(name), day)
		self.assertEqual(
			{str(r.schedule_date) for r in frappe.get_doc("Material Request", name).items}, {day}
		)

	def test_without_a_date_it_comes_from_the_urgency(self):
		name = self.send(urgency="Urgent")
		self.assertEqual(
			self.needed(name), frappe.utils.add_days(frappe.utils.nowdate(), api.URGENCY_DAYS["Urgent"])
		)

	def test_the_date_can_be_changed_while_waiting(self):
		name = self.send()
		day = frappe.utils.add_days(frappe.utils.nowdate(), 5)
		run_as(
			self.staff,
			api.request_stock,
			name=name,
			items=[{"medicine": self.medicine, "qty": 1}],
			needed_by=day,
		)
		self.assertEqual(self.needed(name), day)

	def test_a_date_in_the_past_is_refused(self):
		with self.assertRaisesRegex(frappe.ValidationError, "past"):
			self.send(needed_by=frappe.utils.add_days(frappe.utils.nowdate(), -1))
