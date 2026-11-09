import frappe

RENAMED_ROLES = {"Pharmacy Staff": "Clinic Staff", "Pharmacy Admin": "Clinic Admin"}


def execute():
	# must run before after_migrate, which would create the new roles empty
	for old, new in RENAMED_ROLES.items():
		if frappe.db.exists("Role", old) and not frappe.db.exists("Role", new):
			frappe.rename_doc("Role", old, new, force=True)
