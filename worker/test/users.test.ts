import { beforeEach, describe, expect, it } from 'vitest'
import { Db } from '../src/db'
import { IDS, PASSWORD, body, emailOf, makeWorld, tokenOf, upload } from './harness'
import type { Who, World } from './harness'

let w: World
beforeEach(async () => {
  w = await makeWorld()
})

const login = (email: string, password: string) => w.send('POST', '/api/auth/login', null, { email, password })
const NEW_FACULTY = { role: 'faculty', email: 'dr.new@rajalakshmi.edu.in', fullName: 'Dr New Faculty', department: 'MECH', designation: 'Assistant Professor', reviewDepartments: ['MECH', 'CIVIL'], password: 'Facult1Pass' }

describe('who may manage accounts', () => {
  const attempts = (who: Who | null) => [
    () => w.request('/api/admin/users', who),
    () => w.send('POST', '/api/admin/users', who, NEW_FACULTY),
    () => w.send('PATCH', `/api/admin/users/${IDS.aarav}`, who, { fullName: 'Changed' }),
    () => w.send('POST', `/api/admin/users/${IDS.aarav}/reset-password`, who, { newPassword: 'Hijack3dPass' }),
    () => w.request(`/api/admin/users/${IDS.anand}`, who, { method: 'DELETE' }),
    () => w.request('/api/admin/audit', who),
  ]

  it('refuses a student and a member of faculty on every account route, changing nothing', async () => {
    const before = w.db.rows('SELECT id, role, status, full_name, password_hash FROM users ORDER BY id')
    for (const who of ['aarav', 'meera'] as const) {
      for (const attempt of attempts(who)) expect((await attempt()).status).toBe(403)
    }
    expect(w.db.rows('SELECT id, role, status, full_name, password_hash FROM users ORDER BY id')).toEqual(before)
  })

  it('refuses a request with no sign-in', async () => {
    for (const attempt of attempts(null)) expect((await attempt()).status).toBe(401)
  })

  it('refuses a deactivated administrator', async () => {
    w.setUser('admin', { status: 'inactive' })
    expect((await w.request('/api/admin/users', 'admin')).status).toBe(403)
  })

  it('lets an administrator in', async () => {
    for (const attempt of [() => w.request('/api/admin/users', 'admin'), () => w.request('/api/admin/audit', 'admin')]) expect((await attempt()).status).toBe(200)
  })
})

describe('listing accounts', () => {
  it('lists everyone without ever including a password hash', async () => {
    const res = await w.request('/api/admin/users', 'admin')
    const out = await body(res)
    expect(out.total).toBe(7)
    expect(out.users).toHaveLength(7)
    expect(JSON.stringify(out)).not.toMatch(/pbkdf2|password/i)
    expect(out.users.find((u: { id: string }) => u.id === IDS.meera)).toMatchObject({ role: 'faculty', department: 'CSE', reviewDepartments: ['CSE', 'AIDS'], designation: 'Professor' })
  })

  it('filters by role, status, department and search text', async () => {
    const ids = async (query: string) => (await body(await w.request(`/api/admin/users?${query}`, 'admin'))).users.map((u: { id: string }) => u.id).sort()
    expect(await ids('role=student')).toEqual([IDS.aarav, IDS.diya, IDS.ece].sort())
    expect(await ids('role=faculty&status=inactive')).toEqual([IDS.suresh])
    expect(await ids('department=ECE')).toEqual([IDS.ece, IDS.anand].sort())
    expect(await ids('q=0417')).toEqual([IDS.aarav])
    expect(await ids('q=MEERA')).toEqual([IDS.meera])
    expect(await ids('q=%25')).toEqual([]) // "%" is searched for literally, not as a wildcard
  })

  it('pages through results', async () => {
    const page = await body(await w.request('/api/admin/users?limit=3&offset=0', 'admin'))
    const next = await body(await w.request('/api/admin/users?limit=3&offset=3', 'admin'))
    expect(page.users).toHaveLength(3)
    expect(next.users).toHaveLength(3)
    expect(page.total).toBe(7)
    expect(new Set([...page.users, ...next.users].map((u: { id: string }) => u.id)).size).toBe(6)
  })

  it('cannot be tricked into SQL by a search term', async () => {
    const res = await w.request(`/api/admin/users?q=${encodeURIComponent("' OR 1=1; DROP TABLE users; --")}`, 'admin')
    expect(res.status).toBe(200)
    expect((await body(res)).users).toHaveLength(0)
    expect(w.db.rows('SELECT COUNT(*) AS n FROM users')[0]).toEqual({ n: 7 })
  })
})

describe('creating staff accounts', () => {
  it('creates a faculty account that can sign in, with the details given', async () => {
    const res = await w.send('POST', '/api/admin/users', 'admin', NEW_FACULTY)
    expect(res.status).toBe(201)
    expect((await body(res)).user).toMatchObject({ role: 'faculty', status: 'active', department: 'MECH', reviewDepartments: ['MECH', 'CIVIL'], designation: 'Assistant Professor' })
    expect((await login(NEW_FACULTY.email, NEW_FACULTY.password)).status).toBe(200)
  })

  it('creates an administrator', async () => {
    const res = await w.send('POST', '/api/admin/users', 'admin', { role: 'admin', email: 'second.admin@rajalakshmi.edu.in', fullName: 'Second Admin', designation: 'Deputy Registrar', password: 'Adm1nPassword' })
    expect(res.status).toBe(201)
    expect((await body(res)).user).toMatchObject({ role: 'admin', department: null })
  })

  it('never creates a student here: students register themselves', async () => {
    const res = await w.send('POST', '/api/admin/users', 'admin', { ...NEW_FACULTY, role: 'student' })
    expect(res.status).toBe(400)
    expect((await body(res)).error.field).toBe('role')
  })

  it.each([
    ['an outside email', { email: 'dr.new@gmail.com' }, 'email'],
    ['no department for faculty', { department: undefined }, 'department'],
    ['no designation', { designation: '' }, 'designation'],
    ['a weak password', { password: 'password' }, 'password'],
    ['a review department that is not text', { reviewDepartments: [1, 2] }, 'department'],
  ])('refuses %s', async (_label, over, field) => {
    const res = await w.send('POST', '/api/admin/users', 'admin', { ...NEW_FACULTY, ...over })
    expect(res.status).toBe(400)
    expect((await body(res)).error.field).toBe(field)
  })

  it('refuses an email that is already in use', async () => {
    const res = await w.send('POST', '/api/admin/users', 'admin', { ...NEW_FACULTY, email: emailOf('meera') })
    expect(res.status).toBe(409)
    expect((await body(res)).error).toMatchObject({ code: 'duplicate_email', field: 'email' })
  })
})

describe('editing, approving and deactivating', () => {
  const patch = (id: string, payload: Record<string, unknown>, who: Who = 'admin') => w.send('PATCH', `/api/admin/users/${id}`, who, payload)

  it('approves a pending student, who can then sign in', async () => {
    // With registration open, signing in would let a waiting student straight in, so approval has to be switched on here.
    const strict = await makeWorld({ REGISTRATION_MODE: 'approval' })
    const signIn = () => strict.send('POST', '/api/auth/login', null, { email: emailOf('aarav'), password: PASSWORD })
    strict.setUser('aarav', { status: 'pending' })
    expect((await body(await signIn())).error.code).toBe('account_pending')
    const res = await strict.send('PATCH', `/api/admin/users/${IDS.aarav}`, 'admin', { status: 'active' })
    expect(res.status).toBe(200)
    expect((await body(res)).user).toMatchObject({ status: 'active', active: true })
    expect((await signIn()).status).toBe(200)
  })

  it('deactivates an account at once: the open session stops working, and so does signing in', async () => {
    expect((await w.request('/api/auth/me', 'aarav')).status).toBe(200)
    expect((await patch(IDS.aarav, { status: 'inactive' })).status).toBe(200)
    expect((await w.request('/api/auth/me', 'aarav')).status).toBe(401) // the session itself is gone
    expect((await body(await login(emailOf('aarav'), PASSWORD))).error.code).toBe('account_inactive')
    expect((await patch(IDS.aarav, { status: 'active' })).status).toBe(200)
    expect((await login(emailOf('aarav'), PASSWORD)).status).toBe(200)
  })

  it('keeps the records of a deactivated student', async () => {
    await patch(IDS.aarav, { status: 'inactive' })
    expect(w.db.rows('SELECT 1 FROM users WHERE id = ?', IDS.aarav)).toHaveLength(1)
  })

  it('corrects a name, department, year and section, and moves a faculty member’s review scope immediately', async () => {
    const student = await patch(IDS.aarav, { fullName: '  Aarav  M Menon ', department: 'AIDS', year: 4, section: 'B' })
    expect((await body(student)).user).toMatchObject({ fullName: 'Aarav M Menon', department: 'AIDS', year: 4, section: 'B' })
    const faculty = await patch(IDS.meera, { reviewDepartments: ['CSE'], designation: 'Head of Department' })
    expect((await body(faculty)).user).toMatchObject({ reviewDepartments: ['CSE'], designation: 'Head of Department' })
  })

  it('never changes identity fields: email, register number, password hash and id are not editable', async () => {
    const before = w.user('aarav')
    const res = await patch(IDS.aarav, { email: 'someone.else@rajalakshmi.edu.in', registerNumber: 'HIJACK1', password_hash: 'x', password: 'Hijack3dPass', id: IDS.admin, fullName: 'Aarav Menon' })
    expect(res.status).toBe(200)
    const after = w.user('aarav')
    for (const column of ['id', 'email', 'register_number', 'password_hash']) expect(after[column]).toBe(before[column])
  })

  it('refuses nonsense for each field', async () => {
    for (const payload of [{ fullName: '' }, { department: '<b>' }, { year: 9 }, { section: 'S'.repeat(20) }, { status: 'pending' }, { status: 'deleted' }, { role: 'superuser' }]) {
      expect((await patch(IDS.aarav, payload)).status, JSON.stringify(payload)).toBe(400)
    }
  })

  it('does not give fields to roles that do not have them', async () => {
    expect((await patch(IDS.aarav, { designation: 'Dean' })).status).toBe(400)
    expect((await patch(IDS.aarav, { reviewDepartments: ['CSE'] })).status).toBe(400)
    expect((await patch(IDS.meera, { year: 2 })).status).toBe(400)
    expect((await patch(IDS.admin, { department: 'CSE' })).status).toBe(400)
  })

  it('moves staff between faculty and administrator, signing them out so the new role applies', async () => {
    const res = await patch(IDS.meera, { role: 'admin' })
    expect((await body(res)).user.role).toBe('admin')
    expect((await w.request('/api/auth/me', 'meera')).status).toBe(401)
    const login2 = await w.send('POST', '/api/auth/login', null, { email: emailOf('meera'), password: PASSWORD, portal: 'admin' })
    expect(login2.status).toBe(200)
  })

  it('never turns a student into staff', async () => {
    const res = await patch(IDS.aarav, { role: 'faculty' })
    expect(res.status).toBe(400)
    expect(w.user('aarav').role).toBe('student')
  })

  it('answers 404 for an account that does not exist or an id that is not an id', async () => {
    expect((await patch('99999999-9999-4999-8999-999999999999', { fullName: 'Ghost' })).status).toBe(404)
    expect((await patch('not-an-id', { fullName: 'Ghost' })).status).toBe(404)
  })

  it('does nothing, harmlessly, when asked to change nothing', async () => {
    expect((await patch(IDS.aarav, {})).status).toBe(200)
  })
})

describe('keeping the institution from being locked out', () => {
  const patch = (id: string, payload: Record<string, unknown>, who: Who = 'admin') => w.send('PATCH', `/api/admin/users/${id}`, who, payload)
  const addAdmin = async () => {
    const created = await body(await w.send('POST', '/api/admin/users', 'admin', { role: 'admin', email: 'second.admin@rajalakshmi.edu.in', fullName: 'Second Admin', designation: 'Deputy', password: 'Adm1nPassword' }))
    const token = (await body(await w.send('POST', '/api/auth/login', null, { email: 'second.admin@rajalakshmi.edu.in', password: 'Adm1nPassword' }))).token as string
    return { id: created.user.id as string, token }
  }
  const asToken = (id: string, token: string, payload: Record<string, unknown>) =>
    w.request(`/api/admin/users/${id}`, null, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) })

  it('stops an administrator deactivating or demoting themselves', async () => {
    for (const payload of [{ status: 'inactive' }, { role: 'faculty' }]) {
      const res = await patch(IDS.admin, payload)
      expect(res.status).toBe(409)
      expect((await body(res)).error.code).toBe('cannot_change_self')
    }
    expect(w.user('admin')).toMatchObject({ role: 'admin', status: 'active' })
  })

  it('lets one administrator switch off another while one remains', async () => {
    const second = await addAdmin()
    expect((await patch(second.id, { status: 'inactive' })).status).toBe(200)
  })

  it('keeps an administrator active even if two switch each other off at the same moment', async () => {
    const second = await addAdmin()
    const results = await Promise.all([patch(second.id, { status: 'inactive' }), asToken(IDS.admin, second.token, { status: 'inactive' })])
    // One succeeds. The other is refused (or has already been signed out by the first).
    expect(results.map((r) => r.status).sort()[0]).toBe(200)
    expect(w.db.rows<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'")[0].n).toBe(1)
  })

  describe('the database rule behind it (checked inside the UPDATE itself, so it cannot be raced)', () => {
    const dbOf = () => new Db(w.db, w.deps.now)

    it('lets the first administrator be switched off while another is active, and refuses the next one', async () => {
      const second = await addAdmin()
      const db = dbOf()
      expect(await db.updateUser(IDS.admin, { status: 'inactive' }, { requireOtherActiveAdmin: true })).toMatchObject({ status: 'inactive' })
      expect(await db.updateUser(second.id, { status: 'inactive' }, { requireOtherActiveAdmin: true })).toBeNull()
      expect(w.db.rows<{ n: number }>("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND status = 'active'")[0].n).toBe(1)
    })

    it('does the same for demotion', async () => {
      const second = await addAdmin()
      const db = dbOf()
      expect(await db.updateUser(IDS.admin, { role: 'faculty', department: 'CSE' }, { requireOtherActiveAdmin: true })).toMatchObject({ role: 'faculty' })
      expect(await db.updateUser(second.id, { role: 'faculty', department: 'CSE' }, { requireOtherActiveAdmin: true })).toBeNull()
      expect(w.user('admin')).toMatchObject({ role: 'faculty' })
    })

    it('does not count a deactivated administrator as "another administrator"', async () => {
      const second = await addAdmin()
      w.db.exec("UPDATE users SET status = 'inactive' WHERE id = ?", second.id)
      expect(await dbOf().updateUser(IDS.admin, { status: 'inactive' }, { requireOtherActiveAdmin: true })).toBeNull()
    })
  })
})
describe('resetting a password', () => {
  const reset = (id: string, newPassword: unknown, who: Who = 'admin') => w.send('POST', `/api/admin/users/${id}/reset-password`, who, { newPassword })

  it('sets a new password, ends every open session of that account, and the old password stops working', async () => {
    expect((await w.request('/api/auth/me', 'aarav')).status).toBe(200)
    expect((await reset(IDS.aarav, 'Fr3shPassword')).status).toBe(200)
    expect((await w.request('/api/auth/me', 'aarav')).status).toBe(401)
    expect((await login(emailOf('aarav'), PASSWORD)).status).toBe(401)
    expect((await login(emailOf('aarav'), 'Fr3shPassword')).status).toBe(200)
  })

  it('applies the password policy, and leaves everything alone when it is refused', async () => {
    expect((await reset(IDS.aarav, 'weak')).status).toBe(400)
    expect((await reset(IDS.aarav, undefined)).status).toBe(400)
    expect((await w.request('/api/auth/me', 'aarav')).status).toBe(200)
    expect((await login(emailOf('aarav'), PASSWORD)).status).toBe(200)
  })

  it('is for administrators only, and for accounts that exist', async () => {
    expect((await reset(IDS.diya, 'Fr3shPassword', 'aarav')).status).toBe(403)
    expect((await reset(IDS.aarav, 'Fr3shPassword', 'meera')).status).toBe(403)
    expect((await reset('99999999-9999-4999-8999-999999999999', 'Fr3shPassword')).status).toBe(404)
  })
})

describe('deleting a faculty account', () => {
  const remove = (id: string, who: Who | null = 'admin') => w.request(`/api/admin/users/${id}`, who, { method: 'DELETE' })
  const count = () => w.db.rows<{ n: number }>('SELECT COUNT(*) AS n FROM users')[0].n

  it('removes the account and its sign-ins, and the person can no longer sign in', async () => {
    expect((await w.request('/api/auth/me', 'meera')).status).toBe(200)
    const res = await remove(IDS.meera)
    expect(res.status).toBe(200)
    expect(await body(res)).toEqual({ deleted: true })
    expect(w.db.rows('SELECT 1 FROM users WHERE id = ?', IDS.meera)).toHaveLength(0)
    expect(w.db.rows('SELECT 1 FROM sessions WHERE user_id = ?', IDS.meera)).toHaveLength(0)
    expect((await w.request('/api/auth/me', 'meera')).status).toBe(401)
    expect((await login(emailOf('meera'), PASSWORD)).status).toBe(401)
    expect(count()).toBe(6)
  })

  it('records who was removed, and by whom, without any password', async () => {
    await remove(IDS.meera)
    const { entries } = await body(await w.request('/api/admin/audit', 'admin'))
    expect(entries[0]).toMatchObject({ action: 'faculty_deleted', actorId: IDS.admin, targetId: IDS.meera })
    expect(entries[0].detail).toContain('Dr Meera')
    expect(entries[0].detail).toContain(emailOf('meera'))
    expect(JSON.stringify(entries)).not.toMatch(/pbkdf2|password/i)
  })

  it('works for a deactivated faculty account too', async () => {
    expect((await remove(IDS.suresh)).status).toBe(200)
    expect(count()).toBe(6)
  })

  it.each([
    ['a student', IDS.aarav],
    ['an administrator', IDS.admin],
  ])('refuses to delete %s, who is deactivated instead', async (_label, id) => {
    const before = w.db.rows('SELECT * FROM users ORDER BY id')
    const res = await remove(id)
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('not_deletable')
    expect(w.db.rows('SELECT * FROM users ORDER BY id')).toEqual(before)
  })

  it('keeps every certificate and every other account', async () => {
    expect((await upload(w, { achievementId: 'ach-keep' })).status).toBe(201)
    const before = w.certs.map((c) => [c.id, c.storage_status, c.drive_file_id])
    await remove(IDS.meera)
    expect(w.certs.map((c) => [c.id, c.storage_status, c.drive_file_id])).toEqual(before)
    expect(w.db.rows("SELECT id FROM users WHERE id <> ? ORDER BY id", IDS.meera).map((r) => (r as { id: string }).id).sort()).toEqual(Object.values(IDS).filter((id) => id !== IDS.meera).sort())
  })

  it('says so for an account that does not exist, or an id that is not one', async () => {
    expect((await remove('99999999-9999-4999-8999-999999999999')).status).toBe(404)
    expect((await remove('not-an-id')).status).toBe(404)
    expect((await remove(IDS.meera)).status).toBe(200)
    expect((await remove(IDS.meera)).status).toBe(404)
    expect(count()).toBe(6)
  })

  it('is enforced in the database statement itself: it can only ever remove a faculty account', async () => {
    const db = new Db(w.db, w.deps.now)
    expect(await db.deleteFaculty(IDS.aarav)).toBe(false)
    expect(await db.deleteFaculty(IDS.admin)).toBe(false)
    expect(count()).toBe(7)
    expect(await db.deleteFaculty(IDS.anand)).toBe(true)
    expect(count()).toBe(6)
  })

  it('is refused for faculty, students and anyone not signed in', async () => {
    expect((await remove(IDS.anand, 'meera')).status).toBe(403)
    expect((await remove(IDS.anand, 'aarav')).status).toBe(403)
    expect((await remove(IDS.anand, null)).status).toBe(401)
    expect(count()).toBe(7)
  })
})

describe('the life of a faculty account, from the administrator’s side', () => {
  const mail = 'dr.new@rajalakshmi.edu.in'
  const admin = (method: string, path: string, payload?: unknown) => (payload === undefined ? w.request(path, 'admin', { method }) : w.send(method, path, 'admin', payload))

  it('is created, signs in as faculty only, is edited, reset, switched off and on, and deleted', async () => {
    // Created: the role is fixed, the password is stored only as a hash, and the list never shows it.
    const created = await admin('POST', '/api/admin/users', NEW_FACULTY)
    expect(created.status).toBe(201)
    const user = (await body(created)).user
    expect(user).toMatchObject({ role: 'faculty', status: 'active', department: 'MECH', email: mail })
    expect(JSON.stringify(user)).not.toMatch(/pbkdf2|password/i)
    expect(w.db.rows<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = ?', mail)[0].password_hash).not.toContain('Facult1Pass')

    // Signs in on the faculty page, and nowhere else.
    expect((await login(mail, 'Facult1Pass')).status).toBe(200)
    expect((await w.send('POST', '/api/auth/login', null, { email: mail, password: 'Facult1Pass', portal: 'admin' })).status).toBe(403)
    const session = (await body(await w.send('POST', '/api/auth/login', null, { email: mail, password: 'Facult1Pass', portal: 'faculty' }))).token as string
    const asFaculty = (path: string, init: RequestInit = {}) => w.request(path, null, { ...init, headers: { Authorization: `Bearer ${session}`, ...(init.headers as Record<string, string>) } })
    expect((await asFaculty('/api/certificates')).status).toBe(200)
    for (const path of ['/api/admin/users', '/api/admin/audit', '/api/admin/stats', '/api/storage/status']) expect((await asFaculty(path)).status).toBe(403)
    expect((await asFaculty(`/api/admin/users/${user.id}`, { method: 'DELETE' })).status).toBe(403)

    // Edited.
    const edited = await admin('PATCH', `/api/admin/users/${user.id}`, { fullName: 'Dr New Faculty Kumar', department: 'AIDS', designation: 'Professor', reviewDepartments: ['AIDS', 'CSE'] })
    expect((await body(edited)).user).toMatchObject({ fullName: 'Dr New Faculty Kumar', department: 'AIDS', designation: 'Professor', reviewDepartments: ['AIDS', 'CSE'], role: 'faculty' })

    // Password reset: the old one stops working, the new one works, and open sessions end.
    expect((await admin('POST', `/api/admin/users/${user.id}/reset-password`, { newPassword: 'Br4ndNewPass' })).status).toBe(200)
    expect((await asFaculty('/api/certificates')).status).toBe(401)
    expect((await login(mail, 'Facult1Pass')).status).toBe(401)
    expect((await login(mail, 'Br4ndNewPass')).status).toBe(200)

    // Switched off and on.
    expect((await admin('PATCH', `/api/admin/users/${user.id}`, { status: 'inactive' })).status).toBe(200)
    expect((await body(await login(mail, 'Br4ndNewPass'))).error.code).toBe('account_inactive')
    expect((await admin('PATCH', `/api/admin/users/${user.id}`, { status: 'active' })).status).toBe(200)
    expect((await login(mail, 'Br4ndNewPass')).status).toBe(200)

    // Deleted.
    expect((await admin('DELETE', `/api/admin/users/${user.id}`)).status).toBe(200)
    expect((await login(mail, 'Br4ndNewPass')).status).toBe(401)
    expect((await body(await w.request('/api/admin/users?role=faculty', 'admin'))).users.some((u: { email: string }) => u.email === mail)).toBe(false)
  })

  it('cannot be created with a weak password, an email outside the college, or a role the request invents', async () => {
    expect((await admin('POST', '/api/admin/users', { ...NEW_FACULTY, password: 'weak' })).status).toBe(400)
    expect((await admin('POST', '/api/admin/users', { ...NEW_FACULTY, email: 'dr.new@gmail.com' })).status).toBe(400)
    expect((await admin('POST', '/api/admin/users', { ...NEW_FACULTY, role: 'student' })).status).toBe(400)
    expect(w.db.rows('SELECT 1 FROM users WHERE email = ?', mail)).toHaveLength(0)
  })
})

describe('the audit trail', () => {
  it('records who changed which account, without recording any password', async () => {
    await w.send('POST', '/api/admin/users', 'admin', NEW_FACULTY)
    await w.send('PATCH', `/api/admin/users/${IDS.aarav}`, 'admin', { status: 'inactive' })
    await w.send('POST', `/api/admin/users/${IDS.diya}/reset-password`, 'admin', { newPassword: 'Fr3shPassword' })
    const { entries } = await body(await w.request('/api/admin/audit', 'admin'))
    expect(entries.map((e: { action: string }) => e.action)).toEqual(['password_reset', 'account_deactivated', 'account_created'])
    expect(entries[1]).toMatchObject({ actorId: IDS.admin, targetId: IDS.aarav })
    expect(JSON.stringify(entries)).not.toMatch(/Fr3shPassword|Facult1Pass|pbkdf2/)
  })

  it('names an approval as an approval', async () => {
    w.setUser('aarav', { status: 'pending' })
    await w.send('PATCH', `/api/admin/users/${IDS.aarav}`, 'admin', { status: 'active' })
    const { entries } = await body(await w.request('/api/admin/audit', 'admin'))
    expect(entries[0].action).toBe('account_approved')
  })
})

void tokenOf
