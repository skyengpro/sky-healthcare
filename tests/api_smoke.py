"""Smoke test of the Healthcare Management API against a running site.

Usage: python3 tests/api_smoke.py http://localhost:8088 <staff-email> <staff-pw> <admin-email> <admin-pw>
Creates a test medicine "ZZ Test Medicine <random>" and moves stock in and out.
"""

import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE, S_USER, S_PW, A_USER, A_PW = sys.argv[1:6]


class Client:
	def __init__(self, user, pw):
		self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
		self.req("POST", "login", {"usr": user, "pwd": pw}, form=True)
		self.csrf = self.get("boot")["csrf_token"]

	def req(self, verb, method, data=None, form=False):
		path = method if method == "login" else f"sky_healthcare.api.{method}"
		url, body, headers = f"{BASE}/api/method/{path}", None, {}
		if os.environ.get("SITE_HOST"):  # talk to one site of a multi-site bench directly
			headers["Host"] = os.environ["SITE_HOST"]
		if verb == "GET" and data:
			url += "?" + urllib.parse.urlencode(data)
		elif data is not None:
			body = urllib.parse.urlencode(data).encode() if form else json.dumps(data).encode()
			headers["Content-Type"] = "application/x-www-form-urlencoded" if form else "application/json"
			if getattr(self, "csrf", None):
				headers["X-Frappe-CSRF-Token"] = self.csrf
		try:
			return json.loads(
				self.op.open(urllib.request.Request(url, body, headers, method=verb)).read()
			).get("message")
		except urllib.error.HTTPError as e:
			raw = e.read().decode()
			try:
				msg = json.loads(json.loads(raw).get("_server_messages", "[]"))[0]
				msg = json.loads(msg).get("message")
			except Exception:
				msg = raw[:200]
			raise AssertionError(f"{e.code} {msg}")

	def get(self, m, data=None):
		return self.req("GET", m, data)

	def post(self, m, data):
		return self.req("POST", m, data)


ok = 0


def check(label, cond):
	global ok
	print(("PASS " if cond else "FAIL ") + label)
	if not cond:
		raise SystemExit(1)
	ok += 1


def fails(label, fn, text):
	try:
		fn()
	except AssertionError as e:
		check(f"{label} -> {e}", text.lower() in str(e).lower())
		return
	check(label + " (expected an error)", False)


staff, admin = Client(S_USER, S_PW), Client(A_USER, A_PW)
boot = staff.get("boot")
check("boot as staff, not admin", boot["user"]["name"] == S_USER and boot["is_admin"] is False)
check(
	"options loaded", "Antibiotic" in boot["options"]["categories"] and "Tablet" in boot["options"]["units"]
)
name = f"ZZ Test Medicine {uuid.uuid4().hex[:5]}"
res = staff.post(
	"save_medicine",
	{
		"name": name,
		"category": "Antibiotic",
		"unit": "Tablet",
		"form": "Tablet",
		"strength": "250mg",
		"location": "Shelf T",
		"minimum": 50,
		"qty": 100,
		"price": 12,
		"expiry": "2030-01-31",
		"lot": "",
	},
)
check("add medicine with starting stock", res["code"] == name and res.get("stock_entry"))
fails(
	"duplicate medicine refused",
	lambda: staff.post("save_medicine", {"name": name, "category": "Antibiotic", "unit": "Tablet"}),
	"already exists",
)
cid = str(uuid.uuid4())
a = staff.post(
	"add_stock", {"medicine": name, "qty": 40, "price": 10, "expiry": "2029-06-30", "client_id": cid}
)
b = staff.post(
	"add_stock", {"medicine": name, "qty": 40, "price": 10, "expiry": "2029-06-30", "client_id": cid}
)
check("add stock is idempotent per client_id", a["stock_entry"] == b["stock_entry"] and b.get("duplicate"))
med = staff.get("medicine", {"code": name})
check("stock 140 in 2 batches", med["stock"] == 140 and len(med["batches"]) == 2)
out = staff.post(
	"give_out",
	{
		"medicine": name,
		"qty": 50,
		"reason": "Other authorized adjustment",
		"recipient": "Test note",
		"client_id": str(uuid.uuid4()),
	},
)
med = staff.get("medicine", {"code": name})
check(
	"give out takes earliest expiry first (2029 batch 40 -> 0, 2030 batch 100 -> 90)",
	med["stock"] == 90
	and len(med["batches"]) == 1
	and med["batches"][0]["qty"] == 90
	and str(med["batches"][0]["expiry_date"]).startswith("2030"),
)
fails(
	"the retired reasons are refused",
	lambda: staff.post("give_out", {"medicine": name, "qty": 1, "reason": "Dispensed to a patient"}),
	"reason",
)
fails(
	"cannot give out more than stock",
	lambda: staff.post("give_out", {"medicine": name, "qty": 1000, "reason": "Other authorized adjustment"}),
	"not enough",
)
fails(
	"cannot throw away expired stock when none is expired",
	lambda: staff.post("give_out", {"medicine": name, "qty": 1, "reason": "Expired stock"}),
	"expired units",
)
fails(
	"expiry before receipt date refused",
	lambda: staff.post("add_stock", {"medicine": name, "qty": 1, "expiry": "2020-01-01"}),
	"expiry",
)
st = staff.get("medicines", {"search": "ZZ Test"})
check("medicine list filter by search", any(r["code"] == name for r in st))
check("status ok (90 > min 50)", next(r for r in st if r["code"] == name)["status"] == "ok")
staff.post("give_out", {"medicine": name, "qty": 50, "reason": "Damaged stock"})
low = staff.get("medicines", {"status": "low"})
check("status low after stock 40 < min 50", any(r["code"] == name for r in low))
req = staff.post(
	"request_stock",
	{
		"medicine": name,
		"qty": 200,
		"urgency": "Urgent",
		"reason": "Running low",
		"client_id": str(uuid.uuid4()),
	},
)
check("request created", req["request"].startswith("MAT-MR"))
fails(
	"staff cannot approve",
	lambda: staff.post("decide_request", {"name": req["request"], "action": "approve"}),
	"administrator",
)
fails("staff cannot manage users", lambda: staff.get("staff"), "administrator")
d = admin.post("decide_request", {"name": req["request"], "action": "approve", "note": "OK"})
check("admin approves request", d["state"] == "approved")
req2 = staff.post("request_stock", {"medicine": name, "qty": 5, "urgency": "Routine"})
d2 = admin.post("decide_request", {"name": req2["request"], "action": "reject", "note": "Not needed"})
check("admin rejects request", d2["state"] == "rejected")
rq = staff.get("requests")
check(
	"requests list shows both states",
	{r["name"]: r["state"] for r in rq}.get(req["request"]) == "approved"
	and {r["name"]: r["state"] for r in rq}.get(req2["request"]) == "rejected",
)
mv = staff.get("movements", {"medicine": name})
check(
	"movements: 2 in + 3 out rows with batch and user",
	len(mv) == 5 and all(m["batch"] for m in mv) and mv[0]["by"],
)
dash = staff.get("dashboard")
check("dashboard counts", dash["counts"]["medicines"] >= 1 and len(dash["activity"]) == 14)
exp = staff.get("expiring", {"days": 3650})
check("expiring report", any(r["medicine"] == name for r in exp))
check("admin boot", admin.get("boot")["is_admin"] is True)
cat = f"ZZ Category {uuid.uuid4().hex[:5]}"
made = staff.post("add_category", {"name": f"  {cat}  "})
check("a category can be added from the app", made["created"] and made["name"] == cat)
check("the new category is offered", cat in staff.get("boot")["options"]["categories"])
again = staff.post("add_category", {"name": cat.lower()})
check("adding it again returns the same one", not again["created"] and again["name"] == cat)
fails("a category needs a name", lambda: staff.post("add_category", {"name": "  "}), "name")
fails(
	"a name used elsewhere in ERPNext is refused",
	lambda: staff.post("add_category", {"name": "Products"}),
	"already exists",
)
print(f"\n{ok} checks passed")
