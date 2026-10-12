# CertiPass — frontend prototype (Phases 1–6)

CertiPass is a digital achievement passport for colleges: students submit certificates, faculty verify them, and administrators oversee the records.

- **Phase 1** built the frontend: design system, dashboards and mock services. Its marketing landing page has since been replaced by a sign-in-first entry screen (see "Interface design").
- **Phase 2** adds mock authentication and role management: username sign-in for three roles, student self-registration, a persisted prototype session, role-based route guards and editable profiles.
- **Phase 3** builds the Student Achievement Passport: a journal-style dashboard, a searchable certificate library, achievement detail pages, edit-and-resubmit for records that need attention, a timeline and notifications. All of it is scoped to the signed-in student.
- **Phase 4** adds certificate submission and management: a six-step guided wizard, drafts, real file checks and previews, a review screen, a duplicate warning, a confirmation page, and edit-and-resubmit through the same wizard.
- **Phase 5** adds faculty verification and communication: a scoped review queue, a full review page, enforced status transitions (start review, request correction, verify, reopen), typed comments, a detailed review history, and student notifications for every review action.
- **Phase 6** adds admin management and analytics: an overview dashboard, user and faculty management (including creating faculty accounts), academic configuration, a central achievement register, analytics with stated calculation rules, CSV export and an activity feed.

Everything runs in the browser. There is no backend, Supabase, or email of any kind.

> **Development prototype — not secure.** Sign-in is simulated in the browser. It shows how the flows will work, but it does not protect anything. Don't enter real passwords or personal data.

## Run it

Requires Node 18 or later.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build (http://localhost:4173)
```

Open the app on `localhost` or over HTTPS. Password hashing uses the browser's Web Crypto API, which browsers only enable in a secure context. On a plain-HTTP LAN address (e.g. `http://192.168.x.x:5173`), sign-in shows an explanatory error instead.

## Demo accounts (development only, fictional)

| Role | Sign-in page | Username | Password |
|---|---|---|---|
| Student | `/login` | `aarav.demo` | `Student@123` |
| Faculty | `/faculty/login` | `meera.faculty` | `Faculty@123` |
| Admin | `/admin/login` | `records.admin` | `Admin@123` |

Other seeded accounts:

- Every seeded student (e.g. `diya.r`, `karthik.s`) uses `Student@123`.
- Every seeded faculty member (e.g. `anand.faculty`) uses `Faculty@123`.
- Each reviewer covers certain departments: `meera.faculty` reviews CSE and AIDS, `anand.faculty` reviews ECE and EEE, and `kavitha.faculty` reviews IT and MECH.
- `suresh.faculty` and `tharun.k` are **deactivated**. Use them to see the blocked-account message.

In dev mode, each sign-in page offers **Fill demo credentials**. Production builds don't render it.

Seed passwords live in `src/data/seedCredentials.ts`. They are hashed in memory at runtime and never written to browser storage.

## Routes

| Area | Routes | Guard |
|---|---|---|
| Sign-in | `/` (same screen as `/login`) | none; signed-in users go to their dashboard |
| Guest-only | `/login`, `/register`, `/faculty/login`, `/admin/login` | signed-in users are sent to their own dashboard |
| Student | `/student`, `/student/achievements`, `/student/achievements/new`, `/student/achievements/:id`, `/student/achievements/:id/edit`, `/student/achievements/:id/submitted`, `/student/timeline`, `/student/notifications`, `/student/profile`, `/student/help` | student session |
| Faculty | `/faculty`, `/faculty/queue`, `/faculty/submissions`, `/faculty/review/:id`, `/faculty/students`, `/faculty/profile` | faculty session |
| Admin | `/admin`, `/admin/users`, `/admin/users/:id`, `/admin/faculty`, `/admin/academics`, `/admin/records`, `/admin/records/:id`, `/admin/analytics`, `/admin/activity`, `/admin/settings`, `/admin/profile` | admin session |

How the guards respond:

| Situation | Result |
|---|---|
| No session | Sent to that area's sign-in page. After signing in, the user returns to the page they asked for. |
| Wrong role | Sent to their own dashboard, with an "access denied" notice. |
| Just logged out | Sent to the sign-in screen at `/`. |
| Unknown path inside a workspace | A not-found page that keeps the sidebar. |
| Unknown path anywhere else | The standalone not-found page. |

Admins reach their profile from the name card at the bottom of the sidebar. The card works the same way for every role. The earlier paths `/admin/departments` and `/admin/achievements` redirect to `/admin/academics` and `/admin/records`.

## Student Achievement Passport (Phase 3)

### Status model

Statuses are defined once, in `src/domain/status.ts`. Labels, meanings and grouping rules are shared by the student, faculty and admin views.

| Status | Meaning | Waiting on |
|---|---|---|
| Submitted | Submitted and waiting for a reviewer to pick it up | Faculty |
| Under review | A reviewer is checking it | Faculty |
| Needs attention | The reviewer asked for a clarification or correction | Student |
| Verified | Faculty completed verification | — |

The lifecycle runs: submitted → under review → verified. From under review, a reviewer can instead send a record to needs attention. The student then edits and resubmits it, which returns it to submitted. A verified record can be reopened to under review, by a reviewer, with a stated reason. These are the only moves; the full list is `REVIEW_ACTIONS` in the same file.

- Students can never set a reviewer status. They can only resubmit a record that needs attention.
- A submitted certificate is never treated as a verified achievement.
- Drafts are deliberately not a status. An unfinished submission is a separate draft record that only its student can see (see Phase 4 below).
- Phases 1–2 called the first status `pending`. Stored data is migrated to `submitted` automatically.

### What the student can do

- **Dashboard (`/student`)**
  - Passport-holder header: initials, name, register number, department, year and section, search, and Add Achievement.
  - A "needs attention" callout.
  - Summary counts. Each record is counted once, in exactly one of: verified, in review (submitted or under review), or needs attention, so the three always add up to the total.
  - Recent activity, built from each record's own status history and reviewer comments.
  - A featured achievement: the highest-result verified record, then the most recent. If nothing is verified, an empty state is shown instead.
  - A passport-holder panel linking to the existing profile page.
  - Recently submitted records, with links to the timeline and the full library.
- **Timeline (`/student/timeline`)**
  - Its own page, opened from the Timeline item in the student sidebar. It is no longer part of the dashboard.
  - The signed-in student's records grouped by event year, newest first, each with its category, result and current status, linking to the detail page.
  - Filters for category, status and event year.
  - An empty state with an Add Achievement action when the student has no records.
- **My Achievements (`/student/achievements`)**
  - Searches event name, organiser, category, result or position, certificate file name and reference.
  - Filters by category, status, event year and date range. Filters combine.
  - Shows active-filter chips, a Clear filters action and an accurate "Showing X of Y" count.
  - Sorts by event date (newest or oldest) or by most recently updated. Ties are broken by reference so the order is stable.
  - Offers list and card views. The chosen view is remembered for the browser session.
  - Search, filters and sort are kept in the URL, so a filtered view can be linked and survives a refresh.
- **Achievement detail (`/student/achievements/:id`)**
  - Full record information and the certificate, with its file name, type and size.
  - Verification status, the complete status history and comments; students can reply.
  - Context-sensitive actions: Edit and Resubmit (only when the record needs attention), View Certificate, Add Achievement, and Back to Achievements.
- **Edit and resubmit (`/student/achievements/:id/edit`)**
  - Available only while a record needs attention. It opens the submission wizard prefilled with the record (see Phase 4 below).
- **Notifications (`/student/notifications`)**
  - Covers submissions, review started, correction requests, verifications and updates.
  - Supports per-item Mark as read, Mark all as read, an unread count (also in the sidebar) and links to each achievement.
  - Notifications are in-app only; nothing is emailed or pushed.

### Scoping

Every student-facing query goes through `src/services/passportService.ts`. Its main functions are:

- `getMyAchievements`
- `getAchievementById(studentId, id)`
- `searchAchievements`
- `getAchievementSummary`
- `getAchievementTimeline`
- `getRecentActivity`
- `getFeaturedAchievement`
- `getMyNotifications`
- `markNotificationAsRead`

Submission, drafts and resubmission live in `src/services/submissionService.ts` (Phase 4) and follow the same rule.

Each takes the signed-in student's id. Opening another student's record by URL shows "Achievement not found", so the page doesn't reveal whether the record exists. This scoping is enforced in the browser only; a backend must enforce the same rule server-side.

### Certificates and previews

- **Demo certificate files:** eight seeded records have generated sample certificates in `public/demo-certificates` (PNG, JPG and PDF). Each is watermarked "DEMONSTRATION" and names fictional people and organisations. They render inline and can be opened in a new tab.
- **Uploaded files:** images up to about 900 KB uploaded in this browser are previewed too.
- **Everything else:** a clear "Preview unavailable" state, because the original file isn't stored. No download is offered for a file that doesn't exist.

### Loading and error states

- Passport pages show a loading state while a simulated fetch runs.
- In dev mode, add `?mockFail=1` to any student page URL to see the error state, with a Try again button.

## Certificate Submission & Management (Phase 4)

### The wizard

`/student/achievements/new` is a six-step wizard. Answers are kept as the student moves backward and forward.

| Step | What it asks | Required |
|---|---|---|
| 1. Category | One of nine categories; "Other" allows a custom label | Category |
| 2. Event details | Event name, organiser, event date, location, event mode (Offline / Online / Hybrid) | Name, organiser, date |
| 3. Achievement | Achievement type, prize or position, description | Type; a result description if the type is "Other" |
| 4. Additional info | Additional notes, prize details, a note about the certificate | Nothing — the step can be skipped |
| 5. Certificate | One PDF, JPG or PNG file | A file |
| 6. Review | Everything entered, plus student details from the profile | — |

- **Student details are never asked for.** Name, register number, department, year and section come from the signed-in profile.
- **Dates:** the event date must be a real calendar date and can't be in the future.
- **Description:** it is generated only from values the student entered. Nothing is invented. The student can edit it, and Regenerate restores the generated text.
- **Skipping:** step 3 has "Skip optional details" and step 4 has "Skip This Step".
- **Review:** each section has its own action (Edit Category, Edit Event Details, Edit Achievement Details, Edit Additional Information, Replace Certificate). Each returns to that step and then straight back to the review, with nothing lost.
- **Progress:** a step indicator, plus a summary of which sections are done and how many remain.
- **Leaving:** Exit asks before discarding unsaved work, and the browser warns before a refresh or tab close.

### Files

All upload rules are in one place: `FILE_RULES` in `src/services/fileService.ts`. The size limit is 10 MB.

A file is accepted only if all of these agree:

- its extension is `.pdf`, `.jpg`, `.jpeg` or `.png`,
- its reported MIME type (when the browser provides one) matches the extension,
- its first bytes are a real PDF, JPEG or PNG signature,
- it is not empty and not over the limit.

So a text file renamed to `.pdf` is rejected. These checks catch honest mistakes; they are not a security control, and a server must re-validate and scan every upload.

- **Previews:** images render inline, PDFs are embedded where the browser supports it, and a file that can't be rendered shows a plain fallback instead of breaking the page.
- **Checking state:** the brief "Checking the file on this device…" state is a local read. Nothing is uploaded, and it isn't presented as an upload.
- **Memory:** the file is held in browser memory for the visit. Its temporary preview URL is revoked when the file is replaced or the wizard closes.
- **No fake links:** in-memory files never get a download or "open" link.

### Drafts

- **Save Draft** is available on every step. Once saved, the draft id is in the URL (`?draft=<id>`), and later step changes update the draft automatically.
- A draft stores the form values, the step, and the selected file's name, type and size.
- **Files are not stored in drafts.** When a draft is reopened, the wizard says which file was selected and asks for it again.
- Drafts appear in My Achievements and on the dashboard, with dashed borders and a "Draft" tag.
- Drafts are separate records, not achievements. They are never counted in the totals, never shown as submitted or verified, and never reach faculty.
- A draft can be continued or deleted. Deleting asks for confirmation.
- Submitting from a draft removes the draft.
- Only the owner can open or delete a draft. Another student's draft id shows "Draft not found".

### Duplicate warning

Before submitting, the student's own records are checked for the same event name (ignoring case and punctuation), event date and category. A match shows a warning with links to the existing records. It is a warning, not a block: the student can submit anyway, because one event can produce several genuine achievements.

### Confirmation

After submitting, the student lands on `/student/achievements/:id/submitted`. It shows the event, category, submission date, reference ID and status, with View Achievement and Return to Dashboard.

- The reference ID is unique: `CP-<event year>-<next number>`.
- A new submission always starts as **Submitted**. It is never shown as Verified.
- The page reads the saved record, so it still works after a refresh.
- The new record appears straight away in the dashboard counts, recent activity, timeline, library, search and notifications.
- Repeat clicks on Submit are ignored while a submission is in progress.

### Edit and resubmit

When faculty asks for a correction, Edit and Resubmit opens the same wizard, prefilled.

- The reviewer's request is shown at the top.
- The current certificate is kept unless the student replaces it.
- The review step adds an optional note to the reviewer, which is posted as a comment.
- On resubmission the achievement keeps its id, reference ID and original submission date. A new history entry is added, the modified date is updated, earlier comments stay, and the status returns to Submitted.
- Records that are submitted, under review or verified can't be edited. The service refuses such edits as well as the page.

### Service functions

`src/services/submissionService.ts`:

- `createDraft`, `updateDraft`, `getDrafts`, `getDraftById`, `deleteDraft`
- `submitAchievement`
- `getPossibleDuplicates`
- `updateAchievement`, `resubmitAchievement`

Each takes the student's id, re-validates the form with the same rules as the wizard (`src/services/achievementValidation.ts`), and sets the status itself. A form can't carry in a status, an owner or a reviewer.

Types are in `src/types/index.ts`: `AchievementFormData`, `AchievementDraft`, `CertificateFileMetadata`, `AchievementSubmission`, `ValidationError` and `SubmissionResult`.

## Faculty Verification & Communication (Phase 5)

### Review scope

Each reviewer handles students from certain departments (`reviewDepartments` on the faculty record; their own department if none is listed).

- The dashboard counts, the queue, All Submissions, the Students page and the sidebar badge all show only records in that scope.
- Opening a record outside the scope, or one that doesn't exist, shows the same "Submission not available" page.
- Students' drafts are a separate record type and never appear in any faculty view.
- Administrators keep their existing view of every record.

### Dashboard and queue

- **Summary:** Awaiting Review (submitted), Under Review, Needs Attention and Verified. Each record is counted once, and the four always add up to the reviewer's total. The counts and the queue are built from the same records.
- **Queue rows** show the student's name, register number, department, year and section, plus the event, category, result, submission date, status and reference ID, with an action to open the record.
- **Search** covers student name, register number, event name and reference ID.
- **Filters:** status, department, year and category. Search and filters combine.
- **Sort:** newest submission, or oldest pending first.
- Clear filters resets everything, and there are empty states for "nothing waiting" and "no matches".

### Review page (`/faculty/review/:id`)

- **Student information:** name, register number, department, year and section. These are read-only.
- **Achievement information:** every field the student entered, plus submitted and last-updated times and the current status.
- **Certificate**, in one of three honest states:
  - a preview, when a file is actually available;
  - "Preview unavailable", with the recorded file name, type and size, when the prototype didn't keep the file;
  - "No certificate attached", when the record has no file details at all.

  No preview is ever fabricated.
- **Review history:** oldest first. Each entry shows the action, the previous and new status, who acted and in which role, the date and time, and any reason given.
- **Comments:** the full conversation, with each author's name, role and time. Correction requests and review updates are labelled.
- A note under the header always says what can happen next, so a missing button is explained.

### Review actions

| Action | From → to | Requires |
|---|---|---|
| Start Review | Submitted → Under review | — |
| Request Correction | Under review → Needs attention | A specific request (at least 10 characters). Optional reviewer notes. |
| Verify Achievement | Under review → Verified | A confirmation dialog summarising the record. Optional remark. |
| Reopen Review | Verified → Under review | A reason (at least 10 characters) and confirmation. |

- No other transitions exist. While a record needs attention it waits on the student, and faculty can only comment.
- Each action saves the status, the history entry, the comment (if any) and the student's notification in one step.
- Each action records the acting reviewer.
- Review actions never change the student's event details, description or certificate details.
- Repeat clicks are ignored, and the service refuses a second identical action.

### Comments

- Faculty can comment on records in their scope. Students can comment on their own records.
- Empty comments are rejected. An identical comment from the same author within a few seconds is treated as an accidental repeat.
- The author's name and role come from the signed-in session, not from the page, so a student can't post as faculty.
- Comments can't be edited or deleted, and they are kept when a student resubmits.

### Notifications

The student, and only the student, is notified when a reviewer starts a review, requests a correction, verifies, reopens, or comments, and when they submit or resubmit. Each notification has a type, title, message, time, read state and a link to the achievement. The unread count, Mark as read and Mark all as read are unchanged from Phase 3 and persist across refreshes.

### Resubmission

A correction request appears on the student's dashboard, on the achievement page, in the notifications and at the top of the Edit and Resubmit wizard. Resubmitting keeps the achievement's id, reference ID, comments and history, returns it to Submitted, and puts it back in the reviewer's queue (marked "resubmitted").

### Service functions

`src/services/reviewService.ts`:

- `getFacultyReviewQueue`, `getFacultyReviewSummary`, `getFacultyAccessibleAchievement`, `getFacultyAchievements`, `getFacultyStudents`
- `startReview`, `requestAchievementCorrection`, `verifyAchievement`, `reopenReview`
- `addComment`, `addFacultyComment`, `getAchievementComments`

Each review action checks three things before writing: the signed-in user is the reviewer named in the call, the record is in their scope, and the transition is allowed for the record's current status. `src/services/auth/actor.ts` supplies the signed-in user.

These checks run in the browser. They keep the prototype consistent, but they are not security: anyone who can edit browser storage can bypass them. Real authorisation belongs to the backend and database (Phase 7).

### Data changes

Small, backward-compatible additions; older stored records still load:

- History entries can carry `fromStatus`, `actorId`, `actorRole` and `note`.
- Comments can carry a `type` (general, correction request, review update).
- Notifications can carry a `type`.
- Faculty records can carry `reviewDepartments`.
- Seeded records now follow the real lifecycle (submitted → under review → decision).

## Admin Management & Analytics (Phase 6)

### Admin workspace

The admin sidebar has eight entries: Overview, User Management, Faculty Management, Academic Configuration, Achievement Records, Analytics & Reports, Activity and Settings. Every admin route sits behind the admin route guard. Students and faculty who open one are returned to their own dashboard, and signed-out visitors go to the admin sign-in page.

Every admin change (account status, profile edits, faculty creation, configuration changes, data reset) requires a signed-in administrator and is written to an audit trail. As everywhere in the prototype, these checks run in the browser and are not real security.

### Overview

- **Six headline figures:** Total Students, Total Faculty, Achievement Records, Pending Verification, Verified and Needs Attention. "How these figures are counted" on the page gives each definition.
- **Four charts:** status distribution, submissions this academic year, categories and departments. They use the same service as the figures.
- **Recent activity:** the eight most recent real events.

### User Management

- **List:** name, username, role, register number, department, year and section, created date and account status.
- **Search** by name, username or register number. **Filter** by role, department and account status. **Sort** by name or recently created. Ten per page.
- **Detail page** (`/admin/users/:id`):
  - Students: academic profile, counts of submitted, verified, pending and needs-attention records, and recent records.
  - Faculty: profile, review departments and review activity taken from the records' status history.
  - All roles: any admin actions taken on the account.
- **Editing:** an administrator can correct these fields only.

  | Account | Editable | Never editable here |
  |---|---|---|
  | Student | full name, department, year, section | username, role, register number, password |
  | Faculty | full name, department, designation, review departments | username, role, password |
  | Admin | full name, designation | username, role, password |

- **Activate / deactivate:** always behind a confirmation. Deactivating blocks sign-in and ends any open session. The account and all its records are kept. An administrator can't deactivate the account they are signed in with.
- **Credentials are never shown.** No page displays passwords or password hashes, and there is no password inspection or reset.

### Faculty Management

- **List:** department, designation, review departments, number of recorded review actions and status. Search by name or username; filter by department and status.
- **Add Faculty:** a validated form with full name, username, department, designation, optional review departments, and an initial password with confirmation. There is no email field and no public faculty registration.
  - The username must be unique across every account.
  - The password must have at least 8 characters, with upper and lower case letters and a number.
  - The password is stored only as a salted hash, through the same credential store student registration uses. It is never written in plain text, to the account record or to the audit trail.
  - The new account is always a faculty account. It can sign in to the faculty workspace only.
- Faculty profiles are edited from the account's detail page.

### Academic Configuration

One shared model (`src/services/academicService.ts`) that registration, profiles, the submission wizard and the admin forms all read.

| Item | What an administrator can do |
|---|---|
| Departments | Add (unique code and name), rename, deactivate or reactivate, and remove only if unused |
| Sections | Add (unique), deactivate or reactivate, and remove only if unused |
| Achievement categories | Offer or withhold each of the nine fixed categories for new submissions. "Other" always stays on. |
| Study years | Fixed at four years; shown with student counts but not configurable |

- A department or section that students or faculty still belong to **cannot be removed**; it can only be deactivated.
- A deactivated item stays on existing accounts and records, but isn't offered for new registrations, accounts or submissions.
- Deactivating and removing always ask for confirmation.
- Changes never rewrite existing students or achievements.

### Achievement Records

- **The register** of every submitted achievement: reference ID, student and register number, department, event, category, result, submission date, status and reviewer. Drafts are never listed.
- **Search** by student, register number, event name or reference ID. **Filter** by status, department, year and category. **Sort** by newest, oldest or status. Twelve per page.
- **Record page** (`/admin/records/:id`): full details, certificate (preview or honest fallback), comments and status history.
- **Read-only.** Administrators cannot change a status, edit a student's details or post in the conversation. Verification stays with faculty, and the service refuses these actions as well as the page.

### Analytics & Reports

All figures come from one service, `src/services/analyticsService.ts`, so the overview, the analytics page and the exports can't disagree. They update as soon as a record changes.

**Calculation rules**

| Figure | Rule |
|---|---|
| Total submitted | Every submitted achievement record. Drafts are a separate collection and are never counted. |
| Verified | Records with status Verified |
| Pending review | Records with status Submitted or Under review |
| Needs Attention | Records with status Needs attention |
| Verification rate | Verified ÷ total submitted × 100, to one decimal place. Shown as "—" when there are no records. |
| Department figures | A record counts toward the department of the student who submitted it. |
| Students with achievements | Distinct students in the department with at least one record |
| Category figures | Records per category across the nine fixed categories. Custom labels under "Other" are listed. |
| Submissions over time | Records grouped by their first submission date (`submittedAt`) |

- Each record has exactly one status, so Verified + Pending + Needs Attention = Total.
- Records whose student or department can't be resolved are grouped under "Unassigned" rather than dropped, so totals still add up.

**Time range**

| Range | Covers | Chart columns |
|---|---|---|
| Last 30 days | The last 30 calendar days, including today | One per day |
| Last 90 days | The last 90 calendar days, including today | One per week |
| This academic year | From 1 June to today | One per month |
| All records | Everything on file | One per month |

The range applies to every figure on the page. Periods with no submissions are shown as zero; nothing is filled in.

### CSV export

- **Achievement Records → Export CSV** exports every record matching the current search and filters, not just the page on screen.
- **Analytics → Export records (CSV)** exports the records in the selected time range.
- **Analytics → Export summary (CSV)** exports the figures on the page for the selected range.
- Fields containing commas, quotation marks or line breaks are quoted correctly. Text that a spreadsheet would treat as a formula is prefixed so it is read as text.
- Exports contain record and profile fields only. They never include usernames, passwords, hashes or session data.
- Filenames are descriptive, e.g. `certipass-achievement-records-2026-10-11.csv`.
- If nothing matches, a message is shown and no file is created.
- These are CSV files made in the browser. There is no PDF export.

### Activity

`/admin/activity` lists what has happened, newest first, with a type filter: submissions, reviews started, correction requests, resubmissions, verifications, reopened reviews, accounts created and admin actions. It is built only from what is recorded: each record's status history, account creation dates and the audit trail.

### Data changes

Small, backward-compatible additions to the existing store:

- `config`: one academic configuration record.
- `audit`: admin actions, newest first.
- Departments can carry an `active` flag.

Resetting demo data restores the configuration and clears the audit trail.

## Interface design

The app opens on the sign-in screen; there is no public landing page.

- **Sign-in (`/`, also `/login`):** a centred white panel on a powder-blue background, with compact branding, "Welcome to CertiPass", username and password fields, a show/hide password control and a Student / Faculty / Administrator switch. Students can follow the link to register. Sign-in is by username only.
- **Workspace (all three roles):** one shared shell, `src/layouts/AppShell.tsx`. A white sidebar with icon-and-label navigation and a pastel lavender active item, a white top bar with the institution, date and profile chip, and a light grey content area holding white rounded panels with thin borders. On large screens the frame fills the window and the content area scrolls; on small screens the sidebar becomes a drawer.
- **Tokens** are defined once in `src/index.css`:

  | Use | Colour |
  |---|---|
  | Outer background | `#DCEFF7` |
  | Main content | `#F7F8FA` |
  | Panels | `#FFFFFF` |
  | Text / secondary text | `#20242B` / `#707782` |
  | Border | `#E6E9ED` |
  | Primary button | `#34445C` |
  | Lavender, pale blue, pale yellow, blush | `#CBB8F2`, `#C8E5F2`, `#FFE2AD`, `#F5D7E7` |

- **Status colours:** Submitted is pale yellow, Under review lavender, Needs attention blush and Verified pale blue. Every status also has an icon and a text label. No green is used.
- **Type:** Inter throughout, with IBM Plex Mono for reference IDs and register numbers.
- `src/pages/LandingPage.tsx` from Phase 1 is no longer routed or imported. It is left in the source tree and can be deleted.

## Authentication architecture

```
src/services/auth/
  types.ts             AuthProvider interface + AuthError (codes, field, portal)
  mockAuthProvider.ts  Mock implementation of AuthProvider
  credentials.ts       Password hashing / verification (PBKDF2-SHA-256 via Web Crypto)
  session.ts           Minimal persisted session: read / validate / start / end / expire
  validation.ts        Registration rules shared by the form and the provider
  recovery.ts          Account-recovery seam (no mechanism yet)
  index.ts             Public entry point; `authProvider` = mockAuthProvider
src/context/AuthContext.tsx   useAuth(): currentUser, currentRole, isAuthenticated,
                              login(username, password, expectedRole), registerStudent(data),
                              logout(), getCurrentUser()
src/layouts/RequireRole.tsx   RequireRole (role guard) and GuestOnly (sign-in pages)
src/services/profileService.ts  Self-service profile edits with per-role field whitelists
```

Pages never call the provider directly. They use `useAuth()`. A real provider (e.g. Supabase Auth) implements the same `AuthProvider` interface and replaces the single assignment in `services/auth/index.ts`.

### Behaviour

- **Login** looks the username up across all accounts and checks the password against its hash.
  - It succeeds only if the account's role matches the page in use. A student signing in on the faculty page is refused, gets no session, and sees a link to the correct sign-in page.
  - That role hint appears only after the correct password. Wrong passwords and unknown usernames get the same generic message, and take similar time.
  - The submit button is disabled while a sign-in is in progress, and repeat submits are ignored.
- **Registration** validates every field, rejects duplicate usernames and register numbers, and always creates a `student`. The payload is built from a fixed field list, so a role can't be injected. It then signs the student in and opens their passport.
- **Logout** ends the session, updates the auth state and returns to the sign-in screen. Accounts and records are kept.
- **Sessions** last 8 hours. Expiry is checked every 30 seconds and whenever the tab regains focus. A session is discarded, and the user treated as signed out, if it:
  - is malformed,
  - has expired,
  - points to a missing or deactivated account, or
  - claims a role the account doesn't have.

  Signing out in one tab signs out other open tabs.
- **Profiles** show role-appropriate details. Lock icons mark fields only the records office can change.

  | Role | Can edit | Locked |
  |---|---|---|
  | Student | full name, year, section | username, register number, department, role |
  | Faculty | full name, designation | username, department, role |
  | Admin | full name | username, role |

- **Forgot Password?** explains that recovery will be provided through an approved institutional process. It never claims a password was reset, and there is no email step.
- **Faculty and admin accounts** come only from seed data. There is no public or in-app way to create them. Admins can activate or deactivate existing accounts.

### What is stored in the browser

| Key | Contents |
|---|---|
| `certipass.data.v3` | **Only your changes** to the demo data: records created in this browser (`added`, including drafts) and seed records changed here (`changed`). The seed data itself stays in code. |
| `certipass.session.v1` | `{ userId, role, issuedAt, expiresAt }`, nothing else |
| `certipass.credentials.v1` | Salted PBKDF2 hashes for **self-registered** students only |
| `certipass.ui.libraryView` (sessionStorage) | Library list/card view preference |

No password, raw credential or token is ever written to localStorage or sessionStorage.

Older formats are migrated on first load, and then their keys are deleted:

- `certipass.prototype.v1` (Phase 1) contained plain-text passwords. These are hashed during migration.
- `certipass.prototype.v2` (Phase 2) is converted to the new changes-only format.

Malformed records are dropped individually, so a corrupt record doesn't discard the rest. Unreadable storage falls back to the seed data.

**Admin → Settings → Reset demo data** restores the sample dataset and academic configuration, and removes self-registered students, admin-created faculty accounts and their password hashes.

## Testing

### Automated checks

Six browser test scripts were run against the dev server; they are not yet included in the repository. There is no `npm test` script: `package.json` has only `dev`, `build`, `preview` and `typecheck`.

- **Phase 6 suite (178 checks):** the 20 required scenarios plus:
  - every admin route for signed-out visitors, students and faculty,
  - the service refusing admin actions from other roles,
  - faculty creation end to end, including signing in as the new account,
  - real CSV downloads parsed back and compared with the table,
  - analytics checked against figures computed independently from the store,
  - configuration changes reaching the registration form and the wizard,
  - mobile layouts.
- **Phase 5 suite (129 checks):** the 20 required scenarios plus:
  - reviewer scope (a second reviewer, out-of-scope and unknown records),
  - transition rules checked at the service level,
  - the reopen flow,
  - the three certificate states,
  - students refused every faculty action,
  - notification recipients,
  - mobile layouts.

- **Phase 4 suite (147 checks):** the 20 required scenarios plus:
  - file signature and MIME checks,
  - drag and drop,
  - preview URL clean-up,
  - exit protection,
  - double-click protection,
  - keyboard category selection,
  - service-level ownership and status checks,
  - drafts being invisible to faculty.

- **Phase 3 suite (103 checks):** the 16 required scenarios plus:
  - v2 → v3 migration,
  - malformed storage,
  - the changes-only storage format,
  - edit-and-resubmit validation,
  - file replacement,
  - simulated service failure,
  - the empty passport for a new student,
  - notification scoping,
  - faculty seeing resubmitted records.

- **Phase 2 suite (99 checks):** the 16 required scenarios plus:
  - storage inspection,
  - Phase 1 data migration,
  - malformed, tampered and expired sessions,
  - profile edits,
  - Back button after logout,
  - mobile drawer focus handling.
- **Phase 1 regression suite (61 checks):** confirms the earlier features still work.

All six pass. The production build (`npm run build`) completes without TypeScript errors.

### Manual test script

1. **Register:** go to `/register`.
   - Submit the empty form: 8 fields are flagged and focus moves to the first.
   - Try mismatched passwords, username `aarav.demo` (taken) and register number `2023CSE0417` (taken).
   - Then register with new values. You land on your passport, already signed in.
2. **Refresh:** reload the page. You stay signed in.
3. **Wrong area:** visit `/admin`. You're returned to `/student` with an access-denied notice.
4. **Profile:** open Profile → Edit profile. Change your name or section. The register number and department can't be edited.
5. **Logout:** you land on `/`. Visiting `/student` or pressing Back now goes to `/login`.
6. **Sign-in errors:**
   - Sign in at `/login` with a wrong password: you get a generic error and the password field clears.
   - Sign in at `/faculty/login` with `aarav.demo` / `Student@123`: you're refused, with a link to the student sign-in.
7. **Return to requested page:** while signed out, visit `/faculty/queue`. You're sent to faculty sign-in. Sign in as `meera.faculty`, and you return to the queue.
8. **Admin:** sign in as `records.admin` and visit every admin route. In Users, deactivate an account, sign out, and confirm that account can no longer sign in.
9. **Mobile:** at a narrow width, open the menu.
   - Tab cycles inside the drawer.
   - Escape closes it and returns focus to the menu button.
   - The current page is highlighted.

**Phase 3, signed in as `aarav.demo`:**

10. **Dashboard:** counts read 8 total, 5 verified, 2 in review and 1 needs attention. The featured achievement is the verified Annual Cultural Fest Quiz win.
11. **Library search:** in My Achievements, search `rust-for-systems` (a file name) or `Algorithm Society` (an organiser).
12. **Combined filters:** combine Status = Verified with Year = 2025 (3 results), then add Category = Sports (1 result). Remove a chip, then Clear filters.
13. **Sorting and views:** switch the sort order and the list/card view, then refresh. Both persist.
14. **Detail with history:** open *National Symposium on Applied Computing*. You'll see its demo certificate and a full correction-and-resubmission history.
15. **Edit and resubmit:** open *Summer Research Internship*. The preview is unavailable, and Edit and Resubmit is offered. Edit it, optionally replace the file, add a note, and resubmit. The status becomes Submitted, the dashboard counts update, and a notification appears.
16. **Another student's record:** visit `/student/achievements/ach-009`, which belongs to another student. It shows "Achievement not found".
17. **Notifications:** mark one as read, then mark all as read.
18. **Error state:** visit `/student/achievements?mockFail=1` to see the error state.
19. **Empty states:** register a new student to see the empty passport, library and featured-achievement states.

**Phase 4, signed in as `aarav.demo`:**

20. **Validation:** open Add Achievement and press Continue with nothing chosen. Then try a future event date on step 2.
21. **Wizard and draft:** fill steps 1–4, then press Save Draft. Refresh the page. You return to the same step with your answers, and the draft is listed in My Achievements and on the dashboard.
22. **Files:** on the certificate step, try a `.txt` file, a file over 10 MB, and a text file renamed to `.pdf`. Each is rejected with a reason. Then attach a real PNG or PDF and check the preview.
23. **Review:** on the review step, use Edit Event Details. Change something, then press "Back to review". Nothing else is lost.
24. **Submit:** press Submit Certificate. You land on the confirmation page with a reference ID and the status Submitted. The dashboard total goes from 8 to 9.
25. **Duplicate warning:** add another achievement with the same event name, date and category. A warning appears; choose to submit anyway.
26. **Delete a draft:** start an achievement, choose Exit → Save draft and exit, then delete the draft from My Achievements.
27. **Correction and resubmit:** sign in as `meera.faculty`, open your new submission and choose Request correction. Sign back in as the student, open it and choose Edit and Resubmit. Replace the certificate, add a note and resubmit. The history and the reviewer's comment are still there.
28. **Locked records:** visit `/student/achievements/ach-004/edit` (a verified record). It can't be edited.

**Phase 5 — faculty review, signed in as `meera.faculty` / `Faculty@123`:**

29. **Dashboard:** the counts read 3 awaiting review, 3 under review, 1 needs attention and 14 verified (CSE and AIDS students only).
30. **Queue:** open Review Queue. Search `Diya`, `2025CSE0011` or `CP-2026-0140`. In All Submissions, combine Status = Verified, Department = AIDS and Year IV (3 results). Try both sort orders, then Clear filters.
31. **Start a review:** open *CodeHarbour 36-Hour Hackathon* (Aarav Menon). The certificate shows "Preview unavailable" with its file details. Press Start Review; the status becomes Under review.
32. **Request a correction:** press Request Correction. Try sending it empty, then with `fix it`; both are refused. Enter a real request and send it. The status becomes Needs attention and the review buttons disappear.
33. **Comment:** post a comment on the same record.
34. **Out of scope:** visit `/faculty/review/ach-012` (an IT student). It shows "Submission not available".

**Phase 5 — correction and resubmission, signed in as `aarav.demo`:**

35. **See the request:** the dashboard banner, the Notifications page and the achievement page all show the reviewer's request.
36. **Resubmit:** choose Edit and Resubmit, change something, add a note on the review step and resubmit. The status returns to Submitted.

**Phase 5 — verification, signed in as `meera.faculty` again:**

37. **Back in the queue:** the record is in the Review Queue again, marked "resubmitted". Open it; the review history lists every step in order.
38. **Verify:** press Start Review, then Verify Achievement. Cancel once to see that nothing changes, then confirm. The status becomes Verified.
39. **Reopen:** press Reopen Review. It needs a reason. Verify it again afterwards.
40. **Student's view:** sign in as `aarav.demo`. Notifications show the verification, and the achievement shows Verified with the full history and all comments.
41. **Another reviewer:** sign in as `anand.faculty`. The dashboard covers ECE and EEE only.

**Phase 6 — admin, signed in as `records.admin` / `Admin@123`:**

42. **Overview:** the figures read 12 students, 4 faculty, 41 records, 10 pending, 27 verified and 4 needing attention. Open "How these figures are counted".
43. **User Management:** search `aarav`, then combine Role = Students with Department = CSE (3 results). Sort by recently created and page through the list.
44. **User detail:** open a student. Choose Edit details, change the section and save. Then Deactivate the account, confirm, and check that the student can no longer sign in. Reactivate it.
45. **Add faculty:** in Faculty Management choose Add Faculty. Submit the form empty, then try the username `meera.faculty` (taken). Create the account, sign out, and sign in as the new faculty member at `/faculty/login`.
46. **Academic Configuration:** try adding a department with the code `CSE` (refused). Add a new department, then remove it. Note that Remove is disabled for departments in use. Deactivate a department and check that `/register` no longer offers it.
47. **Achievement Records:** combine Status = Verified with Department = AIDS (5 results), then press Export CSV and open the file. Open a record; it is read-only.
48. **Analytics & Reports:** switch the time range and watch every figure change together. Export the summary.
49. **Activity:** your account changes and configuration changes are listed. Filter by type.
50. **Other roles:** sign in as a student or faculty member and visit `/admin`. You are returned to your own dashboard.

## Folder structure

```
src/
  components/        Shared UI (ui/ primitives, charts/, timeline, certificate preview,
                     comment thread, submissions table, LoginForm, AccountRecoveryDialog, Logo)
  context/           AuthContext, ToastContext
  components/passport/  Achievement card & table, activity feed, featured achievement, draft list, loader
  components/wizard/    SubmissionWizard, the four data steps, UploadStep, ReviewStep
  data/              mockData.ts (seed dataset), seedCredentials.ts (dev-only passwords),
                     demoAssets.ts (generated manifest of public/demo-certificates)
  domain/status.ts   Central status definitions and counting rules
  components/admin/     Account status control, activity list
  hooks/             Store selectors (useData), passport hooks (usePassport), faculty hooks (useReview),
                     academic configuration (useAcademics),
                     URL-synced filters
  layouts/           AppShell, AuthLayout, RequireRole/GuestOnly, navigation config
  lib/               Formatting and className helpers
  pages/             One file per screen
  services/          Mock backend boundary: store, auth/, passportService, submissionService,
                     profileService, achievementService, achievementValidation, reviewService,
                     adminService, analyticsService, academicService, auditService, fileService
  types/index.ts     Domain types (User, Role, AuthSession, LoginCredentials, …)
```

## Known prototype limitations

- **Authorisation is not production-secure.** Role checks, review scope, transition rules and student data scoping all run in the browser. They can be bypassed by editing browser storage. The backend and database must enforce them (Phase 7).
- **Client-side guards are not authorisation.** They only control navigation. Anyone with browser access can edit the session record or read the bundled demo passwords. Real access control must be enforced by the backend.
- **Credentials are checked in the browser.** Hashes are stored in localStorage, readable by anyone using that browser profile. Hashing removes the plaintext; it is not production security.
- **Everything is per-browser.** Data and sessions don't sync between browsers or devices, and clearing site data removes them.
- **Not available yet:**
  - password change and password recovery,
  - creating administrator accounts, and changing or resetting any password (including a new faculty member's initial one),
  - editing identity fields (username, register number, department),
  - deleting or withdrawing a submitted achievement (drafts can be deleted).
- **Files aren't uploaded.** Certificates (including replacements when resubmitting) are checked in the browser.
  - Only metadata is kept, plus a small inline preview for images up to about 900 KB.
  - Submitted PDFs and larger images can't be viewed again after the wizard closes, by the student or by faculty.
  - Seeded records without a bundled demo file have no viewable certificate.
  - Real storage (Supabase Storage) is planned for Phase 7; `storeCertificate` is the one function to replace.
- **Drafts don't keep the file.** A browser can't restore a selected file after a refresh, so the wizard asks for it again.
- **File checks aren't security.** Extension, MIME type and signature checks run in the browser; a server must re-validate and scan uploads.
- **The duplicate check is a hint.** It compares only the student's own records in this browser.
- **Reviewers often can't see the certificate.** Because files aren't stored, a reviewer sees only the file's details unless the record has a bundled demo file or a small uploaded image. The verify dialog warns about this.
- **Review scope is by department only.** There is no per-record assignment, and a department whose reviewer is deactivated needs another reviewer to cover it.
- **Faculty have no notification inbox.** Notifications go to students; reviewers use their queue.
- **Admin-created accounts live in one browser.** A faculty account created here exists only in the browser it was created in, like all other data.
- **Categories and years are fixed lists.** Categories can be offered or withheld but not added; students use "Other" with a custom label. Study years are fixed at four.
- **Administrators can't change an achievement.** The register is read-only by design; there is no admin moderation action.
- **"Now" is the browser's clock.** Time ranges are measured from the current date on the device, so the demo data may fall outside "last 30 days" as time passes.
- **Exports are CSV only**, and are generated in the browser.
- **Browser data isn't secure storage.** Mock data in localStorage can be read, edited or cleared by anyone with access to the browser, and can be reset at any time.
- **Notifications are in-app only.** Nothing is emailed or pushed.

## Not in scope yet

The following are deferred to later phases:

- Supabase, the database schema and real authentication
- email/SMTP and email verification
- production password recovery
- cloud file storage
- backend access-control policies
- deployment configuration
