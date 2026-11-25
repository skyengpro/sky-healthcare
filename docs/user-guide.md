# Sky Healthcare — User Guide

> **Note to editor:** Image placeholders are marked `<!-- IMAGE: … -->` throughout this document. Replace each one with the relevant screenshot before publishing.

---

## Table of contents

1. [What is Sky Healthcare?](#1-what-is-sky-healthcare)
2. [Who uses it and what roles exist](#2-who-uses-it-and-what-roles-exist)
3. [Getting around the interface](#3-getting-around-the-interface)
4. [Patient management](#4-patient-management)
   - 4.1 [Search for a patient](#41-search-for-a-patient)
   - 4.2 [Register a new patient](#42-register-a-new-patient)
   - 4.3 [Patient dashboard](#43-patient-dashboard)
   - 4.4 [Record a consultation](#44-record-a-consultation)
   - 4.5 [Enter a test result](#45-enter-a-test-result)
   - 4.6 [Record a procedure or dispense medications](#46-record-a-procedure-or-dispense-medications)
5. [Stock management](#5-stock-management)
   - 5.1 [Medications and consumables catalogue](#51-medications-and-consumables-catalogue)
   - 5.2 [Requisitions](#52-requisitions)
   - 5.3 [Stock receipt](#53-stock-receipt)
   - 5.4 [Stock status](#54-stock-status)
   - 5.5 [Non-patient issues (expired, broken, lost)](#55-non-patient-issues-expired-broken-lost)
6. [Settings (managers only)](#6-settings-managers-only)
   - 6.1 [Procedure types](#61-procedure-types)
   - 6.2 [Care staff](#62-care-staff)
7. [Complete workflow examples](#7-complete-workflow-examples)
8. [Frequently asked questions](#8-frequently-asked-questions)

---

## 1. What is Sky Healthcare?

Sky Healthcare is a clinical interface for small health facilities — clinics and health centres. It sits on top of Frappe Healthcare and ERPNext, so all patient records and stock movements are stored in those systems. The interface itself hides the complexity: each routine task fits on one screen.

<!-- IMAGE: home screen / app launch screen showing the three main areas -->

Key things to know:

- Every record you create here (patient, consultation, stock receipt) is a standard document visible to administrators in Frappe Desk and in standard reports.
- Stock always moves out of the batch that expires first (FEFO — first expiry, first out). You cannot dispense from an expired batch.
- Saving a procedure automatically reduces the stock. If stock is insufficient, the save is refused and the system suggests adding a requisition.

---

## 2. Who uses it and what roles exist

| Role | Main tasks |
|------|-----------|
| **Reception** | Search for and register patients |
| **Doctor** | Open consultations, prescribe tests, procedures and medications |
| **Nurse** | Record procedures and dispense medications |
| **Stock manager** | Receive stock, fulfill requisitions, remove expired items |
| **Manager / Administrator** | Configure procedure types, manage care staff accounts, access Frappe Desk |

Each role has exactly the permissions it needs on the underlying documents. Staff never need to open Frappe Desk for routine tasks.

---

## 3. Getting around the interface

The interface has three areas accessible from the navigation bar:

- **Patients** — everything related to a patient's care journey.
- **Stock** — catalogue, receipts, status and issues.
- **Settings** — procedure types and care staff (managers only).

<!-- IMAGE: navigation bar with the three areas highlighted -->

---

## 4. Patient management

### 4.1 Search for a patient

1. Go to **Patients**.
2. Type the patient's last name or phone number in the search bar.
3. The list filters as you type. Click the patient's row to open their dashboard.

<!-- IMAGE: patient list with search bar -->

> If no results appear, the patient has not been registered yet — see [4.2](#42-register-a-new-patient).

---

### 4.2 Register a new patient

1. Go to **Patients** and click **Create a patient**.
2. Fill in the required fields:
   - Last name, first name
   - Sex
   - Date of birth
   - Phone number
3. Fill in optional fields as available:
   - Blood group
   - Known allergies
   - Medical history
   - Emergency contact
4. Click **Save**.

The patient's dashboard opens immediately after saving.

<!-- IMAGE: new patient form with required fields indicated -->

---

### 4.3 Patient dashboard

The dashboard shows everything about a patient on one page:

- Identity, allergies, and medical history
- Full history of consultations, tests, and procedures
- Tests that are waiting for a result
- Action links: **Edit record**, **New consultation**, open any test or procedure

<!-- IMAGE: patient dashboard with sections labelled -->

---

### 4.4 Record a consultation

1. From the patient dashboard, click **New consultation**.
2. The doctor and date are filled in automatically.
3. Enter:
   - Reason for visit
   - Symptoms
   - Diagnosis
   - Notes (optional)
4. Add prescriptions as needed:
   - **Tests** — select the test type.
   - **Procedures** — select the procedure type; a nurse will execute it later.
   - **Medications** — select the medication for direct dispensing.
5. Click **Save**.

The consultation is added to the patient's history. Any prescribed tests or procedures appear as pending items on the dashboard.

<!-- IMAGE: consultation form showing prescriptions section -->

---

### 4.5 Enter a test result

Prescribed tests appear in the **Tests awaiting results** section of the patient dashboard.

1. Click the test to open it.
2. Enter the result and the date it was received.
3. Click **Save**.

The result is attached to the consultation and visible in the patient's history.

<!-- IMAGE: test form with result field -->

---

### 4.6 Record a procedure or dispense medications

Prescribed procedures and dispensing orders appear on the patient dashboard.

1. Click the procedure or dispensing order to open it.
2. The screen shows:
   - The procedure type (or medication for dispensing)
   - Medications and consumables proposed from the procedure type, with available stock quantities
3. Adjust quantities actually used if they differ from the defaults.
4. Add the date, time, and any observations.
5. Click **Save**.

**If stock is sufficient:** the procedure is saved, stock is reduced batch by batch (oldest expiry first), and the procedure appears on the patient dashboard.

**If stock is insufficient:** the save is refused. Add the missing product to a requisition (see [5.2](#52-requisitions)) and retry once stock has been received.

<!-- IMAGE: procedure screen showing medications list with stock quantities -->

---

## 5. Stock management

### 5.1 Medications and consumables catalogue

The catalogue is the master list of products the facility uses.

**To view:** Go to **Stock → Medications and consumables**. Products are grouped by category (Medications, Consumables).

**To add a product:**
1. Click **Add**.
2. Fill in: name, category, unit of measure, alert threshold (minimum quantity before an alert is shown).
3. For a medication, also fill in: generic name, therapeutic class, pharmaceutical form, strength.
4. Click **Save**.

<!-- IMAGE: catalogue list and add product form -->

> The alert threshold triggers a warning on the Stock status screen and flags the product in the requisitions list.

---

### 5.2 Requisitions

A requisition records a need — products and quantities to request from the supply point.

**To create a requisition:**
1. Go to **Stock → Requisitions** and click **New requisition**.
2. Enter: requester, date, and each product with the quantity needed.
3. Click **Save**.

**To fulfill a requisition (stock manager):**
1. Open the requisition from the list.
2. Click **Fulfill**.
3. A stock receipt is pre-filled with the requested products. Complete it as described in [5.3](#53-stock-receipt).

<!-- IMAGE: requisition list and fulfill button -->

---

### 5.3 Stock receipt

A stock receipt records products coming into the facility, whether from a supplier, a sales representative, or as opening stock.

1. Go to **Stock → Stock receipt** and click **New receipt** (or arrive here from a fulfilled requisition).
2. Select the source: market, sales representative, or opening stock.
3. For each product line, enter:
   - Product
   - Batch number
   - Expiry date
   - Quantity
   - Price paid
4. Click **Submit**.

Stock quantities increase immediately. The new batches are visible in the stock status.

<!-- IMAGE: stock receipt form with product lines -->

> You can receive stock without a prior requisition by going directly to the Stock receipt screen.

---

### 5.4 Stock status

The stock status screen gives an overview of all quantities.

- **Per product:** total quantity, broken down by batch.
- **Alerts:**
  - 🔴 **Expired** — batch is past its expiry date.
  - 🟠 **Expiring soon** — batch expires within the alert window.
  - 🟡 **Below threshold** — total quantity is below the alert threshold set in the catalogue.
- **Movement history:** each line shows the quantity change, the date, and either the patient (for a procedure) or the reason (for a non-patient issue).

<!-- IMAGE: stock status screen with alert badges -->

---

### 5.5 Non-patient issues (expired, broken, lost)

Use this screen to remove products from stock for reasons other than patient care.

**For expired medications:**
1. Go to **Stock → Non-patient issue**.
2. Select reason: **Expired**.
3. The expired batches are listed automatically with their quantities.
4. Physically remove the boxes.
5. Adjust quantities if the actual count differs from the system.
6. Click **Submit**.

**For breakage or loss:**
1. Go to **Stock → Non-patient issue**.
2. Select reason: **Breakage** or **Loss**.
3. Select the product, batch, and quantity.
4. Click **Submit**.

Stock decreases batch by batch immediately after submission.

<!-- IMAGE: non-patient issue screen showing expired batches listed automatically -->

---

## 6. Settings (managers only)

### 6.1 Procedure types

Procedure types define the default medications and consumables used in a given procedure, with their default quantities. When a nurse opens a procedure, these defaults are pre-filled, saving time and reducing errors.

**To add a procedure type:**
1. Go to **Settings → Procedure types** and click **New**.
2. Enter the procedure name.
3. Add each medication or consumable used by default, with its default quantity.
4. Click **Save**.

<!-- IMAGE: procedure type form -->

---

### 6.2 Care staff

Care staff records link a person's name and role to their Frappe login account, so the consultation form can fill in the doctor automatically.

**To add a staff member:**
1. Go to **Settings → Care staff** and click **New**.
2. Enter: name, role (Doctor, Nurse, etc.), and the linked login account.
3. Click **Save**.

<!-- IMAGE: care staff form -->

---

## 7. Complete workflow examples

### Walk-in patient

1. Reception searches for the patient in **Patients**. Not found — clicks **Create a patient**, fills in the form, saves. The dashboard opens.
2. The doctor opens a **New consultation** from the dashboard. Enters diagnosis and prescribes a procedure with two medications.
3. The nurse opens the prescribed procedure from the dashboard. Confirms the quantities. Clicks **Save** — stock decreases automatically.
4. The procedure appears in the patient's history.

---

### Low-stock replenishment

1. The stock manager sees a product flagged below threshold on **Stock status**.
2. Opens **Requisitions**, creates a new requisition for that product.
3. The supply point delivers. The stock manager opens the requisition, clicks **Fulfill**, completes the stock receipt with batch number, expiry date, quantity, and price, then submits.
4. The stock status updates immediately. The alert clears.

---

### Removing expired medications

1. The stock manager checks **Stock status** and sees expired batches flagged in red.
2. Opens **Non-patient issue**, selects reason **Expired**.
3. The expired batches are listed. The manager physically removes the boxes, adjusts quantities if needed, and submits.
4. Stock decreases. The expired batches no longer appear.

---

## 8. Frequently asked questions

**Can I undo a submitted stock receipt?**
Submissions are reversible by an administrator in Frappe Desk. Contact your site administrator.

**What happens if I try to dispense more than what is in stock?**
The save is refused with a message indicating which product is short. Create a requisition for the missing product, wait for the stock receipt, then retry the procedure.

**Why does the system pick a specific batch instead of letting me choose?**
The system always uses the batch that expires first (FEFO). This minimises waste and prevents expired products from being dispensed to patients.

**A product shows as expired in the system but the box says it is not. What do I do?**
Check the expiry date entered during the stock receipt. If it was entered incorrectly, an administrator can correct it in Frappe Desk before the batch is used.

**I need a feature that is not in the interface (billing, inpatient care, etc.).**
The underlying records (consultations, procedures, stock movements) are standard Frappe Healthcare and ERPNext documents. These features can be managed in Frappe Desk by an administrator, or added to the interface in a future release.

**Who can access Frappe Desk?**
Only administrators. Clinic staff work exclusively in the Sky Healthcare interface and do not need Desk access.

---

*Sky Healthcare is built and maintained by [SkyEngPro](https://skyengpro.com). For support, contact contact@skyengpro.com.*
