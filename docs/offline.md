# Offline mode

Healthcare Management keeps working when the connection is lost and sends what was done when it returns.

## For staff

- **You can keep working.** Registering patients, consultations, treatments, medicines, stock in and out and medical requests all work
  with no connection. What you do appears at once, with a small "Waiting to be sent" tag.
- **The bar at the top** tells you where you are:
  - *You're offline.* Your changes are saved on this device. It shows how old the data on screen is.
  - *Back online. Sending...* Your changes are being sent. Wait for the next message.
  - *All changes are sent.* Nothing is left to send.
  - *N changes could not be sent.* The server refused them (for example the stock was already used). Press **Review**.
  - *Your session ended.* Sign in again. Your saved changes are kept and sent after you sign in.
- **The pill next to the language switch** counts the changes still waiting. Open it to see them. A refused change shows the reason,
  with **Try again** and **Discard**.
- **Needs a connection:** managing staff, changing a password, approving or rejecting a request, deleting a medicine or a category.
- **Do not clear the browser's site data** while changes wait: they live on the device until they are sent. Logging out asks first.
- **Open the app online once** on each device, and again after a long time, so the data kept on it is recent.

## How it works

| Part | What it does | Where |
|---|---|---|
| Service worker | Serves the app, the logo and the fonts with no connection | `frontend/vite.config.js`, `sky_healthcare/service_worker.py` |
| Data copy | Every read is kept in IndexedDB; the lists and the files of the latest 40 patients and 80 medicines are read in the background after sign-in | `frontend/src/offline/store.js`, `prefetch.js` |
| Outbox | Each change is its own record in IndexedDB (store `outbox`) with a unique `client_id`; sent oldest first. Nothing is kept in localStorage | `frontend/src/api.js` |
| Overlay | Shows the waiting changes on top of the data copy, so screens look the same as online | `frontend/src/offline/pending.js` |
| Duplicate protection | The server stores the `client_id` of what it records and ignores a repeat | `sky_healthcare/api.py`, `health.py` (`custom_client_id` fields) |
| Status | The bar and the pill | `ConnectionBanner.vue`, `SyncDialog.vue`, `PendingChanges.vue`, `PendingTag.vue` |

Rules worth knowing:

- **Local ids.** A patient, medicine, consultation or treatment made offline gets a temporary id (`local:...`). Later changes that
  mention it are rewritten with the real id once the server has given it. Editing a record that was not sent yet changes its waiting
  change; completing a waiting treatment marks it done in place; cancelling or discarding it removes the waiting change.
- **Errors.** A refused change (4xx) is kept as *failed* with the server's message. A server error or a busy server (5xx, 408, 429)
  keeps its place and is retried with a growing delay (2 s, 4 s ... up to 60 s) six times, then reported.
- **Connection detection.** A failed request is checked against `/api/method/ping`: only if the server cannot be reached is the app
  marked offline, so one failed request is not shown as a lost connection. While offline, the app tests the connection again every
  few seconds.
- **Slow connection.** If the server takes more than 2.5 s and a copy exists on the device, the copy is shown and the screen refreshes
  when the answer arrives. This is not done for 60 s after the person's own change, so they never see an older copy than what they did.
- **Several tabs.** Only one tab sends at a time (Web Locks). Every change is its own record, a tab only writes or deletes the record
  it works on, and the tabs tell each other (BroadcastChannel) to read the list again. Right before sending, a tab reads the stored
  copy of the change: if it was sent, changed or discarded elsewhere, it uses that. Closing a tab never loses a change.
- **Gateway errors.** 502, 503 and 504 count as failed tries (same delay and limit as 500), they never turn the app "offline".
- **Dates.** A change made offline is dated the day it was made (consultation, stock in and out, treatment): the app adds the date
  when it queues the change.
- **Dependencies.** If a change is refused, every change that needs it (directly or through another) is marked failed with it.
  *Try again* on the first change releases all of them. Discarding it discards them. A change is never sent with a temporary id.
- **People.** Changes are tagged with their user. Only the signed-in person's changes are shown, counted and sent, and nothing is
  sent before the person is known (the page is still starting). Another person's changes stay on the device for them.
- **Session.** If the session ended while offline, sending pauses and the bar asks to sign in again. The start of the app never uses
  the copy on the device to decide who is signed in. If someone else signed in from another tab meanwhile, an open tab never sends
  its changes under their account: it pauses and asks to sign in again.
- **Server errors.** The number of tries of a change is kept on the device, so the limit holds across passes and reloads.
- **Logging out.** It clears the copy and this person's waiting changes (after a warning, from the top menu and from the Account
  page). If the server cannot be reached, the log out is remembered and finished at the next visit with a connection, before
  any screen is shown; until then the app shows the login page.
- **Storage.** If the device cannot keep a change (storage full or blocked), the person is told ("Not saved on this device") and the bar
  says to keep the page open until it is sent.

## After a deploy

1. Run migrate on the site (adds the duplicate-protection fields). In Press this is an **Update** of the site.
2. Open the site and hard refresh once so the new service worker takes over.

## Tests

- `cd frontend && npm run test:offline`: unit tests of the overlay (no browser).
- `node tests/offline_e2e.mjs <site> <staff-email> <staff-pw>`: browser test with the network cut (needs Chrome and `puppeteer-core`).
- `node tests/offline_review_e2e.mjs <site> <staff-email> <staff-pw> [<other-staff-email> <other-staff-pw>]`: edge cases: two tabs, discard while sending, dependent changes, another person's changes, storage failure, 504 answers, slow start, finishing a treatment, someone else signing in from another tab (needs the second user), logging out offline.
- `python3 tests/api_smoke.py` and `tests/health_smoke.py`: a change sent twice is recorded once.

## Limits

- The dashboard follows waiting stock and requests, but reports, notifications and the expiry dates of waiting stock do not.
- A consultation or treatment made offline cannot be edited in every way: edit, finish, complete, cancel and discard work; other changes
  wait until it is sent.
- Two people changing the same record offline is not merged: the later change that reaches the server wins.
- **Data on the device.** The copy kept for offline use (patient files, allergies, the session's CSRF token) is stored unencrypted in
  IndexedDB, and the app opens offline without a new sign-in. Logging out clears it. Whether this is acceptable (shared or lost
  devices, health-data rules) is a product and legal decision, not a code one; options are encrypting with a key from a PIN, or
  limiting what is kept.
- A change made offline is dated the day it was made. A stock movement dated before the medicine was received is refused by the server.
