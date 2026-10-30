import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StudentRegistration } from '../../types'
import { getState } from '../store'
import { clearToken, currentToken, saveToken } from './backend'
import type { BackendUser } from './backend'
import { endSession, getSession, startSession } from './session'
import { AuthError } from './types'
import { createWorkerAuthProvider } from './workerAuthProvider'

const API = 'https://api.test'
const AARAV = '11111111-1111-4111-8111-111111111111'
const MEERA = '44444444-4444-4444-8444-444444444444'
const FUTURE = new Date(Date.now() + 8 * 3_600_000).toISOString()

const user = (over: Partial<BackendUser> = {}): BackendUser => ({
  id: AARAV,
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
const refuse = (status: number, code: string, message: string, extra: Record<string, unknown> = {}) => json({ error: { code, message, retryable: status >= 500, ...extra } }, status)

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>
let handler: Handler
let calls: { url: string; method: string; headers: Record<string, string>; body: Record<string, unknown> | null }[]

beforeEach(() => {
  endSession()
  clearToken()
  calls = []
  handler = () => refuse(404, 'not_found', 'Not found.')
  vi.stubEnv('VITE_CERT_API_URL', API)
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url: url.replace(API, ''), method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body ? JSON.parse(String(init.body)) : null })
      return handler(url.replace(API, ''), init)
    }),
  )
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const make = async () => {
  const provider = createWorkerAuthProvider()
  await provider.ready
  return provider
}

describe('signing in', () => {
  it('asks the server, then starts the session the rest of the app reads', async () => {
    handler = () => json({ token: 'tok-aarav-0123456789abcdef0123456789abcdef', expiresAt: FUTURE, user: user() })
    const provider = await make()
    const signedIn = await provider.login({ username: ' aarav.menon@rajalakshmi.edu.in ', password: 'Passw0rd!' }, 'student')

    expect(signedIn).toMatchObject({ id: AARAV, role: 'student', fullName: 'Aarav Menon', registerNumber: '241801058', department: 'CSE', year: 3, active: true })
    expect(provider.getSession()).toMatchObject({ userId: AARAV, role: 'student' })
    expect(getState().users.find((u) => u.id === AARAV)).toMatchObject({ role: 'student', username: 'aarav.menon@rajalakshmi.edu.in' })
    expect(await provider.getAccessToken()).toBe('tok-aarav-0123456789abcdef0123456789abcdef')
  })

  it('sends only the email, the password and which sign-in page was used, never a role as proof', async () => {
    handler = () => json({ token: 'tok-aarav-0123456789abcdef0123456789abcdef', expiresAt: FUTURE, user: user() })
    const provider = await make()
    await provider.login({ username: 'aarav.menon@rajalakshmi.edu.in', password: 'Passw0rd!' }, 'student')
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ url: '/api/auth/login', method: 'POST', body: { email: 'aarav.menon@rajalakshmi.edu.in', password: 'Passw0rd!', portal: 'student' } })
    expect(Object.keys(calls[0].body!).sort()).toEqual(['email', 'password', 'portal'])
    expect(calls[0].headers.Authorization).toBeUndefined()
  })

  it('takes the role from the server’s answer, and is refused if that is not the page signed in on', async () => {
    handler = () => json({ token: 'tok-x-0123456789abcdef0123456789abcdef', expiresAt: FUTURE, user: user({ role: 'student' }) })
    const provider = await make()
    const err = (await provider.login({ username: 'aarav.menon@rajalakshmi.edu.in', password: 'x' }, 'admin').catch((e) => e)) as AuthError
    expect(err.code).toBe('wrong_portal')
    expect(provider.getSession()).toBeNull()
    expect(currentToken()).toBeNull()
  })

  it('never writes the session token into the app’s own session record', async () => {
    handler = () => json({ token: 'tok-secret-0123456789abcdef0123456789ab', expiresAt: FUTURE, user: user() })
    const provider = await make()
    await provider.login({ username: 'aarav.menon@rajalakshmi.edu.in', password: 'Passw0rd!' }, 'student')
    expect(localStorage.getItem('certipass.session.v1')).not.toContain('tok-secret')
  })

  it('asks for the college email when given a plain username, without calling the server', async () => {
    const provider = await make()
    const err = (await provider.login({ username: 'aarav.menon', password: 'Passw0rd!' }, 'student').catch((e) => e)) as AuthError
    expect(err.code).toBe('invalid_credentials')
    expect(err.message).toContain('@rajalakshmi.edu.in')
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['a wrong password', refuse(401, 'invalid_credentials', 'That email and password combination wasn’t recognised.'), 'invalid_credentials'],
    ['a missing field', refuse(400, 'invalid_input', 'Enter your email and password.'), 'invalid_credentials'],
    ['an account waiting for approval', refuse(403, 'account_pending', 'Your account is waiting for approval by the records office.'), 'pending_approval'],
    ['a deactivated account', refuse(403, 'account_inactive', 'This account has been deactivated.'), 'inactive'],
    ['too many attempts', refuse(429, 'too_many_attempts', 'Too many attempts. Try again in 15 minute(s).'), 'unavailable'],
    ['a server fault', refuse(500, 'internal_error', 'Something went wrong.'), 'unavailable'],
  ])('turns %s into the error the sign-in page understands', async (_label, response, code) => {
    handler = () => response.clone()
    const provider = await make()
    const err = (await provider.login({ username: 'aarav.menon@rajalakshmi.edu.in', password: 'x' }, 'student').catch((e) => e)) as AuthError
    expect(err).toBeInstanceOf(AuthError)
    expect(err.code).toBe(code)
    expect(getSession()).toBeNull()
    expect(currentToken()).toBeNull()
  })

  it('passes on which page to use when the server says so', async () => {
    handler = () => refuse(403, 'wrong_portal', 'Your account is a faculty account. Please use the faculty sign-in page.', { portal: 'faculty' })
    const provider = await make()
    const err = (await provider.login({ username: 'dr.meera@rajalakshmi.edu.in', password: 'x' }, 'student').catch((e) => e)) as AuthError
    expect(err).toMatchObject({ code: 'wrong_portal', portal: 'faculty' })
  })

  it('shows the server’s own message when it is rate-limiting, so the person knows how long to wait', async () => {
    handler = () => refuse(429, 'too_many_attempts', 'Too many attempts. Try again in 15 minute(s).')
    const provider = await make()
    const err = (await provider.login({ username: 'aarav.menon@rajalakshmi.edu.in', password: 'x' }, 'student').catch((e) => e)) as AuthError
    expect(err.message).toContain('15 minute')
  })

  it('treats an unreachable server as "unavailable"', async () => {
    handler = () => {
      throw new TypeError('Failed to fetch')
    }
    const provider = await make()
    const err = (await provider.login({ username: 'aarav.menon@rajalakshmi.edu.in', password: 'x' }, 'student').catch((e) => e)) as AuthError
    expect(err.code).toBe('unavailable')
  })
})

describe('registering', () => {
  const registration = (over: Partial<StudentRegistration> = {}): StudentRegistration => ({
    fullName: 'Diya Raman',
    username: 'diya.raman.2024.aids@rajalakshmi.edu.in',
    password: 'Passw0rd!',
    registerNumber: '241801099',
    department: 'AIDS',
    year: 2,
    section: 'A',
    ...over,
  })

  it('sends only the registration details, never a role, and tells the student to wait for approval', async () => {
    handler = () => json({ status: 'pending', user: user({ status: 'pending', active: false }) }, 202)
    const provider = await make()
    const err = (await provider.registerStudent(registration()).catch((e) => e)) as AuthError
    expect(err.code).toBe('pending_approval')
    expect(calls[0].url).toBe('/api/auth/register')
    expect(calls[0].body).toEqual({
      fullName: 'Diya Raman',
      email: 'diya.raman.2024.aids@rajalakshmi.edu.in',
      password: 'Passw0rd!',
      registerNumber: '241801099',
      department: 'AIDS',
      year: 2,
      section: 'A',
    })
    // Waiting for approval means not signed in.
    expect(getSession()).toBeNull()
    expect(currentToken()).toBeNull()
  })

  it('signs the student in at once when the server says registration is open', async () => {
    handler = () => json({ token: 'tok-diya-0123456789abcdef0123456789abcd', expiresAt: FUTURE, user: user({ id: crypto.randomUUID(), fullName: 'Diya Raman' }) }, 201)
    const provider = await make()
    const created = await provider.registerStudent(registration())
    expect(created).toMatchObject({ role: 'student', fullName: 'Diya Raman' })
    expect(provider.getSession()).toMatchObject({ userId: created.id, role: 'student' })
    expect(getState().notifications.some((n) => n.userId === created.id && n.type === 'welcome')).toBe(true)
  })

  it('reports duplicates against the right field, and form errors against the field the server names', async () => {
    const provider = await make()
    handler = () => refuse(409, 'duplicate_email', 'An account with this email already exists. Sign in instead.', { field: 'email' })
    expect(((await provider.registerStudent(registration()).catch((e) => e)) as AuthError)).toMatchObject({ code: 'duplicate_username', field: 'username' })
    handler = () => refuse(409, 'duplicate_register_number', 'An account with this register number already exists.', { field: 'registerNumber' })
    expect(((await provider.registerStudent(registration()).catch((e) => e)) as AuthError)).toMatchObject({ code: 'duplicate_register_number', field: 'registerNumber' })
    handler = () => refuse(400, 'invalid_input', 'Use your college email.', { field: 'email' })
    expect(((await provider.registerStudent(registration()).catch((e) => e)) as AuthError)).toMatchObject({ code: 'invalid_input', field: 'username' })
  })

  it('applies the same rules as the form before touching the network', async () => {
    const provider = await make()
    for (const bad of [registration({ fullName: '' }), registration({ password: 'short' }), registration({ registerNumber: '' }), registration({ username: 'someone@gmail.com' }), registration({ username: 'diya.raman' })]) {
      await expect(provider.registerStudent(bad)).rejects.toBeInstanceOf(AuthError)
    }
    expect(calls).toHaveLength(0)
  })
})

describe('signing out', () => {
  it('ends the session at once and tells the server so the token stops working everywhere', async () => {
    handler = (url) => (url === '/api/auth/login' ? json({ token: 'tok-aarav-0123456789abcdef0123456789abcdef', expiresAt: FUTURE, user: user() }) : json({ ok: true }))
    const provider = await make()
    await provider.login({ username: 'aarav.menon@rajalakshmi.edu.in', password: 'Passw0rd!' }, 'student')
    provider.logout()
    expect(provider.getSession()).toBeNull() // immediate, not after a network round trip
    expect(currentToken()).toBeNull()
    await vi.waitFor(() => expect(calls.some((c) => c.url === '/api/auth/logout')).toBe(true))
    expect(calls.find((c) => c.url === '/api/auth/logout')!.headers.Authorization).toBe('Bearer tok-aarav-0123456789abcdef0123456789abcdef')
  })

  it('signs out even when the server cannot be reached', async () => {
    handler = () => {
      throw new TypeError('Failed to fetch')
    }
    saveToken('tok-offline-0123456789abcdef0123456789ab', FUTURE)
    startSession(AARAV, 'student')
    const provider = await make()
    provider.logout()
    expect(provider.getSession()).toBeNull()
    expect(currentToken()).toBeNull()
  })
})

describe('checking a remembered session when the page loads', () => {
  it('keeps a real session and refreshes the user from what the server says', async () => {
    saveToken('tok-real-0123456789abcdef0123456789abcdef', FUTURE)
    startSession(AARAV, 'student')
    handler = () => json({ user: user({ fullName: 'Aarav M Menon' }) })
    const provider = await make()
    expect(provider.getSession()).toMatchObject({ userId: AARAV })
    expect(getState().users.find((u) => u.id === AARAV)).toMatchObject({ fullName: 'Aarav M Menon' })
    expect(calls[0].headers.Authorization).toBe('Bearer tok-real-0123456789abcdef0123456789abcdef')
  })

  it('ends a session claim that has no token behind it (cleared, expired or edited by hand)', async () => {
    startSession(MEERA, 'admin') // someone edited browser storage to claim an administrator session
    const provider = await make()
    expect(provider.getSession()).toBeNull()
    expect(calls).toHaveLength(0)
  })

  it('signs out a token the app has no session for', async () => {
    saveToken('tok-stray-0123456789abcdef0123456789abcd', FUTURE)
    handler = () => json({ ok: true })
    await make()
    expect(currentToken()).toBeNull()
    expect(calls.map((c) => c.url)).toContain('/api/auth/logout')
  })

  it.each([
    ['the token expired on the server', refuse(401, 'invalid_token', 'Your session has expired.')],
    ['the account was deactivated', refuse(403, 'account_inactive', 'This account has been deactivated.')],
  ])('ends the session when %s', async (_why, response) => {
    saveToken('tok-old-0123456789abcdef0123456789abcdef', FUTURE)
    startSession(AARAV, 'student')
    handler = () => response.clone()
    const provider = await make()
    expect(provider.getSession()).toBeNull()
    expect(currentToken()).toBeNull()
  })

  it('ends the session when the server says the token belongs to someone else, or has a different role', async () => {
    saveToken('tok-other-0123456789abcdef0123456789abcd', FUTURE)
    startSession(AARAV, 'student')
    handler = () => json({ user: user({ id: MEERA, role: 'faculty' }) })
    const provider = await make()
    expect(provider.getSession()).toBeNull()
    expect(currentToken()).toBeNull()
  })

  it('keeps the session when the server simply cannot be reached right now', async () => {
    saveToken('tok-keep-0123456789abcdef0123456789abcdef', FUTURE)
    startSession(AARAV, 'student')
    handler = () => {
      throw new TypeError('Failed to fetch')
    }
    const provider = await make()
    expect(provider.getSession()).toMatchObject({ userId: AARAV })
    expect(currentToken()).not.toBeNull()
  })
})

describe('the session token for certificate storage', () => {
  it('is the current token while signed in, and null otherwise', async () => {
    const provider = await make()
    expect(await provider.getAccessToken()).toBeNull()
    saveToken('tok-now-0123456789abcdef0123456789abcdef', FUTURE)
    expect(await provider.getAccessToken()).toBe('tok-now-0123456789abcdef0123456789abcdef')
  })

  it('stops being offered once it has expired', async () => {
    saveToken('tok-late-0123456789abcdef0123456789abcde', new Date(Date.now() - 1000).toISOString())
    const provider = await make()
    expect(await provider.getAccessToken()).toBeNull()
    expect(currentToken()).toBeNull()
  })
})
