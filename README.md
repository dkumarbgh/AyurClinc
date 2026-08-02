# Clinic Management System

A Node.js + SQLite application for a clinic that handles:

- **Patient records** — search, add, edit, soft-delete, and **bulk import**
  from Excel (.xlsx/.xls), CSV, or JSON.
- **Vaccinations** — a master vaccine list, per-patient scheduling, and **automatic
  monthly recurrence**: marking a dose administered auto-schedules the next dose if
  the vaccine is recurring (e.g. a monthly injection).
- **Swarna Prashana** — a dedicated module for the monthly Ayurvedic immunity-dose
  program: enroll a child once (or auto-enroll them right from the "Add
  patient" form), and the app queues one dose per month going forward. Each month, staff work a **calling queue** to reach the parent
  (Called / No answer / Rejected), with one-click **Call** and **WhatsApp**
  buttons next to every contact, then mark the dose given once the child
  comes in — which auto-schedules next month's dose. A **Monthly report**
  tab shows a specific calendar month at a glance (doses due, given, not yet
  called, rejected) so nothing falls through the cracks month to month.
- **WhatsApp reminders** — a pluggable messaging service. Right now it *stubs*
  messages (logs them and stores them in the database) since no WhatsApp
  credentials are configured. Flip one setting in `.env` to start sending for
  real via Twilio or Meta's WhatsApp Cloud API — no other code changes needed.
- **Therapy room allocation** — 4 fixed therapy rooms, with therapist assignment
  and automatic conflict checking so a room or therapist can never be
  double-booked.
- **Fee collection** — invoices, partial/full payments, and automatic WhatsApp
  payment confirmations.
- **Admin dashboard** — a browser-based UI (no separate frontend build step
  needed) covering all of the above.
- **Staff accounts & roles** — three roles (Admin, Front desk, Therapist)
  with different levels of access, so a therapist can work the Swarna
  Prashana calling queue and vaccination schedule without seeing fees or
  being able to edit patient records, while an admin has full access
  including staff management.
- **Audit log** — every action that changes data (adding a patient,
  recording a payment, booking an appointment, etc.) is automatically
  recorded with who did it and when, visible to admins.
- **PDF documents** — invoices, receipts, vaccination certificates, medical
  certificates, and insurance bills, all generated instantly in the browser
  with your clinic's letterhead (set once under Settings).

---

## 1. Requirements

- **Node.js 22.5 or later (Node 24+ recommended).** The app uses Node's
  built-in `node:sqlite` module, so **there is no native/compiled dependency
  to install** — no Python, no Visual Studio Build Tools, no `node-gyp`,
  on any OS. If you previously hit an error like `gyp ERR! find Python` or
  `better-sqlite3` failing to build on Windows, that's now resolved: this
  version doesn't use `better-sqlite3` at all.
- npm

You'll see a one-line `ExperimentalWarning: SQLite is an experimental
feature` printed when the server starts — that's expected and harmless; it
just means Node itself still labels the module experimental.

## 2. Setup

```bash
cd clinic-management
npm install
cp .env.example .env      # then edit .env if you want to change the admin password, etc.
npm run seed               # creates the admin login and default vaccine list
npm start                  # or: npm run dev  (auto-restarts on file changes)
```

Want to explore the app with realistic-looking data instead of starting from
an empty database? Run `npm run sample-data` instead of (or after) `npm run
seed` — it adds 8 sample patients, 3 therapists, a mix of appointments, fee
records (paid/partial/pending/overdue), vaccination records, Swarna Prashana
enrollments with varied call statuses, and two extra staff logins
(`reception` / `reception123` for front desk, `anita` / `therapist123` for
therapist) so you can try out each role immediately. Every date it creates
is relative to today, so it always looks current whenever you run it. It's
safe to run more than once — it detects existing patients and skips rather
than duplicating; delete `clinic.db` and start over if you want a clean
re-run.

The server starts on **http://localhost:3000** by default. Open that URL in a
browser to reach the admin dashboard.

**Default login:** username `admin`, password `admin123` (both configurable
via `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` **before** running `npm run
seed`; changing them afterwards does not update the already-created account —
either delete `clinic.db` and reseed, or change the password from the app
itself once logged in via the sidebar's "Change password" link).

This first account is always created with the `admin` role. From the
**Users** page (visible only to admins), add accounts for your actual staff
with the appropriate role:

- **Admin** — full access, including staff accounts and the audit log.
- **Front desk** — patients, fees, scheduling, vaccinations, Swarna
  Prashana. Can't manage staff accounts or edit the therapist/room list.
- **Therapist** — the clinical workflow (appointments, vaccinations, Swarna
  Prashana calling queue) and read-only patient info, but no access to fees,
  staff management, or editing the therapist/room list.

Every staff member can change their own password from the sidebar at any
time; admins can also reset anyone's password from the Users page.

## 3. Project layout

```
clinic-management/
├── server.js                  Express app entry point
├── src/
│   ├── db/
│   │   ├── schema.sql          Full SQLite schema
│   │   ├── connection.js       DB connection + auto-migration + room seeding
│   │   └── seed.js             Creates admin user + default vaccine list
│   ├── routes/                 One file per REST resource
│   ├── services/
│   │   ├── whatsappService.js  Stub / Twilio / Meta WhatsApp sender
│   │   └── reminderJobs.js     Daily cron jobs (vaccines, appointments, fees)
│   ├── middleware/auth.js      JWT auth guard
│   └── utils/helpers.js        Pagination, date math, patient code generator
└── public/                     Static admin dashboard (vanilla JS, no build step)
    ├── index.html
    ├── css/style.css
    └── js/
        ├── api.js              fetch() wrapper + auth token handling
        ├── app.js               Routing, toasts, modals, formatting helpers
        ├── main.js              Boot script
        └── views/               One file per screen (patients, fees, etc.)
```

The whole database lives in a single file, `clinic.db`, created automatically
on first run via Node's built-in `node:sqlite` module (`src/db/connection.js`
wraps it in a thin better-sqlite3-shaped API) — no native compilation step,
and fast enough for a single clinic with thousands of patient records.

## 4. Turning on real WhatsApp messages

Every reminder and confirmation in the app calls one function,
`whatsappService.sendMessage()`. Until you configure a provider, it just logs
the message and records it in the `whatsapp_logs` table (visible in the
**WhatsApp Log** tab of the dashboard) with status `stubbed`.

To go live, edit `.env`:

```bash
# Twilio
WHATSAPP_PROVIDER=twilio
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886

# —or— Meta WhatsApp Cloud API
WHATSAPP_PROVIDER=meta
META_PHONE_NUMBER_ID=your_phone_number_id
META_ACCESS_TOKEN=your_access_token
```

Restart the server and messages will actually be sent. No frontend or route
code needs to change.

## 5. How the pieces fit together

- **Monthly vaccines**: each vaccine in the master list can have a
  `recurring_interval_months` value. When staff mark a dose "administered" in
  the Vaccinations tab, the app automatically creates the next dose's record
  N months later (unless a `total_doses` cap has been reached). A daily cron
  job (`src/services/reminderJobs.js`, default 9am — configurable via
  `REMINDER_CRON_SCHEDULE` in `.env`) finds doses due within
  `VACCINE_REMINDER_DAYS_BEFORE` days (default 3) and messages the patient,
  once per dose.
- **Room allocation**: the 4 rooms are seeded automatically on first run.
  Booking an appointment checks both the room and the therapist for
  overlapping time slots on the same date and rejects the booking with a
  clear error if there's a conflict.
- **Fees**: an invoice (`fees` table) can optionally be linked to a therapy
  session or a vaccination dose, or stand alone (e.g. a consultation fee).
  Payments can be partial; the status automatically flips to `paid` once the
  full amount is covered, which triggers a WhatsApp confirmation.
- **Bulk patient import**: the "Import" button on the Patients page accepts
  `.xlsx`, `.xls`, `.csv`, or `.json`. Column headers are matched flexibly
  (e.g. "Patient Name", "Full Name", and "name" all map to the same field —
  see `src/utils/importParser.js` for the full alias list), only **name** and
  **phone** are required, and rows whose phone number matches an existing
  active patient are skipped rather than creating a duplicate. The response
  reports exactly how many rows were imported vs. skipped, with a reason for
  each skip. A "Download CSV template" link in the import dialog gives a
  ready-made starting point.
- **Swarna Prashana monthly tracking**: besides the rolling "Calling queue"
  (which always shows anything due now or overdue, so nothing gets lost),
  the **Monthly report** tab lets you pick any calendar month
  (`GET /api/swarna-prashana/doses/monthly?month=YYYY-MM`) and see, at a
  glance, how many doses were due that month, how many were actually given,
  how many parents still haven't been reached, and how many declined —
  along with the full list for that month, with the same call/WhatsApp/log
  actions available right there. This is the view to use for a monthly
  review or handoff between staff.
- **Swarna Prashana**: enrolling a patient (`POST /api/swarna-prashana/enrollments`)
  creates an `active` enrollment plus a single dose record for the first
  month. Each dose has two independent statuses: `call_status` (whether staff
  have reached the parent: `not_called` / `called` / `no_answer` / `rejected`)
  and `dose_status` (whether the child actually came in: `pending` /
  `administered` / `missed` / `cancelled`). Marking a dose `administered` — or
  `missed`/`cancelled` — automatically creates next month's dose record, so
  the queue always has the next call waiting. Pausing or stopping an
  enrollment stops future doses from being generated.

  **Connecting with parents from the page:** each row in the calling queue
  has a phone icon and a WhatsApp icon next to the contact number.
  - The phone icon is a `tel:` link — it opens the device's own phone
    dialer/softphone with the number pre-filled. No setup, no cost, works on
    any device.
  - The WhatsApp icon is a `wa.me` click-to-chat link — it opens WhatsApp
    (desktop or mobile) with a pre-written message ready to send, using the
    parent's regular WhatsApp, not the Business API. Also no setup, no cost.

  Neither of these actually places a call or sends a message *from the
  server* — they hand off to apps already on the staff member's device, and
  staff still records the outcome afterwards via the "Log call" button. A
  true one-click *server-initiated* calling feature (auto-dialing, call
  recording, IVR bridging) would need a paid telephony provider such as
  Twilio Voice, Exotel, or Ozonetel/Knowlarity — the same kind of setup as
  the WhatsApp Business API described above, with its own phone number and
  per-minute cost. That's a reasonable next step once you're ready to invest
  in it, but wasn't necessary to get a working calling workflow today.
- **PDF documents**: from the **Fees** page, every fee record has an
  Invoice (unpaid) or Receipt (paid) button. From a patient's **Documents**
  tab, you can generate a **Vaccination Certificate** (auto-filled from that
  patient's administered doses), a **Medical Certificate** (free-text, with
  a few templates to start from), or an **Insurance Bill** (pick which fee
  records to include, plus a diagnosis/treatment notes field). All of these
  are generated **entirely in the browser** using jsPDF, loaded from a CDN —
  deliberately kept off the server so there's no new native dependency to
  install (the same reasoning as the `node:sqlite` switch earlier). The
  one tradeoff: the browser needs an internet connection **the first time**
  it generates a PDF, to fetch those library files (the browser caches them
  after that, so it isn't needed on every single PDF). If your clinic's
  computer genuinely has no internet access at all, let me know and this
  can be swapped for a server-side approach instead.
  The letterhead on every document comes from **Settings** (admin-only) —
  set your clinic name, address, phone, email, and registration number once
  and it's used everywhere.

## 6. API overview

All `/api/*` routes except `/api/auth/login` and `/api/health` require a
`Authorization: Bearer <token>` header (the token comes back from
`POST /api/auth/login`).

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/login` |
| Patients | `GET/POST /api/patients`, `GET/PUT/DELETE /api/patients/:id`, `POST /api/patients/import` (multipart file upload, field name `file`) |
| Vaccines (master list) | `GET/POST /api/vaccines`, `PUT/DELETE /api/vaccines/:id` |
| Vaccination records | `POST /api/vaccines/schedule`, `PUT /api/vaccines/record/:id`, `PUT /api/vaccines/record/:id/administer`, `GET /api/vaccines/due/upcoming`, `GET /api/vaccines/due/overdue` |
| Therapists | `GET/POST /api/therapists`, `GET/PUT/DELETE /api/therapists/:id` |
| Rooms | `GET /api/rooms`, `GET /api/rooms/occupancy`, `PUT /api/rooms/:id` |
| Appointments | `GET/POST /api/appointments`, `PUT/DELETE /api/appointments/:id` |
| Fees | `GET/POST /api/fees`, `PUT /api/fees/:id`, `PUT /api/fees/:id/pay`, `GET /api/fees/summary` |
| Dashboard | `GET /api/dashboard/summary` |
| WhatsApp | `GET /api/whatsapp/logs`, `POST /api/whatsapp/test-send`, `POST /api/whatsapp/run-reminders` |
| Swarna Prashana | `GET/POST /api/swarna-prashana/enrollments`, `PUT /api/swarna-prashana/enrollments/:id`, `GET /api/swarna-prashana/doses`, `GET /api/swarna-prashana/doses/monthly`, `PUT /api/swarna-prashana/doses/:id/call`, `PUT /api/swarna-prashana/doses/:id/administer`, `GET /api/swarna-prashana/patients/:patientId/doses` |
| Users (admin only) | `GET/POST /api/users`, `PUT /api/users/:id`, `PUT /api/users/:id/reset-password` |
| Your own account | `PUT /api/auth/me/password` |
| Audit log (admin only) | `GET /api/audit-logs` |
| Settings | `GET /api/settings` (any signed-in user), `PUT /api/settings` (admin only) |

## 7. Notes on scale

Indexes are in place on the columns used for search and scheduling
(`patients.full_name`/`phone`, all foreign keys, and every date column used
in the due/overdue/occupancy queries), so the app should comfortably handle
a single clinic with several thousand patients on SQLite. If you ever outgrow
SQLite (multiple clinics, very high concurrent write volume), the queries are
plain SQL and would port to Postgres/MySQL with minimal changes.
