# Default install configuration

ERPNext and Healthcare are required apps. Frappe installs them first if they are missing from the site, and the install fails if they are not on the bench. They cannot be uninstalled while Sky Healthcare is on the site.

Each migration applies the roles, site settings, custom fields and record sharing below again and overwrites local changes to them. The last section lists what is only created when missing.

## Roles

| Role | Access in the app |
|---|---|
| `Pharmacy Staff` | Patients, consultations, treatments, medicines, stock, stock requests and reports |
| `Pharmacy Admin` | Same, and approves or rejects requests, manages staff and deletes categories |

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

## Record sharing between practitioners

Healthcare adds a User Permission that limits a user linked to a practitioner to that practitioner's records. The app removes that permission when a practitioner is saved and at each migration. A permission scoped to specific doctypes is left in place.

This is enabled so that a doctor or nurse sees what colleagues prescribed. A user linked to a practitioner can read the consultations, prescriptions and procedures of every practitioner, in Desk and through the API, within what their roles allow.

Desk forms fill in the practitioner from the signed-in user, which the removed permission used to do.

## Custom fields

The app adds fields to Item, Stock Entry, Material Request, Patient, Patient Encounter, Clinical Procedure and Clinical Procedure Template. They are defined in `sky_healthcare/setup/install.py`.

## Created when missing

Local changes to these are kept.

- Item groups under `Medicine`, the `Clinical Procedures` item group and the units of measure
- The `Pharmacy` warehouse, on first install only
- Notifications for expiring batches, low stock and new requests
- A Medication for each medicine and a Healthcare Practitioner for each pharmacy user

`sky_healthcare.setup.site.setup` is a separate command. Only that command sets the date and number formats and disables public sign-up.
