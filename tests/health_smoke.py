"""Smoke test of patients and procedures (Frappe Health) against a running site.

Usage: python3 tests/health_smoke.py http://localhost:8088 <staff-email> <staff-pw>
Creates "ZZ Health Test <random>" medicine, a patient, a procedure template and two procedures.
"""

import http.cookiejar
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

BASE, S_USER, S_PW = sys.argv[1:4]
A_USER, A_PW = ([*sys.argv[4:6], None, None])[:2]


class Client:
	def __init__(self, user, pw):
		self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
		self.req("POST", "login", {"usr": user, "pwd": pw}, form=True)
		self.csrf = self.get("boot")["csrf_token"]

	def req(self, verb, method, data=None, form=False):
		# "boot" -> sky_healthcare.api.boot, "health.patients" -> sky_healthcare.health.patients
		path = (
			method
			if method == "login"
			else f"sky_healthcare.{method}"
			if "." in method
			else f"sky_healthcare.api.{method}"
		)
		url, body, headers = f"{BASE}/api/method/{path}", None, {}
		if os.environ.get("SITE_HOST"):
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
				msg = raw[:300]
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
		check(f"{label} ({e})", text.lower() in str(e).lower())
		return
	check(label + " (no error raised)", False)


staff = Client(S_USER, S_PW)
boot = staff.get("boot")
check("boot says Frappe Health is installed", boot["health"] is True)
check("boot lists sexes", "Female" in boot["options"]["genders"])

tag = uuid.uuid4().hex[:5]
med = f"ZZ Health Test {tag}"
staff.post(
	"save_medicine",
	{
		"name": med,
		"category": "Analgesic",
		"unit": "Tablet",
		"form": "Tablet",
		"strength": "500mg",
		"minimum": 5,
		"qty": 40,
		"expiry": "2030-01-31",
	},
)


def stock():
	return staff.get("medicine", {"code": med})["stock"]


check("medicine created with 40 in stock", stock() == 40)

# the patient
p = staff.post(
	"health.save_patient",
	{
		"first_name": "Test",
		"last_name": f"Patient {tag}",
		"sex": "Female",
		"dob": "1990-05-01",
		"mobile": "+237600000000",
		"blood_group": "O Positive",
	},
)
check("patient registered in Frappe Health", p["patient_name"] == f"Test Patient {tag}")
check(
	"patient is in the list",
	any(r["name"] == p["name"] for r in staff.get("health.patients", {"search": tag})),
)
fails(
	"a patient needs a sex", lambda: staff.post("health.save_patient", {"first_name": "X", "sex": ""}), "sex"
)

# the procedure template uses 3 tablets
tpl_name = f"ZZ Dressing {tag}"
tpl = staff.post(
	"health.save_procedure_template",
	{"template": tpl_name, "description": "Test", "items": [{"medicine": med, "qty": 3}]},
)
listed = [t for t in staff.get("health.procedure_templates") if t["name"] == tpl["name"]]
check("template saved with its medicine", listed and listed[0]["items"][0]["qty"] == 3)
fails(
	"template names are unique",
	lambda: staff.post("health.save_procedure_template", {"template": tpl_name, "items": []}),
	"already exists",
)

# done now: stock goes down by 3 (template) -> 37
done = staff.post(
	"health.record_procedure",
	{"patient": p["name"], "template": tpl["name"], "complete": 1, "client_id": f"t-{tag}"},
)
check("procedure completed with a stock entry", done["status"] == "Completed" and done["stock_entry"])
check("stock went down by 3", stock() == 37)
again = staff.post(
	"health.record_procedure",
	{"patient": p["name"], "template": tpl["name"], "complete": 1, "client_id": f"t-{tag}"},
)
check("same client_id is not recorded twice", again.get("duplicate") and stock() == 37)

# planned with edited quantity: nothing moves until completed
planned = staff.post(
	"health.record_procedure",
	{"patient": p["name"], "template": tpl["name"], "complete": 0, "items": [{"medicine": med, "qty": 5}]},
)
check("planned procedure does not move stock", planned["status"] == "Pending" and stock() == 37)
staff.post("health.complete_procedure", {"name": planned["name"]})
check("completing it takes 5 out", stock() == 32)

fails(
	"cannot use more than in stock",
	lambda: staff.post(
		"health.record_procedure",
		{"patient": p["name"], "template": tpl["name"], "items": [{"medicine": med, "qty": 999}]},
	),
	"not enough",
)
check("failed procedure left stock untouched", stock() == 32)

detail = staff.get("health.patient", {"name": p["name"]})
check(
	"patient shows 2 completed procedures",
	len([x for x in detail["procedures"] if x["state"] == "done"]) == 2,
)
moves = staff.get("movements", {"medicine": med})
check(
	"movement says 'Used in a procedure' with the patient",
	any(m["reason"] == "Used in a procedure" and m["recipient"] == p["patient_name"] for m in moves),
)

# cancelling a completed procedure puts the medicines back and keeps the history
fails(
	"a completed procedure needs a reason to be cancelled",
	lambda: staff.post("health.cancel_procedure", {"name": done["name"]}),
	"reason",
)
check("still 32 after the refused cancel", stock() == 32)
cancelled = staff.post(
	"health.cancel_procedure", {"name": done["name"], "reason": "Recorded for the wrong patient"}
)
check("cancelled: stock returned", cancelled["stock_returned"] and stock() == 35)
fails(
	"cannot cancel twice",
	lambda: staff.post("health.cancel_procedure", {"name": done["name"], "reason": "again"}),
	"already cancelled",
)
detail = staff.get("health.patient", {"name": p["name"]})
mine = next(x for x in detail["procedures"] if x["name"] == done["name"])
check(
	"procedure shows as cancelled with its reason",
	mine["state"] == "cancelled" and mine["custom_cancel_reason"] == "Recorded for the wrong patient",
)
moves = staff.get("movements", {"medicine": med})
old = [m for m in moves if m["entry"] == cancelled_entry] if (cancelled_entry := done["stock_entry"]) else []
check(
	"original movement stays in the history, marked cancelled",
	len(old) == 1 and old[0]["cancelled"] and old[0]["direction"] == "out",
)
check("no reversal row is listed", len([m for m in moves if m["entry"] == done["stock_entry"]]) == 1)
check(
	"done filter leaves it out, cancelled filter has it",
	done["name"] not in [x["name"] for x in staff.get("health.procedures", {"status": "done"})]
	and done["name"] in [x["name"] for x in staff.get("health.procedures", {"status": "cancelled"})],
)
# a planned procedure can be cancelled without a reason, nothing moves
planned2 = staff.post(
	"health.record_procedure", {"patient": p["name"], "template": tpl["name"], "complete": 0}
)
staff.post("health.cancel_procedure", {"name": planned2["name"]})
check("planned procedure cancelled without a reason, stock unchanged", stock() == 35)

# ---- doctors and consultations
check(
	"the user has a doctor profile and the lists are offered",
	boot["practitioner"] and "BID" in boot["options"]["dosages"],
)
docs = staff.get("health.practitioners")
me = [d for d in docs if d["me"]]
check("the logged-in user is in the list of doctors", len(me) == 1)
if A_USER:
	admin = Client(A_USER, A_PW)
	email = f"doc.{tag}@healthcenter.local"
	admin.post(
		"save_staff",
		{
			"email": email,
			"full_name": f"Doctor {tag}",
			"role": "Pharmacy Staff",
			"password": "Tmp-Passw0rd!x9",
		},
	)
	check(
		"creating a staff user also creates the doctor",
		any(d["user_id"] == email for d in staff.get("health.practitioners")),
	)
	admin.post(
		"save_staff", {"email": email, "full_name": f"Doctor {tag}", "role": "Pharmacy Staff", "enabled": 0}
	)
	check(
		"disabling the user disables the doctor",
		not any(d["user_id"] == email for d in staff.get("health.practitioners")),
	)

data = {
	"patient": p["name"],
	"symptoms": ["Fever", f"Cough {tag}"],
	"diagnoses": ["Malaria"],
	"notes": "Fever for 3 days",
	"vitals": {
		"temperature": "38.6",
		"pulse": "92",
		"bp_systolic": "120",
		"bp_diastolic": "80",
		"weight": "61",
	},
	"prescriptions": [{"medicine": med, "dosage": "BID", "period": "1 Week", "comment": "after meals"}],
	"treatments": [tpl["name"]],
}
c = staff.post("health.save_consultation", data)
check("consultation saved as a draft", c["status"] == "draft")
d = staff.get("health.consultation", {"name": c["name"]})
check(
	"draft holds symptoms, diagnosis, vitals, prescription, treatment",
	d["symptoms"] == ["Fever", f"Cough {tag}"]
	and d["diagnoses"] == ["Malaria"]
	and d["vitals"]["temperature"] == "38.6"
	and len(d["prescriptions"]) == 1
	and d["treatments"][0]["template"] == tpl["name"]
	and d["state"] == "draft",
)
data["notes"] = "Fever for 3 days, no vomiting"
staff.post("health.save_consultation", {**data, "name": c["name"]})
check(
	"a draft can be edited",
	staff.get("health.consultation", {"name": c["name"]})["encounter_comment"].endswith("no vomiting"),
)
check(
	"no orders exist before finishing",
	not staff.get("health.prescriptions", {"patient": p["name"]})
	and not staff.get("health.treatments_requested", {"patient": p["name"]}),
)
staff.post("health.save_consultation", {**data, "name": c["name"], "finish": 1})
d = staff.get("health.consultation", {"name": c["name"]})
check(
	"finishing locks it and creates the prescription",
	d["state"] == "done" and d["prescriptions"][0]["quantity"] == 14,
)
fails(
	"a finished consultation cannot be changed",
	lambda: staff.post("health.save_consultation", {**data, "name": c["name"]}),
	"cannot be changed",
)
check(
	"the prescription is listed for the patient and does not move stock",
	len(staff.get("health.prescriptions", {"patient": p["name"]})) == 1 and stock() == 35,
)
asked = staff.get("health.treatments_requested", {"patient": p["name"]})
check(
	"the treatment the doctor asked for is waiting to be recorded",
	len(asked) == 1 and asked[0]["template"] == tpl["name"],
)
rec = staff.post(
	"health.record_procedure",
	{"patient": p["name"], "template": tpl["name"], "complete": 1, "service_request": asked[0]["name"]},
)
check(
	"recording it takes the stock out (35 - 3 = 32) and clears the request",
	stock() == 32 and not staff.get("health.treatments_requested", {"patient": p["name"]}),
)
detail = staff.get("health.patient", {"name": p["name"]})
check(
	"patient file gathers consultations, prescriptions, vitals",
	len(detail["consultations"]) == 1 and len(detail["prescriptions"]) == 1 and len(detail["vitals"]) == 1,
)
fails(
	"cannot finish an empty consultation",
	lambda: staff.post("health.save_consultation", {"patient": p["name"], "finish": 1}),
	"observation",
)
d2 = staff.post("health.save_consultation", {"patient": p["name"], "notes": "walk-in"})
staff.post("health.discard_consultation", {"name": d2["name"]})
check(
	"a draft can be discarded",
	d2["name"] not in [x["name"] for x in staff.get("health.consultations", {"patient": p["name"]})],
)

# a finished consultation can be corrected (doctor's words and vital signs), orders stay
staff.post(
	"health.update_consultation",
	{
		"name": c["name"],
		"symptoms": ["Fever"],
		"diagnoses": ["Malaria"],
		"notes": "Fever, corrected",
		"vitals": {"temperature": "37.9", "pulse": "88"},
	},
)
d = staff.get("health.consultation", {"name": c["name"]})
check(
	"a finished consultation can be corrected",
	d["encounter_comment"] == "Fever, corrected"
	and d["vitals"]["temperature"] == "37.9"
	and d["state"] == "done",
)
check("its prescription is untouched by the correction", len(d["prescriptions"]) == 1)
fails(
	"a draft cannot use the correction route",
	lambda: staff.post("health.update_consultation", {"name": d2["name"], "notes": "x"}),
	"finished",
)
# a treatment that is done is dated today; only a planned one may be dated later
fails(
	"a done treatment cannot have a future date",
	lambda: staff.post(
		"health.record_procedure",
		{"patient": p["name"], "template": tpl["name"], "complete": 1, "date": "2999-01-01"},
	),
	"future date",
)
future = staff.post(
	"health.record_procedure",
	{"patient": p["name"], "template": tpl["name"], "complete": 0, "date": "2999-01-01"},
)
check("a planned treatment can be dated later", future["status"] == "Pending")
print(f"\n{ok} checks passed")
