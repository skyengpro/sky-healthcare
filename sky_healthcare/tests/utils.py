import frappe
from frappe.utils import add_days, nowdate

from sky_healthcare import api, health
from sky_healthcare.setup import install, site


def before_tests():
	"""A new CI site has no company yet, and the stock flows need one."""
	frappe.clear_cache()
	if not frappe.is_setup_complete():
		site._setup_wizard(
			{"name": "Sky Test Clinic", "abbr": "STC", "country": "Cameroon", "currency": "XAF"},
			None,
			{"steps": []},
		)
	install.after_install()
	frappe.db.commit()  # nosemgrep


def unique(prefix):
	return f"{prefix} {frappe.generate_hash(length=8)}"


def make_staff(role="Pharmacy Staff"):
	email = f"{frappe.generate_hash(length=10)}@example.com"
	api.save_staff(email=email, full_name="Test Staff", role=role)
	return email


def practitioner_of(user):
	return frappe.db.get_value("Healthcare Practitioner", {"user_id": user}, "name")


def make_medicine():
	return api.save_medicine(name=unique("ZZ Medicine"), category="Other Medicine", unit="Tablet")["code"]


def make_patient():
	return health.save_patient(first_name=unique("ZZ Patient"), sex="Female")["name"]


def ensure_stock_adjustment_account():
	"""Stock entries need one, and a company from the setup wizard may not have it."""
	company = install.default_company()
	if frappe.db.get_value("Company", company, "stock_adjustment_account"):
		return
	base = {"company": company, "is_group": 0}
	account = frappe.db.get_value(
		"Account", {**base, "account_type": "Stock Adjustment"}, "name"
	) or frappe.db.get_value("Account", {**base, "root_type": "Expense"}, "name")
	frappe.db.set_value("Company", company, "stock_adjustment_account", account)


def receive(medicine, days_to_expiry=300, qty=10):
	ensure_stock_adjustment_account()
	return api.add_stock(
		medicine=medicine,
		qty=qty,
		price=100,
		expiry=add_days(nowdate(), days_to_expiry),
		lot=frappe.generate_hash(length=10),
	)


def run_as(user, function, *args, **kwargs):
	frappe.set_user(user)
	try:
		return function(*args, **kwargs)
	finally:
		frappe.set_user("Administrator")
