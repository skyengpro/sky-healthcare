# Default install configuration

ERPNext and Healthcare are required apps. Frappe installs them first if they are missing from the site, and the install fails if they are not on the bench. They cannot be uninstalled while Sky Healthcare is on the site.

The app is tested with Frappe `v16.60.2`, ERPNext `v16.60.0` and Healthcare `v16.8.0` (see the README).

Each migration applies the roles, site settings, custom fields and record sharing below again and overwrites local changes to them. Stock accounts are only filled in when empty. The last section lists what is only created when missing.

Everything here is stored in the site's own database. Configuring, or later changing, one customer's site never affects another site.

## Roles

| Role | Access in the app |
|---|---|
| `Clinic Staff` | Patients, consultations, treatments, medicines, stock, stock requests and reports |
| `Clinic Admin` | Same, and approves or rejects requests, manages staff and deletes categories |

Neither role has Desk access or permissions on documents. The app API checks the role and then writes as Administrator. The real user is recorded as owner, last editor and in the change history. Direct database updates made by ERPNext, such as batch quantities, stay under Administrator.

## Site settings

These apply to the whole site, including work done outside the app.

| Setting | Value | Effect |
|---|---|---|
| Stock Settings `enable_serial_and_batch_no_for_item` | 1 | Items can be tracked by batch |
| Stock Settings `use_serial_batch_fields` | 1 | Stock transactions take the batch number directly on the row |
| Stock Settings `pick_serial_and_batch_based_on` | Expiry | Automatic batch selection takes the batch that expires first, for every item |
| Stock Settings `auto_indent` | 1 | ERPNext raises a Material Request when an item falls below its reorder level |
| Appointment Type `Consultation` | Practitioner, 20 minutes | Default type, so a consultation can be saved without an appointment |

## Stock accounts

ERPNext creates companies with perpetual inventory on: every stock movement also posts accounting entries. Those postings need two Company accounts, and the first stock receipt fails without them ("Please set Account in Warehouse … or Default Inventory Account in Company …"). Some charts, such as SYSCOHADA (Cameroon and other OHADA countries), provide neither.

At install, after the setup wizard and at each migration, the app fills in these Company fields for the default company when they are empty:

| Company field | Standard chart | SYSCOHADA chart, when it has no stock account |
|---|---|---|
| Default Inventory Account | The chart's existing stock account (`Stock In Hand`) | Creates `336 - Médicaments et consommables médicaux` under `33 - Autres approvisionnements`, type Stock |
| Stock Adjustment Account | The chart's existing `Stock Adjustment` account | Uses `6033 - Variations des stocks d'autres approvisionnements` and gives it the type Stock Adjustment |

On another chart without a stock account, the account is created as `Medicines and Medical Supplies` under the chart's stock group. The number is the first free one under the parent.

The users never see these entries: receipts debit the stock account and credit the adjustment account, and issues do the reverse. A customer who later starts accounting already has the stock value in their books. An accountant can rename or move these accounts, or choose others in the Company. Only later entries follow the change.

The app never changes an account that is already set, and changes nothing when perpetual inventory is off. If the chart has no suitable account and no place to create one, the install prints a warning and stock receipts fail until the accounts are set by hand. To run this step again: `bench --site <site> execute sky_healthcare.setup.install.configure_stock_accounts`.

## Record sharing between practitioners

Healthcare adds a User Permission that limits a user linked to a practitioner to that practitioner's records. The app removes that permission when a practitioner is saved and at each migration. A permission scoped to specific doctypes is left in place.

This is enabled so that a doctor or nurse sees what colleagues prescribed. A user linked to a practitioner can read the consultations, prescriptions and procedures of every practitioner, in Desk and through the API, within what their roles allow.

Desk forms fill in the practitioner from the signed-in user, which the removed permission used to do.

## Custom fields

The app adds fields to Item, Stock Entry, Material Request, Patient, Patient Encounter, Clinical Procedure and Clinical Procedure Template. They are defined in `sky_healthcare/setup/install.py`.

## Default administrator

The install creates one user with the `Clinic Admin` role, so someone can sign in to the app straight away.

| Email | Password |
|---|---|
| `clinic.admin@gmail.com` | `clinicadmin123` |

If a user with this email already exists, the install leaves it unchanged, including its roles and password. A migration never creates this user, so it does not come back after being deleted. A site where the app is already installed does not get it; to add it there, run `bench --site <site> execute sky_healthcare.setup.install.create_default_admin`.

The password is the same on every site and ignores the site's password policy. Change it after the first sign-in.

## Created when missing

Local changes to these are kept.

- Item groups under `Medicine`, the `Clinical Procedures` item group and the units of measure
- The `Medical Store` warehouse, on first install only
- The medical stock account, when the chart has no stock account (see [Stock accounts](#stock-accounts))
- Notifications for expiring batches, low stock and new requests
- A Medication for each medicine and a Healthcare Practitioner for each app user

`sky_healthcare.setup.site.setup` is a separate command. Only that command sets the date and number formats and disables public sign-up.
