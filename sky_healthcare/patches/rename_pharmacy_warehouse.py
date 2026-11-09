import frappe

OLD = "Pharmacy"
NEW = "Medical Store"


def execute():
	warehouses = frappe.get_all(
		"Warehouse", filters={"warehouse_name": OLD, "is_group": 0}, fields=["name", "company"]
	)
	for warehouse in warehouses:
		abbr = frappe.db.get_value("Company", warehouse.company, "abbr")
		new_name = f"{NEW} - {abbr}"
		if frappe.db.exists("Warehouse", new_name):
			continue
		frappe.rename_doc("Warehouse", warehouse.name, new_name, force=True)
		# the name is built by the controller, so rename_doc leaves this field behind
		frappe.db.set_value("Warehouse", new_name, "warehouse_name", NEW)
