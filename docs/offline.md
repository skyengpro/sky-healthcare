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
| Outbox | Each change is a record in IndexedDB (and a backup in localStorage) with a unique `client_id`; sent oldest first | `frontend/src/api.js` |
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
- **Several tabs.** Only one tab sends at a time (Web Locks).
- **Session.** If the session ended while offline, sending pauses and the bar asks to sign in again. Changes are tagged with their
  user and are only sent for that user.

## After a deploy

1. Run migrate on the site (adds the duplicate-protection fields). In Press this is an **Update** of the site.
2. Open the site and hard refresh once so the new service worker takes over.

## Tests

- `cd frontend && npm run test:offline`: unit tests of the overlay (no browser).
- `node tests/offline_e2e.mjs <site> <staff-email> <staff-pw>`: browser test with the network cut (needs Chrome and `puppeteer-core`).
- `python3 tests/api_smoke.py` and `tests/health_smoke.py`: a change sent twice is recorded once.

## Limits

- The dashboard follows waiting stock and requests, but reports, notifications and the expiry dates of waiting stock do not.
- A consultation or treatment made offline cannot be edited in every way: edit, finish, complete, cancel and discard work; other changes
  wait until it is sent.
- Two people changing the same record offline is not merged: the later change that reaches the server wins.
