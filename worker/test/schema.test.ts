/*
 * The real migration, run on real SQLite: the rules the database enforces no matter what the Worker code does.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { Db } from '../src/db'
import { TestD1, migrationSql } from './d1'

let db: TestD1
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const NOW = '2026-10-29T10:00:00.000Z'

function user(over: Record<string, string | number | null> = {}) {
  const row: Record<string, string | number | null> = {
    id: crypto.randomUUID(), email: `u${Math.random().toString(36).slice(2)}@rajalakshmi.edu.in`, password_hash: 'h', role: 'student', status: 'active', full_name: 'Test Student',
    department: 'CSE', register_number: `R${Math.random().toString(36).slice(2, 10)}`, year: 2, created_at: NOW, updated_at: NOW, ...over,
  }
  const cols = Object.keys(row)
  db.exec(`INSERT INTO users (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...(Object.values(row) as (string | number | null)[]))
  return row.id as string
}

let n = 0
function cert(over: Record<string, string | number | null> = {}) {
  n++
  const row: Record<string, string | number | null> = {
    id: crypto.randomUUID(), upload_id: crypto.randomUUID(), achievement_id: `ach-${n}`, student_id: A, department: 'CSE', admission_batch: '2023', register_number: 'R1', category: 'Hackathon',
    original_filename: 'c.pdf', mime_type: 'application/pdf', size_bytes: 1000, storage_status: 'pending', created_at: NOW, updated_at: NOW, ...over,
  }
  const cols = Object.keys(row)
  db.exec(`INSERT INTO certificate_files (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...(Object.values(row) as (string | number | null)[]))
  return row as { id: string; upload_id: string }
}

beforeEach(() => {
  db = new TestD1()
  user({ id: A })
  user({ id: B })
})

describe('the migrations', () => {
  it('apply cleanly in order to an empty database, and create every table', () => {
    const tables = db.rows<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").map((r) => r.name).sort()
    expect(tables).toEqual(['audit_log', 'auth_throttle', 'certificate_files', 'sessions', 'users'])
  })

  it('are all plain SQL files, with none leftover from the old Postgres setup', () => {
    expect(migrationSql().length).toBeGreaterThan(0)
    for (const sql of migrationSql()) expect(sql).not.toMatch(/auth\.uid|row level security|supabase|service_role/i)
  })
})

describe('accounts', () => {
  it('allow one account per email, whatever the capitalisation', () => {
    user({ email: 'someone@rajalakshmi.edu.in' })
    expect(() => user({ email: 'SOMEONE@Rajalakshmi.edu.in' })).toThrow(/UNIQUE/)
  })

  it('allow one account per register number, whatever the capitalisation', () => {
    user({ register_number: 'abc123' })
    expect(() => user({ register_number: 'ABC123' })).toThrow(/UNIQUE/)
  })

  it('refuse an unknown role or status', () => {
    expect(() => user({ role: 'superuser' })).toThrow(/CHECK/)
    expect(() => user({ status: 'deleted' })).toThrow(/CHECK/)
  })

  it('refuse a student without a register number, department or year, and a faculty member without a department', () => {
    expect(() => user({ register_number: null })).toThrow(/CHECK/)
    expect(() => user({ department: null })).toThrow(/CHECK/)
    expect(() => user({ year: null })).toThrow(/CHECK/)
    expect(() => user({ role: 'faculty', department: null, register_number: null, year: null })).toThrow(/CHECK/)
    expect(() => user({ role: 'admin', department: null, register_number: null, year: null })).not.toThrow()
  })

  it('refuse a year outside 1–4 and over-long fields', () => {
    expect(() => user({ year: 5 })).toThrow(/CHECK/)
    expect(() => user({ year: 0 })).toThrow(/CHECK/)
    expect(() => user({ register_number: 'R'.repeat(31) })).toThrow(/CHECK/)
    expect(() => user({ full_name: '' })).toThrow(/CHECK/)
  })

  it('start out pending unless said otherwise', () => {
    db.exec(`INSERT INTO users (id, email, password_hash, role, full_name, department, register_number, year, created_at, updated_at) VALUES ('x1', 'x1@rajalakshmi.edu.in', 'h', 'student', 'X', 'CSE', 'RX1', 1, ?, ?)`, NOW, NOW)
    expect(db.rows("SELECT status FROM users WHERE id = 'x1'")[0]).toEqual({ status: 'pending' })
  })
})

describe('sessions', () => {
  it('disappear with their account', () => {
    db.exec('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', 'h1', A, NOW, NOW)
    db.exec('DELETE FROM users WHERE id = ?', A)
    expect(db.rows('SELECT 1 FROM sessions')).toHaveLength(0)
  })

  it('cannot exist for an account that does not exist', () => {
    expect(() => db.exec('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', 'h2', 'nobody', NOW, NOW)).toThrow(/FOREIGN KEY/)
  })
})

describe('certificate records', () => {
  it('refuse unsupported types, oversized or empty files and odd achievement ids', () => {
    expect(() => cert({ mime_type: 'text/html' })).toThrow(/CHECK/)
    expect(() => cert({ size_bytes: 10 * 1024 * 1024 + 1 })).toThrow(/CHECK/)
    expect(() => cert({ size_bytes: 0 })).toThrow(/CHECK/)
    for (const bad of ['../x', 'a b', "a'b", 'a/b', '', 'x'.repeat(65)]) expect(() => cert({ achievement_id: bad }), bad).toThrow(/CHECK/)
    expect(() => cert({ achievement_id: 'ach-1_ok-2' })).not.toThrow()
  })

  it('refuse a stored row that has no Drive file', () => {
    expect(() => cert({ storage_status: 'stored' })).toThrow(/CHECK/)
    expect(() => cert({ storage_status: 'stored', drive_file_id: 'f', uploaded_at: NOW })).not.toThrow()
  })

  it('refuse a malformed checksum, and an upload id that is not a UUID', () => {
    expect(() => cert({ sha256: 'xyz' })).toThrow(/CHECK/)
    expect(() => cert({ upload_id: 'short' })).toThrow(/CHECK/)
    expect(() => cert({ sha256: 'a'.repeat(64) })).not.toThrow()
  })

  it('allow one upload in flight and one stored certificate per achievement of a student', () => {
    cert({ achievement_id: 'dup' })
    expect(() => cert({ achievement_id: 'dup' })).toThrow(/UNIQUE/)
    cert({ achievement_id: 'dup2', storage_status: 'stored', drive_file_id: 'f1', uploaded_at: NOW })
    expect(() => cert({ achievement_id: 'dup2', storage_status: 'stored', drive_file_id: 'f2', uploaded_at: NOW })).toThrow(/UNIQUE/)
  })

  it('let any number of retired rows pile up for one achievement', () => {
    for (const status of ['failed', 'replaced', 'removed', 'failed', 'replaced']) cert({ achievement_id: 'history', storage_status: status })
    expect(db.rows("SELECT 1 FROM certificate_files WHERE achievement_id = 'history'")).toHaveLength(5)
  })

  it('let two different students use the same achievement id', () => {
    cert({ achievement_id: 'same', student_id: A })
    expect(() => cert({ achievement_id: 'same', student_id: B })).not.toThrow()
  })

  it('never reuse an upload id', () => {
    const first = cert()
    expect(() => cert({ upload_id: first.upload_id })).toThrow(/UNIQUE/)
  })

  it('cannot be orphaned: an account with certificates cannot be deleted', () => {
    cert({ student_id: A })
    expect(() => db.exec('DELETE FROM users WHERE id = ?', A)).toThrow(/FOREIGN KEY/)
  })

  it('cannot belong to an account that does not exist', () => {
    expect(() => cert({ student_id: 'nobody' })).toThrow(/FOREIGN KEY/)
  })
})

describe('finishing an upload (one transaction)', () => {
  const dbOf = () => new Db(db, () => new Date(NOW))
  const statusOf = (id: string) => db.rows<{ storage_status: string; drive_cleanup_pending: number }>('SELECT storage_status, drive_cleanup_pending FROM certificate_files WHERE id = ?', id)[0]

  it('turns a pending upload into a stored one', async () => {
    const c = cert({ achievement_id: 'fin-1' })
    expect(await dbOf().finalizeUpload(c.upload_id, 'drive-A', 'folder-1')).toMatchObject({ storage_status: 'stored', drive_file_id: 'drive-A', drive_folder_id: 'folder-1' })
  })

  it('is idempotent for the same Drive file, and refuses a different one', async () => {
    const c = cert({ achievement_id: 'fin-2' })
    await dbOf().finalizeUpload(c.upload_id, 'drive-B', 'f')
    await expect(dbOf().finalizeUpload(c.upload_id, 'drive-B', 'f')).resolves.toMatchObject({ storage_status: 'stored' })
    await expect(dbOf().finalizeUpload(c.upload_id, 'drive-OTHER', 'f')).rejects.toMatchObject({ code: 'upload_already_stored' })
  })

  it('retires the earlier certificate for the same achievement in the same step', async () => {
    const first = cert({ achievement_id: 'fin-3' })
    await dbOf().finalizeUpload(first.upload_id, 'drive-old', 'f')
    const second = cert({ achievement_id: 'fin-3' })
    await dbOf().finalizeUpload(second.upload_id, 'drive-new', 'f')
    expect(statusOf(first.id)).toEqual({ storage_status: 'replaced', drive_cleanup_pending: 1 })
    expect(statusOf(second.id)).toEqual({ storage_status: 'stored', drive_cleanup_pending: 0 })
  })

  it('never retires another student’s certificate that happens to share the achievement id', async () => {
    const a = cert({ achievement_id: 'shared', student_id: A })
    const b = cert({ achievement_id: 'shared', student_id: B })
    await dbOf().finalizeUpload(a.upload_id, 'drive-a', 'f')
    await dbOf().finalizeUpload(b.upload_id, 'drive-b', 'f')
    expect(statusOf(a.id).storage_status).toBe('stored')
    expect(statusOf(b.id).storage_status).toBe('stored')
  })

  it('refuses unknown uploads and ones that are not pending', async () => {
    await expect(dbOf().finalizeUpload(crypto.randomUUID(), 'x', 'f')).rejects.toMatchObject({ code: 'upload_not_found' })
    const failed = cert({ achievement_id: 'fin-4', storage_status: 'failed' })
    await expect(dbOf().finalizeUpload(failed.upload_id, 'x', 'f')).rejects.toMatchObject({ code: 'upload_not_pending' })
  })

  it('leaves the old certificate alone if the new upload was closed before it could be stored (a lost race)', async () => {
    const old = cert({ achievement_id: 'race', storage_status: 'stored', drive_file_id: 'drive-old', uploaded_at: NOW })
    const fresh = cert({ achievement_id: 'race' })
    // Between the Worker reading the pending row and writing, the row is closed (for example by clean-up).
    const real = db.sqlite.prepare.bind(db.sqlite)
    let closed = false
    db.sqlite.prepare = ((sql: string) => {
      if (!closed && /storage_status = 'replaced'/.test(sql)) {
        closed = true
        db.exec("UPDATE certificate_files SET storage_status = 'failed' WHERE id = ?", fresh.id)
      }
      return real(sql)
    }) as typeof db.sqlite.prepare
    await expect(dbOf().finalizeUpload(fresh.upload_id, 'drive-new', 'f')).rejects.toMatchObject({ code: 'upload_not_pending' })
    expect(statusOf(old.id)).toEqual({ storage_status: 'stored', drive_cleanup_pending: 0 })
  })

  it('rolls back completely if any part fails', async () => {
    const first = cert({ achievement_id: 'rollback' })
    await dbOf().finalizeUpload(first.upload_id, 'drive-1', 'f')
    const second = cert({ achievement_id: 'rollback' })
    db.failNext((c) => c.kind === 'batch', 1)
    await expect(dbOf().finalizeUpload(second.upload_id, 'drive-2', 'f')).rejects.toBeTruthy()
    expect(statusOf(first.id).storage_status).toBe('stored')
    expect(statusOf(second.id).storage_status).toBe('pending')
  })
})
