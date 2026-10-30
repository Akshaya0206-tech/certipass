# CertiPass backend: accounts, sign-in and the database

CertiPass has one backend: the Cloudflare Worker in [`worker/`](../worker). It keeps the accounts, checks every
sign-in and every request, and stores certificates in your private Google Drive folder
([GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md)). Its database is **Cloudflare D1** (SQLite) bound to the Worker:
nothing else to sign up for or run. There is no Supabase anywhere.

> **Read this first.** This connects *sign-in, accounts and certificate files*. The rest of the app's records
> (achievements, reviews, comments, notifications) still live in each browser's local storage, so a faculty
> member on another computer does not see a student's achievements even though the certificate is in Drive.
> **Do not use this for real student records until achievements move to the database.**

## What the Worker guarantees

| Rule | How it is enforced |
|---|---|
| Nobody is trusted because the browser says so | Every request carries a session token. The Worker looks it up, and reads the person's role, department and status **from its own database at that moment**. A role, student id or department sent by the browser is never believed. |
| Passwords are not recoverable | PBKDF2-SHA-256 with a random salt per password, run through HMAC with a secret (`AUTH_PEPPER`) kept only in the Worker's secrets. A stolen database alone cannot be used to guess passwords. |
| A stolen database cannot be used to sign in | Session tokens are random 256-bit values; only their SHA-256 is stored. |
| Sign-in cannot be brute-forced | 5 wrong passwords lock that email for 15 minutes; 30 failures from one address lock it too; registration is limited to 10 attempts an hour per address. The counters hold no email addresses. |
| "No such account" and "wrong password" look the same | Same message, same status, and the same amount of password work. |
| Registering can only ever make a **student** | The role is fixed in the Worker. Only `@rajalakshmi.edu.in` addresses are accepted (configurable). |
| A new student can sign in at once | By default there is no approval step: a student who registers is signed straight in. Setting `REGISTRATION_MODE=approval` makes each new account wait for an administrator instead. |
| Switching an account off takes effect at once | The person's open sessions are deleted in the same step, and the role is re-read on every request. |
| Administrators can't lock everyone out | An administrator can't deactivate or demote themselves, and the "another active administrator exists" rule is part of the SQL `UPDATE`, so two administrators can't switch each other off at the same instant. |
| Students see only their own certificates | Enforced in SQL and in the access rules, on every request: list, view, download. Faculty see students currently in a department they cover. Administrators see all. |
| Certificate ids can't be squatted | Certificates are keyed by *(student, achievement id)*, so nobody can pre-claim or be mistaken for another student's achievement. |
| Changes to accounts are recorded | An audit trail records who approved, created, edited, deactivated or reset whom, and who removed which certificate. Never a password. |

**Honest limits.**
* The Workers runtime caps PBKDF2 at 100,000 rounds, below what OWASP suggests on its own. The pepper and the lockouts make up for it; the round count is stored in each hash so it can be raised later. On Cloudflare's Free plan the 10 ms CPU limit may be too tight for password hashing; a paid Workers plan is recommended for real use.
* There is no email verification (no mail service), and with registration open there is no approval either. So nothing proves that the person registering owns the college address or register number they typed: someone could register with another student's details first, and upload under them. Students can only ever reach their own data, so the damage is limited to that one student's area, but if you want a human check, set `REGISTRATION_MODE=approval`.
* The browser keeps its session token in local storage so a refresh doesn't sign you out. A cross-site-scripting bug in the app could expose it. The app has no `dangerouslySetInnerHTML`, `innerHTML` or third-party scripts; keep it that way.
* Changing `AUTH_PEPPER` invalidates every password. There is no way to rotate it without everyone resetting their password.

## Set it up on your own computer (nothing is deployed)

```bash
cd worker
cp .dev.vars.example .dev.vars        # skip if you already have one; then add the two lines below
```

1. **Secrets.** In `worker/.dev.vars` set `AUTH_PEPPER` (32+ random characters) and `SETUP_TOKEN` (20+). Make each with
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. The Google values you already have stay as they are.
2. **Create the tables** in the local database: `npm run db:migrate:local`
3. **Run the Worker:** `npm run dev` (it listens on <http://127.0.0.1:8787>).
4. **Create the first administrator** (in a second terminal): `npm run admin:create`. It asks for a college email, a name and a password (typed hidden). It works **once**: as soon as any administrator exists the Worker refuses for good.
5. **Connect the app.** In the project's `.env.local` set `VITE_CERT_API_URL=http://127.0.0.1:8787`, then `npm run dev` in the project root and open <http://localhost:5173>.
6. **Try it.** Register a test student on the student page. They are signed straight in, and can open **My Certificates** and upload a certificate, which appears in your Drive folder under `CertiPass/…`. Sign in on the administrator page to see it under **Certificates**. (With `REGISTRATION_MODE=approval` the student sees "Registration received" instead, and an administrator presses **Approve** on the **User Management** page before they can sign in.)

With `VITE_CERT_API_URL` empty the app is the offline prototype again, exactly as before.

**"Certificate storage isn't set up yet"** on a certificates page means the app was built or started with `VITE_CERT_API_URL` empty, so it has no Worker to ask. It says nothing about Google Drive itself. Set the variable (Vite reads it when it starts or builds, so restart `npm run dev` or rebuild), then sign in with a **server account**: the offline demo logins (`aarav.demo` and so on) exist only in the browser, and the Worker has never heard of them. "Certificate storage can't verify this sign-in" means the URL is set but you are not signed in to the Worker. To check the Drive side on its own, run `npm run drive:check` in `worker/`, or open the administrator's Certificates page, which reports the folder's status.

## Deploy it (not done yet; needs your go-ahead)

```bash
cd worker
npx wrangler login
npx wrangler d1 create certipass            # copy the database_id it prints into wrangler.toml
npm run db:migrate:remote
npx wrangler secret put AUTH_PEPPER
npx wrangler secret put SETUP_TOKEN
npx wrangler secret put GOOGLE_DRIVE_ROOT_FOLDER_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_ID
npx wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
npx wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN
# set ALLOWED_ORIGINS in wrangler.toml to your real site (exact origin, no wildcard), then:
npx wrangler deploy
SETUP_TOKEN=<the same value> npm run admin:create -- --url https://<your-worker>.workers.dev
npx wrangler secret delete SETUP_TOKEN      # the first administrator exists now; the route is closed anyway, but remove the secret
```

Then set `VITE_CERT_API_URL=https://<your-worker>.workers.dev` for the site build. Add a Cloudflare rate-limiting rule on `/api/auth/*` and `/api/certificates` as an extra guard. D1 keeps point-in-time history ("Time Travel") you can restore from; check your plan's retention.

## The screens

With the app connected to the Worker (`VITE_CERT_API_URL`), each role gets one certificates page in its menu. Nothing else about the app's design changes.

* **Student → My Certificates.** A short form (title, category, issuing organisation, issue date, file), a progress bar while it uploads ("Saving to Google Drive…" once the file has arrived), a clear success or error message
  with a **Try again** button (a retry can never store the file twice), and the student's own certificates with **Preview** and **Download**.
* **Faculty → Certificates.** The certificates of students in the departments they review. Search by student name or ID (also certificate title and issuer); filter by department, batch and category; **Preview** and **Download**.
* **Administrator → Certificates.** Everything above for all students, plus **Remove** (with a confirmation; the file goes to the Drive bin for 30 days) and an **Upload statistics** panel.
  Account management (and, if approval is switched on, approving new students) stays on the existing **User Management** and **Faculty Management** pages.
* **Administrator → Faculty Management.** Summary cards (total, active, inactive), a searchable list filtered by department and status, **Add Faculty** (name, email, designation, department, the departments they cover, an initial password; the role is always Faculty),
  and on every row **Edit**, **Reset password**, **Deactivate / Activate** and **Delete** (with a confirmation). Only faculty can be deleted; students and administrators are deactivated instead, so their records are never lost. A reset or a deactivation ends the person's open sign-ins at once.

Preview and download go through the Worker, which checks the person's role first and then streams the file from Drive. There is no link to copy, share or leak.

## Where each certificate goes in Google Drive

`<your folder> / CertiPass / <year of upload> / <student's department> / <student ID> / Certificates / <student ID>_<category>_Certificate.<ext>`.
The department and student ID come from the student's account in the Worker's database, never from the request. See [GOOGLE_DRIVE_SETUP.md](GOOGLE_DRIVE_SETUP.md).
## Who can do what

| | Student | Faculty | Administrator |
|---|---|---|---|
| Register / sign in / sign out / change own password | ✔ | ✔ | ✔ |
| Upload a certificate (title, category, issuing organisation, issue date, file) | ✔ (as themselves) | — | — |
| List, search, preview, download certificates | own only | students currently in their departments | all |
| Filter by department, batch, category | ✔ (within what they may see) | ✔ (within their departments) | ✔ |
| Remove a certificate | — | — | ✔ |
| Upload statistics (totals, by category, department and month, accounts; and anyone awaiting approval) | — | — | ✔ |
| Create, edit, deactivate accounts (and approve new ones, if approval is on); reset passwords; read the audit trail | — | — | ✔ |
| Check Drive storage status, run reconciliation | — | — | ✔ |

A deactivated account (or one still waiting for approval, when approval is on) can do nothing.

## The API

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/auth/login` | anyone | email + password (+ which sign-in page) → session token |
| `POST /api/auth/register` | anyone | a student registers |
| `POST /api/setup/first-admin` | setup token | create the first administrator, once |
| `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/change-password` | signed in | |
| `POST /api/certificates` | student | upload (multipart; PDF/JPG/PNG up to 10 MB; optional `title`, `issuer`, `issueDate`) |
| `GET /api/certificates` | signed in | list what you may see (`?q ?department ?batch ?category ?studentId ?achievementId ?limit ?offset`); also returns the departments and batches to offer as filters |
| `GET /api/certificates/by-achievement/:id` | signed in | find a student's certificate (`?student=` for staff) |
| `GET /api/certificates/:id`, `GET /api/certificates/:id/file` | by role | details; the file itself, streamed through the Worker |
| `DELETE /api/certificates/:id` | administrator | remove (the Drive file goes to the bin) |
| `GET/POST /api/admin/users`, `PATCH /api/admin/users/:id`, `DELETE /api/admin/users/:id` (faculty only), `POST /api/admin/users/:id/reset-password`, `GET /api/admin/audit` | administrator | account management |
| `GET /api/admin/stats` | administrator | upload and account statistics |
| `GET /api/storage/status`, `POST /api/admin/reconcile` | administrator | Drive health; finish interrupted work |

## What this does not do yet

1. **Achievements are not in the database.** Everything except accounts and certificate files is still per-browser. Moving it is the next big piece of work.
2. **The prototype's demo data still appears** in the local lists. Real accounts sit alongside it.
3. **Password reset by the person themselves** (a "forgot password" email) needs a mail service. An administrator can reset a password through the API; the admin screens have no button for it yet.
4. **Per-person password change screen.** The API exists (`POST /api/auth/change-password`); the app has no screen for it yet.
5. **The Google token** expires after 7 days while the consent screen is External and in Testing mode (see GOOGLE_DRIVE_SETUP.md).

## Before real student records

1. Achievements, reviews and comments stored in the database with the same role rules.
2. A full pass through the app as a real student, a faculty member and an administrator.
3. The Worker deployed with its secrets, `ALLOWED_ORIGINS` set to the real site, rate limits in place.
4. Your sign-off. Nothing here has been deployed or used with real student data.
