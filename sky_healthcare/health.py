"""Patients and clinical procedures, stored in Frappe Health (the `healthcare` app).

The app keeps one record per medicine in each module:

- ERPNext Stock: the Item, its batches and every stock movement (see `api.py`).
- Frappe Health: a Medication linked to that Item, so doctors and nurses find the same medicine
  in prescriptions and procedures. `sync_medication` keeps it in step whenever the clinic adds,
  edits, archives or brings back a medicine.

A clinical procedure is done for a patient from a template (e.g. "Wound dressing"). The template
lists the medicines it uses. Completing the procedure takes those medicines out of the Medical
Store with the same rules as a stock out: valid batches only, earliest expiry first.
"""

import json
import re

import frappe
from frappe import _
from frappe.utils import cint, flt, getdate, now_datetime, nowdate

from sky_healthcare.api import (
	_allocate,
	_company,
	_existing,
	_owner,
	_require_staff,
	_submit,
	_user_names,
	_warehouse,
	_writes,
)

PROCEDURE_REASON = "Used in a procedure"
PROCEDURE_GROUP = "Clinical Procedures"
GENDERS = ["Female", "Male"]
BLOOD_GROUPS = [
	"A Positive",
	"A Negative",
	"B Positive",
	"B Negative",
	"AB Positive",
	"AB Negative",
	"O Positive",
	"O Negative",
]
# strength units as typed in the app ("500mg", "1 g", "5ml") -> UOM used by Frappe Health
STRENGTH_UNITS = {
	"mg": "mg",
	"g": "g",
	"mcg": "mcg",
	"µg": "mcg",
	"ug": "mcg",
	"ml": "ml",
	"iu": "IU",
	"ui": "IU",
	"%": "%",
}


def has_health():
	return "healthcare" in frappe.get_installed_apps()


def _require_health():
	if not has_health():
		frappe.throw(_("Patients and treatments need the Frappe Health app on this site."))


def _ensure(doctype, name, **fields):
	if not frappe.db.exists(doctype, name):
		frappe.get_doc({"doctype": doctype, **fields}).insert(ignore_permissions=True)
	return name


# ------------------------------------------------------------------ medicine <-> medication


def _parse_strength(text, fallback_uom="mg"):
	"""'500mg' -> (500.0, 'mg'). No strength written -> (0, the medicine's own unit, e.g. 'Tablet').

	Frappe Health requires a strength and a unit on every Medication; with no strength the unit the
	clinic counts in is shown, instead of an unrelated "mg".
	"""
	m = re.match(r"^\s*([\d.,]+)\s*([a-zA-Zµ%]+)?", text or "")
	if not m:
		return 0, _ensure("UOM", fallback_uom, uom_name=fallback_uom, enabled=1)
	value = flt(m.group(1).replace(",", "."))
	unit = STRENGTH_UNITS.get((m.group(2) or "mg").lower(), "mg")
	return value, _ensure("UOM", unit, uom_name=unit, enabled=1)


def _medication_of(code):
	return frappe.db.get_value("Medication Linked Item", {"item": code, "parenttype": "Medication"}, "parent")


def sync_medication(code):
	"""Create or update the Frappe Health Medication for a medicine (an ERPNext Item).

	Written straight to the database on update: Medication's own save hooks rename the Item and
	create prices, which the clinic does not want.
	"""
	if not has_health() or not frappe.db.exists("Item", code):
		return None
	item = frappe.db.get_value(
		"Item",
		code,
		["item_name", "item_group", "custom_dosage_form", "custom_strength", "stock_uom", "disabled"],
		as_dict=True,
	)
	strength, strength_uom = _parse_strength(item.custom_strength, item.stock_uom or "mg")
	fields = {
		"generic_name": item.item_name,
		"medication_class": _ensure("Medication Class", item.item_group, medication_class=item.item_group),
		"dosage_form": _ensure(
			"Dosage Form", item.custom_dosage_form or "Other", dosage_form=item.custom_dosage_form or "Other"
		),
		"strength": strength,
		"strength_uom": strength_uom,
		"disabled": item.disabled,
		"is_orderable": 1,
	}
	name = _medication_of(code)
	if name:
		frappe.db.set_value("Medication", name, fields)
		frappe.db.set_value(
			"Medication Linked Item", {"parent": name, "item": code}, "item_group", item.item_group
		)
	else:
		med = frappe.get_doc({"doctype": "Medication", **fields})
		# named like the medicine, unless a Medication of that name already exists (e.g. created in the desk)
		med.name = (
			code
			if not frappe.db.exists("Medication", code)
			else f"{code} ({item.custom_dosage_form or item.stock_uom})"
		)
		med.flags.name_set = True
		med.insert(ignore_permissions=True)
		frappe.get_doc(
			{
				"doctype": "Medication Linked Item",
				"parent": med.name,
				"parenttype": "Medication",
				"parentfield": "linked_items",
				"idx": 1,
				"item_code": code,
				"item": code,
				"item_group": item.item_group,
				"stock_uom": item.stock_uom,
				"is_billable": 0,
			}
		).db_insert()
		name = med.name
	if frappe.get_meta("Item").has_field("custom_medication"):
		frappe.db.set_value("Item", code, "custom_medication", name, update_modified=False)
	return name


def remove_medication(code, delete=False):
	"""The medicine was archived (disable its Medication) or deleted (delete the Medication too)."""
	if not has_health():
		return
	name = _medication_of(code)
	if not name:
		return
	if delete:
		frappe.db.delete("Medication Linked Item", {"parent": name, "parenttype": "Medication"})
		frappe.delete_doc("Medication", name, ignore_permissions=True, force=True)
	else:
		frappe.db.set_value("Medication", name, "disabled", 1)


def sync_all_medications():
	"""Give every medicine its Medication (after an update, or after installing Frappe Health)."""
	from sky_healthcare.api import _medicine_groups

	groups = _medicine_groups()
	if not has_health() or not groups:
		return
	for code in frappe.get_all(
		"Item", filters={"item_group": ["in", groups], "is_stock_item": 1}, pluck="name"
	):
		try:
			sync_medication(code)
		except Exception:
			frappe.log_error(f"Healthcare Management: could not sync Medication for {code}")


# ------------------------------------------------------------------ patients


def _age(dob):
	if not dob:
		return None
	dob, today = getdate(dob), getdate()
	return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def _patient_row(p):
	p.age = _age(p.dob)
	return p


@frappe.whitelist()
def patients(search: str | None = None):
	"""Patients, most recent first, with their number of procedures and the date of the last one."""
	_require_staff()
	_require_health()
	rows = frappe.db.sql(
		"""
		select p.name, p.patient_name, p.first_name, p.last_name, p.sex, p.dob, p.mobile, p.blood_group, p.creation,
			(select count(*) from `tabClinical Procedure` cp where cp.patient = p.name and cp.docstatus = 1) as procedures,
			(select max(cp.start_date) from `tabClinical Procedure` cp where cp.patient = p.name and cp.docstatus = 1) as last_visit
		from `tabPatient` p
		where p.status = 'Active'
			and (%(s)s is null or p.patient_name like %(s)s or p.mobile like %(s)s or p.name like %(s)s)
		order by p.creation desc
		limit 500
		""",
		{"s": f"%{search}%" if search else None},
		as_dict=True,
	)
	return [_patient_row(r) for r in rows]


@frappe.whitelist()
def patient(name: str):
	_require_staff()
	_require_health()
	if not frappe.db.exists("Patient", name):
		frappe.throw(_("Patient not found"), frappe.DoesNotExistError)
	p = frappe.db.get_value(
		"Patient",
		name,
		[
			"name",
			"patient_name",
			"first_name",
			"last_name",
			"sex",
			"dob",
			"mobile",
			"blood_group",
			"allergies",
			"medical_history",
			"creation",
			"owner",
		],
		as_dict=True,
	)
	_patient_row(p)
	p.procedures = procedures(patient=name)
	p.consultations = consultations(patient=name)
	p.prescriptions = prescriptions(patient=name)
	p.treatments_requested = treatments_requested(patient=name)
	p.vitals = _vitals_rows({"patient": name, "docstatus": 1})
	return p


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def save_patient(
	first_name: str,
	sex: str,
	last_name: str | None = None,
	dob: str | None = None,
	mobile: str | None = None,
	blood_group: str | None = None,
	allergies: str | None = None,
	medical_history: str | None = None,
	name: str | None = None,
	client_id: str | None = None,
):
	"""Register a patient in Frappe Health, or update one when `name` is given."""
	_require_health()
	if not name and (done := _by_client_id("Patient", client_id)):
		return {"name": done, "patient_name": frappe.db.get_value("Patient", done, "patient_name")}
	first_name = (first_name or "").strip()
	if not first_name:
		frappe.throw(_("Please enter the patient's first name"))
	if sex not in GENDERS:
		frappe.throw(_("Please choose the patient's sex"))
	if blood_group and blood_group not in BLOOD_GROUPS:
		blood_group = None
	if dob and getdate(dob) > getdate():
		frappe.throw(_("The date of birth cannot be in the future"))
	fields = {
		"first_name": first_name,
		"last_name": (last_name or "").strip(),
		"sex": sex,
		"dob": dob or None,
		"mobile": (mobile or "").strip(),
		"blood_group": blood_group,
		"allergies": allergies or "",
		"medical_history": medical_history or "",
	}
	if name:
		doc = frappe.get_doc("Patient", name)
		doc.update(fields)
		doc.save(ignore_permissions=True)
	else:
		doc = frappe.get_doc({"doctype": "Patient", "custom_client_id": client_id, **fields})
		doc.insert(ignore_permissions=True)
	return {"name": doc.name, "patient_name": doc.patient_name}


# ------------------------------------------------------------------ procedure templates


def _items_arg(items):
	"""[{medicine, qty}] from the app -> validated rows for a Clinical Procedure Item table."""
	if isinstance(items, str):
		items = json.loads(items or "[]")
	rows = []
	for row in items or []:
		code, qty = row.get("medicine"), flt(row.get("qty"))
		if not code:
			continue
		if qty <= 0:
			frappe.throw(_("Please enter a quantity above 0 for {0}").format(code))
		item = frappe.db.get_value(
			"Item", {"name": code, "disabled": 0}, ["name", "item_name", "stock_uom"], as_dict=True
		)
		if not item:
			frappe.throw(_("Medicine not found: {0}").format(code))
		rows.append(
			{
				"item_code": item.name,
				"item_name": item.item_name,
				"qty": qty,
				"uom": item.stock_uom,
				"stock_uom": item.stock_uom,
				"conversion_factor": 1,
				"transfer_qty": qty,
			}
		)
	return rows


def _item_rows(parent, parenttype):
	return frappe.get_all(
		"Clinical Procedure Item",
		filters={"parent": parent, "parenttype": parenttype},
		fields=["item_code as medicine", "item_name as medicine_name", "qty", "stock_uom as unit"],
		order_by="idx",
	)


@frappe.whitelist()
def procedure_templates(include_disabled: int | bool | str = 0):
	_require_staff()
	_require_health()
	filters = {} if cint(include_disabled) else {"disabled": 0}
	rows = frappe.get_all(
		"Clinical Procedure Template",
		filters=filters,
		fields=["name", "template", "description", "disabled", "consume_stock", "modified"],
		order_by="template asc",
	)
	counts = dict(
		frappe.db.sql("""select procedure_template, count(*) from `tabClinical Procedure`
		where docstatus = 1 group by procedure_template""")
	)
	for r in rows:
		r.items = _item_rows(r.name, "Clinical Procedure Template")
		r.used = counts.get(r.name, 0)
	return rows


def _by_client_id(doctype, client_id):
	"""A record this device already sent (a write is sent again when the answer was lost)."""
	if client_id and frappe.db.has_column(doctype, "custom_client_id"):
		return frappe.db.get_value(doctype, {"custom_client_id": client_id}, "name")


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def save_procedure_template(
	template: str,
	items: list | str,
	description: str | None = None,
	name: str | None = None,
	disabled: int | bool | str = 0,
	client_id: str | None = None,
):
	"""Create or edit a procedure template and the medicines it uses."""
	_require_health()
	if not name and (done := _by_client_id("Clinical Procedure Template", client_id)):
		return {"name": done}
	template = (template or "").strip()
	if not template:
		frappe.throw(_("Please enter the name of the treatment type"))
	rows = _items_arg(items)
	fields = {
		"description": (description or "").strip() or template,
		"consume_stock": 1 if rows else 0,
		"disabled": cint(disabled),
	}
	if name:
		doc = frappe.get_doc("Clinical Procedure Template", name)
		doc.update(fields)
		doc.set("items", rows)
		doc.save(ignore_permissions=True)
		return {"name": doc.name}
	if frappe.db.exists("Clinical Procedure Template", template):
		frappe.throw(
			_("A treatment type named {0} already exists").format(template), frappe.DuplicateEntryError
		)
	group = _ensure(
		"Item Group",
		PROCEDURE_GROUP,
		item_group_name=PROCEDURE_GROUP,
		parent_item_group="All Item Groups",
		is_group=0,
	)
	# Frappe Health also creates a (service) Item for the procedure, named like the template
	item_code = template if not frappe.db.exists("Item", template) else f"{template} (procedure)"
	doc = frappe.get_doc(
		{
			"doctype": "Clinical Procedure Template",
			"custom_client_id": client_id,
			"template": template,
			"item_code": item_code,
			"item_group": group,
			"is_billable": 0,
			"rate": 0,
			"items": rows,
			**fields,
		}
	)
	doc.insert(ignore_permissions=True)
	return {"name": doc.name}


# ------------------------------------------------------------------ procedures


def _procedure_rows(filters, limit=100):
	rows = frappe.get_all(
		"Clinical Procedure",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"procedure_template",
			"start_date",
			"status",
			"notes",
			"owner",
			"creation",
			"consume_stock",
			"actual_end_datetime",
			"docstatus",
			"custom_cancel_reason",
			"custom_cancelled_by",
		],
		order_by="start_date desc, creation desc",
		limit=cint(limit),
	)
	names = _user_names([r.owner for r in rows] + [r.custom_cancelled_by for r in rows])
	entries = {}
	if rows and frappe.get_meta("Stock Entry").has_field("custom_clinical_procedure"):
		entries = dict(
			frappe.get_all(
				"Stock Entry",
				filters={"custom_clinical_procedure": ["in", [r.name for r in rows]], "docstatus": 1},
				fields=["custom_clinical_procedure", "name"],
				as_list=True,
			)
		)
	for r in rows:
		r.items = _item_rows(r.name, "Clinical Procedure")
		r.by = names.get(r.owner, r.owner)
		r.cancelled_by = names.get(r.custom_cancelled_by, r.custom_cancelled_by)
		r.stock_entry = entries.get(r.name)
		r.state = "cancelled" if r.docstatus == 2 else "done" if r.status == "Completed" else "planned"
	return rows


@frappe.whitelist()
def procedures(patient: str | None = None, status: str | None = None, limit: int | str = 100):
	"""Recorded procedures, newest first (cancelled ones included). status: planned | done | cancelled."""
	_require_staff()
	_require_health()
	filters = {"docstatus": ["in", [1, 2]]}
	if patient:
		filters["patient"] = patient
	if status == "done":
		filters["docstatus"] = 1
		filters["status"] = "Completed"
	elif status == "planned":
		filters["status"] = ["in", ["Pending", "In Progress"]]
	elif status == "cancelled":
		filters["docstatus"] = 2
	return _procedure_rows(filters, limit)


def _complete(cp):
	"""Take the procedure's medicines out of the Medical Store, then mark it completed."""
	if cp.status == "Completed":
		return frappe.db.get_value(
			"Stock Entry", {"custom_clinical_procedure": cp.name, "docstatus": 1}, "name"
		)
	entry = None
	patient_name = cp.patient_name or frappe.db.get_value("Patient", cp.patient, "patient_name")
	needed = {}
	for row in cp.items:
		needed[row.item_code] = needed.get(row.item_code, 0) + flt(row.qty)
	if cp.consume_stock and needed:
		lines = []
		for code, qty in needed.items():
			try:
				plan = _allocate(code, qty, expired=False)
			except frappe.ValidationError as e:
				frappe.clear_last_message()
				frappe.throw(_("{0}: {1}").format(frappe.db.get_value("Item", code, "item_name"), str(e)))
			lines += [
				{
					"item_code": code,
					"qty": q,
					"s_warehouse": cp.warehouse,
					"use_serial_batch_fields": 1,
					"batch_no": b,
				}
				for b, q in plan
			]
		se = _submit(
			frappe.get_doc(
				{
					"doctype": "Stock Entry",
					"stock_entry_type": "Material Issue",
					"company": cp.company,
					"set_posting_time": 1,
					"posting_date": getdate(cp.start_date or nowdate()),
					"from_warehouse": cp.warehouse,
					"custom_reason": PROCEDURE_REASON,
					"custom_recipient": patient_name,
					"custom_clinical_procedure": cp.name,
					"items": lines,
				}
			)
		)
		entry = se.name
	details = "\n".join(f"{r.item_name}: {frappe.format(r.qty)} {r.stock_uom}" for r in cp.items)
	cp.db_set({"status": "Completed", "actual_end_datetime": now_datetime(), "consumption_details": details})
	return entry


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def record_procedure(
	patient: str,
	template: str,
	items: list | str | None = None,
	date: str | None = None,
	notes: str | None = None,
	complete: int | bool | str = 1,
	client_id: str | None = None,
	service_request: str | None = None,
):
	"""Record a procedure for a patient. With `complete`, its medicines leave the store right away."""
	_require_health()
	if client_id and (
		done := frappe.db.get_value("Clinical Procedure", {"custom_client_id": client_id}, "name")
	):
		return {"name": done, "duplicate": True}
	if not frappe.db.exists("Patient", patient):
		frappe.throw(_("Please choose a patient"))
	if not frappe.db.exists("Clinical Procedure Template", template):
		frappe.throw(_("Please choose a treatment"))
	rows = (
		_items_arg(items)
		if items is not None
		else [
			{
				"item_code": r.medicine,
				"item_name": r.medicine_name,
				"qty": r.qty,
				"uom": r.unit,
				"stock_uom": r.unit,
				"conversion_factor": 1,
				"transfer_qty": r.qty,
			}
			for r in _item_rows(template, "Clinical Procedure Template")
		]
	)
	date = getdate(date or nowdate())
	if date > getdate() and cint(complete):
		frappe.throw(_("A treatment that is done cannot have a future date. Plan it for that day instead."))
	if service_request:  # a treatment the doctor asked for in a consultation
		sr = frappe.db.get_value(
			"Service Request",
			service_request,
			["patient", "template_dn", "docstatus", "status"],
			as_dict=True,
		)
		if not sr or sr.patient != patient or sr.template_dn != template or sr.docstatus != 1:
			frappe.throw(_("This treatment was not asked for this patient"))
	cp = frappe.get_doc(
		{
			"doctype": "Clinical Procedure",
			"patient": patient,
			"procedure_template": template,
			"patient_name": frappe.db.get_value("Patient", patient, "patient_name"),
			"company": _company(),
			"warehouse": _warehouse(),
			"start_date": date,
			"consume_stock": 1 if rows else 0,
			"notes": notes or "",
			"items": rows,
			"custom_client_id": client_id,
			"service_request": service_request or None,
		}
	)
	cp.flags.ignore_permissions = True
	cp.insert()
	cp.submit()
	entry = _complete(cp) if cint(complete) else None
	if service_request and cint(complete):
		frappe.db.set_value("Service Request", service_request, "status", "completed-Request Status")
	return {
		"name": cp.name,
		"stock_entry": entry,
		"status": frappe.db.get_value("Clinical Procedure", cp.name, "status"),
	}


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def complete_procedure(name: str, date: str | None = None):
	"""Finish a planned procedure: its medicines leave the store now.

	`date` is the day it was done when the change was made without a connection (never later than today).
	"""
	_require_health()
	cp = frappe.get_doc("Clinical Procedure", name)
	if cp.docstatus == 1 and cp.status == "Completed":
		return {"name": cp.name, "stock_entry": None}  # already done (the first answer was lost)
	if cp.docstatus != 1 or cp.status == "Cancelled":
		frappe.throw(_("This treatment was cancelled"))
	if cp.status != "Completed":  # it happens today, whatever day it was planned for
		done_on = min(getdate(date or nowdate()), getdate())
		cp.db_set("start_date", done_on)
		cp.start_date = done_on
	return {"name": cp.name, "stock_entry": _complete(cp)}


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def cancel_procedure(name: str, reason: str | None = None):
	"""Cancel a procedure (clinic staff and administrators).

	A planned one is simply cancelled. A completed one needs a reason: its stock movement is cancelled
	too, so the medicines go back into the same batches. The original movement stays in the history,
	marked as cancelled, and the procedure stays in the patient's file as cancelled.
	"""
	_require_health()
	cp = frappe.get_doc("Clinical Procedure", name)
	if cp.docstatus == 2:
		return {"name": cp.name, "stock_returned": False}  # already cancelled
	reason = (reason or "").strip()
	completed = cp.status == "Completed"
	if completed and not reason:
		frappe.throw(_("Please give the reason for cancelling this treatment"))
	if completed:
		for se in frappe.get_all(
			"Stock Entry", filters={"custom_clinical_procedure": cp.name, "docstatus": 1}, pluck="name"
		):
			entry = frappe.get_doc("Stock Entry", se)
			entry.flags.ignore_permissions = True
			entry.cancel()
	cp.flags.ignore_permissions = True
	cp.cancel()
	cp.db_set({"custom_cancel_reason": reason, "custom_cancelled_by": _owner()}, update_modified=False)
	return {"name": cp.name, "stock_returned": completed}


# ------------------------------------------------------------------ doctors (Healthcare Practitioner)

APPOINTMENT_TYPE = "Consultation"
APPOINTMENT_TYPE_SETTINGS = {"allow_booking_for": "Practitioner", "default_duration": 20}
DOSAGES = ["Once Daily", "BID", "TID", "QID", "Once Bedtime"]
DURATIONS = ["1 Day", "2 Day", "3 Day", "5 Day", "1 Week", "2 Week", "1 Month"]
VITALS = ("temperature", "pulse", "respiratory_rate", "bp_systolic", "bp_diastolic", "weight", "height")


def sync_practitioner(user):
	"""Every app user is also a Healthcare Practitioner, so any of them can run a consultation.

	Called when a user is created or changed in the app, and for all app users on update.
	"""
	if not has_health() or not frappe.db.exists("User", user):
		return None
	u = frappe.db.get_value("User", user, ["first_name", "last_name", "full_name", "enabled"], as_dict=True)
	status = "Active" if u.enabled else "Disabled"
	name = frappe.db.get_value("Healthcare Practitioner", {"user_id": user}, "name")
	if name:
		frappe.db.set_value("Healthcare Practitioner", name, "status", status)
		return name
	doc = frappe.get_doc(
		{
			"doctype": "Healthcare Practitioner",
			"first_name": u.first_name or u.full_name or user,
			"last_name": u.last_name or "",
			"status": status,
			"user_id": user,
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


def sync_all_practitioners():
	users = frappe.get_all(
		"Has Role",
		filters={"role": ["in", ["Clinic Staff", "Clinic Admin"]], "parenttype": "User"},
		pluck="parent",
	)
	for user in set(users):
		try:
			sync_practitioner(user)
		except Exception:
			frappe.log_error(f"Healthcare Management: could not create a practitioner for {user}")


def _my_practitioner():
	return frappe.db.get_value("Healthcare Practitioner", {"user_id": _owner(), "status": "Active"}, "name")


def ensure_appointment_type():
	if not frappe.db.exists("Appointment Type", APPOINTMENT_TYPE):
		frappe.get_doc(
			{
				"doctype": "Appointment Type",
				"appointment_type": APPOINTMENT_TYPE,
				**APPOINTMENT_TYPE_SETTINGS,
			}
		).insert(ignore_permissions=True)
	return APPOINTMENT_TYPE


def configure_appointment_type():
	"""Create the default appointment type, and restore it if it was changed on the site."""
	doc = frappe.get_doc("Appointment Type", ensure_appointment_type())
	if any(doc.get(field) != value for field, value in APPOINTMENT_TYPE_SETTINGS.items()):
		doc.update(APPOINTMENT_TYPE_SETTINGS)
		doc.save(ignore_permissions=True)


# Healthcare limits a user linked to a practitioner to that practitioner's records. The care team shares
# its patients, so that one permission is removed and every practitioner sees what colleagues prescribed.


def _remove_practitioner_limit(practitioner, user):
	"""Remove only the permission Healthcare adds; a permission an administrator scoped stays."""
	for name in frappe.get_all(
		"User Permission",
		filters={
			"user": user,
			"allow": "Healthcare Practitioner",
			"for_value": practitioner,
			"apply_to_all_doctypes": 1,
			"is_default": 0,
		},
		pluck="name",
	):
		frappe.delete_doc(
			"User Permission", name, ignore_permissions=True, force=True, delete_permanently=True
		)


def open_practitioner_records(doc, method=None):
	"""`on_update` of Healthcare Practitioner: runs after Healthcare has added its permission."""
	if doc.user_id:
		_remove_practitioner_limit(doc.name, doc.user_id)


def open_all_practitioner_records():
	"""At each migration, for the practitioners already linked to a user."""
	for row in frappe.get_all(
		"Healthcare Practitioner", filters={"user_id": ["is", "set"]}, fields=["name", "user_id"]
	):
		_remove_practitioner_limit(row.name, row.user_id)


@frappe.whitelist()
def practitioners():
	"""Doctors who can be chosen for an appointment or a consultation."""
	_require_staff()
	_require_health()
	rows = frappe.get_all(
		"Healthcare Practitioner",
		filters={"status": "Active"},
		fields=["name", "practitioner_name", "user_id"],
		order_by="practitioner_name asc",
	)
	me = frappe.session.user
	for r in rows:
		r.me = r.user_id == me
	return rows


# ------------------------------------------------------------------ consultations (Patient Encounter)


def _named(doctype, field, names):
	"""Rows for a MultiSelect table: each name is looked up or created in the list (Complaint, Diagnosis)."""
	out = []
	for n in dict.fromkeys((x or "").strip() for x in (names or [])):
		if not n:
			continue
		if not frappe.db.exists(doctype, n):
			frappe.get_doc({"doctype": doctype, field: n}).insert(ignore_permissions=True)
		out.append(n)
	return out


@frappe.whitelist()
def suggestions(kind: str):
	"""Names already used for symptoms (kind=symptoms) or diagnoses (kind=diagnoses): helps typing."""
	_require_staff()
	_require_health()
	doctype, field = ("Complaint", "complaints") if kind == "symptoms" else ("Diagnosis", "diagnosis")
	return frappe.get_all(doctype, pluck=field, order_by="modified desc", limit=200)


def _prescription_rows(items):
	rows = []
	for r in items or []:
		code = r.get("medicine")
		if not code:
			continue
		item = frappe.db.get_value(
			"Item", {"name": code, "disabled": 0}, ["name", "item_name", "custom_medication"], as_dict=True
		)
		if not item:
			frappe.throw(_("Medicine not found: {0}").format(code))
		med = item.custom_medication or _medication_of(code)
		if not med:
			frappe.throw(
				_("{0} has no medication record yet. Open it in Medicines and save it once.").format(
					item.item_name
				)
			)
		dosage = r.get("dosage") or "Once Daily"
		period = r.get("period") or "1 Week"
		if dosage not in DOSAGES or period not in DURATIONS:
			frappe.throw(_("Please choose how often and for how long for {0}").format(item.item_name))
		rows.append(
			{
				"medication": med,
				"drug_code": item.name,
				"drug_name": item.item_name,
				"dosage": dosage,
				"period": period,
				"dosage_form": frappe.db.get_value("Medication", med, "dosage_form") or "Tablet",
				"comment": r.get("comment") or "",
			}
		)
	return rows


def _save_vitals(doc, vitals, finish):
	vitals = {k: v for k, v in (vitals or {}).items() if k in VITALS and str(v or "").strip() != ""}
	existing = frappe.db.get_value("Vital Signs", {"encounter": doc.name, "docstatus": 0}, "name")
	if not vitals:
		if existing:
			frappe.delete_doc("Vital Signs", existing, ignore_permissions=True)
		return
	data = {k: (flt(v) if k in ("weight", "height") else str(v).strip()) for k, v in vitals.items()}
	if existing:
		vs = frappe.get_doc("Vital Signs", existing)
		for k in VITALS:
			vs.set(k, data.get(k))
	else:
		vs = frappe.get_doc(
			{
				"doctype": "Vital Signs",
				"patient": doc.patient,
				"encounter": doc.name,
				"signs_date": doc.encounter_date,
				"signs_time": doc.encounter_time,
				"naming_series": "HLC-VTS-.YYYY.-",
				"company": doc.company,
				**data,
			}
		)
	vs.flags.ignore_permissions = True
	vs.save()
	if finish:
		vs.submit()


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def save_consultation(
	patient: str,
	name: str | None = None,
	practitioner: str | None = None,
	date: str | None = None,
	symptoms: list | str | None = None,
	diagnoses: list | str | None = None,
	notes: str | None = None,
	vitals: dict | str | None = None,
	prescriptions: list | str | None = None,
	treatments: list | str | None = None,
	finish: int | bool | str = 0,
	client_id: str | None = None,
):
	"""Save a consultation as a draft, or finish it (the doctor's orders are then created).

	Finishing creates a Prescription (Medication Request) per medicine and a requested Treatment (Service Request) per
	treatment. A finished consultation cannot be edited.
	"""
	_require_health()
	if not name and (done := _by_client_id("Patient Encounter", client_id)):
		return {
			"name": done,
			"status": "done" if frappe.db.get_value("Patient Encounter", done, "docstatus") == 1 else "draft",
		}
	if name and cint(finish) and frappe.db.get_value("Patient Encounter", name, "docstatus") == 1:
		return {"name": name, "status": "done"}  # finished already (the first answer was lost)
	symptoms, diagnoses, prescriptions, treatments = [
		_loads(x) for x in (symptoms, diagnoses, prescriptions, treatments)
	]
	vitals = _loads(vitals) or {}
	if not frappe.db.exists("Patient", patient):
		frappe.throw(_("Please choose a patient"))
	practitioner = practitioner or _my_practitioner()
	if not practitioner or not frappe.db.exists(
		"Healthcare Practitioner", {"name": practitioner, "status": "Active"}
	):
		frappe.throw(_("Please choose the doctor for this consultation"))
	date = getdate(date or nowdate())
	if date > getdate():
		frappe.throw(_("The date cannot be in the future"))
	for tpl in treatments or []:
		if not frappe.db.exists("Clinical Procedure Template", {"name": tpl, "disabled": 0}):
			frappe.throw(_("Treatment type not found: {0}").format(tpl))
	if cint(finish) and not (notes or symptoms or diagnoses or prescriptions or treatments):
		frappe.throw(_("Write at least one observation before finishing"))
	fields = {
		"patient": patient,
		"patient_name": frappe.db.get_value("Patient", patient, "patient_name"),
		"practitioner": practitioner,
		"company": _company(),
		"appointment_type": ensure_appointment_type(),
		"encounter_date": date,
		"encounter_comment": notes or "",
	}
	rows = {
		"symptoms": [{"complaint": n} for n in _named("Complaint", "complaints", symptoms)],
		"diagnosis": [{"diagnosis": n} for n in _named("Diagnosis", "diagnosis", diagnoses)],
		"drug_prescription": _prescription_rows(prescriptions),
		"procedure_prescription": [{"procedure": t} for t in dict.fromkeys(treatments or [])],
	}
	if name:
		doc = frappe.get_doc("Patient Encounter", name)
		if doc.docstatus != 0:
			frappe.throw(_("A finished consultation cannot be changed"))
		doc.update(fields)
	else:
		doc = frappe.get_doc(
			{
				"doctype": "Patient Encounter",
				"encounter_time": nowtime_str(),
				"custom_client_id": client_id,
				**fields,
			}
		)
	for table, value in rows.items():
		doc.set(table, value)
	doc.flags.ignore_permissions = True
	doc.save()
	_save_vitals(doc, vitals, cint(finish))
	if cint(finish):
		doc.submit()
	return {"name": doc.name, "status": "done" if cint(finish) else "draft"}


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def update_consultation(
	name: str,
	practitioner: str | None = None,
	symptoms: list | str | None = None,
	diagnoses: list | str | None = None,
	notes: str | None = None,
	vitals: dict | str | None = None,
):
	"""Correct what the doctor wrote on a finished consultation.

	The doctor, symptoms, diagnoses, observation and vital signs can be changed. The prescription and the treatments
	were already ordered when it was finished, so they stay as they are.
	"""
	_require_health()
	symptoms, diagnoses = _loads(symptoms), _loads(diagnoses)
	vitals = _loads(vitals) or {}
	if frappe.db.get_value("Patient Encounter", name, "docstatus") != 1:
		frappe.throw(_("Only a finished consultation can be corrected this way"))
	doc = frappe.get_doc("Patient Encounter", name)
	if practitioner and practitioner != doc.practitioner:
		if not frappe.db.exists("Healthcare Practitioner", {"name": practitioner, "status": "Active"}):
			frappe.throw(_("Please choose the doctor for this consultation"))
		doc.practitioner = practitioner
	if not (notes or symptoms or diagnoses or doc.drug_prescription or doc.procedure_prescription):
		frappe.throw(_("Write at least one observation"))
	doc.encounter_comment = notes or ""
	doc.set("symptoms", [{"complaint": n} for n in _named("Complaint", "complaints", symptoms)])
	doc.set("diagnosis", [{"diagnosis": n} for n in _named("Diagnosis", "diagnosis", diagnoses)])
	doc.flags.ignore_permissions = True
	doc.flags.ignore_validate_update_after_submit = True
	doc.save()
	_edit_vitals(doc, vitals)
	return {"name": doc.name}


def _edit_vitals(doc, vitals):
	"""Change the vital signs of a finished consultation (a new reading is created if there was none)."""
	data = {
		k: (flt(v) if k in ("weight", "height") else str(v).strip())
		for k, v in (vitals or {}).items()
		if k in VITALS and str(v or "").strip() != ""
	}
	existing = frappe.db.get_value("Vital Signs", {"encounter": doc.name, "docstatus": ["<", 2]}, "name")
	if not data and not existing:
		return
	if not existing:
		_save_vitals(doc, data, 1)
		return
	vs = frappe.get_doc("Vital Signs", existing)
	for k in VITALS:
		vs.set(k, data.get(k))
	vs.flags.ignore_permissions = True
	vs.flags.ignore_validate_update_after_submit = True
	vs.save()


def nowtime_str():
	return frappe.utils.nowtime().split(".")[0]


def _loads(value):
	if isinstance(value, str):
		return json.loads(value or "null")
	return value


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def discard_consultation(name: str):
	"""Delete a draft consultation. A finished one stays in the file."""
	_require_health()
	status = frappe.db.get_value("Patient Encounter", name, "docstatus")
	if status is None:
		return {"name": name}  # already gone
	if status != 0:
		frappe.throw(_("A finished consultation cannot be deleted"))
	for vs in frappe.get_all("Vital Signs", filters={"encounter": name, "docstatus": 0}, pluck="name"):
		frappe.delete_doc("Vital Signs", vs, ignore_permissions=True)
	frappe.delete_doc("Patient Encounter", name, ignore_permissions=True)
	return {"name": name}


def _consultation_row(r):
	if not r.get("patient_name"):
		r.patient_name = frappe.db.get_value("Patient", r.patient, "patient_name")
	if not r.get("practitioner_name"):
		r.practitioner_name = frappe.db.get_value(
			"Healthcare Practitioner", r.practitioner, "practitioner_name"
		)
	r.state = "done" if r.docstatus == 1 else "cancelled" if r.docstatus == 2 else "draft"
	r.symptoms = frappe.get_all(
		"Patient Encounter Symptom", filters={"parent": r.name}, pluck="complaint", order_by="idx"
	)
	r.diagnoses = frappe.get_all(
		"Patient Encounter Diagnosis", filters={"parent": r.name}, pluck="diagnosis", order_by="idx"
	)
	r.prescription_count = frappe.db.count("Drug Prescription", {"parent": r.name})
	r.treatment_count = frappe.db.count("Procedure Prescription", {"parent": r.name})
	return r


@frappe.whitelist()
def consultations(patient: str | None = None, limit: int | str = 100):
	_require_staff()
	_require_health()
	filters = {"docstatus": ["<", 2]}
	if patient:
		filters["patient"] = patient
	rows = frappe.get_all(
		"Patient Encounter",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"practitioner",
			"practitioner_name",
			"encounter_date",
			"encounter_time",
			"encounter_comment",
			"docstatus",
		],
		order_by="encounter_date desc, encounter_time desc",
		limit=cint(limit),
	)
	for r in rows:
		r.time = str(r.encounter_time)[:5] if r.encounter_time else ""
		_consultation_row(r)
	return rows


def _vitals_rows(filters):
	rows = frappe.get_all(
		"Vital Signs",
		filters=filters,
		fields=[
			"name",
			"patient",
			"signs_date",
			"signs_time",
			"temperature",
			"pulse",
			"respiratory_rate",
			"bp_systolic",
			"bp_diastolic",
			"bp",
			"weight",
			"height",
			"bmi",
			"docstatus",
			"encounter",
		],
		order_by="signs_date desc, signs_time desc",
		limit=50,
	)
	for r in rows:
		r.bp = r.bp or (f"{r.bp_systolic}/{r.bp_diastolic}" if r.bp_systolic and r.bp_diastolic else "")
	return rows


@frappe.whitelist()
def consultation(name: str):
	"""One consultation with everything the doctor wrote and ordered."""
	_require_staff()
	_require_health()
	if not frappe.db.exists("Patient Encounter", name):
		frappe.throw(_("Consultation not found"), frappe.DoesNotExistError)
	r = frappe.db.get_value(
		"Patient Encounter",
		name,
		[
			"name",
			"patient",
			"patient_name",
			"practitioner",
			"practitioner_name",
			"encounter_date",
			"encounter_time",
			"encounter_comment",
			"docstatus",
			"creation",
			"owner",
		],
		as_dict=True,
	)
	r.time = str(r.encounter_time)[:5] if r.encounter_time else ""
	_consultation_row(r)
	r.prescriptions = frappe.get_all(
		"Drug Prescription",
		filters={"parent": name},
		fields=[
			"drug_code as medicine",
			"drug_name as medicine_name",
			"dosage",
			"period",
			"comment",
			"medication_request",
		],
		order_by="idx",
	)
	for p in r.prescriptions:
		if p.medication_request:
			mr = (
				frappe.db.get_value(
					"Medication Request", p.medication_request, ["quantity", "status"], as_dict=True
				)
				or {}
			)
			p.quantity, p.request_status = mr.get("quantity"), mr.get("status")
	r.treatments = frappe.get_all(
		"Procedure Prescription",
		filters={"parent": name},
		fields=["procedure as template", "service_request"],
		order_by="idx",
	)
	for t in r.treatments:
		t.status = (
			frappe.db.get_value("Service Request", t.service_request, "status") if t.service_request else None
		)
		t.done = bool(t.status and t.status.startswith("completed"))
	r.vitals = (_vitals_rows({"encounter": name, "docstatus": ["<", 2]}) or [None])[0]
	return r


# ------------------------------------------------------------------ prescriptions (Medication Request) and orders


@frappe.whitelist()
def prescriptions(patient: str | None = None, limit: int | str = 100):
	"""Medicines a doctor prescribed (Medication Requests). They do not move stock."""
	_require_staff()
	_require_health()
	filters = {"docstatus": ["<", 2]}
	if patient:
		filters["patient"] = patient
	rows = frappe.get_all(
		"Medication Request",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"medication",
			"medication_item",
			"quantity",
			"dosage",
			"period",
			"comment",
			"status",
			"order_date",
			"practitioner_name",
			"order_group",
		],
		order_by="order_date desc, creation desc",
		limit=cint(limit),
	)
	for r in rows:
		r.medicine_name = (
			frappe.db.get_value("Item", r.medication_item, "item_name") if r.medication_item else r.medication
		)
		r.stopped = (r.status or "").startswith(("stopped", "cancelled", "completed"))
		r.state = (
			"done"
			if (r.status or "").startswith("completed")
			else "cancelled"
			if (r.status or "").startswith(("stopped", "cancelled"))
			else "active"
		)
	return rows


@frappe.whitelist()
def treatments_requested(patient: str | None = None):
	"""Treatments a doctor asked for in a consultation and that nobody has recorded yet."""
	_require_staff()
	_require_health()
	filters = {"docstatus": 1, "template_dt": "Clinical Procedure Template", "status": ["like", "active%"]}
	if patient:
		filters["patient"] = patient
	rows = frappe.get_all(
		"Service Request",
		filters=filters,
		fields=[
			"name",
			"patient",
			"patient_name",
			"template_dn as template",
			"order_date",
			"practitioner_name",
			"order_group",
		],
		order_by="order_date desc",
		limit=100,
	)
	for r in rows:
		r.consultation = r.order_group
	return rows


def care_summary():
	"""Numbers and latest procedures for the dashboard."""
	month = nowdate()[:8] + "01"
	week = frappe.utils.add_days(nowdate(), -6)
	done = {"docstatus": 1, "status": "Completed"}
	by_day = dict(
		frappe.db.sql(
			"""select start_date, count(*) from `tabClinical Procedure`
		where docstatus = 1 and status = 'Completed' and start_date >= %s group by start_date""",
			week,
		)
	)
	return {
		"patients": frappe.db.count("Patient", {"status": "Active"}),
		"new_patients": frappe.db.count("Patient", {"status": "Active", "creation": [">=", month]}),
		"procedures_month": frappe.db.count("Clinical Procedure", {**done, "start_date": [">=", month]}),
		"planned": frappe.db.count(
			"Clinical Procedure", {"docstatus": 1, "status": ["in", ["Pending", "In Progress"]]}
		),
		"week": [
			{
				"date": str(frappe.utils.add_days(week, i)),
				"count": by_day.get(getdate(frappe.utils.add_days(week, i)), 0),
			}
			for i in range(7)
		],
		"recent": _procedure_rows({"docstatus": 1}, limit=5),
		"consultations": consultations(limit=5),
		"requested": len(treatments_requested()),
		"top_templates": frappe.db.sql(
			"""select procedure_template as name, count(*) as n from `tabClinical Procedure`
			where docstatus = 1 and status = 'Completed' and start_date >= %s group by procedure_template order by n desc limit 4""",
			month,
			as_dict=True,
		),
	}
