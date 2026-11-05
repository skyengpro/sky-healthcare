"""Server API for the Healthcare Management app.

Every function checks the caller's pharmacy role first, then does the stock work with ERPNext on
the user's behalf. Staff never need ERPNext permissions of their own, and each write is one
call, so a dropped connection cannot leave half a record behind.

Writes accept a `client_id` made by the app. Sending the same `client_id` twice returns the
first result instead of recording the stock movement again, which is what lets the PWA retry
queued offline actions safely.
"""

from contextlib import contextmanager
from functools import wraps

import frappe
from frappe import _
from frappe.utils import add_days, cint, flt, getdate, nowdate

STAFF_ROLES = ("Pharmacy Staff", "Pharmacy Admin", "System Manager")
ADMIN_ROLES = ("Pharmacy Admin", "System Manager")
PHARMACY_ROLES = ("Pharmacy Staff", "Pharmacy Admin")
EXPIRY_WARNING_DAYS = 90
# Why stock may leave without a patient. Medicine for a patient leaves through a procedure ("Used in a procedure").
# Older entries keep their earlier reasons ("Dispensed to a patient", "Transfer to ...") in the history.
REASONS = [
	"Damaged stock",
	"Expired stock",
	"Other authorized adjustment",
]
URGENCY_DAYS = {"Routine": 14, "Urgent": 3, "Emergency": 0}


# ------------------------------------------------------------------ access


def _roles():
	if frappe.flags.sky_healthcare_elevated:
		return frappe.flags.sky_healthcare_roles
	return set(frappe.get_roles())


def _require_staff():
	if frappe.session.user == "Guest" or not (_roles() & set(STAFF_ROLES)):
		frappe.throw(_("You do not have access to the pharmacy."), frappe.PermissionError)


def _require_admin():
	_require_staff()
	if not (_roles() & set(ADMIN_ROLES)):
		frappe.throw(_("Only a pharmacy administrator can do this."), frappe.PermissionError)


def _is_admin():
	return bool(_roles() & set(ADMIN_ROLES))


def _company():
	return (
		frappe.defaults.get_user_default("company")
		or frappe.defaults.get_global_default("company")
		or frappe.db.get_value("Company", {}, "name")
	)


def _warehouse():
	wh = frappe.db.get_value(
		"Warehouse", {"warehouse_name": "Pharmacy", "is_group": 0, "company": _company()}, "name"
	)
	if not wh:
		frappe.throw(
			_("The Pharmacy store is not set up. Ask your administrator to finish the installation.")
		)
	return wh


def _medicine_groups():
	lft, rgt = frappe.db.get_value("Item Group", "Medicine", ["lft", "rgt"]) or (0, 0)
	return frappe.get_all("Item Group", filters={"lft": [">=", lft], "rgt": ["<=", rgt]}, pluck="name")


def _user_names(users):
	users = [u for u in set(users) if u]
	if not users:
		return {}
	rows = frappe.get_all("User", filters={"name": ["in", users]}, fields=["name", "full_name"])
	return {r.name: r.full_name or r.name for r in rows}


@contextmanager
def _as_system():
	"""Run stock postings with full rights after the role check.

	ERPNext checks permissions deep inside stock posting (batch bundles, ledger entries), and
	pharmacy users deliberately have no ERPNext permissions. Documents still record the real
	user as their owner, see `_owner`.
	"""
	user = frappe.session.user
	# the caller already passed the pharmacy role check in `_writes`; the real user is restored below
	frappe.set_user("Administrator")  # nosemgrep
	try:
		yield user
	finally:
		frappe.set_user(user)  # nosemgrep


def _writes(admin=False):
	"""Check the caller's pharmacy role, then run the write with full rights (see `_as_system`)."""

	def decorator(fn):
		@wraps(fn)
		def wrapper(*args, **kwargs):
			_require_admin() if admin else _require_staff()
			if frappe.flags.sky_healthcare_elevated:
				return fn(*args, **kwargs)
			roles = set(frappe.get_roles())
			with _as_system() as user:
				frappe.flags.update(
					sky_healthcare_user=user, sky_healthcare_roles=roles, sky_healthcare_elevated=True
				)
				try:
					return fn(*args, **kwargs)
				finally:
					frappe.flags.update(
						sky_healthcare_user=None, sky_healthcare_roles=None, sky_healthcare_elevated=False
					)

		return wrapper

	return decorator


def _owner():
	return frappe.flags.sky_healthcare_user or frappe.session.user


def _keep_owner(doc):
	"""Frappe records the session user (here the elevated system user) as owner; put the real user back."""
	user = _owner()
	if user and doc.owner != user:
		frappe.db.set_value(doc.doctype, doc.name, "owner", user, update_modified=False)
		doc.owner = user
	return doc


def _existing(doctype, client_id):
	if client_id:
		return frappe.db.get_value(doctype, {"custom_client_id": client_id}, "name")


# ------------------------------------------------------------------ boot


# Guests must be able to call this: the login screen asks it who is logged in and for a CSRF token.
# It returns nothing but {"user": None} unless the caller is a pharmacy user.
@frappe.whitelist(allow_guest=True)  # nosemgrep
def boot():
	"""Everything the app needs at start. Also returns a fresh CSRF token, so a cached page can still post."""
	if frappe.session.user == "Guest":
		return {"user": None}
	_require_staff()
	user = frappe.get_cached_doc("User", frappe.session.user)
	company = _company()
	return {
		"user": {
			"name": user.name,
			"full_name": user.full_name or user.name,
			"email": user.email,
			"image": user.user_image,
			"language": user.language,
		},
		"is_admin": _is_admin(),
		"csrf_token": frappe.sessions.get_csrf_token(),
		"company": company,
		"currency": frappe.db.get_value("Company", company, "default_currency") if company else None,
		"site_name": frappe.db.get_single_value("System Settings", "app_name")
		if frappe.db.get_single_value("System Settings", "app_name") not in (None, "", "Frappe", "ERPNext")
		else company,
		"options": {
			"categories": [g for g in _medicine_groups() if g != "Medicine"],
			"forms": [
				f for f in (frappe.get_meta("Item").get_options("custom_dosage_form") or "").split("\n") if f
			],
			"units": frappe.get_all(
				"UOM",
				filters={
					"enabled": 1,
					"name": [
						"in",
						[
							"Tablet",
							"Capsule",
							"Bottle",
							"Vial",
							"Sachet",
							"Box",
							"Tube",
							"Ampoule",
							"Strip",
							"Pack",
							"Nos",
						],
					],
				},
				pluck="name",
			),
			"reasons": REASONS,
			"urgencies": list(URGENCY_DAYS),
			"genders": health.GENDERS,
			"blood_groups": health.BLOOD_GROUPS,
			"dosages": health.DOSAGES,
			"durations": health.DURATIONS,
		},
		"health": health.has_health(),
		"practitioner": health._my_practitioner() if health.has_health() else None,
	}


# ------------------------------------------------------------------ medicines


def _medicine_rows(search=None, category=None, name=None):
	# optional filters are passed as NULL when unused, so the query text never changes
	values = {
		"groups": _medicine_groups() or [""],
		"wh": _warehouse(),
		"today": nowdate(),
		"soon": add_days(nowdate(), EXPIRY_WARNING_DAYS),
		"name": name or None,
		"search": f"%{search}%" if search else None,
		"category": category or None,
	}
	return frappe.db.sql(
		"""
		select i.name as code, i.item_name as name, i.item_group as category, i.custom_dosage_form as form,
			i.custom_strength as strength, i.custom_location as location, i.stock_uom as unit, i.description,
			coalesce((select sum(b.actual_qty) from `tabBin` b where b.item_code = i.name and b.warehouse = %(wh)s), 0) as stock,
			coalesce((select max(r.warehouse_reorder_level) from `tabItem Reorder` r where r.parent = i.name), 0) as minimum,
			(select min(bt.expiry_date) from `tabBatch` bt where bt.item = i.name and bt.batch_qty > 0 and bt.disabled = 0
				and bt.expiry_date >= %(today)s) as nearest_expiry,
			coalesce((select sum(bt.batch_qty) from `tabBatch` bt where bt.item = i.name and bt.batch_qty > 0 and bt.disabled = 0
				and bt.expiry_date < %(today)s), 0) as expired_qty,
			coalesce((select sum(bt.batch_qty) from `tabBatch` bt where bt.item = i.name and bt.batch_qty > 0 and bt.disabled = 0
				and bt.expiry_date >= %(today)s and bt.expiry_date <= %(soon)s), 0) as expiring_qty
		from `tabItem` i
		where i.disabled = 0 and i.is_stock_item = 1 and i.item_group in %(groups)s
			and (%(name)s is null or i.name = %(name)s)
			and (%(search)s is null or i.item_name like %(search)s or i.name like %(search)s)
			and (%(category)s is null or i.item_group = %(category)s)
		order by i.item_name
		""",
		values,
		as_dict=True,
	)


def _with_status(row):
	row.stock, row.minimum = flt(row.stock), flt(row.minimum)
	row.is_out = row.stock <= 0
	row.is_low = not row.is_out and row.stock <= row.minimum
	row.has_expired = flt(row.expired_qty) > 0
	row.is_expiring = flt(row.expiring_qty) > 0
	row.status = (
		"out"
		if row.is_out
		else "expired"
		if row.has_expired
		else "expiring"
		if row.is_expiring
		else "low"
		if row.is_low
		else "ok"
	)
	return row


@frappe.whitelist()
def medicines(
	search: str | None = None,
	category: str | None = None,
	status: str | None = None,
	expiry_before: str | None = None,
):
	"""Medicine list with stock, minimum level, nearest expiry and a status."""
	_require_staff()
	rows = [_with_status(r) for r in _medicine_rows(search, category)]
	if status and status != "all":
		key = {"low": "is_low", "out": "is_out", "expiring": "is_expiring", "expired": "has_expired"}.get(
			status
		)
		rows = [r for r in rows if (r.status == "ok" if status == "ok" else r.get(key))]
	if expiry_before:
		rows = [r for r in rows if r.nearest_expiry and getdate(r.nearest_expiry) <= getdate(expiry_before)]
	return rows


@frappe.whitelist()
def medicine(code: str):
	"""One medicine with its batches and latest movements."""
	_require_staff()
	rows = _medicine_rows(name=code)
	if not rows:
		frappe.throw(_("Medicine not found"), frappe.DoesNotExistError)
	med = _with_status(rows[0])
	med.batches = frappe.get_all(
		"Batch",
		filters={"item": code, "batch_qty": [">", 0], "disabled": 0},
		fields=["name as batch", "expiry_date", "batch_qty as qty"],
		order_by="expiry_date asc",
	)
	for b in med.batches:
		b.expired = bool(b.expiry_date and getdate(b.expiry_date) < getdate())
		b.days_left = (getdate(b.expiry_date) - getdate()).days if b.expiry_date else None
	med.movements = _movements(medicine=code, limit=15)
	return med


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def add_category(name: str):
	"""Add a medicine category (a group under "Medicine"). An existing one is returned as it is."""
	name = " ".join((name or "").split())
	if not name:
		frappe.throw(_("Please enter the name of the category"))
	if len(name) > 70:
		frappe.throw(_("The category name is too long"))
	for existing in _medicine_groups():
		if existing.lower() == name.lower():
			return {"name": existing, "created": False}
	if frappe.db.exists("Item Group", name):
		frappe.throw(_("A group named {0} already exists in ERPNext. Choose another name.").format(name))
	frappe.get_doc(
		{
			"doctype": "Item Group",
			"item_group_name": name,
			"parent_item_group": "Medicine",
			"is_group": 0,
		}
	).insert(ignore_permissions=True)
	return {"name": name, "created": True}


@frappe.whitelist(methods=["POST"])
@_writes(admin=True)
def delete_category(name: str):
	"""Remove a medicine category that no medicine uses any more (administrators only)."""
	if name == "Medicine" or name not in _medicine_groups():
		frappe.throw(_("Category not found"), frappe.DoesNotExistError)
	used = frappe.db.count("Item", {"item_group": name})
	if used:
		frappe.throw(
			_("{0} medicine(s) still use the category {1}. Move them to another category first.").format(
				used, name
			)
		)
	try:
		frappe.delete_doc("Item Group", name, ignore_permissions=True)
	except frappe.LinkExistsError:
		frappe.throw(
			_("The category {0} is used elsewhere in the system and cannot be deleted.").format(name)
		)
	return {"name": name, "deleted": True}


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def save_medicine(
	name: str,
	category: str,
	unit: str,
	form: str | None = None,
	strength: str | None = None,
	location: str | None = None,
	minimum: int | float | str = 0,
	code: str | None = None,
	qty: int | float | str = 0,
	price: int | float | str = 0,
	date: str | None = None,
	expiry: str | None = None,
	lot: str | int | None = None,
	client_id: str | None = None,
):
	"""Create a medicine, or update one when `code` is given. Optionally receives its first stock."""
	_require_staff()
	if not code and (done := _existing("Item", client_id)):
		return {"code": done}
	name = (name or "").strip()
	if not name:
		frappe.throw(_("Please enter the medicine name"))
	if category not in _medicine_groups():
		frappe.throw(_("Please choose a medicine category"))
	wh = _warehouse()
	reorder = [
		{
			"warehouse": wh,
			"warehouse_reorder_level": flt(minimum),
			"warehouse_reorder_qty": max(flt(minimum) * 2, 1),
			"material_request_type": "Purchase",
		}
	]

	restored = False
	if not code:
		existing = frappe.db.get_value("Item", name, ["name", "disabled"]) or frappe.db.get_value(
			"Item", {"item_name": name}, ["name", "disabled"]
		)
		if existing and not existing[1]:
			frappe.throw(
				_("{0} already exists. Open it and use Add Stock instead.").format(name),
				frappe.DuplicateEntryError,
			)
		if existing:  # removed earlier (see delete_medicine): bring it back with the new details
			frappe.db.set_value("Item", existing[0], "disabled", 0)
			code, restored = existing[0], True

	if code:
		item = frappe.get_doc("Item", code)
		item.update(
			{
				"item_name": name,
				"item_group": category,
				"custom_dosage_form": form,
				"custom_strength": strength,
				"custom_location": location,
			}
		)
		item.set("reorder_levels", reorder if flt(minimum) else [])
		item.flags.ignore_permissions = True
		item.save()
		health.sync_medication(item.name)
		out = {"code": item.name}
		if restored and flt(qty) > 0:
			out["stock_entry"] = add_stock(item.name, qty, price, date, expiry, lot)["stock_entry"]
		return out

	item = frappe.get_doc(
		{
			"doctype": "Item",
			"owner": _owner(),
			"custom_client_id": client_id,
			"item_code": name,
			"item_name": name,
			"item_group": category,
			"stock_uom": unit,
			"is_stock_item": 1,
			"include_item_in_manufacturing": 0,
			"is_purchase_item": 1,
			"is_sales_item": 0,
			"has_batch_no": 1,
			"create_new_batch": 1,
			"batch_number_series": "BATCH-.#####",
			"has_expiry_date": 1,
			"shelf_life_in_days": 730,
			"custom_dosage_form": form,
			"custom_strength": strength,
			"custom_location": location,
			"reorder_levels": reorder if flt(minimum) else [],
		}
	)
	item.insert(ignore_permissions=True)
	_keep_owner(item)
	health.sync_medication(item.name)  # the same medicine in Frappe Health
	out = {"code": item.name}
	if flt(qty) > 0:
		out["stock_entry"] = add_stock(item.name, qty, price, date, expiry, lot)["stock_entry"]
	return out


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def delete_medicine(code: str):
	"""Remove a medicine from the list (pharmacy staff and administrators).

	A medicine that still has stock cannot be removed. One that was never used is deleted. One with
	history is archived instead (disabled), because ERPNext must keep its stock ledger; it disappears
	from every list, and adding the same name again brings it back.
	"""
	rows = _medicine_rows(name=code)
	if not rows:
		frappe.throw(_("Medicine not found"), frappe.DoesNotExistError)
	stock = flt(rows[0].stock)
	if stock > 0:
		frappe.throw(
			_(
				"{0} still has {1} {2} in stock. Give it out or record it as expired first, then delete it."
			).format(rows[0].name, frappe.format(stock), rows[0].unit)
		)
	used = (
		frappe.db.exists("Stock Ledger Entry", {"item_code": code})
		or frappe.db.exists("Stock Entry Detail", {"item_code": code})
		or frappe.db.exists("Material Request Item", {"item_code": code})
		or frappe.db.exists("Batch", {"item": code})
		or (health.has_health() and frappe.db.exists("Clinical Procedure Item", {"item_code": code}))
	)
	if used:
		frappe.db.set_value("Item", code, "disabled", 1)
		health.remove_medication(code)
		return {"code": code, "archived": True}
	health.remove_medication(code, delete=True)
	frappe.delete_doc("Item", code, ignore_permissions=True)
	return {"code": code, "deleted": True}


# ------------------------------------------------------------------ stock in / out


def _submit(doc):
	doc.flags.ignore_permissions = True
	doc.insert()
	doc.submit()
	return _keep_owner(doc)


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def add_stock(
	medicine: str,
	qty: int | float | str,
	price: int | float | str = 0,
	date: str | None = None,
	expiry: str | None = None,
	lot: str | int | None = None,
	client_id: str | None = None,
):
	"""Record a delivery: one batch with its expiry date, added to the pharmacy store."""
	_require_staff()
	if done := _existing("Stock Entry", client_id):
		return {"stock_entry": done, "duplicate": True}
	qty, date = flt(qty), getdate(date or nowdate())
	if qty <= 0:
		frappe.throw(_("Quantity must be more than 0"))
	if not expiry:
		frappe.throw(_("Please enter the expiry date"))
	expiry = getdate(expiry)
	if expiry <= date:
		frappe.throw(_("The expiry date must be after the date received"))
	if not frappe.db.exists("Item", medicine):
		frappe.throw(_("Medicine not found"))

	lot = (lot or "").strip()
	batch = None
	if lot and frappe.db.exists("Batch", lot):
		item, batch_expiry = frappe.db.get_value("Batch", lot, ["item", "expiry_date"])
		if item != medicine:
			frappe.throw(_("Lot number {0} is already used for {1}").format(lot, item))
		if batch_expiry and getdate(batch_expiry) != expiry:
			frappe.throw(
				_("Lot number {0} already exists with expiry date {1}").format(
					lot, frappe.format(batch_expiry, "Date")
				)
			)
		batch = lot
	if not batch:
		b = frappe.get_doc(
			{
				"doctype": "Batch",
				"owner": _owner(),
				"item": medicine,
				"expiry_date": expiry,
				**({"batch_id": lot} if lot else {}),
			}
		)
		b.insert(ignore_permissions=True)
		_keep_owner(b)
		batch = b.name

	wh = _warehouse()
	se = _submit(
		frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"owner": _owner(),
				"stock_entry_type": "Material Receipt",
				"company": _company(),
				"set_posting_time": 1,
				"posting_date": date,
				"to_warehouse": wh,
				"custom_client_id": client_id,
				"items": [
					{
						"item_code": medicine,
						"qty": qty,
						"t_warehouse": wh,
						"basic_rate": flt(price),
						"allow_zero_valuation_rate": 0 if flt(price) else 1,
						"use_serial_batch_fields": 1,
						"batch_no": batch,
					}
				],
			}
		)
	)
	return {"stock_entry": se.name, "batch": batch}


def _allocate(medicine, qty, expired):
	"""Pick batches for a stock out. Earliest expiry first; expired batches only when throwing expired stock away."""
	today = getdate()
	batches = frappe.get_all(
		"Batch",
		filters={"item": medicine, "batch_qty": [">", 0], "disabled": 0},
		fields=["name", "expiry_date", "batch_qty"],
		order_by="expiry_date asc",
	)
	usable = [b for b in batches if bool(b.expiry_date and getdate(b.expiry_date) < today) == expired]
	available = sum(flt(b.batch_qty) for b in usable)
	if qty > available + 1e-9:
		if expired:
			frappe.throw(
				_("Only {0} expired units of this medicine are in stock.").format(frappe.format(available))
			)
		frappe.throw(
			_("Not enough valid stock. Only {0} available (expired stock cannot be given out).").format(
				frappe.format(available)
			)
		)
	plan, left = [], qty
	for b in usable:
		take = min(left, flt(b.batch_qty))
		if take > 0:
			plan.append((b.name, take))
			left -= take
		if left <= 0:
			break
	return plan


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def give_out(
	medicine: str,
	qty: int | float | str,
	reason: str,
	recipient: str | None = None,
	date: str | None = None,
	client_id: str | None = None,
):
	"""Record stock leaving the store. Valid (unexpired) batches with the earliest expiry go first."""
	_require_staff()
	if done := _existing("Stock Entry", client_id):
		return {"stock_entry": done, "duplicate": True}
	qty = flt(qty)
	if qty <= 0:
		frappe.throw(_("Quantity must be more than 0"))
	if reason not in REASONS:
		frappe.throw(_("Please choose a reason"))
	wh = _warehouse()
	plan = _allocate(medicine, qty, expired=(reason == "Expired stock"))
	se = _submit(
		frappe.get_doc(
			{
				"doctype": "Stock Entry",
				"owner": _owner(),
				"stock_entry_type": "Material Issue",
				"company": _company(),
				"set_posting_time": 1,
				"posting_date": getdate(date or nowdate()),
				"from_warehouse": wh,
				"custom_reason": reason,
				"custom_recipient": recipient or "",
				"custom_client_id": client_id,
				"items": [
					{
						"item_code": medicine,
						"qty": q,
						"s_warehouse": wh,
						"use_serial_batch_fields": 1,
						"batch_no": b,
					}
					for b, q in plan
				],
			}
		)
	)
	return {"stock_entry": se.name, "batches": [b for b, _q in plan]}


# ------------------------------------------------------------------ requests


@frappe.whitelist(methods=["POST"])
@_writes(admin=False)
def request_stock(
	medicine: str,
	qty: int | float | str,
	urgency: str = "Routine",
	reason: str | None = None,
	client_id: str | None = None,
):
	"""Ask for medicine to be ordered. The request waits for a pharmacy administrator."""
	_require_staff()
	if done := _existing("Material Request", client_id):
		return {"request": done, "duplicate": True}
	if flt(qty) <= 0:
		frappe.throw(_("Quantity must be more than 0"))
	if urgency not in URGENCY_DAYS:
		urgency = "Routine"
	need = add_days(nowdate(), URGENCY_DAYS[urgency])
	mr = frappe.get_doc(
		{
			"doctype": "Material Request",
			"owner": _owner(),
			"material_request_type": "Purchase",
			"company": _company(),
			"schedule_date": need,
			"custom_urgency": urgency,
			"custom_reason": reason or "",
			"custom_client_id": client_id,
			"items": [
				{"item_code": medicine, "qty": flt(qty), "schedule_date": need, "warehouse": _warehouse()}
			],
		}
	)
	mr.flags.ignore_permissions = True
	mr.insert()
	_keep_owner(mr)
	return {"request": mr.name}


def _request_status(r):
	if r.docstatus == 2:
		return "cancelled"
	if r.docstatus == 0:
		return "rejected" if r.custom_rejected else "pending"
	return {
		"Ordered": "ordered",
		"Partially Ordered": "ordered",
		"Received": "received",
		"Partially Received": "received",
		"Stopped": "cancelled",
		"Cancelled": "cancelled",
	}.get(r.status, "approved")


@frappe.whitelist()
def requests(status: str | None = None, limit: int | str = 100):
	_require_staff()
	rows = frappe.db.sql(
		"""
		select mr.name, mr.transaction_date as date, mr.schedule_date as needed_by, mr.docstatus, mr.status,
			mr.custom_urgency as urgency, mr.custom_reason as reason, mr.custom_rejected, mr.custom_decision_note as note,
			mr.auto_created_via_reorder as automatic, mr.owner, mri.item_code as medicine, i.item_name as medicine_name,
			mri.qty, mri.stock_uom as unit
		from `tabMaterial Request` mr
		join `tabMaterial Request Item` mri on mri.parent = mr.name and mri.idx = 1
		left join `tabItem` i on i.name = mri.item_code
		where mr.material_request_type = 'Purchase'
		order by mr.creation desc limit %(limit)s
		""",
		{"limit": cint(limit)},
		as_dict=True,
	)
	names = _user_names(r.owner for r in rows)
	for r in rows:
		r.state = _request_status(r)
		r.requested_by = _("Automatic (low stock)") if r.automatic else names.get(r.owner, r.owner)
	if status and status != "all":
		rows = [r for r in rows if r.state == status]
	return rows


@frappe.whitelist(methods=["POST"])
@_writes(admin=True)
def decide_request(name: str, action: str, note: str | None = None):
	"""Approve or reject a pending request (administrators only)."""
	_require_admin()
	mr = frappe.get_doc("Material Request", name)
	if mr.docstatus != 0 or mr.custom_rejected:
		frappe.throw(_("This request has already been handled."))
	mr.flags.ignore_permissions = True
	if action == "approve":
		mr.custom_decision_note = note or ""
		mr.submit()
	elif action == "reject":
		mr.db_set({"custom_rejected": 1, "custom_decision_note": note or ""})
	else:
		frappe.throw(_("Unknown action"))
	return {"request": mr.name, "state": _request_status(frappe.get_doc("Material Request", name))}


# ------------------------------------------------------------------ movements and reports


def _movements(medicine=None, from_date=None, to_date=None, kind=None, limit=200):
	# a cancelled stock entry keeps its original row (marked cancelled); its reversal row is left out.
	# Optional filters are passed as NULL when unused, so the query text never changes.
	values = {
		"wh": _warehouse(),
		"limit": cint(limit),
		"medicine": medicine or None,
		"from_date": from_date or None,
		"to_date": to_date or None,
		"kind": kind if kind in ("in", "out") else None,
	}
	rows = frappe.db.sql(
		"""
		select sle.posting_date as date, sle.creation, sle.item_code as medicine, i.item_name as medicine_name,
			sle.actual_qty as qty, sle.stock_uom as unit, sle.batch_no as batch, sle.voucher_no as entry, se.owner,
			se.custom_reason as reason, se.custom_recipient as recipient, se.stock_entry_type as type, se.docstatus as se_status,
			sle.qty_after_transaction as balance
		from `tabStock Ledger Entry` sle
		join `tabStock Entry` se on se.name = sle.voucher_no
		left join `tabItem` i on i.name = sle.item_code
		where sle.warehouse = %(wh)s
			and sle.voucher_type = 'Stock Entry'
			and (sle.is_cancelled = 0 or (se.docstatus = 2 and (
				(se.stock_entry_type = 'Material Issue' and sle.actual_qty < 0)
				or (se.stock_entry_type <> 'Material Issue' and sle.actual_qty > 0))))
			and (%(medicine)s is null or sle.item_code = %(medicine)s)
			and (%(from_date)s is null or sle.posting_date >= %(from_date)s)
			and (%(to_date)s is null or sle.posting_date <= %(to_date)s)
			and (%(kind)s is null or (%(kind)s = 'in' and sle.actual_qty > 0) or (%(kind)s = 'out' and sle.actual_qty < 0))
		order by sle.posting_date desc, sle.creation desc limit %(limit)s
		""",
		values,
		as_dict=True,
	)
	# with batch bundles the ledger row has no batch number; read it from the bundle
	bundle_batches = {}
	entries = [r.entry for r in rows if not r.batch]
	if entries:
		for b in frappe.db.sql(
			"""select sbb.voucher_no, sbb.item_code, group_concat(distinct sbe.batch_no) as batches
			from `tabSerial and Batch Bundle` sbb join `tabSerial and Batch Entry` sbe on sbe.parent = sbb.name
			where sbb.voucher_no in %(e)s group by sbb.voucher_no, sbb.item_code""",
			{"e": entries},
			as_dict=True,
		):
			bundle_batches[(b.voucher_no, b.item_code)] = b.batches
	names = _user_names(r.owner for r in rows)
	for r in rows:
		r.cancelled = r.se_status == 2
		if r.cancelled:
			r.balance = None
		r.direction = "in" if flt(r.qty) > 0 else "out"
		r.qty = abs(flt(r.qty))
		r.batch = r.batch or bundle_batches.get((r.entry, r.medicine))
		r.by = names.get(r.owner, r.owner)
		if r.direction == "in" and not r.reason:
			r.reason = "Received" if r.type == "Material Receipt" else r.type
	return rows


@frappe.whitelist()
def movements(
	medicine: str | None = None,
	from_date: str | None = None,
	to_date: str | None = None,
	kind: str | None = None,
	limit: int | str = 200,
):
	_require_staff()
	return _movements(medicine, from_date, to_date, kind, limit)


@frappe.whitelist()
def expiring(days: int | str = EXPIRY_WARNING_DAYS):
	"""Batches with stock that expire within `days` days, and those already expired."""
	_require_staff()
	rows = frappe.db.sql(
		"""
		select b.name as batch, b.item as medicine, i.item_name as medicine_name, b.expiry_date, b.batch_qty as qty,
			i.stock_uom as unit, i.custom_location as location
		from `tabBatch` b join `tabItem` i on i.name = b.item
		where b.batch_qty > 0 and b.disabled = 0 and b.expiry_date is not null and b.expiry_date <= %(until)s
			and i.item_group in %(groups)s
		order by b.expiry_date asc
		""",
		{"until": add_days(nowdate(), cint(days)), "groups": _medicine_groups() or [""]},
		as_dict=True,
	)
	for r in rows:
		r.days_left = (getdate(r.expiry_date) - getdate()).days
		r.expired = r.days_left < 0
	return rows


@frappe.whitelist()
def dashboard():
	_require_staff()
	meds = [_with_status(r) for r in _medicine_rows()]
	exp = expiring()
	reqs = requests(limit=50)
	since = add_days(nowdate(), -13)
	daily = frappe.db.sql(
		"""select sle.posting_date as date, sum(case when sle.actual_qty < 0 then -sle.actual_qty else 0 end) as out_qty,
			sum(case when sle.actual_qty > 0 then sle.actual_qty else 0 end) as in_qty
		from `tabStock Ledger Entry` sle
		where sle.is_cancelled = 0 and sle.warehouse = %(wh)s and sle.voucher_type = 'Stock Entry' and sle.posting_date >= %(since)s
		group by sle.posting_date""",
		{"wh": _warehouse(), "since": since},
		as_dict=True,
	)
	by_day = {str(d.date): d for d in daily}
	activity = []
	for i in range(14):
		day = str(add_days(since, i))
		activity.append(
			{
				"date": day,
				"out": flt(by_day.get(day, {}).get("out_qty")),
				"in": flt(by_day.get(day, {}).get("in_qty")),
			}
		)
	low = [m for m in meds if m.is_low or m.is_out]
	return {
		"care": health.care_summary() if health.has_health() else None,
		"health": {
			k: len([m for m in meds if m.status == k]) for k in ("ok", "low", "out", "expiring", "expired")
		},
		"expiry_buckets": _expiry_buckets(),
		"top_out": _top_out(days=30),
		"counts": {
			"medicines": len(meds),
			"units": sum(m.stock for m in meds),
			"low": len(low),
			"expiring": len({r.medicine for r in exp if not r.expired}),
			"expired": len({r.medicine for r in exp if r.expired}),
			"pending": len([r for r in reqs if r.state == "pending"]),
		},
		"low": sorted(low, key=lambda m: m.stock - m.minimum)[:6],
		"expiring": exp[:6],
		"pending": [r for r in reqs if r.state == "pending"][:6],
		"recent": _movements(limit=8),
		"activity": activity,
	}


def _expiry_buckets():
	"""Units on the shelf by time left before expiry."""
	today = getdate()
	buckets = {"expired": 0, "30": 0, "90": 0, "180": 0, "365": 0, "later": 0}
	for b in frappe.get_all(
		"Batch",
		filters={
			"batch_qty": [">", 0],
			"disabled": 0,
			"expiry_date": ["is", "set"],
			"item": ["in", _medicine_items()],
		},
		fields=["expiry_date", "batch_qty"],
	):
		days = (getdate(b.expiry_date) - today).days
		key = (
			"expired"
			if days < 0
			else "30"
			if days <= 30
			else "90"
			if days <= 90
			else "180"
			if days <= 180
			else "365"
			if days <= 365
			else "later"
		)
		buckets[key] += flt(b.batch_qty)
	return buckets


def _medicine_items():
	return frappe.get_all(
		"Item", filters={"item_group": ["in", _medicine_groups() or [""]], "disabled": 0}, pluck="name"
	) or [""]


def _top_out(days=30, limit=6):
	"""Medicines given out the most over the last `days` days."""
	return frappe.db.sql(
		"""select sle.item_code as medicine, i.item_name as name, i.stock_uom as unit, sum(-sle.actual_qty) as qty
		from `tabStock Ledger Entry` sle join `tabItem` i on i.name = sle.item_code
		where sle.is_cancelled = 0 and sle.actual_qty < 0 and sle.voucher_type = 'Stock Entry' and sle.warehouse = %(wh)s
			and sle.posting_date >= %(since)s and i.disabled = 0
		group by sle.item_code order by qty desc limit %(limit)s""",
		{"wh": _warehouse(), "since": add_days(nowdate(), -cint(days)), "limit": cint(limit)},
		as_dict=True,
	)


# ------------------------------------------------------------------ notifications


@frappe.whitelist()
def notifications():
	"""What needs action now, plus this user's notification history."""
	_require_staff()
	meds = [_with_status(r) for r in _medicine_rows()]
	exp = expiring()
	pending = [r for r in requests(limit=50) if r.state == "pending"] if _is_admin() else []
	log = frappe.get_all(
		"Notification Log",
		filters={"for_user": frappe.session.user},
		fields=["name", "subject", "creation", "`read`", "document_type", "document_name", "type"],
		order_by="creation desc",
		limit_page_length=40,
	)
	for n in log:
		n.subject = frappe.utils.strip_html(n.subject or "")
	return {
		"expired": [r for r in exp if r.expired],
		"low": sorted([m for m in meds if m.is_low or m.is_out], key=lambda m: m.stock - m.minimum),
		"expiring": [r for r in exp if not r.expired],
		"pending": pending,
		"log": log,
		"unread": len([n for n in log if not n.read]),
	}


@frappe.whitelist(methods=["POST"])
def mark_notifications_read():
	_require_staff()
	frappe.db.set_value(
		"Notification Log", {"for_user": frappe.session.user, "read": 0}, "read", 1, update_modified=False
	)
	return {"ok": True}


# ------------------------------------------------------------------ staff


@frappe.whitelist()
def staff():
	_require_admin()
	users = frappe.db.sql(
		"""select distinct u.name, u.full_name, u.email, u.enabled, u.last_login, hr.role
		from `tabUser` u join `tabHas Role` hr on hr.parent = u.name and hr.parenttype = 'User'
		where hr.role in %(roles)s order by u.full_name""",
		{"roles": PHARMACY_ROLES},
		as_dict=True,
	)
	out = {}
	for u in users:
		row = out.setdefault(u.name, {**u, "role": "Pharmacy Staff"})
		if u.role == "Pharmacy Admin":
			row["role"] = "Pharmacy Admin"
	return list(out.values())


@frappe.whitelist(methods=["POST"])
@_writes(admin=True)
def save_staff(
	email: str,
	full_name: str,
	role: str = "Pharmacy Staff",
	password: str | None = None,
	enabled: int | bool | str = 1,
):
	"""Create or update a pharmacy user. Administrators can only give the two pharmacy roles."""
	_require_admin()
	if role not in PHARMACY_ROLES:
		frappe.throw(_("Invalid role"))
	email = (email or "").strip().lower()
	if frappe.db.exists("User", email):
		user = frappe.get_doc("User", email)
		other_roles = [r.role for r in user.roles if r.role not in PHARMACY_ROLES]
		if other_roles and "System Manager" not in _roles():
			frappe.throw(
				_("This user has other access in the system and can only be changed by the system manager.")
			)
		if (
			email == _owner()
			and (role != "Pharmacy Admin" or not cint(enabled))
			and "System Manager" not in _roles()
		):
			frappe.throw(_("You cannot remove your own administrator access."))
	else:
		user = frappe.get_doc(
			{"doctype": "User", "email": email, "send_welcome_email": 0, "user_type": "Website User"}
		)
	parts = (full_name or "").strip().split(" ", 1)
	user.first_name = parts[0] or email
	user.last_name = parts[1] if len(parts) > 1 else ""
	user.enabled = cint(enabled)
	keep = [r.role for r in user.get("roles", []) if r.role not in PHARMACY_ROLES]
	user.set("roles", [])
	for r in [*keep, role]:
		user.append("roles", {"role": r})
	if password:
		user.new_password = password
	user.flags.ignore_permissions = True
	user.flags.ignore_password_policy = False
	user.save()
	health.sync_practitioner(user.name)  # every pharmacy user is also a doctor profile in Frappe Health
	return {"name": user.name}


# imported last: health.py uses the helpers above
from sky_healthcare import health
