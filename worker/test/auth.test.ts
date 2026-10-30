import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Db } from '../src/db'
import { IDS, PASSWORD, SETUP_TOKEN, body, emailOf, makeWorld, tokenOf, upload } from './harness'
import type { Who, World } from './harness'

let w: World
beforeEach(async () => {
  w = await makeWorld()
})

const login = (email: string, password: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  w.send('POST', '/api/auth/login', null, { email, password, ...extra }, headers)
const me = (token: string) => w.request('/api/auth/me', null, { headers: { Authorization: `Bearer ${token}` } })
const sessions = () => w.db.rows<{ n: number }>('SELECT COUNT(*) AS n FROM sessions')[0].n

const REG = {
  fullName: 'Priya Krishnan',
  email: 'priya.k.2024.cse@rajalakshmi.edu.in',
  password: 'Passw0rd!',
  registerNumber: '241801099',
  department: 'CSE',
  year: 2,
  section: 'A',
}
const register = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}) => w.send('POST', '/api/auth/register', null, { ...REG, ...over }, headers)

describe('signing in', () => {
  it('gives a session token that works, and never returns the password hash', async () => {
    const res = await login(emailOf('aarav'), PASSWORD)
    expect(res.status).toBe(200)
    const out = await body(res)
    expect(out.user).toMatchObject({ id: IDS.aarav, email: emailOf('aarav'), role: 'student', fullName: 'Aarav Menon', registerNumber: '2023CSE0417', department: 'CSE', active: true })
    expect(JSON.stringify(out)).not.toMatch(/pbkdf2|password_hash/)
    expect((await me(out.token)).status).toBe(200)
  })

  it('stores only a hash of the token, so a leaked database cannot be used to sign in', async () => {
    const { token } = await body(await login(emailOf('aarav'), PASSWORD))
    const stored = w.db.rows<{ token_hash: string }>('SELECT token_hash FROM sessions').map((r) => r.token_hash)
    expect(stored).not.toContain(token)
    expect(JSON.stringify(w.db.rows('SELECT * FROM sessions'))).not.toContain(token)
  })

  it('ignores capitalisation and stray spaces in the email', async () => {
    expect((await login(`  ${emailOf('aarav').toUpperCase()} `, PASSWORD)).status).toBe(200)
  })

  it('answers a wrong password and an unknown account in exactly the same way', async () => {
    const wrong = await login(emailOf('aarav'), 'Wr0ngPassword')
    const unknown = await login('nobody@rajalakshmi.edu.in', 'Wr0ngPassword')
    expect(wrong.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect((await body(wrong)).error).toEqual((await body(unknown)).error)
  })

  it('does the same amount of password work for an unknown account as for a wrong password, so timing reveals nothing', async () => {
    await login('prime-the-decoy@rajalakshmi.edu.in', 'Wr0ngPassword') // the decoy hash is made once, on first use
    const derivations = async (email: string) => {
      const spy = vi.spyOn(crypto.subtle, 'deriveBits')
      try {
        await login(email, 'Wr0ngPassword')
        return spy.mock.calls.length
      } finally {
        spy.mockRestore()
      }
    }
    expect(await derivations('nobody-at-all@rajalakshmi.edu.in')).toBe(1)
    expect(await derivations(emailOf('diya'))).toBe(1)
  })

  it('does not say whether a pending or deactivated account exists unless the password is right', async () => {
    w.setUser('aarav', { status: 'pending' })
    w.setUser('diya', { status: 'inactive' })
    expect((await body(await login(emailOf('aarav'), 'Wr0ngPassword'))).error.code).toBe('invalid_credentials')
    expect((await body(await login(emailOf('diya'), 'Wr0ngPassword'))).error.code).toBe('invalid_credentials')
  })

  describe('an account still marked as waiting for approval', () => {
    it('is told so, once the password is right, when new accounts have to be approved', async () => {
      const strict = await makeWorld({ REGISTRATION_MODE: 'approval' })
      strict.setUser('aarav', { status: 'pending' })
      const res = await strict.send('POST', '/api/auth/login', null, { email: emailOf('aarav'), password: PASSWORD })
      expect(res.status).toBe(403)
      expect((await body(res)).error.code).toBe('account_pending')
      expect(strict.db.rows<{ n: number }>('SELECT COUNT(*) AS n FROM sessions')[0].n).toBe(7)
      expect(strict.user('aarav').status).toBe('pending')
    })

    it('simply signs in when registration is open, and is activated by doing so', async () => {
      w.setUser('aarav', { status: 'pending' })
      const res = await login(emailOf('aarav'), PASSWORD)
      expect(res.status).toBe(200)
      expect((await body(res)).user).toMatchObject({ id: IDS.aarav, status: 'active', active: true })
      expect(w.user('aarav').status).toBe('active')
      expect(sessions()).toBe(8)
      expect(w.db.rows('SELECT action, actor_id, target_id, detail FROM audit_log')).toEqual([
        { action: 'account_auto_approved', actor_id: IDS.aarav, target_id: IDS.aarav, detail: 'registration is open' },
      ])
    })

    it('is not let in by a wrong password, or by the wrong sign-in page, and is left as it was', async () => {
      w.setUser('aarav', { status: 'pending' })
      expect((await login(emailOf('aarav'), 'Wr0ngPassword')).status).toBe(401)
      expect((await body(await login(emailOf('aarav'), PASSWORD, { portal: 'faculty' }))).error.code).toBe('wrong_portal')
      expect(w.user('aarav').status).toBe('pending')
      expect(w.db.rows('SELECT 1 FROM audit_log')).toHaveLength(0)
    })

    it('is not let in once an administrator has deactivated it, whatever the setting', async () => {
      w.setUser('aarav', { status: 'inactive' })
      expect((await body(await login(emailOf('aarav'), PASSWORD))).error.code).toBe('account_inactive')
      expect(w.user('aarav').status).toBe('inactive')
    })

    it('is only ever activated while it is still waiting, so a deactivation made in the meantime cannot be undone', async () => {
      const db = new Db(w.db, w.deps.now)
      w.setUser('aarav', { status: 'inactive' })
      expect(await db.activatePending(IDS.aarav)).toBe(false)
      expect(w.user('aarav').status).toBe('inactive')
      w.setUser('aarav', { status: 'pending' })
      expect(await db.activatePending(IDS.aarav)).toBe(true)
      expect(w.user('aarav').status).toBe('active')
      expect(await db.activatePending(IDS.aarav)).toBe(false)
    })
  })

  it('refuses a deactivated account, even with the right password', async () => {
    const res = await login(emailOf('suresh'), PASSWORD)
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('account_inactive')
  })

  it('points a person at the right sign-in page, without starting a session on the wrong one', async () => {
    const before = sessions()
    const res = await login(emailOf('meera'), PASSWORD, { portal: 'student' })
    expect(res.status).toBe(403)
    expect((await body(res)).error).toMatchObject({ code: 'wrong_portal', portal: 'faculty' })
    expect(sessions()).toBe(before)
    expect((await login(emailOf('meera'), PASSWORD, { portal: 'faculty' })).status).toBe(200)
  })

  it.each([
    ['no body fields', {}],
    ['no password', { email: 'aarav@rajalakshmi.edu.in' }],
    ['a password that is not text', { email: 'aarav@rajalakshmi.edu.in', password: 12345678 }],
    ['an absurdly long password', { email: 'aarav@rajalakshmi.edu.in', password: 'x'.repeat(200) }],
  ])('rejects %s without touching any account', async (_label, payload) => {
    const res = await w.send('POST', '/api/auth/login', null, payload)
    expect(res.status).toBe(400)
  })

  it('refuses a body that is not JSON, or is too large', async () => {
    expect((await w.request('/api/auth/login', null, { method: 'POST', body: 'email=a&password=b' })).status).toBe(415)
    expect((await w.request('/api/auth/login', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not json' })).status).toBe(400)
    expect((await w.request('/api/auth/login', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'a'.repeat(40_000) }) })).status).toBe(413)
    expect((await w.request('/api/auth/login', null, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '[1,2]' })).status).toBe(400)
  })

  it('says sign-in is not set up, rather than failing oddly, when the server secret is missing', async () => {
    const bare = await makeWorld({ AUTH_PEPPER: '' })
    const res = await bare.send('POST', '/api/auth/login', null, { email: emailOf('aarav'), password: PASSWORD })
    expect(res.status).toBe(503)
    expect((await body(res)).error.code).toBe('auth_not_configured')
    const short = await makeWorld({ AUTH_PEPPER: 'too-short' })
    expect((await short.send('POST', '/api/auth/login', null, { email: emailOf('aarav'), password: PASSWORD })).status).toBe(503)
  })

  it('reports a database outage as retryable and does not sign anyone in', async () => {
    w.db.failNext((c) => /FROM users WHERE email/i.test(c.sql), 1)
    const res = await login(emailOf('aarav'), PASSWORD)
    expect(res.status).toBe(503)
    expect((await body(res)).error).toMatchObject({ code: 'database_unavailable', retryable: true })
  })
})

describe('brute-force protection', () => {
  it('locks an account after 5 wrong passwords, even for the right password, then lets it back in', async () => {
    for (let i = 0; i < 5; i++) expect((await login(emailOf('aarav'), 'Wr0ngPassword')).status).toBe(401)
    const locked = await login(emailOf('aarav'), PASSWORD)
    expect(locked.status).toBe(429)
    expect((await body(locked)).error).toMatchObject({ code: 'too_many_attempts', retryable: true })
    expect(Number(locked.headers.get('retry-after'))).toBeGreaterThan(0)

    w.clock.advance(16)
    expect((await login(emailOf('aarav'), PASSWORD)).status).toBe(200)
  })

  it('does not lock other accounts', async () => {
    for (let i = 0; i < 5; i++) await login(emailOf('aarav'), 'Wr0ngPassword')
    expect((await login(emailOf('diya'), PASSWORD)).status).toBe(200)
  })

  it('starts counting again after a successful sign-in', async () => {
    for (let i = 0; i < 4; i++) await login(emailOf('aarav'), 'Wr0ngPassword')
    expect((await login(emailOf('aarav'), PASSWORD)).status).toBe(200)
    for (let i = 0; i < 4; i++) await login(emailOf('aarav'), 'Wr0ngPassword')
    expect((await login(emailOf('aarav'), PASSWORD)).status).toBe(200)
  })

  it('locks out one address that tries many accounts (password spraying)', async () => {
    const attacker = { 'cf-connecting-ip': '203.0.113.9' }
    for (let i = 0; i < 30; i++) await login(`victim${i}@rajalakshmi.edu.in`, 'Passw0rd!', {}, attacker)
    const res = await login(emailOf('aarav'), PASSWORD, {}, attacker)
    expect(res.status).toBe(429)
    // Everyone else is unaffected.
    expect((await login(emailOf('aarav'), PASSWORD, {}, { 'cf-connecting-ip': '198.51.100.7' })).status).toBe(200)
  })

  it('keeps no email addresses in the counters', async () => {
    await login(emailOf('aarav'), 'Wr0ngPassword')
    expect(JSON.stringify(w.db.rows('SELECT key FROM auth_throttle'))).not.toContain('aarav')
  })
})

describe('sessions', () => {
  it('end after the configured time', async () => {
    const { token } = await body(await login(emailOf('aarav'), PASSWORD))
    w.clock.advance(7 * 60 + 59)
    expect((await me(token)).status).toBe(200)
    w.clock.advance(2)
    const res = await me(token)
    expect(res.status).toBe(401)
    expect((await body(res)).error.code).toBe('invalid_token')
  })

  it('can be made shorter with SESSION_HOURS', async () => {
    const short = await makeWorld({ SESSION_HOURS: '1' })
    const { token } = await body(await short.send('POST', '/api/auth/login', null, { email: emailOf('aarav'), password: PASSWORD }))
    short.clock.advance(61)
    expect((await short.request('/api/auth/me', null, { headers: { Authorization: `Bearer ${token}` } })).status).toBe(401)
  })

  it('end at once on sign-out, and only that one', async () => {
    const a = (await body(await login(emailOf('aarav'), PASSWORD))).token
    const b = (await body(await login(emailOf('aarav'), PASSWORD))).token
    const out = await w.request('/api/auth/logout', null, { method: 'POST', headers: { Authorization: `Bearer ${a}` } })
    expect(out.status).toBe(200)
    expect((await me(a)).status).toBe(401)
    expect((await me(b)).status).toBe(200)
  })

  it('stop working the moment an account is deactivated or still pending', async () => {
    expect((await w.request('/api/auth/me', 'aarav')).status).toBe(200)
    w.setUser('aarav', { status: 'inactive' })
    expect(((await body(await w.request('/api/auth/me', 'aarav'))).error.code)).toBe('account_inactive')
    w.setUser('aarav', { status: 'pending' })
    expect(((await body(await w.request('/api/auth/me', 'aarav'))).error.code)).toBe('account_pending')
  })

  it('reflect a role change at once, because the role is read from the database every time', async () => {
    expect((await w.request('/api/admin/users', 'meera')).status).toBe(403)
    w.setUser('meera', { role: 'admin' })
    expect((await w.request('/api/admin/users', 'meera')).status).toBe(200)
  })

  it('are refused when missing, malformed or invented', async () => {
    expect((await w.request('/api/auth/me', null)).status).toBe(401)
    expect(((await body(await w.request('/api/auth/me', null))).error.code)).toBe('unauthenticated')
    for (const header of ['Bearer', 'Bearer short', 'Basic dXNlcjpwYXNz', `Bearer ${'x'.repeat(500)}`, `Bearer ${'a'.repeat(43)}`, 'Bearer a b']) {
      const res = await w.request('/api/auth/me', null, { headers: { Authorization: header } })
      expect(res.status, header).toBe(401)
    }
  })

  it('cannot be guessed from the stored hash', async () => {
    // The hash in the database is NOT a usable token.
    const hash = w.db.rows<{ token_hash: string }>('SELECT token_hash FROM sessions LIMIT 1')[0].token_hash
    expect((await me(hash)).status).toBe(401)
  })
})

describe('what the browser says about itself is never believed', () => {
  it('ignores a role, a student id or any identity header sent with a request', async () => {
    const asStudent = { 'X-Role': 'admin', 'X-User-Id': IDS.admin, 'X-Student-Id': IDS.diya }
    expect((await w.request('/api/admin/users', 'aarav', { headers: asStudent })).status).toBe(403)
    expect((await w.send('PATCH', `/api/admin/users/${IDS.aarav}`, 'aarav', { role: 'admin', status: 'active' }, asStudent)).status).toBe(403)
    expect(w.user('aarav').role).toBe('student')
  })

  it('records an upload under the signed-in student whatever the form claims', async () => {
    const form = new FormData()
    form.set('achievementId', 'ach-x')
    form.set('uploadId', crypto.randomUUID())
    form.set('category', 'Hackathon')
    form.set('studentId', IDS.diya)
    form.set('student_id', IDS.diya)
    form.set('role', 'admin')
    form.set('registerNumber', 'SOMEONE-ELSE')
    form.set('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1])], 'c.pdf', { type: 'application/pdf' }))
    const res = await w.request('/api/certificates', 'aarav', { method: 'POST', body: form })
    expect(res.status).toBe(201)
    expect(w.certs[0]).toMatchObject({ student_id: IDS.aarav, register_number: '2023CSE0417' })
  })

  it('lets nobody act as another user by guessing their id', async () => {
    const res = await w.request(`/api/certificates/by-achievement/ach-1?student=${IDS.admin}`, 'aarav')
    expect(res.status).toBe(404)
  })
})

describe('registering', () => {
  it('creates a student account that can be used at once: no approval, and the student is signed in', async () => {
    const res = await register()
    expect(res.status).toBe(201)
    const out = await body(res)
    expect(out.user).toMatchObject({ role: 'student', status: 'active', active: true, registerNumber: '241801099', department: 'CSE', year: 2 })
    expect(w.db.rows('SELECT role, status FROM users WHERE email = ?', REG.email)[0]).toEqual({ role: 'student', status: 'active' })
    expect((await me(out.token)).status).toBe(200)
  })

  it('lets the new student sign in again later with the password they chose', async () => {
    await register()
    const again = await login(REG.email, REG.password, { portal: 'student' })
    expect(again.status).toBe(200)
    expect((await body(again)).user).toMatchObject({ role: 'student', status: 'active' })
  })

  it('stores the password only as a salted, peppered hash', async () => {
    await register()
    const hash = (w.db.rows<{ password_hash: string }>('SELECT password_hash FROM users WHERE email = ?', REG.email)[0]).password_hash
    expect(hash.startsWith('pbkdf2-sha256$')).toBe(true)
    expect(hash).not.toContain(REG.password)
  })

  it('can only ever create a student, whatever the request asks for', async () => {
    const res = await register({ role: 'admin', status: 'active', active: true, designation: 'Administrator', reviewDepartments: ['CSE'], id: IDS.admin })
    expect(res.status).toBe(201)
    const row = w.db.rows<Record<string, unknown>>('SELECT * FROM users WHERE email = ?', REG.email)[0]
    expect(row).toMatchObject({ role: 'student', status: 'active', designation: null, review_departments: null })
    expect(row.id).not.toBe(IDS.admin)
    expect((await w.request('/api/admin/users', null, { headers: { Authorization: `Bearer ${(await body(res)).token}` } })).status).toBe(403)
  })

  describe('when approval is switched on (REGISTRATION_MODE=approval)', () => {
    let strict: World
    beforeEach(async () => {
      strict = await makeWorld({ REGISTRATION_MODE: 'approval' })
    })
    const signUp = (over: Record<string, unknown> = {}) => strict.send('POST', '/api/auth/register', null, { ...REG, ...over })
    const signIn = () => strict.send('POST', '/api/auth/login', null, { email: REG.email, password: REG.password })

    it('creates an account that waits, and does not sign the student in', async () => {
      const res = await signUp()
      expect(res.status).toBe(202)
      const out = await body(res)
      expect(out.status).toBe('pending')
      expect(out.token).toBeUndefined()
      expect(out.user).toMatchObject({ role: 'student', status: 'pending', active: false, registerNumber: '241801099', department: 'CSE', year: 2 })
      expect(strict.db.rows('SELECT role, status FROM users WHERE email = ?', REG.email)[0]).toEqual({ role: 'student', status: 'pending' })
    })

    it('cannot sign in until an administrator approves it, and then can', async () => {
      await signUp()
      expect((await body(await signIn())).error.code).toBe('account_pending')
      const id = strict.db.rows<{ id: string }>('SELECT id FROM users WHERE email = ?', REG.email)[0].id
      expect((await strict.send('PATCH', `/api/admin/users/${id}`, 'admin', { status: 'active' })).status).toBe(200)
      expect((await signIn()).status).toBe(200)
    })

    it('still cannot be talked into creating anything but a waiting student', async () => {
      expect((await signUp({ role: 'admin', status: 'active', active: true })).status).toBe(202)
      expect(strict.db.rows('SELECT role, status FROM users WHERE email = ?', REG.email)[0]).toEqual({ role: 'student', status: 'pending' })
    })
  })

  it.each([
    ['nothing', undefined, 201],
    ['an empty value', '', 201],
    ['"open", whatever the capitals or spaces', '  Open ', 201],
    ['"approval"', 'approval', 202],
    ['a misspelling, so a typo can never leave registration open by accident', 'aproval', 202],
  ])('reads %s in REGISTRATION_MODE correctly', async (_label, mode, status) => {
    const world = await makeWorld({ REGISTRATION_MODE: mode })
    expect((await world.send('POST', '/api/auth/register', null, REG)).status).toBe(status)
  })

  it('cleans up the details it keeps', async () => {
    await register({ fullName: '  Priya   Krishnan ', registerNumber: ' 241801099 ', email: ' Priya.K.2024.CSE@Rajalakshmi.EDU.IN ' })
    expect(w.db.rows("SELECT full_name, register_number, email FROM users WHERE register_number = '241801099'")[0]).toEqual({ full_name: 'Priya Krishnan', register_number: '241801099', email: 'priya.k.2024.cse@rajalakshmi.edu.in' })
  })

  it.each([
    ['an email on another domain', { email: 'priya@gmail.com' }, 'email'],
    ['a look-alike domain', { email: 'priya@rajalakshmi.edu.in.evil.example' }, 'email'],
    ['a sub-domain', { email: 'priya@cse.rajalakshmi.edu.in' }, 'email'],
    ['an email with a doubled dot', { email: 'pri..ya@rajalakshmi.edu.in' }, 'email'],
    ['no email', { email: undefined }, 'email'],
    ['a weak password', { password: 'password' }, 'password'],
    ['a short password', { password: 'Ab1' }, 'password'],
    ['no name', { fullName: '' }, 'fullName'],
    ['a name with markup', { fullName: '<script>alert(1)</script>' }, 'fullName'],
    ['no register number', { registerNumber: '' }, 'registerNumber'],
    ['a register number that is too long', { registerNumber: 'R'.repeat(31) }, 'registerNumber'],
    ['a register number with odd characters', { registerNumber: "1'; DROP TABLE users;--" }, 'registerNumber'],
    ['no department', { department: '' }, 'department'],
    ['year 5', { year: 5 }, 'year'],
    ['year 0', { year: 0 }, 'year'],
    ['a year that is not a number', { year: 'final' }, 'year'],
    ['a section that is too long', { section: 'S'.repeat(11) }, 'section'],
  ])('refuses %s, pointing at the field', async (_label, over, field) => {
    const res = await register(over)
    expect(res.status).toBe(400)
    expect((await body(res)).error).toMatchObject({ code: 'invalid_input', field })
    expect(w.db.rows('SELECT 1 FROM users WHERE email = ?', REG.email)).toHaveLength(0)
  })

  it('refuses an email that is already registered, and a register number that is already taken (any capitalisation)', async () => {
    expect(await body(await register({ email: emailOf('aarav') }))).toMatchObject({ error: { code: 'duplicate_email', field: 'email' } })
    expect(await body(await register({ registerNumber: '2023cse0417' }))).toMatchObject({ error: { code: 'duplicate_register_number', field: 'registerNumber' } })
  })

  it('does not let one address flood the system with accounts', async () => {
    const flood = { 'cf-connecting-ip': '203.0.113.50' }
    for (let i = 0; i < 10; i++) await register({ email: `student${i}@rajalakshmi.edu.in`, registerNumber: `REG${i}` }, flood)
    const res = await register({ email: 'one.more@rajalakshmi.edu.in', registerNumber: 'REG99' }, flood)
    expect(res.status).toBe(429)
    expect(w.db.rows("SELECT 1 FROM users WHERE email = 'one.more@rajalakshmi.edu.in'")).toHaveLength(0)
  })

  it('accepts only the domains the institution lists', async () => {
    const other = await makeWorld({ ALLOWED_EMAIL_DOMAINS: 'example.edu, college.test' })
    expect((await other.send('POST', '/api/auth/register', null, { ...REG, email: 'a@college.test' })).status).toBe(201)
    expect((await other.send('POST', '/api/auth/register', null, REG)).status).toBe(400)
  })
})

describe('changing a password', () => {
  const change = (who: Who | string, current: string, next: string) =>
    w.request('/api/auth/change-password', null, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${(who as string).length > 12 ? who : tokenOf(who as Who)}` },
      body: JSON.stringify({ currentPassword: current, newPassword: next }),
    })

  it('needs the current password, and the new one must follow the policy', async () => {
    expect((await change('aarav', 'Wr0ngPassword', 'N3wPassword!')).status).toBe(403)
    expect((await change('aarav', PASSWORD, 'weak')).status).toBe(400)
    expect((await login(emailOf('aarav'), PASSWORD)).status).toBe(200) // unchanged
  })

  it('replaces the password and signs out every other session', async () => {
    const other = (await body(await login(emailOf('aarav'), PASSWORD))).token
    expect((await change('aarav', PASSWORD, 'N3wPassword!')).status).toBe(200)
    expect((await me(other)).status).toBe(401)
    expect((await w.request('/api/auth/me', 'aarav')).status).toBe(200) // the session that made the change stays
    expect((await login(emailOf('aarav'), PASSWORD)).status).toBe(401)
    expect((await login(emailOf('aarav'), 'N3wPassword!')).status).toBe(200)
  })

  it('does not let someone guess the current password forever', async () => {
    for (let i = 0; i < 5; i++) await change('aarav', 'Wr0ngPassword', 'N3wPassword!')
    expect((await change('aarav', PASSWORD, 'N3wPassword!')).status).toBe(429)
  })
})

describe('creating the first administrator', () => {
  beforeEach(() => {
    w.db.exec("DELETE FROM users WHERE role = 'admin'")
  })
  const setup = (over: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    w.send('POST', '/api/setup/first-admin', null, { setupToken: SETUP_TOKEN, email: 'records@rajalakshmi.edu.in', fullName: 'Records Office', password: 'Adm1nPassword', ...over }, headers)

  it('works once with the setup token, and the new administrator can sign in', async () => {
    const res = await setup()
    expect(res.status).toBe(201)
    expect((await body(res)).user).toMatchObject({ role: 'admin', status: 'active' })
    expect((await login('records@rajalakshmi.edu.in', 'Adm1nPassword', { portal: 'admin' })).status).toBe(200)
  })

  it('then refuses for good, whatever the token', async () => {
    await setup()
    const again = await setup({ email: 'second@rajalakshmi.edu.in' })
    expect(again.status).toBe(409)
    expect((await body(again)).error.code).toBe('setup_closed')
    expect(w.db.rows("SELECT 1 FROM users WHERE role = 'admin'")).toHaveLength(1)
  })

  it('cannot create two administrators when two requests arrive together', async () => {
    const results = await Promise.all([setup({ email: 'one@rajalakshmi.edu.in' }), setup({ email: 'two@rajalakshmi.edu.in' })])
    expect(results.map((r) => r.status).sort()).toEqual([201, 409])
    expect(w.db.rows("SELECT 1 FROM users WHERE role = 'admin'")).toHaveLength(1)
  })

  it('refuses a wrong token, and locks the address out after a few guesses', async () => {
    const guesser = { 'cf-connecting-ip': '203.0.113.77' }
    for (let i = 0; i < 5; i++) expect((await setup({ setupToken: `guess-${i}-guess-${i}-guess-${i}` }, guesser)).status).toBe(403)
    expect((await setup({}, guesser)).status).toBe(429)
    expect(w.db.rows("SELECT 1 FROM users WHERE role = 'admin'")).toHaveLength(0)
  })

  it('does not even exist when no setup token is configured', async () => {
    const none = await makeWorld({ SETUP_TOKEN: undefined })
    none.db.exec("DELETE FROM users WHERE role = 'admin'")
    expect((await none.send('POST', '/api/setup/first-admin', null, { setupToken: '', email: 'a@rajalakshmi.edu.in', fullName: 'A B', password: 'Adm1nPassword' })).status).toBe(404)
    const weak = await makeWorld({ SETUP_TOKEN: 'short' })
    expect((await weak.send('POST', '/api/setup/first-admin', null, { setupToken: 'short', email: 'a@rajalakshmi.edu.in', fullName: 'A B', password: 'Adm1nPassword' })).status).toBe(404)
  })

  it('applies the same email and password rules as everything else', async () => {
    expect((await setup({ email: 'records@gmail.com' })).status).toBe(400)
    expect((await setup({ password: 'weak' })).status).toBe(400)
    expect(w.db.rows("SELECT 1 FROM users WHERE role = 'admin'")).toHaveLength(0)
  })
})

describe('the HTTP surface of sign-in', () => {
  it('lets only the listed origins call it, including PATCH for account management', async () => {
    const ok = await w.request('/api/admin/users', null, { method: 'OPTIONS', headers: { Origin: 'https://certipass.test' } })
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-methods')).toContain('PATCH')
    expect((await w.request('/api/auth/login', null, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })).status).toBe(403)
  })

  it('never caches an authentication response', async () => {
    const res = await login(emailOf('aarav'), PASSWORD)
    expect(res.headers.get('cache-control')).toBe('no-store')
  })
})

void upload
