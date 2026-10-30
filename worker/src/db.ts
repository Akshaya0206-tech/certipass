/*
 * The Worker's database (Cloudflare D1, which is SQLite). Every query uses bound
 * parameters, never string-built values, and every caller in certificates.ts /
 * users.ts / auth.ts applies the policy in access.ts BEFORE reading or writing.
 *
 * Only this file knows SQL; the rest of the Worker deals in typed rows.
 */
import type { AccountStatus, CertificateListItem, CertificateRow, D1Like, D1Statement, Profile, Role, UserRow } from './types'

export type DbErrorCode = 'unique' | 'foreign_key' | 'check' | 'db' | 'upload_not_found' | 'upload_already_stored' | 'upload_not_pending'

export class DbError extends Error {
  readonly code: DbErrorCode
  /** What the database said. For server logs only: it names tables and columns, never values, and never reaches a client. */
  readonly detail: string
  constructor(code: DbErrorCode, message: string, detail = message) {
    super(message)
    this.name = 'DbError'
    this.code = code
    this.detail = detail.slice(0, 300)
  }
  get isUniqueViolation() {
    return this.code === 'unique'
  }
}

function classify(err: unknown): DbError {
  if (err instanceof DbError) return err
  const text = err instanceof Error ? err.message : String(err)
  if (/UNIQUE constraint failed/i.test(text)) return new DbError('unique', text)
  if (/FOREIGN KEY constraint failed/i.test(text)) return new DbError('foreign_key', text)
  if (/CHECK constraint failed/i.test(text)) return new DbError('check', text)
  return new DbError('db', 'The database request failed.', text)
}

/** Column names only ever come from code, never from a request, but check anyway before they reach SQL. */
const COLUMN = /^[a-z][a-z0-9_]*$/
const column = (name: string) => {
  if (!COLUMN.test(name)) throw new DbError('db', 'Invalid column name.')
  return name
}
const sqlValue = (v: unknown) => (typeof v === 'boolean' ? (v ? 1 : 0) : v === undefined ? null : v)

export type Where = Record<string, string | number | boolean | null>

function buildWhere(where: Where): { sql: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []
  for (const [key, value] of Object.entries(where)) {
    if (value === null) parts.push(`${column(key)} IS NULL`)
    else {
      parts.push(`${column(key)} = ?`)
      params.push(sqlValue(value))
    }
  }
  return { sql: parts.length ? parts.join(' AND ') : '1 = 1', params }
}

export const mapCertificate = (row: Record<string, unknown>): CertificateRow => ({ ...(row as unknown as CertificateRow), drive_cleanup_pending: row.drive_cleanup_pending === 1 || row.drive_cleanup_pending === true })

export function parseDepartments(json: string | null): string[] | null {
  if (!json) return null
  try {
    const value: unknown = JSON.parse(json)
    return Array.isArray(value) && value.every((d) => typeof d === 'string') ? (value as string[]) : null
  } catch {
    return null
  }
}

/** The Profile the access rules work with. `active` means the account may be used right now. */
export const toProfile = (u: UserRow): Profile => ({
  id: u.id,
  role: u.role,
  active: u.status === 'active',
  full_name: u.full_name,
  department: u.department,
  review_departments: parseDepartments(u.review_departments),
  register_number: u.register_number,
  year: u.year,
})

export interface NewUser {
  email: string
  password_hash: string
  role: Role
  status: AccountStatus
  full_name: string
  department: string | null
  review_departments: string[] | null
  register_number: string | null
  year: number | null
  section: string | null
  designation: string | null
}

export type UserPatch = Partial<{
  password_hash: string
  role: Role
  status: AccountStatus
  full_name: string
  department: string | null
  review_departments: string[] | null
  year: number | null
  section: string | null
  designation: string | null
}>

export interface UserListFilters {
  role?: Role
  status?: AccountStatus
  department?: string
  /** Matches name, email or register number. */
  q?: string
  limit: number
  offset: number
}

export interface CertificateFilters {
  studentId?: string
  category?: string
  achievementId?: string
  /** Matches the student's name or register number, or the certificate's title, issuer or file name. */
  q?: string
  /** The student's department now. */
  department?: string
  /** Admission year, e.g. "2023". */
  batch?: string
}

export interface CertificateScope {
  role: Role
  userId: string
  /** Faculty: the departments they cover. */
  departments: string[]
}

export class Db {
  constructor(
    private readonly d1: D1Like,
    private readonly now: () => Date,
  ) {}

  private iso() {
    return this.now().toISOString()
  }

  private async all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
    try {
      return (await this.d1.prepare(sql).bind(...params.map(sqlValue)).all<T>()).results
    } catch (err) {
      throw classify(err)
    }
  }

  private async first<T>(sql: string, ...params: unknown[]): Promise<T | null> {
    try {
      return await this.d1.prepare(sql).bind(...params.map(sqlValue)).first<T>()
    } catch (err) {
      throw classify(err)
    }
  }

  private async run(sql: string, ...params: unknown[]): Promise<number> {
    try {
      return (await this.d1.prepare(sql).bind(...params.map(sqlValue)).run()).meta.changes
    } catch (err) {
      throw classify(err)
    }
  }

  private stmt(sql: string, ...params: unknown[]): D1Statement {
    return this.d1.prepare(sql).bind(...params.map(sqlValue))
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  getUser(id: string): Promise<UserRow | null> {
    return this.first<UserRow>('SELECT * FROM users WHERE id = ?', id)
  }

  getUserByEmail(email: string): Promise<UserRow | null> {
    return this.first<UserRow>('SELECT * FROM users WHERE email = ?', email)
  }

  async insertUser(user: NewUser): Promise<UserRow> {
    const id = crypto.randomUUID()
    const at = this.iso()
    await this.run(
      `INSERT INTO users (id, email, password_hash, role, status, full_name, department, review_departments, register_number, year, section, designation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id, user.email, user.password_hash, user.role, user.status, user.full_name, user.department,
      user.review_departments ? JSON.stringify(user.review_departments) : null,
      user.register_number, user.year, user.section, user.designation, at, at,
    )
    return (await this.getUser(id))!
  }

  /**
   * Creates the first administrator, and only if there is no administrator yet, in ONE statement so two
   * simultaneous requests cannot both succeed. Returns false when an administrator already exists.
   */
  async insertFirstAdmin(user: Pick<NewUser, 'email' | 'password_hash' | 'full_name' | 'designation'>): Promise<boolean> {
    const at = this.iso()
    const changes = await this.run(
      `INSERT INTO users (id, email, password_hash, role, status, full_name, designation, created_at, updated_at)
       SELECT ?, ?, ?, 'admin', 'active', ?, ?, ?, ?
       WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')`,
      crypto.randomUUID(), user.email, user.password_hash, user.full_name, user.designation, at, at,
    )
    return changes > 0
  }

  /**
   * Update an account. With `requireOtherActiveAdmin`, the change only happens if some OTHER administrator is active
   * at that very moment, checked inside the same statement, so two administrators switching each other off at the same
   * time cannot both succeed. Returns null when that guard stopped the change.
   */
  async updateUser(id: string, patch: UserPatch, options: { requireOtherActiveAdmin?: boolean } = {}): Promise<UserRow | null> {
    const sets: string[] = []
    const params: unknown[] = []
    for (const [key, value] of Object.entries(patch)) {
      sets.push(`${column(key)} = ?`)
      params.push(key === 'review_departments' ? (value ? JSON.stringify(value) : null) : value)
    }
    if (sets.length === 0) return this.getUser(id)
    sets.push('updated_at = ?')
    params.push(this.iso(), id)
    let guard = ''
    if (options.requireOtherActiveAdmin) {
      guard = ` AND EXISTS (SELECT 1 FROM users o WHERE o.role = 'admin' AND o.status = 'active' AND o.id <> ?)`
      params.push(id)
    }
    const changes = await this.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?${guard}`, ...params)
    return changes === 0 && guard ? null : this.getUser(id)
  }

  /**
   * Let in an account that was waiting for approval. One statement, and only while the account is still waiting, so it
   * can never undo an administrator who deactivated it in the meantime. Returns whether it changed anything.
   */
  async activatePending(id: string): Promise<boolean> {
    return (await this.run(`UPDATE users SET status = 'active', updated_at = ? WHERE id = ? AND status = 'pending'`, this.iso(), id)) > 0
  }

  /**
   * Remove a faculty account. One statement that can only ever match a faculty account, so it cannot remove a student
   * (whose certificates must stay) or an administrator. Returns whether anything was removed.
   */
  async deleteFaculty(id: string): Promise<boolean> {
    return (await this.run(`DELETE FROM users WHERE id = ? AND role = 'faculty'`, id)) > 0
  }

  async listUsers(f: UserListFilters): Promise<{ users: UserRow[]; total: number }> {
    const where: string[] = []
    const params: unknown[] = []
    if (f.role) (where.push('role = ?'), params.push(f.role))
    if (f.status) (where.push('status = ?'), params.push(f.status))
    if (f.department) (where.push('department = ?'), params.push(f.department))
    if (f.q) {
      const like = `%${f.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      where.push(`(full_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR register_number LIKE ? ESCAPE '\\')`)
      params.push(like, like, like)
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = (await this.first<{ n: number }>(`SELECT COUNT(*) AS n FROM users ${clause}`, ...params))?.n ?? 0
    const users = await this.all<UserRow>(`SELECT * FROM users ${clause} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`, ...params, f.limit, f.offset)
    return { users, total }
  }

  // ── Sessions ───────────────────────────────────────────────────────────────

  async createSession(tokenHash: string, userId: string, expiresAt: string): Promise<void> {
    await this.run('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', tokenHash, userId, this.iso(), expiresAt)
  }

  async getSession(tokenHash: string): Promise<{ expiresAt: string; user: UserRow } | null> {
    const row = await this.first<UserRow & { session_expires_at: string }>(
      'SELECT s.expires_at AS session_expires_at, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?',
      tokenHash,
    )
    if (!row) return null
    const { session_expires_at, ...user } = row
    return { expiresAt: session_expires_at, user: user as UserRow }
  }

  deleteSession(tokenHash: string): Promise<number> {
    return this.run('DELETE FROM sessions WHERE token_hash = ?', tokenHash)
  }

  /** Ends every session of a user, optionally keeping one (the one making the request). */
  deleteUserSessions(userId: string, exceptTokenHash?: string): Promise<number> {
    return exceptTokenHash
      ? this.run('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?', userId, exceptTokenHash)
      : this.run('DELETE FROM sessions WHERE user_id = ?', userId)
  }

  purgeExpiredSessions(): Promise<number> {
    return this.run('DELETE FROM sessions WHERE expires_at < ?', this.iso())
  }

  // ── Brute-force counters ───────────────────────────────────────────────────

  getThrottle(key: string): Promise<{ key: string; failures: number; window_start: string; locked_until: string | null } | null> {
    return this.first('SELECT * FROM auth_throttle WHERE key = ?', key)
  }

  async putThrottle(key: string, failures: number, windowStart: string, lockedUntil: string | null): Promise<void> {
    await this.run(
      `INSERT INTO auth_throttle (key, failures, window_start, locked_until) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET failures = excluded.failures, window_start = excluded.window_start, locked_until = excluded.locked_until`,
      key, failures, windowStart, lockedUntil,
    )
  }

  async deleteThrottle(key: string): Promise<void> {
    await this.run('DELETE FROM auth_throttle WHERE key = ?', key)
  }

  purgeThrottle(olderThan: string): Promise<number> {
    return this.run('DELETE FROM auth_throttle WHERE window_start < ? AND (locked_until IS NULL OR locked_until < ?)', olderThan, olderThan)
  }

  // ── Audit trail ────────────────────────────────────────────────────────────

  async audit(actorId: string | null, action: string, targetId: string | null, detail: string | null): Promise<void> {
    // The trail must never break the action it records.
    await this.run('INSERT INTO audit_log (at, actor_id, action, target_id, detail) VALUES (?, ?, ?, ?, ?)', this.iso(), actorId, action, targetId, detail?.slice(0, 500) ?? null).catch(() => 0)
  }

  listAudit(limit: number) {
    return this.all<{ id: number; at: string; actor_id: string | null; action: string; target_id: string | null; detail: string | null }>('SELECT * FROM audit_log ORDER BY id DESC LIMIT ?', limit)
  }

  // ── Certificates ───────────────────────────────────────────────────────────

  async getCertificate(id: string): Promise<CertificateRow | null> {
    const row = await this.first<Record<string, unknown>>('SELECT * FROM certificate_files WHERE id = ?', id)
    return row ? mapCertificate(row) : null
  }

  async findByUploadId(uploadId: string): Promise<CertificateRow | null> {
    const row = await this.first<Record<string, unknown>>('SELECT * FROM certificate_files WHERE upload_id = ?', uploadId)
    return row ? mapCertificate(row) : null
  }

  /**
   * Rows for one student's achievement that are still in play: being uploaded, or stored. An achievement id is
   * chosen by the browser, so it only means something together with the student who owns it.
   */
  async liveForAchievement(studentId: string, achievementId: string): Promise<CertificateRow[]> {
    const rows = await this.all<Record<string, unknown>>(
      `SELECT * FROM certificate_files WHERE student_id = ? AND achievement_id = ? AND storage_status IN ('pending', 'stored')`,
      studentId, achievementId,
    )
    return rows.map(mapCertificate)
  }

  async storedForAchievement(studentId: string, achievementId: string): Promise<CertificateRow[]> {
    const rows = await this.all<Record<string, unknown>>(
      `SELECT * FROM certificate_files WHERE student_id = ? AND achievement_id = ? AND storage_status = 'stored'`,
      studentId, achievementId,
    )
    return rows.map(mapCertificate)
  }

  async insertCertificate(row: Record<string, unknown>): Promise<CertificateRow> {
    const id = crypto.randomUUID()
    const at = this.iso()
    const data: Record<string, unknown> = { id, created_at: at, updated_at: at, ...row }
    const cols = Object.keys(data).map(column)
    await this.run(`INSERT INTO certificate_files (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...Object.values(data))
    return (await this.getCertificate(id))!
  }

  /** Update rows matching `where` (all conditions must hold). An empty result means nobody matched, e.g. a lost race. */
  async updateCertificates(where: Where, patch: Record<string, unknown>): Promise<CertificateRow[]> {
    const sets = Object.keys(patch).map((k) => `${column(k)} = ?`)
    sets.push('updated_at = ?')
    const w = buildWhere(where)
    const rows = await this.all<Record<string, unknown>>(
      `UPDATE certificate_files SET ${sets.join(', ')} WHERE ${w.sql} RETURNING *`,
      ...Object.values(patch), this.iso(), ...w.params,
    )
    return rows.map(mapCertificate)
  }

  /**
   * Turn a pending upload into a stored one and retire any earlier stored certificate for the same achievement,
   * in ONE transaction. Idempotent: calling it again for an already-stored upload with the same Drive file
   * returns the row. The earlier certificate is only retired if this row is still pending at that moment, so a
   * lost race can never leave an achievement with no certificate.
   */
  async finalizeUpload(uploadId: string, driveFileId: string, driveFolderId: string): Promise<CertificateRow> {
    const row = await this.findByUploadId(uploadId)
    if (!row) throw new DbError('upload_not_found', 'upload_not_found')
    if (row.storage_status === 'stored') {
      if (row.drive_file_id === driveFileId) return row
      throw new DbError('upload_already_stored', 'upload_already_stored')
    }
    if (row.storage_status !== 'pending') throw new DbError('upload_not_pending', 'upload_not_pending')

    const at = this.iso()
    let results
    try {
      results = await this.d1.batch([
        this.stmt(
          `UPDATE certificate_files SET storage_status = 'replaced', drive_cleanup_pending = CASE WHEN drive_file_id IS NOT NULL THEN 1 ELSE 0 END, updated_at = ?
            WHERE student_id = ? AND achievement_id = ? AND storage_status = 'stored' AND id <> ?
              AND EXISTS (SELECT 1 FROM certificate_files p WHERE p.id = ? AND p.storage_status = 'pending')`,
          at, row.student_id, row.achievement_id, row.id, row.id,
        ),
        this.stmt(
          `UPDATE certificate_files SET storage_status = 'stored', drive_file_id = ?, drive_folder_id = ?, uploaded_at = ?, failure_code = NULL, updated_at = ?
            WHERE id = ? AND storage_status = 'pending'`,
          driveFileId, driveFolderId, at, at, row.id,
        ),
      ])
    } catch (err) {
      throw classify(err)
    }
    if (results[1].meta.changes === 0) {
      // Somebody else finished (or closed) this upload between our read and our write.
      const current = await this.getCertificate(row.id)
      if (current?.storage_status === 'stored' && current.drive_file_id === driveFileId) return current
      throw new DbError('upload_not_pending', 'upload_not_pending')
    }
    return (await this.getCertificate(row.id))!
  }

  async stalePending(cutoffIso: string, limit: number): Promise<CertificateRow[]> {
    const rows = await this.all<Record<string, unknown>>(`SELECT * FROM certificate_files WHERE storage_status = 'pending' AND updated_at < ? ORDER BY updated_at LIMIT ?`, cutoffIso, limit)
    return rows.map(mapCertificate)
  }

  async needingDriveCleanup(limit: number, studentId?: string, achievementId?: string): Promise<CertificateRow[]> {
    const rows =
      studentId && achievementId
        ? await this.all<Record<string, unknown>>(`SELECT * FROM certificate_files WHERE drive_cleanup_pending = 1 AND student_id = ? AND achievement_id = ? LIMIT ?`, studentId, achievementId, limit)
        : await this.all<Record<string, unknown>>('SELECT * FROM certificate_files WHERE drive_cleanup_pending = 1 LIMIT ?', limit)
    return rows.map(mapCertificate)
  }

  async knownDriveFileIds(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set()
    const rows = await this.all<{ drive_file_id: string }>(`SELECT drive_file_id FROM certificate_files WHERE drive_file_id IN (${ids.map(() => '?').join(', ')})`, ...ids)
    return new Set(rows.map((r) => r.drive_file_id))
  }

  /**
   * Stored certificates a person may see, newest first. The scope is applied here in SQL, so a caller can never
   * list more than their role allows; the filters can only narrow it. Faculty see students currently in a department
   * they cover. `facets` lists the departments and batches present within the SCOPE (not the filters), for dropdowns.
   */
  async listCertificates(
    scope: CertificateScope,
    filters: CertificateFilters,
    limit: number,
    offset: number,
  ): Promise<{ items: CertificateListItem[]; total: number; facets: { departments: string[]; batches: string[] } }> {
    const empty = { items: [], total: 0, facets: { departments: [], batches: [] } }
    const where: string[] = [`c.storage_status = 'stored'`]
    const params: unknown[] = []
    if (scope.role === 'student') (where.push('c.student_id = ?'), params.push(scope.userId))
    else if (scope.role === 'faculty') {
      if (scope.departments.length === 0) return empty
      where.push(`u.role = 'student' AND u.department IN (${scope.departments.map(() => '?').join(', ')})`)
      params.push(...scope.departments)
    }
    const scopeWhere = where.join(' AND ')
    const scopeParams = [...params]

    if (filters.studentId) (where.push('c.student_id = ?'), params.push(filters.studentId))
    if (filters.category) (where.push('c.category = ?'), params.push(filters.category))
    if (filters.achievementId) (where.push('c.achievement_id = ?'), params.push(filters.achievementId))
    if (filters.department) (where.push('u.department = ?'), params.push(filters.department))
    if (filters.batch) (where.push('c.admission_batch = ?'), params.push(filters.batch))
    if (filters.q) {
      const like = `%${filters.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
      where.push(
        `(u.full_name LIKE ? ESCAPE '\\' OR c.register_number LIKE ? ESCAPE '\\' OR c.title LIKE ? ESCAPE '\\' OR c.issuer LIKE ? ESCAPE '\\' OR c.original_filename LIKE ? ESCAPE '\\')`,
      )
      params.push(like, like, like, like, like)
    }
    const from = `FROM certificate_files c JOIN users u ON u.id = c.student_id WHERE ${where.join(' AND ')}`
    const total = (await this.first<{ n: number }>(`SELECT COUNT(*) AS n ${from}`, ...params))?.n ?? 0
    const rows = await this.all<Record<string, unknown>>(
      `SELECT c.id, c.achievement_id, c.original_filename, c.mime_type, c.size_bytes, c.uploaded_at, c.category, c.title, c.issuer, c.issue_date,
              c.student_id, c.register_number, c.admission_batch, u.full_name AS student_name, u.department AS student_department ${from}
        ORDER BY c.uploaded_at DESC, c.id LIMIT ? OFFSET ?`,
      ...params, limit, offset,
    )
    const base = `FROM certificate_files c JOIN users u ON u.id = c.student_id WHERE ${scopeWhere}`
    const departments = (await this.all<{ v: string | null }>(`SELECT DISTINCT u.department AS v ${base} ORDER BY v`, ...scopeParams)).map((r) => r.v).filter((v): v is string => !!v)
    const batches = (await this.all<{ v: string | null }>(`SELECT DISTINCT c.admission_batch AS v ${base} ORDER BY v DESC`, ...scopeParams)).map((r) => r.v).filter((v): v is string => !!v)
    return {
      total,
      facets: { departments, batches },
      items: rows.map((r) => ({
        id: String(r.id),
        achievementId: String(r.achievement_id),
        fileName: String(r.original_filename),
        mimeType: String(r.mime_type),
        sizeBytes: Number(r.size_bytes),
        uploadedAt: (r.uploaded_at as string | null) ?? null,
        category: String(r.category),
        title: (r.title as string | null) ?? null,
        issuer: (r.issuer as string | null) ?? null,
        issueDate: (r.issue_date as string | null) ?? null,
        studentId: String(r.student_id),
        studentName: String(r.student_name),
        registerNumber: String(r.register_number),
        department: String(r.student_department ?? ''),
        batch: String(r.admission_batch),
      })),
    }
  }

  /** Upload statistics for the administrator's overview. Counts only certificates that are really stored. */
  async stats(now: Date) {
    const t = now.getTime()
    const ago = (days: number) => new Date(t - days * 86_400_000).toISOString()
    const totals = await this.first<{ n: number; bytes: number; students: number; week: number; month: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS bytes, COUNT(DISTINCT student_id) AS students,
              COALESCE(SUM(CASE WHEN uploaded_at >= ? THEN 1 ELSE 0 END), 0) AS week,
              COALESCE(SUM(CASE WHEN uploaded_at >= ? THEN 1 ELSE 0 END), 0) AS month
         FROM certificate_files WHERE storage_status = 'stored'`,
      ago(7), ago(30),
    )
    const byCategory = await this.all<{ category: string; n: number }>(`SELECT category, COUNT(*) AS n FROM certificate_files WHERE storage_status = 'stored' GROUP BY category ORDER BY n DESC, category`)
    const byDepartment = await this.all<{ department: string | null; n: number }>(
      `SELECT u.department AS department, COUNT(*) AS n FROM certificate_files c JOIN users u ON u.id = c.student_id
        WHERE c.storage_status = 'stored' GROUP BY u.department ORDER BY n DESC, department`,
    )
    const byMonth = await this.all<{ month: string; n: number }>(
      `SELECT substr(uploaded_at, 1, 7) AS month, COUNT(*) AS n FROM certificate_files WHERE storage_status = 'stored' AND uploaded_at >= ? GROUP BY month ORDER BY month`,
      ago(366),
    )
    const accounts = await this.all<{ role: Role; status: AccountStatus; n: number }>('SELECT role, status, COUNT(*) AS n FROM users GROUP BY role, status')
    return { totals: totals ?? { n: 0, bytes: 0, students: 0, week: 0, month: 0 }, byCategory, byDepartment, byMonth, accounts }
  }
}