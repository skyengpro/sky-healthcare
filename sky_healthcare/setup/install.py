import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

ROLES = ["Pharmacy Staff", "Pharmacy Admin"]
CATEGORIES = [
	"Analgesic",
	"Antibiotic",
	"Antimalarial",
	"Antihypertensive",
	"Antidiabetic",
	"Antiseptic",
	"Vitamin / Supplement",
	"Vaccine",
	"Gastrointestinal",
	"Respiratory",
	"Other Medicine",
]
UOMS = ["Tablet", "Capsule", "Bottle", "Vial", "Sachet", "Box", "Tube", "Ampoule", "Strip", "Pack"]
FORMS = (
	"Tablet\nCapsule\nSyrup\nInjection\nCream / Ointment\nDrops\nInhaler\nPowder / Sachet\nSuppository\nOther"
)
REASONS = (
	"\nDispensed to a patient\nTransfer to another store or department\nDamaged stock\nExpired stock\nOther authorized adjustment"
	"\nUsed in a procedure"
)

CUSTOM_FIELDS = {
	"Item": [
		{
			"fieldname": "custom_dosage_form",
			"label": "Dosage Form",
			"fieldtype": "Select",
			"options": FORMS,
			"insert_after": "item_group",
		},
		{
			"fieldname": "custom_strength",
			"label": "Strength",
			"fieldtype": "Data",
			"insert_after": "custom_dosage_form",
		},
		{
			"fieldname": "custom_location",
			"label": "Storage Location",
			"fieldtype": "Data",
			"insert_after": "custom_strength",
		},
	],
	"Stock Entry": [
		{
			"fieldname": "custom_reason",
			"label": "Reason",
			"fieldtype": "Select",
			"options": REASONS,
			"insert_after": "stock_entry_type",
		},
		{
			"fieldname": "custom_recipient",
			"label": "Recipient",
			"fieldtype": "Data",
			"insert_after": "custom_reason",
		},
		# unique id created by the app/PWA so a retried (offline) request is never recorded twice
		{
			"fieldname": "custom_client_id",
			"label": "Client ID",
			"fieldtype": "Data",
			"hidden": 1,
			"read_only": 1,
			"no_copy": 1,
			"search_index": 1,
			"insert_after": "custom_recipient",
		},
	],
	"Material Request": [
		{
			"fieldname": "custom_urgency",
			"label": "Urgency",
			"fieldtype": "Select",
			"options": "Routine\nUrgent\nEmergency",
			"default": "Routine",
			"insert_after": "material_request_type",
		},
		{
			"fieldname": "custom_reason",
			"label": "Reason",
			"fieldtype": "Small Text",
			"insert_after": "custom_urgency",
		},
		{
			"fieldname": "custom_client_id",
			"label": "Client ID",
			"fieldtype": "Data",
			"hidden": 1,
			"read_only": 1,
			"no_copy": 1,
			"search_index": 1,
			"insert_after": "custom_reason",
		},
		{
			"fieldname": "custom_rejected",
			"label": "Rejected",
			"fieldtype": "Check",
			"read_only": 1,
			"no_copy": 1,
			"allow_on_submit": 1,
			"insert_after": "custom_client_id",
		},
		{
			"fieldname": "custom_decision_note",
			"label": "Decision Note",
			"fieldtype": "Small Text",
			"no_copy": 1,
			"allow_on_submit": 1,
			"insert_after": "custom_rejected",
		},
	],
}


# only when Frappe Health is installed: these link to its doctypes
HEALTH_FIELDS = {
	"Item": [
		{
			"fieldname": "custom_medication",
			"label": "Medication (Health)",
			"fieldtype": "Link",
			"options": "Medication",
			"read_only": 1,
			"no_copy": 1,
			"insert_after": "custom_location",
		},
	],
	"Stock Entry": [
		{
			"fieldname": "custom_clinical_procedure",
			"label": "Clinical Procedure",
			"fieldtype": "Link",
			"options": "Clinical Procedure",
			"read_only": 1,
			"no_copy": 1,
			"search_index": 1,
			"insert_after": "custom_recipient",
		},
	],
	"Clinical Procedure": [
		{
			"fieldname": "custom_client_id",
			"label": "Client ID",
			"fieldtype": "Data",
			"hidden": 1,
			"read_only": 1,
			"no_copy": 1,
			"search_index": 1,
			"insert_after": "notes",
		},
		{
			"fieldname": "custom_cancel_reason",
			"label": "Cancel Reason",
			"fieldtype": "Small Text",
			"read_only": 1,
			"no_copy": 1,
			"allow_on_submit": 1,
			"insert_after": "custom_client_id",
		},
		{
			"fieldname": "custom_cancelled_by",
			"label": "Cancelled By",
			"fieldtype": "Link",
			"options": "User",
			"read_only": 1,
			"no_copy": 1,
			"allow_on_submit": 1,
			"insert_after": "custom_cancel_reason",
		},
	],
}


def after_install():
	"""First install: everything in `after_migrate`, plus the site-wide stock settings and the store."""
	after_migrate()
	if not erpnext_ready():
		return  # finished by after_setup_wizard once the company exists
	configure_stock()
	create_warehouse()
	# the setup wizard hook can run outside a request that commits; the store must exist when it ends
	frappe.db.commit()  # nosemgrep


def after_migrate():
	"""Runs on every update. Only adds what is missing; never changes settings an administrator may have edited."""
	create_roles()
	create_custom_fields(CUSTOM_FIELDS, update=True)
	if erpnext_ready():
		create_catalogue()
	create_alerts()
	setup_health()


def setup_health():
	"""Link the pharmacy to Frappe Health: custom fields, and a Medication for every medicine."""
	from sky_healthcare.health import (
		ensure_appointment_type,
		has_health,
		sync_all_medications,
		sync_all_practitioners,
	)

	if not has_health():
		return
	create_custom_fields(HEALTH_FIELDS, update=True)
	if erpnext_ready():
		_insert_if_missing(
			"Item Group",
			"Clinical Procedures",
			item_group_name="Clinical Procedures",
			parent_item_group="All Item Groups",
			is_group=0,
		)
		sync_all_medications()
		ensure_appointment_type()
		sync_all_practitioners()


def erpnext_ready():
	"""ERPNext creates its base records (item groups, company) in the setup wizard."""
	return bool(frappe.db.exists("Item Group", "All Item Groups") and default_company())


def after_setup_wizard(args=None):  # nosemgrep
	"""On a site where the app was installed before the setup wizard, finish the setup now."""
	try:
		after_install()
	except frappe.ValidationError:
		# e.g. the new company has no Default Inventory Account yet: never block the setup wizard on it
		frappe.log_error("Healthcare Management setup after the wizard")
		print(
			"Healthcare Management: setup could not finish inside the wizard. After it, run: "
			"bench --site <site> execute sky_healthcare.setup.install.after_install"
		)


def create_roles():
	for role in ROLES:
		if not frappe.db.exists("Role", role):
			frappe.get_doc({"doctype": "Role", "role_name": role, "desk_access": 0}).insert(
				ignore_permissions=True
			)
		else:
			# pharmacy users only use the app, never the ERPNext desk
			frappe.db.set_value("Role", role, "desk_access", 0)


def _insert_if_missing(doctype, name, **fields):
	if not frappe.db.exists(doctype, name):
		frappe.get_doc({"doctype": doctype, **fields}).insert(ignore_permissions=True)


def create_catalogue():
	_insert_if_missing(
		"Item Group", "Medicine", item_group_name="Medicine", parent_item_group="All Item Groups", is_group=1
	)
	for c in CATEGORIES:
		_insert_if_missing("Item Group", c, item_group_name=c, parent_item_group="Medicine", is_group=0)
	for u in UOMS:
		_insert_if_missing("UOM", u, uom_name=u, enabled=1, must_be_whole_number=1)


def configure_stock():
	"""Batches with expiry dates and automatic reorder requests.

	These are site-wide Stock Settings, so they are only set on first install. Batch numbers are
	required for expiry tracking; the rest can be changed back in ERPNext without breaking the app.
	"""
	ss = frappe.get_single("Stock Settings")
	ss.enable_serial_and_batch_no_for_item = 1
	ss.use_serial_batch_fields = 1
	ss.pick_serial_and_batch_based_on = "Expiry"
	ss.auto_indent = 1
	ss.save(ignore_permissions=True)


def default_company():
	return frappe.defaults.get_global_default("company") or frappe.db.get_value("Company", {}, "name")


def create_warehouse(company=None):
	"""Create the "Pharmacy" store for a company (default company if none given).

	Run by hand for another company: bench --site <site> execute sky_healthcare.setup.install.create_warehouse --kwargs "{'company': 'X'}"
	"""
	company = company or default_company()
	if not company:
		return  # no company yet (setup wizard not done); run create_warehouse after it
	if frappe.db.get_value("Company", company, "enable_perpetual_inventory") and not frappe.db.get_value(
		"Company", company, "default_inventory_account"
	):
		# stock entries would fail; this is an accounting decision, so it is reported, not changed
		print(
			f"Healthcare Management: company {company} uses perpetual inventory without a Default Inventory Account. "
			"Set one in the Company, or disable perpetual inventory, before recording stock."
		)
	abbr = frappe.db.get_value("Company", company, "abbr")
	name = f"Pharmacy - {abbr}"
	if not frappe.db.exists("Warehouse", name):
		frappe.get_doc(
			{
				"doctype": "Warehouse",
				"warehouse_name": "Pharmacy",
				"company": company,
				"parent_warehouse": f"All Warehouses - {abbr}",
			}
		).insert(ignore_permissions=True)


def _alert(subject, **fields):
	# a Notification is named after its subject
	if not frappe.db.exists("Notification", {"subject": subject}):
		frappe.get_doc({"doctype": "Notification", "subject": subject, **fields}).insert(
			ignore_permissions=True
		)


def create_alerts():
	"""Bell notifications for expiring batches and new medical requests."""
	_alert(
		"Expiring: {{ doc.item }} batch {{ doc.name }}",
		document_type="Batch",
		event="Days Before",
		date_changed="expiry_date",
		days_in_advance=60,
		channel="System Notification",
		condition="doc.batch_qty > 0",
		enabled=1,
		message="Batch {{ doc.name }} of {{ doc.item }} expires on {{ doc.expiry_date }}. Qty left: {{ doc.batch_qty }}.",
		recipients=[{"receiver_by_role": "Pharmacy Admin"}, {"receiver_by_role": "Pharmacy Staff"}],
	)
	_alert(
		"Low stock: reorder requested ({{ doc.name }})",
		document_type="Material Request",
		event="New",
		channel="System Notification",
		condition="doc.auto_created_via_reorder",
		enabled=1,
		message="Stock fell below the minimum level. Request {{ doc.name }} was created.",
		recipients=[{"receiver_by_role": "Pharmacy Admin"}],
	)
	# renamed from "Stock request ...": drop the old notification so a site does not get both
	frappe.db.delete(
		"Notification",
		{"subject": "Stock request waiting for approval: {{ doc.name }} ({{ doc.custom_urgency }})"},
	)
	_alert(
		"Medical request waiting for approval: {{ doc.name }} ({{ doc.custom_urgency }})",
		document_type="Material Request",
		event="New",
		channel="System Notification",
		condition="not doc.auto_created_via_reorder",
		enabled=1,
		message="{{ doc.owner }} asked for stock. Urgency: {{ doc.custom_urgency }}. {{ doc.custom_reason or '' }}",
		recipients=[{"receiver_by_role": "Pharmacy Admin"}],
	)
