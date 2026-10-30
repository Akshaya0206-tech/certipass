import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PermissionError } from './auth/actor'
import { clearToken, isServerId, rememberUser, saveToken, toAppUser } from './auth/backend'
import type { BackendUser } from './auth/backend'
import { endSession, startSession } from './auth/session'
import { refreshDirectory } from './accountApi'
import { AdminError, createFacultyAccount, deleteFacultyAccount, resetFacultyPassword, setUserActive, updateUserByAdmin, validateFacultyInput } from './adminService'
import { getState } from './store'

const API = 'https://api.test'
const FUTURE = new Date(Date.now() + 8 * 3_600_000).toISOString()
const ADMIN = '66666666-6666-4666-8666-666666666666'
const STUDENT = '11111111-1111-4111-8111-111111111111'
const FACULTY = '44444444-4444-4444-8444-444444444444'

const account = (over: Partial<BackendUser> = {}): BackendUser => ({
  id: STUDENT,
  email: 'aarav.menon@rajalakshmi.edu.in',
  username: 'aarav.menon@rajalakshmi.edu.in',
  role: 'student',
  status: 'active',
  active: true,
  fullName: 'Aarav Menon',
  department: 'CSE',
  reviewDepartments: null,
  registerNumber: '241801058',
  year: 3,
  section: 'A',
  designation: null,
  createdAt: '2026-10-01T00:00:00Z',
  ...over,
})
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const refuse = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => json({ error: { code, message, retryable: false, ...extra } }, status)

type Handler = (url: string, init: RequestInit) => Response
let handler: Handler
let calls: { url: string; method: string; auth?: string; body: Record<string, unknown> | null }[]

function signInAsAdmin() {
  saveToken('tok-admin-0123456789abcdef0123456789abcd', FUTURE)
  rememberUser(toAppUser(account({ id: ADMIN, role: 'admin', fullName: 'Records Admin', department: null, registerNumber: null, year: null, section: null, designation: 'Records Officer', email: 'admin@rajalakshmi.edu.in' })))
  startSession(ADMIN, 'admin')
}

beforeEach(() => {
  faculty = newFaculty()
  endSession()
  clearToken()
  calls = []
  handler = () => refuse(404, 'not_found', 'Not found.')
  vi.stubEnv('VITE_CERT_API_URL', API)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const headers = (init.headers ?? {}) as Record<string, string>
      calls.push({ url: url.replace(API, ''), method: init.method ?? 'GET', auth: headers.Authorization, body: init.body ? JSON.parse(String(init.body)) : null })
      return handler(url.replace(API, ''), init)
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

let counter = 0
/** A new faculty form each time, with an email no earlier test left in the local list. */
const newFaculty = () => ({
  fullName: 'Dr New Faculty',
  username: `dr.new${++counter}@rajalakshmi.edu.in`,
  department: 'CSE',
  designation: 'Assistant Professor',
  reviewDepartments: ['CSE'],
  password: 'Facult1Pass',
  confirmPassword: 'Facult1Pass',
})
let faculty = newFaculty()

describe('creating a faculty account (through the server)', () => {
  it('asks the server to create it and puts the result in the admin’s list', async () => {
    signInAsAdmin()
    handler = () => json({ user: account({ id: FACULTY, role: 'faculty', fullName: 'Dr New Faculty', email: faculty.username, designation: 'Assistant Professor', reviewDepartments: ['CSE'], registerNumber: null, year: null, section: null }) }, 201)
    const created = await createFacultyAccount(faculty)

    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ url: '/api/admin/users', method: 'POST', auth: 'Bearer tok-admin-0123456789abcdef0123456789abcd' })
    expect(calls[0].body).toMatchObject({ role: 'faculty', email: faculty.username, fullName: 'Dr New Faculty', department: 'CSE', designation: 'Assistant Professor', reviewDepartments: ['CSE'], password: 'Facult1Pass' })
    expect(created).toMatchObject({ id: FACULTY, role: 'faculty' })
    expect(getState().users.find((u) => u.id === FACULTY)).toMatchObject({ role: 'faculty', username: faculty.username })
  })

  it('keeps the password out of everything stored in the browser', async () => {
    signInAsAdmin()
    handler = () => json({ user: account({ id: FACULTY, role: 'faculty', email: faculty.username, designation: 'Assistant Professor', registerNumber: null, year: null }) }, 201)
    await createFacultyAccount(faculty)
    expect(JSON.stringify(getState())).not.toContain('Facult1Pass')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Facult1Pass')
  })

  it('checks the form before asking the server', async () => {
    signInAsAdmin()
    await expect(createFacultyAccount({ ...faculty, password: 'weak', confirmPassword: 'weak' })).rejects.toBeInstanceOf(AdminError)
    await expect(createFacultyAccount({ ...faculty, department: '' })).rejects.toBeInstanceOf(AdminError)
    expect(calls).toHaveLength(0)
  })

  it('reports an email the server says is taken against the username field', async () => {
    signInAsAdmin()
    handler = () => refuse(409, 'duplicate_email', 'An account with this email already exists. Sign in instead.', { field: 'email' })
    const err = (await createFacultyAccount(faculty).catch((e) => e)) as AdminError
    expect(err).toMatchObject({ code: 'duplicate', field: 'username' })
  })

  it('reports a refusal by the server (not an administrator) as "not allowed"', async () => {
    signInAsAdmin()
    handler = () => refuse(403, 'forbidden', 'Only administrators can manage accounts.')
    expect(((await createFacultyAccount(faculty).catch((e) => e)) as AdminError).code).toBe('not_allowed')
  })

  it('does nothing without an administrator signed in, not even a network call', async () => {
    await expect(createFacultyAccount(faculty)).rejects.toBeInstanceOf(PermissionError)
    expect(calls).toHaveLength(0)
  })
})

describe('approving, activating and deactivating (through the server)', () => {
  beforeEach(() => {
    signInAsAdmin()
    rememberUser(toAppUser(account({ status: 'pending', active: false })))
  })

  it('treats "activate" on a pending student as the approval, and shows the result', async () => {
    expect(getState().users.find((u) => u.id === STUDENT)).toMatchObject({ active: false, pending: true })
    handler = () => json({ user: account({ status: 'active', active: true }) })
    const approved = await setUserActive(STUDENT, true)
    expect(calls[0]).toMatchObject({ url: `/api/admin/users/${STUDENT}`, method: 'PATCH', body: { status: 'active' } })
    expect(approved).toMatchObject({ active: true })
    expect(getState().users.find((u) => u.id === STUDENT)).toMatchObject({ active: true })
    expect(getState().users.find((u) => u.id === STUDENT)!.pending).toBeFalsy()
  })

  it('deactivates through the server', async () => {
    handler = () => json({ user: account({ status: 'inactive', active: false }) })
    rememberUser(toAppUser(account()))
    await setUserActive(STUDENT, false)
    expect(calls[0].body).toEqual({ status: 'inactive' })
    expect(getState().users.find((u) => u.id === STUDENT)).toMatchObject({ active: false })
  })

  it('leaves the list unchanged, and says why, when the server refuses', async () => {
    handler = () => refuse(409, 'cannot_change_self', 'You can’t deactivate or change the role of the account you’re signed in with.')
    const err = (await setUserActive(STUDENT, true).catch((e) => e)) as AdminError
    expect(err).toMatchObject({ code: 'not_allowed' })
    expect(getState().users.find((u) => u.id === STUDENT)).toMatchObject({ active: false, pending: true })
  })

  it('refuses locally to deactivate the administrator’s own account, before any network call', async () => {
    await expect(setUserActive(ADMIN, false)).rejects.toMatchObject({ code: 'not_allowed' })
    expect(calls).toHaveLength(0)
  })

  it('still manages the prototype’s demo accounts locally, without calling the server', async () => {
    const demo = getState().users.find((u) => u.role === 'student' && !isServerId(u.id) && u.active)!
    const out = await setUserActive(demo.id, false)
    expect(out.active).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('editing an account (through the server)', () => {
  beforeEach(() => {
    signInAsAdmin()
    rememberUser(toAppUser(account()))
    rememberUser(toAppUser(account({ id: FACULTY, role: 'faculty', email: 'dr.meera@rajalakshmi.edu.in', fullName: 'Dr Meera', designation: 'Professor', reviewDepartments: ['CSE'], registerNumber: null, year: null, section: null })))
  })
  const edit = { fullName: 'Aarav M Menon', department: 'CSE', year: '4', section: 'B', designation: '', reviewDepartments: [] as string[] }

  it('sends a student’s editable fields only', async () => {
    handler = () => json({ user: account({ fullName: 'Aarav M Menon', year: 4, section: 'B' }) })
    const updated = await updateUserByAdmin(STUDENT, edit)
    expect(calls[0]).toMatchObject({ url: `/api/admin/users/${STUDENT}`, method: 'PATCH', body: { fullName: 'Aarav M Menon', department: 'CSE', year: 4, section: 'B' } })
    expect(Object.keys(calls[0].body!).sort()).toEqual(['department', 'fullName', 'section', 'year'])
    expect(updated).toMatchObject({ fullName: 'Aarav M Menon' })
  })

  it('sends a faculty member’s editable fields only', async () => {
    handler = () => json({ user: account({ id: FACULTY, role: 'faculty', designation: 'Head of Department', reviewDepartments: ['CSE', 'AIDS'], registerNumber: null, year: null, section: null }) })
    await updateUserByAdmin(FACULTY, { fullName: 'Dr Meera', department: 'CSE', year: '', section: '', designation: 'Head of Department', reviewDepartments: ['CSE', 'AIDS'] })
    expect(Object.keys(calls[0].body!).sort()).toEqual(['department', 'designation', 'fullName', 'reviewDepartments'])
  })

  it('never sends identity fields: email, register number, role or password', async () => {
    handler = () => json({ user: account() })
    await updateUserByAdmin(STUDENT, edit)
    expect(JSON.stringify(calls[0].body)).not.toMatch(/email|registerNumber|role|password|id"/i)
  })

  it('reports a server refusal', async () => {
    handler = () => refuse(400, 'invalid_input', 'Select a department.', { field: 'department' })
    const err = (await updateUserByAdmin(STUDENT, edit).catch((e) => e)) as AdminError
    expect(err).toMatchObject({ code: 'invalid', field: 'department' })
  })
})

describe('resetting a faculty password and deleting a faculty account (through the server)', () => {
  beforeEach(() => {
    signInAsAdmin()
    rememberUser(toAppUser(account()))
    rememberUser(toAppUser(account({ id: FACULTY, role: 'faculty', email: 'dr.meera@rajalakshmi.edu.in', fullName: 'Dr Meera', designation: 'Professor', reviewDepartments: ['CSE'], registerNumber: null, year: null, section: null })))
  })

  it('sends the new password to the server once, and keeps it out of everything stored in the browser', async () => {
    handler = () => json({ ok: true })
    await resetFacultyPassword(FACULTY, 'Br4ndNewPass', 'Br4ndNewPass')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ url: `/api/admin/users/${FACULTY}/reset-password`, method: 'POST', auth: 'Bearer tok-admin-0123456789abcdef0123456789abcd', body: { newPassword: 'Br4ndNewPass' } })
    expect(JSON.stringify(getState())).not.toContain('Br4ndNewPass')
    expect(JSON.stringify({ ...localStorage })).not.toContain('Br4ndNewPass')
  })

  it('checks the new password before any network call', async () => {
    for (const [pw, again] of [['', ''], ['weak', 'weak'], ['alllowercase1', 'alllowercase1'], ['Br4ndNewPass', 'Different1Pass']]) {
      await expect(resetFacultyPassword(FACULTY, pw, again)).rejects.toMatchObject({ code: 'invalid', field: 'password' })
    }
    expect(calls).toHaveLength(0)
  })

  it('only ever resets a faculty account, whoever the id belongs to', async () => {
    await expect(resetFacultyPassword(STUDENT, 'Br4ndNewPass', 'Br4ndNewPass')).rejects.toMatchObject({ code: 'not_allowed' })
    await expect(resetFacultyPassword(ADMIN, 'Br4ndNewPass', 'Br4ndNewPass')).rejects.toMatchObject({ code: 'not_allowed' })
    expect(calls).toHaveLength(0)
  })

  it('says why when the server refuses', async () => {
    handler = () => refuse(403, 'forbidden', 'Only administrators can manage accounts.')
    expect(((await resetFacultyPassword(FACULTY, 'Br4ndNewPass', 'Br4ndNewPass').catch((e) => e)) as AdminError).code).toBe('not_allowed')
  })

  it('deletes through the server and takes the account out of the list', async () => {
    handler = () => json({ deleted: true })
    await deleteFacultyAccount(FACULTY)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ url: `/api/admin/users/${FACULTY}`, method: 'DELETE', auth: 'Bearer tok-admin-0123456789abcdef0123456789abcd' })
    expect(getState().users.some((u) => u.id === FACULTY)).toBe(false)
    expect(getState().users.some((u) => u.id === STUDENT)).toBe(true)
  })

  it('keeps the account in the list when the server refuses to delete it', async () => {
    handler = () => refuse(403, 'not_deletable', 'Only faculty accounts can be deleted.')
    await expect(deleteFacultyAccount(FACULTY)).rejects.toMatchObject({ code: 'not_allowed' })
    expect(getState().users.some((u) => u.id === FACULTY)).toBe(true)
  })

  it('never deletes a student or an administrator, and makes no call for them', async () => {
    await expect(deleteFacultyAccount(STUDENT)).rejects.toMatchObject({ code: 'not_allowed' })
    await expect(deleteFacultyAccount(ADMIN)).rejects.toMatchObject({ code: 'not_allowed' })
    expect(calls).toHaveLength(0)
    expect(getState().users.some((u) => u.id === STUDENT)).toBe(true)
  })

  it('needs an administrator signed in', async () => {
    endSession()
    await expect(deleteFacultyAccount(FACULTY)).rejects.toBeInstanceOf(PermissionError)
    await expect(resetFacultyPassword(FACULTY, 'Br4ndNewPass', 'Br4ndNewPass')).rejects.toBeInstanceOf(PermissionError)
    expect(calls).toHaveLength(0)
  })

  it('asks for a college email when creating a faculty account against the server', async () => {
    expect(validateFacultyInput({ ...newFaculty(), username: 'dr.new' }, []).username).toMatch(/college email/)
    expect(validateFacultyInput({ ...newFaculty(), username: 'dr.new@rajalakshmi.edu.in' }, []).username).toBeUndefined()
  })
})

describe('loading the real list of accounts', () => {
  it('replaces the server’s accounts with its current answer and keeps the demo accounts', async () => {
    signInAsAdmin()
    rememberUser(toAppUser(account({ id: '99999999-9999-4999-8999-999999999999', fullName: 'Removed Long Ago' })))
    const demoBefore = getState().users.filter((u) => !isServerId(u.id)).length
    handler = () => json({ users: [account(), account({ id: FACULTY, role: 'faculty', email: 'dr.meera@rajalakshmi.edu.in', fullName: 'Dr Meera', designation: 'Professor', registerNumber: null, year: null, section: null })], total: 2 })
    await refreshDirectory()
    const users = getState().users
    expect(users.some((u) => u.fullName === 'Removed Long Ago')).toBe(false)
    expect(users.filter((u) => isServerId(u.id)).map((u) => u.id).sort()).toEqual([FACULTY, STUDENT].sort())
    expect(users.filter((u) => !isServerId(u.id))).toHaveLength(demoBefore)
  })

  it('pages through a long list', async () => {
    signInAsAdmin()
    const make = (n: number) => Array.from({ length: n }, (_, i) => account({ id: crypto.randomUUID(), email: `s${i}@rajalakshmi.edu.in`, registerNumber: `R${i}` }))
    handler = (url) => (url.includes('offset=0') ? json({ users: make(200), total: 250 }) : json({ users: make(50), total: 250 }))
    await refreshDirectory()
    expect(calls.map((c) => c.url)).toEqual(['/api/admin/users?limit=200&offset=0', '/api/admin/users?limit=200&offset=200'])
    expect(getState().users.filter((u) => isServerId(u.id)).length).toBeGreaterThanOrEqual(250)
  })
})
