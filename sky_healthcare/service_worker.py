import os

import frappe
from frappe.website.page_renderers.base_renderer import BaseRenderer

SW_PATH = "pharmacy/sw.js"


class ServiceWorkerPage(BaseRenderer):
	"""Serve the built service worker from /pharmacy/sw.js.

	A service worker only controls pages under the folder it is served from. The build puts it in
	/assets/sky_healthcare/frontend/, so it is re-served here to give it the /pharmacy scope.
	"""

	def can_render(self):
		# the /pharmacy/<path> route rule has already rewritten self.path, so check the raw URL
		request = getattr(frappe.local, "request", None)
		return bool(request) and request.path.strip("/") == SW_PATH

	def render(self):
		path = frappe.get_app_path("sky_healthcare", "public", "frontend", "sw.js")
		if not os.path.exists(path):
			return self.build_response("", http_status_code=404)
		# fixed path inside the app (no user input)
		with open(path) as f:  # nosemgrep
			body = f.read()
		self.path = SW_PATH  # sets the javascript content type
		return self.build_response(
			body, headers={"Cache-Control": "no-cache", "Service-Worker-Allowed": "/pharmacy"}
		)
