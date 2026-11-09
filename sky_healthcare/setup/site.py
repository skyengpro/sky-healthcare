"""Set up a whole site for Healthcare Management in one command.

	bench --site <site> execute sky_healthcare.setup.site.setup --kwargs "{'config': '/path/to/site-setup.json'}"

Without a config file it only does the parts that need no choices (roles, fields, categories, units,
dosages, notifications, store). See `site-setup.example.json` next to this file for every option.

Every step is safe to run again and creates no duplicates. Users, medicines and treatment types that
already exist are kept; docs/default_install_configuration.md lists what is overwritten. New users
without a password in the config get a generated one, printed once at the end.
"""

import json
import secrets
from pathlib import Path

import frappe
from frappe import _
from frappe.utils import getdate, nowdate

from sky_healthcare.setup import install

DOSAGE_FORMS = [
	"Tablet",
	"Capsule",
	"Syrup",
	"Injection",
	"Cream / Ointment",
	"Drops",
	"Inhaler",
	"Powder / Sachet",
	"Suppository",
	"Other",
]
# Frappe Health ships these on install; they are added here only if a site is missing them
DOSAGES = {
	"Once Daily": [("09:00:00", 1)],
	"BID": [("09:00:00", 1), ("21:00:00", 1)],
	"TID": [("09:00:00", 1), ("14:00:00", 1), ("21:00:00", 1)],
	"QID": [("09:00:00", 1), ("13:00:00", 1), ("17:00:00", 1), ("21:00:00", 1)],
}
DURATIONS = [(n, p) for p in ("Day", "Week", "Month") for n in range(1, 4)]


def setup(config: str | None = None):
	"""Run every setup step. `config` is the path of a JSON file (see site-setup.example.json)."""
	cfg = _read_config(config) if config else {}
	report = {"steps": [], "users": [], "warnings": []}
	# a bench command, run by the site operator: the steps below create roles, users and settings
	frappe.set_user("Administrator")  # nosemgrep

	_setup_wizard(cfg.get("company"), cfg.get("admin_user"), report)
	install.after_install()
	report["steps"].append("roles, custom fields, categories, units, notifications, Pharmacy store")
	_system_settings(cfg.get("company") or {}, report)
	_dosages(report)
	_check_inventory_account(report)
	# keep the base setup even if a later, optional step (users, medicines) fails
	frappe.db.commit()  # nosemgrep

	for user in cfg.get("users", []):
		report["users"].append(_user(user))
	medicines = _medicines(cfg.get("medicines", []), report)
	_treatment_types(cfg.get("treatment_types", []), medicines, report)
	frappe.db.commit()  # nosemgrep

	_print(report)
	return {"ok": True, "warnings": report["warnings"]}


# ------------------------------------------------------------------ steps


def _setup_wizard(company, admin_user, report):
	"""Create the company and finish the ERPNext setup wizard, unless it was already done."""
	if frappe.is_setup_complete():
		report["steps"].append(f"setup wizard already done (company {install.default_company()})")
		return
	if not company or not company.get("name"):
		frappe.throw(_("The setup wizard is not done yet: give a 'company' in the config (see the example)."))
	from frappe.desk.page.setup_wizard.setup_wizard import setup_complete

	year = getdate(nowdate()).year
	args = {
		"language": company.get("language", "English"),
		"country": company.get("country", "Cameroon"),
		"timezone": company.get("timezone", "Africa/Douala"),
		"currency": company.get("currency", "XAF"),
		"company_name": company["name"],
		"company_abbr": company.get("abbr") or "".join(w[0] for w in company["name"].split())[:5].upper(),
		"chart_of_accounts": "Standard",
		"fy_start_date": f"{year}-01-01",
		"fy_end_date": f"{year}-12-31",
		"domains": ["Healthcare"],
		"setup_demo": 0,
	}
	if admin_user:
		args.update(
			full_name=admin_user["full_name"],
			email=admin_user["email"],
			password=admin_user.get("password") or _password(),
		)
		report["users"].append(
			{
				"email": admin_user["email"],
				"role": "System Manager (desk)",
				"password": args["password"],
				"new": True,
			}
		)
	result = setup_complete(args)
	if result.get("status") != "ok":
		frappe.throw(_("The setup wizard failed: {0}").format(result))
	report["steps"].append(f"setup wizard done (company {company['name']})")


def _system_settings(company, report):
	"""Local formats, and no public sign-up: accounts are created by an administrator."""
	ss = frappe.get_single("System Settings")
	ss.date_format = company.get("date_format", "dd-mm-yyyy")
	ss.time_format = "HH:mm"
	ss.number_format = company.get("number_format", "#,###.##")
	ss.float_precision = ss.float_precision or "3"
	if company.get("timezone"):
		ss.time_zone = company["timezone"]
	if company.get("app_language"):
		ss.language = company["app_language"]
	ss.save(ignore_permissions=True)
	frappe.db.set_single_value("Website Settings", "disable_signup", 1)
	report["steps"].append("system settings: local date format, sign-up disabled")


def _dosages(report):
	"""Dosage forms for medicines, and the usual dosages and durations for prescriptions."""
	if not frappe.db.exists("DocType", "Dosage Form"):
		return
	added = 0
	for form in DOSAGE_FORMS:
		if not frappe.db.exists("Dosage Form", form):
			frappe.get_doc({"doctype": "Dosage Form", "dosage_form": form}).insert(ignore_permissions=True)
			added += 1
	for name, times in DOSAGES.items():
		if not frappe.db.exists("Prescription Dosage", name):
			frappe.get_doc(
				{
					"doctype": "Prescription Dosage",
					"dosage": name,
					"dosage_strength": [{"strength_time": t, "strength": s} for t, s in times],
				}
			).insert(ignore_permissions=True)
			added += 1
	for number, period in DURATIONS:
		name = f"{number} {period}"
		if not frappe.db.exists("Prescription Duration", name):
			frappe.get_doc({"doctype": "Prescription Duration", "number": number, "period": period}).insert(
				ignore_permissions=True
			)
			added += 1
	report["steps"].append(f"dosage forms, dosages and durations ({added} added)")


def _check_inventory_account(report):
	company = install.default_company()
	if frappe.db.get_value("Company", company, "enable_perpetual_inventory") and not frappe.db.get_value(
		"Company", company, "default_inventory_account"
	):
		report["warnings"].append(
			f"Company {company} has no Default Inventory Account: stock cannot be recorded until one is set."
		)


def _user(u):
	"""A pharmacy user (and their doctor profile), created like the Staff page does."""
	from sky_healthcare.api import save_staff

	email = u["email"].strip().lower()
	role = {"admin": "Pharmacy Admin", "staff": "Pharmacy Staff"}.get(u.get("role", "staff"), u.get("role"))
	new = not frappe.db.exists("User", email)
	password = u.get("password") or (_password() if new else None)
	save_staff(email=email, full_name=u["full_name"], role=role, password=password)
	if u.get("language"):
		frappe.db.set_value("User", email, "language", u["language"])
	return {"email": email, "role": role, "password": password if new else "(unchanged)", "new": new}


def _medicines(rows, report):
	"""Optional starting catalogue. Existing medicines (same name) are left as they are."""
	from sky_healthcare.api import save_medicine

	codes, added = {}, 0
	for m in rows:
		code = frappe.db.get_value("Item", {"item_name": m["name"]}, "name")
		if not code:
			stock = m.get("stock") or {}
			code = save_medicine(
				name=m["name"],
				category=m.get("category", "Other Medicine"),
				unit=m.get("unit", "Tablet"),
				form=m.get("form"),
				strength=m.get("strength"),
				minimum=m.get("minimum", 0),
				qty=stock.get("qty", 0),
				expiry=stock.get("expiry"),
				lot=stock.get("lot"),
			)["code"]
			added += 1
		codes[m["name"]] = code
	if rows:
		report["steps"].append(f"medicines ({added} added, {len(rows) - added} already there)")
	return codes


def _treatment_types(rows, medicines, report):
	"""Optional treatment types with the medicines each one uses."""
	if not rows:
		return
	from sky_healthcare.health import has_health, save_procedure_template

	if not has_health():
		report["warnings"].append("Frappe Health is not installed: treatment types were skipped.")
		return
	added = 0
	for t in rows:
		if frappe.db.exists("Clinical Procedure Template", t["name"]):
			continue
		items = []
		for i in t.get("medicines", []):
			code = medicines.get(i["medicine"]) or frappe.db.get_value(
				"Item", {"item_name": i["medicine"]}, "name"
			)
			if not code:
				report["warnings"].append(
					f"Treatment type {t['name']}: medicine {i['medicine']} not found, left out."
				)
				continue
			items.append({"medicine": code, "qty": i.get("qty", 1)})
		save_procedure_template(template=t["name"], items=items, description=t.get("description"))
		added += 1
	report["steps"].append(f"treatment types ({added} added, {len(rows) - added} already there)")


# ------------------------------------------------------------------ helpers


def _read_config(path):
	# bench commands run from the sites folder; also accept a path relative to the bench folder
	for p in (Path(path), Path(frappe.utils.get_bench_path()) / path):
		if p.is_file():
			return json.loads(p.read_text())
	frappe.throw(_("Config file not found: {0}").format(path))


def _password():
	# letters, digits and a symbol, so it passes Frappe's password strength check
	return secrets.token_urlsafe(10) + "-7a"


def _print(report):
	print("\nHealthcare Management: site setup finished")
	for s in report["steps"]:
		print(f"  done   {s}")
	for w in report["warnings"]:
		print(f"  WARN   {w}")
	if report["users"]:
		print("\n  Users (passwords are shown once, keep them safe):")
		for u in report["users"]:
			print(f"    {u['email']:<36} {u['role']:<22} {'new' if u['new'] else 'kept':<5} {u['password']}")
	print(f"\n  Open: {frappe.utils.get_url('/sky-healthcare')}\n")
