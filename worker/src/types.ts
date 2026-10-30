/*
 * Shared types for the CertiPass Worker.
 *
 * Everything secret arrives through `Env` (Wrangler secrets / .dev.vars) and
 * never leaves this Worker: not in a response, not in a log line.
 */

// ── The slice of Cloudflare D1 this Worker uses ─────────────────────────────
// Declared here (instead of using the platform type directly) so the exact same code runs against
// real D1 in production and against a SQLite file in tests. The real binding satisfies it.

export interface D1Result<T> {
  results: T[]
  meta: { changes: number }
}

export interface D1Statement {
  bind(...values: unknown[]): D1Statement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
  run(): Promise<D1Result<never>>
}

export interface D1Like {
  prepare(sql: string): D1Statement
  /** Runs the statements in order inside one transaction: all of them take effect, or none. */
  batch(statements: D1Statement[]): Promise<D1Result<unknown>[]>
}

export interface Env {
  /** Cloudflare D1 database (accounts, sessions, certificate records). */
  DB: D1Like

  // Accounts
  /**
   * Secret mixed into every password hash. If the database leaks, the hashes alone are not enough to guess
   * passwords. At least 32 characters. CHANGING IT INVALIDATES EVERY PASSWORD, so keep it with the other secrets.
   */
  AUTH_PEPPER: string
  /** Lets `POST /api/setup/first-admin` create the very first administrator. Inert once any admin exists. */
  SETUP_TOKEN?: string
  /** "open" (default): a student who registers can sign in at once. "approval": new student accounts wait for an administrator. */
  REGISTRATION_MODE?: string
  /** Comma-separated email domains that may have an account. Default "rajalakshmi.edu.in". */
  ALLOWED_EMAIL_DOMAINS?: string
  /** How long a sign-in lasts, in hours. Default 8. */
  SESSION_HOURS?: string

  // Google Drive
  /** The Drive folder (or Shared Drive folder) every certificate lives under. */
  GOOGLE_DRIVE_ROOT_FOLDER_ID: string
  /** "oauth" (a person's refresh token) or "service_account" (Shared Drives only). */
  GOOGLE_AUTH_MODE?: string
  GOOGLE_OAUTH_CLIENT_ID?: string
  GOOGLE_OAUTH_CLIENT_SECRET?: string
  GOOGLE_OAUTH_REFRESH_TOKEN?: string
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?: string

  // Behaviour
  /** Comma-separated list of exact origins allowed to call the API, e.g. https://certipass.example.edu */
  ALLOWED_ORIGINS?: string
  /** Minutes before an unfinished upload is treated as interrupted. Default 10. */
  PENDING_STALE_MINUTES?: string
  /**
   * Uploads are refused while the Drive folder is shared with "anyone with the link", because every file
   * inherits that sharing. Set to "true" only if you really want certificates readable by link holders.
   */
  ALLOW_PUBLIC_FOLDER?: string
}

export type Role = 'student' | 'faculty' | 'admin'
export type AccountStatus = 'pending' | 'active' | 'inactive'

/** A row of `users`, as stored. */
export interface UserRow {
  id: string
  email: string
  password_hash: string
  role: Role
  status: AccountStatus
  full_name: string
  department: string | null
  /** JSON array text, or null. */
  review_departments: string | null
  register_number: string | null
  year: number | null
  section: string | null
  designation: string | null
  created_at: string
  updated_at: string
}

/** Who someone is and what they may see. Built from `users`; the only source of a user's role. */
export interface Profile {
  id: string
  role: Role
  active: boolean
  full_name: string
  department: string | null
  review_departments: string[] | null
  register_number: string | null
  year: number | null
}

/** The authenticated caller: a signed-in user joined to their profile. */
export interface Caller {
  id: string
  role: Role
  active: boolean
  profile: Profile
  /** Hash of the session token this request came in on (used to sign out / keep this session on password change). */
  sessionHash: string
}

export type StorageStatus = 'pending' | 'stored' | 'failed' | 'replaced' | 'removed'

/** A row of `certificate_files`. */
export interface CertificateRow {
  id: string
  upload_id: string
  achievement_id: string
  student_id: string
  department: string
  admission_batch: string
  register_number: string
  category: string
  drive_file_id: string | null
  drive_folder_id: string | null
  original_filename: string
  mime_type: string
  size_bytes: number
  sha256: string | null
  title: string | null
  issuer: string | null
  issue_date: string | null
  storage_status: StorageStatus
  failure_code: string | null
  drive_cleanup_pending: boolean
  uploaded_at: string | null
  created_at: string
  updated_at: string
}

/** What a client is allowed to learn about a certificate. Never includes a Drive id. */
export interface CertificateView {
  id: string
  achievementId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string | null
  category: string
  /** What the student called it, who issued it and when (YYYY-MM-DD). Null for certificates attached to an achievement. */
  title: string | null
  issuer: string | null
  issueDate: string | null
}

/** A certificate in a listing: the view plus whose it is. Never includes a Drive id. */
export interface CertificateListItem extends CertificateView {
  studentId: string
  studentName: string
  registerNumber: string
  /** The student's department now. */
  department: string
  /** Admission year, e.g. "2023". */
  batch: string
}
/** Injected so tests can run the whole Worker against in-memory fakes. */
export interface Deps {
  fetch: typeof fetch
  now: () => Date
  uuid: () => string
  /** Waits between Drive retries. Tests pass a no-op. */
  sleep: (ms: number) => Promise<void>
  /** Test-only: fewer password-hash rounds so the suite stays fast. Never set in production. */
  pbkdf2Iterations?: number
}

export const defaultDeps: Deps = {
  fetch: (...args) => fetch(...args),
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
}
