/*
 * Talking to the CertiPass Worker for accounts (sign-in, registration, account management).
 *
 * The browser holds one thing from the Worker: a random session token, kept so a
 * page refresh does not sign the person out. It is sent only to the Worker, only
 * in an Authorization header. It is not a password, it ends on sign-out, on
 * password change and after at most the session length, and the Worker keeps only
 * a hash of it. Nothing here ever decides what a person may do: the Worker does,
 * from its own database, on every request.
 */
import type { StudentUser, User, Year } from '../../types'
import { apiBaseUrl } from '../certificateStorage'
import { createId, setState } from '../store'

const TOKEN_KEY = 'certipass.auth.token.v1'

/** True when this build talks to the CertiPass Worker (VITE_CERT_API_URL is set); false for the offline prototype. */
export const backendEnabled = () => apiBaseUrl() !== undefined

// ── The session token ────────────────────────────────────────────────────────

interface StoredToken {
  token: string
  expiresAt: string
}

let memory: StoredToken | null = null

function readToken(): StoredToken | null {
  if (memory) return memory
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredToken>) : null
    if (parsed && typeof parsed.token === 'string' && typeof parsed.expiresAt === 'string') memory = { token: parsed.token, expiresAt: parsed.expiresAt }
  } catch {
    /* storage blocked or malformed: no remembered session */
  }
  return memory
}

export function saveToken(token: string, expiresAt: string) {
  memory = { token, expiresAt }
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(memory))
  } catch {
    /* in-memory only: the person stays signed in until they close the tab */
  }
}

export function clearToken() {
  memory = null
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export const hasToken = () => readToken() !== null

/** The current session token, or null when there is none or it has run out. */
export function currentToken(now = Date.now()): string | null {
  const stored = readToken()
  if (!stored) return null
  if (Date.parse(stored.expiresAt) <= now) {
    clearToken()
    return null
  }
  return stored.token
}

// ── Requests ─────────────────────────────────────────────────────────────────

export class BackendError extends Error {
  readonly code: string
  readonly status: number
  readonly retryable: boolean
  /** Extra facts the Worker sent with the error: `field`, `portal`, `retryAfterSeconds`… */
  readonly extra: Record<string, unknown>
  constructor(code: string, message: string, status = 0, retryable = false, extra: Record<string, unknown> = {}) {
    super(message)
    this.name = 'BackendError'
    this.code = code
    this.status = status
    this.retryable = retryable
    this.extra = extra
  }
}

export interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Send the session token. Sign-in and registration are the only calls that do not. */
  signedIn?: boolean
  /** Use this token instead of the stored one (signing out clears the stored one first). */
  token?: string
  signal?: AbortSignal
}

export async function backendCall<T>(path: string, { method = 'GET', body, signedIn = true, token: explicit, signal }: CallOptions = {}): Promise<T> {
  const base = apiBaseUrl()
  if (!base) throw new BackendError('not_configured', 'This build is not connected to the CertiPass server.')
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (explicit) headers.Authorization = `Bearer ${explicit}`
  else if (signedIn) {
    const token = currentToken()
    if (!token) throw new BackendError('no_session', 'Your session has ended. Please sign in again.', 401)
    headers.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new BackendError('network', 'Couldn’t reach the CertiPass server. Check your connection and try again.', 0, true)
  }
  if (res.ok) return (await res.json().catch(() => ({}))) as T

  let code = 'request_failed'
  let message = `The server returned an error (${res.status}).`
  let retryable = res.status >= 500
  let extra: Record<string, unknown> = {}
  try {
    const parsed = (await res.json()) as { error?: { code?: string; message?: string; retryable?: boolean } & Record<string, unknown> }
    if (parsed.error) {
      const { code: c, message: m, retryable: r, ...rest } = parsed.error
      if (c) code = c
      if (m) message = m
      if (typeof r === 'boolean') retryable = r
      extra = rest
    }
  } catch {
    /* keep the generic message */
  }
  throw new BackendError(code, message, res.status, retryable, extra)
}

// ── Users ────────────────────────────────────────────────────────────────────

/** A user as the Worker describes them. */
export interface BackendUser {
  id: string
  email: string
  username: string
  role: 'student' | 'faculty' | 'admin'
  status: 'pending' | 'active' | 'inactive'
  active: boolean
  fullName: string
  department: string | null
  reviewDepartments: string[] | null
  registerNumber: string | null
  year: number | null
  section: string | null
  designation: string | null
  createdAt: string
}

/** Builds the app's user from the Worker's. The role is whatever the Worker says, never anything the browser decided. */
export function toAppUser(u: BackendUser): User {
  const base = { id: u.id, username: u.email, fullName: u.fullName, department: u.department ?? '', createdAt: u.createdAt, active: u.active, pending: u.status === 'pending' || undefined }
  if (u.role === 'student') {
    const year = ([1, 2, 3, 4] as number[]).includes(u.year ?? 0) ? (u.year as Year) : 1
    return { ...base, role: 'student', registerNumber: u.registerNumber ?? '', year, section: u.section ?? '' } satisfies StudentUser
  }
  if (u.role === 'faculty') return { ...base, role: 'faculty', designation: u.designation ?? 'Faculty', reviewDepartments: u.reviewDepartments?.length ? u.reviewDepartments : undefined }
  return { ...base, role: 'admin', designation: u.designation ?? 'Administrator' }
}

/** The rest of the app looks users up in its local list, so a signed-in user (or one an administrator manages) is placed there. */
export function rememberUser(user: User) {
  setState((s) => ({ ...s, users: [...s.users.filter((x) => x.id !== user.id), user] }))
}

/** Ids the Worker issues are UUIDs; the prototype's demo accounts use short prefixed ids. */
export const isServerId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)

export function welcomeNotification(userId: string) {
  setState((s) => ({
    ...s,
    notifications: [
      {
        id: createId('ntf'),
        userId,
        title: 'Welcome to CertiPass',
        body: 'Your achievement passport is ready. Add your first certificate to begin your record.',
        createdAt: new Date().toISOString(),
        read: false,
        tone: 'info' as const,
        type: 'welcome' as const,
      },
      ...s.notifications,
    ],
  }))
}
