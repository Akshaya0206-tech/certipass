/**
 * Mock authentication. In production this is a backend concern: the server
 * verifies credentials and decides the role. Here the role is read from the
 * stored account record — the sign-in form never submits or trusts a role.
 */
import { hashPassword, newSalt } from '../data/seed'
import type { PublicUser, User } from '../types'
import { getState, mutate, sessionKey } from './store'

export class ApiError extends Error {
  code: 'unauthenticated' | 'forbidden' | 'not_found' | 'invalid' | 'conflict'
  constructor(code: ApiError['code'], message: string) {
    super(message)
    this.code = code
  }
}

export const delay = (ms = 350) => new Promise<void>((r) => setTimeout(r, ms))

export function toPublic(u: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash: _h, salt: _s, ...rest } = u
  return rest
}

interface Session {
  userId: string
}

function readSession(): Session | null {
  try {
    const raw = sessionStorage.getItem(sessionKey) ?? localStorage.getItem(sessionKey)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

/** The signed-in account, or null. Disabled accounts are signed out. */
export function currentUser(): PublicUser | null {
  const s = readSession()
  if (!s) return null
  const u = getState().users.find((x) => x.id === s.userId)
  return u && u.active ? toPublic(u) : null
}

export function requireUser(): PublicUser {
  const u = currentUser()
  if (!u) throw new ApiError('unauthenticated', 'Please sign in to continue.')
  return u
}

// Simple throttle so repeated wrong passwords slow down (demo of a server-side rule).
const attempts = new Map<string, { count: number; until: number }>()
const MAX_ATTEMPTS = 5
const LOCK_MS = 30_000

export async function login(identifier: string, password: string, remember: boolean): Promise<PublicUser> {
  await delay(500)
  const id = identifier.trim().toLowerCase()
  const lock = attempts.get(id)
  if (lock && lock.until > Date.now()) {
    const secs = Math.ceil((lock.until - Date.now()) / 1000)
    throw new ApiError('forbidden', `Too many failed attempts. Try again in ${secs} seconds.`)
  }
  const user = getState().users.find((u) => u.username.toLowerCase() === id || u.email.toLowerCase() === id)
  const ok = user ? (await hashPassword(password, user.salt)) === user.passwordHash : false
  if (!user || !ok) {
    const entry = attempts.get(id) ?? { count: 0, until: 0 }
    entry.count += 1
    if (entry.count >= MAX_ATTEMPTS) {
      entry.until = Date.now() + LOCK_MS
      entry.count = 0
    }
    attempts.set(id, entry)
    // Same message for unknown user and wrong password.
    throw new ApiError('unauthenticated', 'The username or password is incorrect.')
  }
  if (!user.active) throw new ApiError('forbidden', 'This account has been disabled. Please contact the administrator.')
  attempts.delete(id)
  const store = remember ? localStorage : sessionStorage
  try {
    sessionStorage.removeItem(sessionKey)
    localStorage.removeItem(sessionKey)
    store.setItem(sessionKey, JSON.stringify({ userId: user.id } satisfies Session))
  } catch {
    throw new ApiError('invalid', 'Your browser is blocking storage, so the demo cannot keep you signed in.')
  }
  return toPublic(user)
}

export function logout(): void {
  try {
    sessionStorage.removeItem(sessionKey)
    localStorage.removeItem(sessionKey)
  } catch {
    // ignore
  }
}

export async function changePassword(current: string, next: string): Promise<void> {
  await delay(400)
  const me = requireUser()
  const user = getState().users.find((u) => u.id === me.id)!
  if ((await hashPassword(current, user.salt)) !== user.passwordHash) {
    throw new ApiError('invalid', 'The current password is incorrect.')
  }
  const problem = passwordProblem(next)
  if (problem) throw new ApiError('invalid', problem)
  const salt = newSalt()
  const passwordHash = await hashPassword(next, salt)
  mutate((s) => {
    const u = s.users.find((x) => x.id === me.id)!
    u.salt = salt
    u.passwordHash = passwordHash
  })
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return 'Use at least 8 characters.'
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use a mix of letters and numbers.'
  return null
}
