import frappe

no_cache = 1


def get_context(context):
	# the page is a static shell; user data and the CSRF token come from sky_healthcare.api.boot
	context.no_cache = 1
	context.lang = frappe.local.lang or "en"
