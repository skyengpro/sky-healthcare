# Health-Center Inventory Management (HCIM)

## Customer Requirements and Scope

| | |
|---|---|
| **First customer** | Mr. Emmanuel (also the pilot tester) |
| **Prepared by** | SkyEngPro |
| **Version** | 0.3, draft for validation with the customer |
| **Status** | Based on the information gathered so far. Points marked **TBC** are still to be confirmed |

---

## 1. Purpose

Health centers manage their medicine stock on paper today. This project gives them a simple application to record every medicine that comes in, is given to a patient, or is returned because it expired, so that the stock is always known and every movement can be traced to a person.

The solution reuses existing Sky ERP modules and adds a simplified screen set made for health center staff, not for ERP specialists.

**What success looks like**

- Staff always know how much of each medicine is in stock.
- Every stock change shows who did it, when, how much and why.
- Medicines are ordered on time, before they run out.
- Expired medicine is never given to a patient and is returned in an orderly way.
- The pilot health center works for one full month without the paper register.

---

## 2. Current situation

| Area | Today |
|---|---|
| Records | Manual registers kept by each health center |
| Ordering | Requests are made directly to Mr. Emmanuel |
| Where medicines come from | The store, the open market, medical delegates, the delegation |
| Giving medicine to patients | Written in the stock register by hand |
| Expired medicine | Returned to Mr. Emmanuel for disposal |

**Problems to solve**

1. Stock is kept in manual records, which are hard to search and easy to get wrong.
2. Stock movements are hard to track, so losses and shortages are found late.
3. Orders are not always placed on time.

---

## 3. Scope

### Included (confirmed)

- **Drug requisition:** a health center asks for medicines.
- **Dispense drug:** giving medicine to a patient, which reduces the stock. Every dispensing is linked to a registered patient.
- **Return expired:** sending expired medicine back, which reduces the stock.
- **Patient registration:** registering and finding patients.

### Included to make the above work (proposed)

- A list of medicines with a minimum stock level.
- **Receiving stock**, with where it came from, its batch and expiry date.
- Alerts for low stock and for medicine about to expire.
- Users with simple roles, and reports.
- Entering the opening stock from the first physical count.

### Not included

- Billing, prices charged to patients, payments and insurance.
- Purchasing from suppliers and accounting.
- Anything other than medicine stock and patient registration.

---

## 4. Users and roles

| Role | Who | What they can do |
|---|---|---|
| **Staff** | Nurses, pharmacists, store keepers | Register patients, receive stock, dispense medicines, ask for medicines, record expired returns, see reports |
| **Administrator** | Health center manager, Mr. Emmanuel **TBC** | Everything staff can do, plus approve or reject requests, manage users, and cancel a wrong entry |

**TBC:** whether staff may also cancel a wrong entry or adjust the stock, or administrators only.

---

## 5. How it will work

**Ordering medicines**

1. The system shows medicines that are running low.
2. Staff ask for the medicine they need, with quantity and urgency.
3. An administrator approves or rejects the request.
4. The approved request reaches Mr. Emmanuel **TBC: inside the system, or as a printed or PDF document**.
5. When the medicines arrive they are received into stock.

**Receiving stock.** Staff enter the medicine, quantity, batch number, expiry date and where it came from: store, open market, medical delegate, delegation or other.

**Dispensing to a patient.** Staff open the patient's file and dispense the medicines. The system uses the batch that expires first, refuses expired medicine, and refuses a quantity larger than what is available. A wrong entry can be cancelled with a reason, and the stock goes back.

**Returning expired medicine.** The system lists expired medicine and medicine expiring soon. Staff choose the batch and quantity to return and who receives it **TBC**. The stock goes down and the return is recorded.

**Registering a patient.** Staff search first to avoid duplicates, then register the patient. The patient's file shows the medicines given to them.

---

## 6. Requirements

### 6.1 Medicines

| Requirement | Priority | Basis |
|---|---|---|
| Add and edit a medicine: name, category, form, strength, unit | Must | Proposed |
| Set a minimum stock level; show "to restock" when it is reached | Must | Proposed |
| Search and filter medicines by name, category, status and expiry | Must | Proposed |
| Show for each medicine its stock, nearest expiry, batches and full history | Must | Proposed |
| Archive a medicine without losing its history | Should | Proposed |
| Import the first medicine list from a spreadsheet | Should | Proposed |

### 6.2 Receiving stock

| Requirement | Priority | Basis |
|---|---|---|
| Receive a medicine with quantity, batch number, expiry date and date | Must | Proposed |
| Record where each receipt came from: store, open market, medical delegate, delegation, other | Must | Confirmed |
| Enter the opening stock from the first physical count | Must | Proposed |
| Record the delivery or receipt number **TBC** | Should | Proposed |
| Receive several batches of one medicine in a single entry | Should | Proposed |

### 6.3 Drug requisition

| Requirement | Priority | Basis |
|---|---|---|
| Ask for a medicine with quantity, urgency and reason | Must | Confirmed |
| Administrator approves or rejects, with a note | Must | Confirmed |
| Make an approved request available to Mr. Emmanuel **TBC** | Must | Confirmed |
| Suggest a request automatically when stock is low | Should | Proposed |
| Notify the administrator of waiting requests | Should | Proposed |
| Follow the request status: waiting, approved, rejected, received | Should | Proposed |

### 6.4 Dispensing

| Requirement | Priority | Basis |
|---|---|---|
| Dispense medicine to a registered patient and reduce the stock | Must | Confirmed |
| No medicine can be given without choosing a patient | Must | Confirmed |
| Never dispense expired medicine | Must | Confirmed |
| Use the batch that expires first | Must | Proposed |
| Refuse a quantity above the available stock, with a clear message | Must | Proposed |
| Record the user, date and time of every dispensing | Must | Confirmed |
| Never record the same entry twice, even after a poor connection | Must | Proposed |
| Cancel a wrong dispensing with a reason, returning the stock; the original entry stays visible as cancelled | Should | Proposed |
| Print a dispensing slip **TBC** | Could | Proposed |

### 6.5 Expired medicine

| Requirement | Priority | Basis |
|---|---|---|
| List expired medicine and medicine expiring soon (default 90 days) | Must | Proposed |
| Record the return of an expired batch: quantity, date and receiver | Must | Confirmed |
| Alert staff about medicine about to expire | Should | Proposed |
| Print a return slip for the receiver's signature **TBC** | Should | Proposed |
| Record damaged or lost stock with a reason | Should | Proposed |

### 6.6 Patients

| Requirement | Priority | Basis |
|---|---|---|
| Register a patient: first name, last name, sex, date of birth, phone | Must | Confirmed |
| Search by name or phone, and warn about a possible duplicate | Must | Proposed |
| Show the medicines given to each patient in the patient file | Must | Proposed |
| Edit a patient; a patient with history cannot be deleted | Must | Proposed |
| Optional details such as blood group and allergies **TBC** | Should | Proposed |

### 6.7 Users and reports

| Requirement | Priority | Basis |
|---|---|---|
| The administrator creates, disables and resets the password of users | Must | Proposed |
| Two roles, Staff and Administrator, with the rights listed in section 4 | Must | Proposed |
| Keep a trail of who did what and when | Must | Confirmed |
| Dashboard: medicines, to restock, expiring soon, patients, waiting requests | Must | Proposed |
| Stock movements report with filters, exportable to Excel | Must | Confirmed |
| Current stock report and expiry report | Must | Proposed |
| Requests report and consumption per medicine, to help ordering | Should | Proposed |
| Print any report | Should | Proposed |

---

## 7. Other expectations

- **Simple to use:** a new staff member can work with it after a short training.
- **Any device:** works on phones, tablets and computers.
- **Languages:** English and French.
- **Poor connection:** the application opens without internet. Receiving, dispensing and requests made offline are saved and sent once the connection returns, without duplicates **TBC**.
- **Security and privacy:** each person has their own login; patient information is only seen by authorized users **TBC: legal requirements**.
- **Nothing is erased:** stock movements are never deleted. Corrections are shown as cancelled entries.
- **Backups:** the data is backed up automatically.

---

## 8. Starting to use it

1. Collect the medicine list from the paper register.
2. Do a physical stock count, with batch and expiry dates.
3. Enter the count as opening stock.
4. Create the users and train the staff.
5. Run the application next to the paper register for an agreed period **TBC**.
6. Stop the paper register, and review the reports weekly during the first month.

---

## 9. Assumptions and risks

**Assumptions**

- The health center has a phone, tablet or computer, and occasional internet.
- The customer provides the medicine list and does the opening stock count.

**Main risks**

| Risk | How we reduce it |
|---|---|
| Staff keep using the paper register | Training, a clear end date for the parallel run, weekly review |
| Poor internet | The application works offline for stock tasks |
| Opening stock count is inaccurate | Count with two people, check in the first month |
| Dispensing feels slower than paper | Few screens, quick patient search, test with real staff in the pilot |
| The scope grows (billing, prices) | Changes go through an agreed change request |

---

## 10. Open questions

| # | Question |
|---|---|
| 1 | Does Mr. Emmanuel approve requests and receive expired medicine inside the system, or only on paper or PDF? |
| 2 | Is the delivery or receipt number needed for each receipt, in addition to where it came from? |
| 3 | What does an expired return need: receiver name, signature, a return slip, a disposal certificate? |
| 4 | Who may cancel a wrong entry and who may adjust the stock: staff or administrators only? |
| 5 | Which patient details are required, and are there legal rules about them? |
| 6 | Are there medicines without an expiry date, or needing special handling? |
| 7 | What internet, devices and printers does the pilot health center have? |
| 8 | Which printed documents are required: request, return slip, dispensing slip? |
| 9 | Who provides the medicine list and does the opening count, and when? |
| 10 | What is the target date for the pilot, and which health center? |
| 11 | Who signs the acceptance? We assume Mr. Emmanuel |

---

## 11. Next steps

| Step | What | Who |
|---|---|---|
| 1 | Answer the open questions and validate this document | Mr. Emmanuel, SkyEngPro |
| 2 | Confirm which Sky ERP modules are reused and what must be added | SkyEngPro |
| 3 | Build and test the missing parts | SkyEngPro |
| 4 | Prepare the pilot: users, opening stock, training | SkyEngPro, health center |
| 5 | Run the pilot and review weekly | Mr. Emmanuel, SkyEngPro |
| 6 | Extend to other health centers | SkyEngPro |

Dates will be set once the open questions are answered.

---

## 12. Acceptance

The pilot is accepted by Mr. Emmanuel when these checks pass in the health center:

1. Receiving 100 tablets from the delegation shows 100 in stock, with their source.
2. Dispensing 30 tablets to a registered patient leaves 70, with the patient and user recorded.
3. A dispensing larger than the stock is refused and nothing changes.
4. With two batches, the one that expires first is used.
5. Expired medicine cannot be dispensed.
6. Returning an expired batch reduces the stock and records the receiver.
7. A medicine below its minimum shows as "to restock", and a request can be raised and approved.
8. A wrong dispensing is cancelled with a reason and the stock goes back.
9. Work done offline is recorded once, not twice, when the connection returns.
10. Staff cannot approve a request.
11. The application is comfortable to use on a phone, a tablet and a computer.

---

*This document reflects the information gathered so far and will be updated once the open questions are answered.*
