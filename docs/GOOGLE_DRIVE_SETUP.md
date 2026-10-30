# Certificate storage in Google Drive — setup guide

CertiPass stores each student's real certificate (PDF, JPG or PNG, up to 10 MB) in a **private,
college-controlled Google Drive folder**, and keeps the records about it (who owns it, its name, size and
status) in the Worker's own database. Accounts and sign-in are covered in [BACKEND_SETUP.md](BACKEND_SETUP.md).
There is no Supabase and no other service.

> **Status.**
> * **Google Drive: verified for real** on 2026-10-29 and 2026-10-30. `drive:check` and `drive:sample` passed against the real folder, and on 2026-10-30 the Worker
>   (in the real Workers runtime, with a local D1 database) accepted a PDF, a PNG and a JPG from a test student, stored them in the folder layout below, served
>   them back byte for byte, and enforced who may see what (53 checks). Those test files were left under `_CertiPass sample` in your Drive folder so you can look at them;
>   `npm run drive:sample -- --cleanup` removes them.
> * **Not done:** the Worker is not deployed and has no production database or secrets; achievements are still stored per browser; nothing has been used with
>   real student data. See "What still needs doing" at the end.
## How it fits together

```
 Browser (React)                    CertiPass Worker (/worker)                      Google Drive
 ───────────────                    ──────────────────────────                      ────────────
 student signs in ─ email+password ▶ checks the password, issues a session token
 student submits  ── multipart ───▶ 1. look the token up in D1 → who, role, status
                                    2. validate extension, MIME, bytes, size
                                    3. write a `pending` row  ──▶ D1
                                    4. find-or-create folders ──────────────▶ root/CertiPass/batch/dept/regno/category
                                    5. upload the file ─────────────────────▶ (private; no sharing ever set)
                                    6. finalize row: pending → stored (one transaction) ▶ D1
 "uploaded" ◀──────────────────────  only now does the client hear success

 faculty clicks     ── GET /file ──▶ authorise from D1 (student's CURRENT department)
 View Certificate                    stream the bytes back  ◀───────────────── Drive (Worker's own credentials)
 (blob shown in a modal)             never a Drive link, never public
```

* Google credentials and the refresh token exist **only** as Worker secrets (and in your git-ignored `worker/.dev.vars` locally).
* The browser never sees a Drive file id or link; no API response contains one (tests assert this).
* No `permissions.create` call exists anywhere in the code, so nothing can become public or link-shared
  (a test asserts this).
* Folder layout: `<configured folder>/CertiPass/<year>/<department>/<student ID>/Certificates/<student ID>_<category>_Certificate.<ext>`, where `<year>` is the calendar
  year of the upload, `<department>` is the student's own department and `<student ID>` is their register number from their account (never anything the browser sends).
  Everything CertiPass writes sits under the one `CertiPass` folder, so it never mixes with anything else in your folder.
  Folders are found before they are created, and concurrent uploads converge on one folder (the loser trashes its empty copy).
  A second certificate in the same category becomes `…_Certificate_2.pdf`, so nothing is silently overwritten.

## Admins browsing everything in Google Drive

Every uploaded certificate is an ordinary file in your Drive folder, so an admin can open the folder in Google Drive and browse all of them:

```
<your folder>/
  CertiPass/                     ← everything CertiPass writes
    2026/                        ← year of the upload
      AIDS/                      ← the student's department
        2023AIDS0417/            ← the student's ID (register number)
          Certificates/
            2023AIDS0417_Hackathon_Certificate.pdf
            2023AIDS0417_Workshop_Certificate.png
```
* **File names** are meaningful: `<register number>_<category>_Certificate.<ext>`, e.g. `2023AIDS0417_Hackathon_Certificate.pdf`. A second certificate in the same
  category becomes `…_Certificate_2.pdf` (and so on) rather than a confusing duplicate. The student's own file name is kept in the database and used for downloads.
* In the app, **Admin → Settings → Certificate files** has an **Open Google Drive Folder** button, and so does **Achievement Records**. Set `VITE_DRIVE_FOLDER_URL`
  (see `.env.example`) and the button opens exactly that folder, even before the storage Worker is connected. Once the Worker is connected, administrators get the link
  from it instead. Because `VITE_*` values are visible in the built site, **the Drive folder must be Restricted**: the id alone lets nobody in, Google checks the viewer.
* **Google, not CertiPass, decides who can open that link.** Files uploaded into a shared folder inherit the folder's sharing, so access = whoever the folder is shared with.
  Share it with the specific Google accounts of your admins/records office (Viewer is enough to browse; the uploading account needs Editor).
* **Anyone with access to the folder in Drive sees *every* department's certificates and bypasses the app's department-level rules.** So give Drive access to admins only —
  never to faculty or students, who should use the app (where the Worker enforces their departments).
* **The folder must be "Restricted", never "Anyone with the link".** A link-shared folder makes every certificate readable by whoever has the link. The Worker enforces this:
  if Drive reports the folder as link-shared, uploads are refused with `drive_folder_public` and the Settings page shows a warning, until you change it
  (Drive → right-click the folder → Share → General access → **Restricted**). Drive only reveals sharing to accounts allowed to share the folder; if it doesn't say,
  uploads continue and the Settings page asks you to check by hand. `ALLOW_PUBLIC_FOLDER=true` turns the guard off — don't.

## 0. Decide where the folder lives (this matters)

Open your certificate folder in Drive and look at the left sidebar.

| The folder is… | Use | Why |
|---|---|---|
| inside a **Shared drive** (listed under "Shared drives") | OAuth *or* a service account | Files belong to the shared drive, not to a person. Best for a college. |
| inside someone's **My Drive** (a normal shared folder) | **OAuth only** | A service account has no storage quota, so Google rejects its uploads to a My Drive folder (`storageQuotaExceeded`). Files will count against the authorising account's quota. |

> **A share link is not API access.** A link that opens in your browser says nothing about whether the
> *API account* can upload to it. Step 4 checks this directly.
>
> **Set the folder's link sharing to "Restricted".** The API never needs link sharing. If the folder is
> "Anyone with the link", anyone who finds the link (it may be in a chat, a repo or a screenshot) can read the
> certificates. Share it only with the specific account(s) below.

The folder id is the last part of its URL: `https://drive.google.com/drive/folders/<FOLDER_ID>`.
Don't commit it to a public repository; it goes in a Worker secret.

## 1. Google Cloud project

1. <https://console.cloud.google.com> → create a project (e.g. "CertiPass").
2. **APIs & Services → Library → Google Drive API → Enable.**
3. **APIs & Services → OAuth consent screen**
   * If `rajalakshmi.edu.in` is a Google Workspace domain, choose **Internal**. This is the right choice: no Google verification is needed
     for the restricted Drive scope, and refresh tokens don't expire after 7 days.
   * If you must choose **External**: while the app is in *Testing*, Google **expires refresh tokens after 7 days**, so uploads will
     suddenly start failing with `drive_auth_failed`. Publishing to *Production* with the restricted `drive` scope requires Google's verification.
     Prefer a Shared Drive + service account in that case.
4. **Credentials → Create credentials → OAuth client ID → Application type: Desktop app.** Copy the client id and secret.

The scope used is `https://www.googleapis.com/auth/drive`. The narrower `drive.file` scope is **not** enough: it only
covers files the app created itself, so it can't write into a folder you made by hand.

*(Service-account route, Shared Drive only: Credentials → Create service account → Keys → Add key → JSON. Then in the Shared Drive, add the
service account's email as a member with **Content manager**. Set `GOOGLE_AUTH_MODE=service_account` and fill the two `GOOGLE_SERVICE_ACCOUNT_*` values.)*

## 2. Choose the Google account that does the uploading

For OAuth, this is a person's account (ideally a shared **records-office** account, not a student or an individual who may leave).
It must have **Editor** access to the folder (or Content manager on a Shared Drive). If the folder is in someone's My Drive, share it with this
account (Share → add the email → **Editor**).

## 3. Local configuration

```bash
cd worker
npm install
cp .dev.vars.example .dev.vars      # git-ignored; fill in the values
```

Fill `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. (`AUTH_PEPPER` and `SETUP_TOKEN` can wait until step 5.)

## 4. Verify it for real

```bash
npm run drive:authorize
```

The script opens your browser at a short local link (`http://127.0.0.1:8976/start`) that sends you to the right Google page for *this* run. If the browser doesn't open, type that short link in
yourself (add `-- --no-open` to stop the automatic opening). **Choose the account from step 2** and click Allow. It prints the account it authorised and
saves the refresh token straight into `worker/.dev.vars` (replacing only the `GOOGLE_OAUTH_REFRESH_TOKEN` line). **The token is not printed.** Then:

```bash
npm run drive:check              # can the account see the folder and add files to it?
npm run drive:check -- --write   # also uploads a tiny PDF, reads it back, compares bytes, and bins it
npm run drive:sample             # the real test: a sample certificate, left in your folder for you to look at
npm run drive:sample -- --cleanup   # remove the sample when you've seen it
```

`drive:sample` uses the same folder layout, file naming and Drive client as a student's upload. It checks, against real Google Drive, that the account can write to the
folder, that the folder is **not** link-shared, that the file is listed under `_CertiPass sample / CertiPass / <this year> / AIDS / 2023AIDS0417 / Certificates /
2023AIDS0417_Hackathon_Certificate.pdf`, that the bytes read back are identical, and that an **anonymous request cannot read the file**. Then open your folder in Drive and look for it.
It needs only the Google values in `worker/.dev.vars`, not the database or sign-in.

| Result | Meaning / fix |
|---|---|
| `OK  The folder is reachable and the account can add files to it.` | Good. |
| `drive_folder_inaccessible` — "visible but … only view access" | Give the account **Editor** on the folder. |
| `drive_folder_inaccessible` — "not found or not shared" | The folder id is wrong, or it isn't shared with *the authorising account* (the share link alone isn't enough). |
| `drive_auth_failed` | The refresh token was revoked/expired (see the External/Testing note). Run `drive:authorize` again. |
| `drive_quota` | The account's Drive is full, or you used a service account on a My Drive folder. |
| `drive_folder_public` | The folder is shared with "Anyone with the link". Set General access to **Restricted** in Drive. |

**Do not consider Drive integration working until `drive:sample` succeeds against your real folder and you have seen the file in Drive.**

### If `drive:authorize` fails

Each run makes its own one-time link. The callback must come from *that* link, so the usual cause of trouble is a leftover from an earlier run.

| What you see | Why / fix |
|---|---|
| `A callback from a different sign-in attempt was ignored` | You approved a link from an older run (an old browser tab, or an earlier terminal). The run **keeps waiting**: close the old tab and use the link printed by the current run. |
| `Google redirected back without a "state" value ... The sign-in link that was opened was incomplete` | The long Google link was cut off when it was copied (terminals wrap it). Use the short `http://127.0.0.1:8976/start` link instead. The run keeps waiting. |
| `The callback address was opened with no sign-in data attached` | Someone opened `http://127.0.0.1:8976/callback` directly: browser history, a bookmark or address-bar autocomplete. Harmless; the run keeps waiting. Start from the short link. |
| Browser shows `This link has no "state" value ...` / `Google sent you back, but the link you started from was incomplete` | Same two cases as the two rows above, seen from the browser side. Open the short link it names. |
| `Port 8976 is already in use` | An earlier `drive:authorize` is still waiting in another terminal. Close it (Ctrl+C), or run `npm run drive:authorize -- --port 8977`. |
| Browser shows `ERR_CONNECTION_REFUSED` | The run that owned that link is no longer running (finished, failed, timed out after 10 minutes, or cancelled). Start a new run and use its link. |
| `Access was not granted in the browser (access_denied)` | You chose Cancel on Google's consent screen. Run it again and choose **Allow**. |
| Google's own page says `Access blocked` / `Error 403: access_denied` | Google stopped you before redirecting back, so the terminal just keeps waiting. The account isn't allowed on the consent screen: for an *External* app in Testing mode, add it under **OAuth consent screen → Test users**. |
| `invalid_client` | The client id or secret in `.dev.vars` is wrong, or the client isn't type **Desktop app**. |
| `invalid_grant` | The one-time code was already used or expired. Start again. |
| `Google did not return a refresh token` | Google only issues one on first consent. Remove CertiPass at <https://myaccount.google.com/permissions> and run it again. |

### Replacing a refresh token that may have been exposed

A refresh token is a long-lived password for the Drive folder. If one was ever pasted into a chat, a screenshot, a commit or a log, treat it as compromised:

1. Revoke it: open <https://myaccount.google.com/permissions> as the authorising account, choose the CertiPass app → **Delete all connections**. This invalidates every token the app holds, so do it **before** step 2.
2. Run `npm run drive:authorize` again. It writes a new token to `worker/.dev.vars`.
3. If the Worker is deployed, replace its copy too: `npx wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN` (copy the value from `worker/.dev.vars`; the prompt hides it).
4. If the **client secret** was exposed as well, add a new secret under Google Cloud → APIs & Services → Credentials → your OAuth client, put it in `.dev.vars` (and `wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET`), then disable the old one.

## 5. Accounts and the database

Sign-in, accounts and the certificate records live in Cloudflare D1, behind the same Worker. **All of it, step by step, is in [BACKEND_SETUP.md](BACKEND_SETUP.md).**
In short: put `AUTH_PEPPER` and `SETUP_TOKEN` in `worker/.dev.vars`, run `npm run db:migrate:local`, start the Worker with `npm run dev`, and create the first
administrator with `npm run admin:create`. The role of every person comes **only** from the Worker's database, never from anything the browser sends.

> CertiPass signs in with the **college email** (any name/year before the fixed `@rajalakshmi.edu.in`).
> The older plain-username demo accounts (`aarav.demo`, …) exist only in the offline prototype's local sign-in.

## 6. Deploy the Worker

Not done yet, and not to be done without your approval. The full sequence (create the D1 database, run the migrations remotely, set the secrets, deploy,
create the first administrator, remove the setup token) is in [BACKEND_SETUP.md](BACKEND_SETUP.md#deploy-it-not-done-yet-needs-your-go-ahead).
The Google secrets it needs are `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `GOOGLE_OAUTH_REFRESH_TOKEN`
(`npx wrangler secret put <NAME>`). Edit `ALLOWED_ORIGINS` in [`worker/wrangler.toml`](../worker/wrangler.toml) to your real site origin(s) — exact origins, no wildcard.

The `*/15 * * * *` cron trigger finishes or fails interrupted uploads, clears Drive files flagged for clean-up, and forgets expired sessions.
Add a Cloudflare rate-limiting rule on `/api/auth/*` and `/api/certificates` as an extra guard; the Worker's own limits cover sign-in and registration, not uploads.

## 7. Point the app at it

```bash
cp .env.example .env.local     # then set VITE_CERT_API_URL=https://<your-worker>.workers.dev
npm run build
```

With `VITE_CERT_API_URL` empty the app is the offline prototype, exactly as before. With it set, **sign-in goes through the Worker** and submitting a certificate
uploads it to Drive first and saves the achievement only after that succeeds.
## What happens when something fails

| Situation | Result |
|---|---|
| Drive is down / rate-limited | Retried twice automatically. Then: row `failed`, student sees a retryable error, **nothing is saved**. Pressing Submit again reuses the same upload id. |
| Folder not shared / wrong id | Non-retryable `drive_folder_inaccessible` with a plain-language message for the records office. Admins can call `GET /api/storage/status` for a diagnosis. |
| Refresh token revoked | `drive_auth_failed`. Re-run `npm run drive:authorize` and `wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN`. |
| File in Drive, but saving the row failed | The Drive file is **kept**. The row stays `pending`, the student sees "could not be recorded yet — try again". Retrying finds the file by its upload id and completes the row **without uploading again**. If they never retry, the cron job adopts it. |
| Worker dies mid-upload | Same as above; stale `pending` rows are adopted if the file exists, otherwise marked `failed (abandoned)`. |
| Double click / two tabs | One upload id → one file. The second request gets "in progress" or the finished result. |
| Student replaces the certificate | New file is stored; the old row becomes `replaced` **in the same transaction** and its Drive file is binned (flag kept and retried if binning fails). |
| Admin removes a certificate | Row `removed`; Drive file binned (30-day recovery in Drive's bin). |
| Orphaned Drive files (no row) | `POST /api/admin/reconcile?orphans=1` reports them; add `&trash=1` to bin them. Files not created by CertiPass are never touched. |

## Who can see what (enforced in the Worker, from the database, on every request)

| Role | Upload | View / download | Other |
|---|---|---|---|
| Student | own achievements | own certificates only | — |
| Faculty | — | certificates of students **currently** in a department they cover (`review_departments`, else their own) | — |
| Admin | — | all | remove, storage status (incl. the Drive folder link), reconcile |
| Deactivated account | — | — | refused everywhere |
| Anyone the Drive folder is shared with | — | **every** certificate, directly in Google Drive | outside the app's rules — share with admins only |

An unknown id, someone else's certificate and an out-of-scope certificate all return the same `404 certificate_not_available`, so nothing leaks about what exists.

## Testing

```bash
cd worker && npm test           # 375 tests: validation, access policy, upload/failure/recovery, streaming, sign-in, accounts, listing and filters, statistics, the real SQL on SQLite, the OAuth helper
cd .. && npm test               # 149 tests: storage client (including upload progress), the student/faculty/admin certificate pages, View Certificate states, the submission wizard, sign-in/register rules, the Worker sign-in provider, admin account actions
npm run build                   # type-check + production build
```

The Worker suites run the real Worker code against a real SQLite database (built from the real migration files) and an in-memory Google Drive fake; the frontend suites use a fake
Worker. They prove the logic, **not** that Google accepts your configuration — that's what `drive:check`, `drive:sample` and the checklist below are for.

Also run by hand on 2026-10-30 and not part of `npm test`: the real Worker under `wrangler dev` (the Workers runtime) with a local D1 database and the real Drive folder.
53 checks passed: a student uploaded a PDF, a PNG and a JPG (with title, organisation and date); the files appeared in
`_CertiPass sample / CertiPass / 2026 / ZZTEST / 2099ZZTEST0001 / Certificates`; a second certificate in the same category became `_2` and nothing was overwritten;
preview and download returned identical bytes with the right types; the student, same-department faculty, other-department faculty and the administrator each saw exactly what they should
(search by name and ID, filters by department, batch and category, statistics); removing a certificate put its Drive file in the bin; and no-sign-in, wrong-role, forged-header, bad-type,
disguised-file, 11 MB, future-date and deactivated-account requests were all refused without anything reaching Drive. No answer from the Worker contained a Drive id or link, an anonymous
request could not read a stored file, and the folder is not shared with "anyone with the link".

## What still needs doing

1. **Google Drive** — done and verified. The Google refresh token expires after 7 days while the consent screen is External + Testing; re-run `npm run drive:authorize` when `drive:check` starts failing with `drive_auth_failed`.
2. **Create the production D1 database, set the secrets and deploy** ([BACKEND_SETUP.md](BACKEND_SETUP.md)). Not done; needs your approval. The folder id from your link goes in as the `GOOGLE_DRIVE_ROOT_FOLDER_ID` secret.
3. **Achievements in the database.** The long "Add Achievement" form and the rest of the achievement records still live in the browser's local data. The new **My Certificates** pages do not depend on them: accounts and
   certificate records are in the Worker's database, so they work across computers. Certificates are keyed by *(student, achievement id)*, so no student can claim, block or be mistaken for another's achievement.
4. **Cloudflare rate limiting** on uploads, log retention and alerting on `drive_auth_failed` / `metadata_save_failed`.
5. **Students cannot delete their own certificates** (only an administrator can, and a student can replace one through the achievement form). Say so if you want a student-side "remove".
6. **Draft files.** Drafts store only the file's name, type and size, never the file (the wizard says so).