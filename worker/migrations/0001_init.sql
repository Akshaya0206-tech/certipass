-- CertiPass backend schema (Cloudflare D1 / SQLite).
--
--   users              accounts: who someone is and what they may do. The ONLY source of a user's role.
--   sessions           sign-ins. Only a hash of the session token is stored, so a leaked database
--                      cannot be used to sign in as anyone.
--   auth_throttle      failed-sign-in and registration counters (brute-force protection).
--   audit_log          who changed which account, and who removed which certificate.
--   certificate_files  one row per upload: the Google Drive file id, original file name, MIME type,
--                      size, owner (student), achievement and status.
--
-- Apply with:  npx wrangler d1 migrations apply DB --local   (or --remote)
-- Timestamps are ISO-8601 UTC text, which sorts correctly as text.

PRAGMA foreign_keys = ON;

-- ── users ───────────────────────────────────────────────────────────────────

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  email               TEXT NOT NULL UNIQUE COLLATE NOCASE,
  -- "pbkdf2-sha256$<iterations>$<salt>$<hash>"; see src/passwords.ts. Never leaves the Worker.
  password_hash       TEXT NOT NULL,
  role                TEXT NOT NULL CHECK (role IN ('student', 'faculty', 'admin')),
  -- pending: registered, waiting for an administrator. inactive: switched off by an administrator.
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'inactive')),
  full_name           TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 120),
  department          TEXT CHECK (department IS NULL OR length(department) BETWEEN 1 AND 40),
  -- Faculty only: a JSON array of departments they review. Empty or null means "their own department".
  review_departments  TEXT,
  register_number     TEXT UNIQUE COLLATE NOCASE CHECK (register_number IS NULL OR length(register_number) BETWEEN 1 AND 30),
  year                INTEGER CHECK (year IS NULL OR year BETWEEN 1 AND 4),
  section             TEXT CHECK (section IS NULL OR length(section) <= 10),
  designation         TEXT CHECK (designation IS NULL OR length(designation) <= 80),
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK (role <> 'student' OR (register_number IS NOT NULL AND department IS NOT NULL AND year IS NOT NULL)),
  CHECK (role <> 'faculty' OR department IS NOT NULL)
);

CREATE INDEX users_role_status_idx ON users (role, status);
CREATE INDEX users_department_idx ON users (department);

-- ── sessions ────────────────────────────────────────────────────────────────

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL
);

CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

-- ── auth_throttle ───────────────────────────────────────────────────────────

CREATE TABLE auth_throttle (
  key           TEXT PRIMARY KEY,
  failures      INTEGER NOT NULL DEFAULT 0,
  window_start  TEXT NOT NULL,
  locked_until  TEXT
);

-- ── audit_log ───────────────────────────────────────────────────────────────

CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  at         TEXT NOT NULL,
  actor_id   TEXT,
  action     TEXT NOT NULL,
  target_id  TEXT,
  detail     TEXT
);

CREATE INDEX audit_log_at_idx ON audit_log (at);

-- ── certificate_files ───────────────────────────────────────────────────────

CREATE TABLE certificate_files (
  id                     TEXT PRIMARY KEY,
  -- Chosen by the browser for each upload attempt; retries reuse it, which is what makes a retry safe.
  upload_id              TEXT NOT NULL UNIQUE CHECK (length(upload_id) = 36),
  achievement_id         TEXT NOT NULL CHECK (length(achievement_id) BETWEEN 1 AND 64 AND achievement_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  student_id             TEXT NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
  -- Snapshot of the student's details at upload time, used to organise Drive folders.
  department             TEXT NOT NULL,
  admission_batch        TEXT NOT NULL,
  register_number        TEXT NOT NULL,
  category               TEXT NOT NULL,
  -- Where the file is in Google Drive. Never sent to browsers.
  drive_file_id          TEXT,
  drive_folder_id        TEXT,
  original_filename      TEXT NOT NULL CHECK (length(original_filename) BETWEEN 1 AND 255),
  mime_type              TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
  size_bytes             INTEGER NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  sha256                 TEXT CHECK (sha256 IS NULL OR (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*')),
  storage_status         TEXT NOT NULL DEFAULT 'pending' CHECK (storage_status IN ('pending', 'stored', 'failed', 'replaced', 'removed')),
  failure_code           TEXT,
  -- 1 when the Drive file should be moved to the bin (replaced or removed) and that hasn't happened yet.
  drive_cleanup_pending  INTEGER NOT NULL DEFAULT 0 CHECK (drive_cleanup_pending IN (0, 1)),
  uploaded_at            TEXT,
  created_at             TEXT NOT NULL,
  updated_at             TEXT NOT NULL,
  -- "stored" is only ever true once the Drive file exists and its id is saved.
  CHECK (storage_status <> 'stored' OR (drive_file_id IS NOT NULL AND uploaded_at IS NOT NULL))
);

-- At most one upload in flight and one stored certificate per achievement OF A STUDENT. The browser
-- chooses achievement ids, so an id is only meaningful together with the student who uploaded under it:
-- nobody can pre-claim, block or be mistaken for someone else's achievement.
CREATE UNIQUE INDEX certificate_files_one_pending ON certificate_files (student_id, achievement_id) WHERE storage_status = 'pending';
CREATE UNIQUE INDEX certificate_files_one_stored ON certificate_files (student_id, achievement_id) WHERE storage_status = 'stored';

CREATE INDEX certificate_files_student_idx ON certificate_files (student_id);
CREATE INDEX certificate_files_achievement_idx ON certificate_files (achievement_id);
CREATE INDEX certificate_files_status_idx ON certificate_files (storage_status, updated_at);
CREATE INDEX certificate_files_drive_file_idx ON certificate_files (drive_file_id) WHERE drive_file_id IS NOT NULL;
CREATE INDEX certificate_files_cleanup_idx ON certificate_files (drive_cleanup_pending) WHERE drive_cleanup_pending = 1;
