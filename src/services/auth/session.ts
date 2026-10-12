/*
 * Prototype session persistence.
 *
 * Stores only { userId, role, issuedAt, expiresAt } — no password, no
 * credentials, no token — so a refresh keeps the demo user signed in.
 * Anyone with access to the browser can edit this record, so it provides no
 * security; real sessions will be issued and verified by the backend.
 */
import type { AuthSession, Role } from '../../types'

const STORAGE_KEY = 'certipass.session.v1'
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000
const ROLES: Role[] = ['student', 'faculty', 'admin']

function isValid(value: unknown, now = Date.now()): value is AuthSession {
  const s = value as AuthSession
  if (!s || typeof s !== 'object') return false
  if (typeof s.userId !== 'string' || !s.userId || !ROLES.includes(s.role)) return false
  const issued = Date.parse(s.issuedAt)
  const expires = Date.parse(s.expiresAt)
  return Number.isFinite(issued) && Number.isFinite(expires) && issued <= now + 60_000 && expires > now
}

function read(): AuthSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (isValid(parsed)) return { userId: parsed.userId, role: parsed.role, issuedAt: parsed.issuedAt, expiresAt: parsed.expiresAt }
  } catch {
    /* malformed JSON */
  }
  // Missing fields, tampering or expiry: discard quietly.
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  return null
}

let current: AuthSession | null = read()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

export function getSession(): AuthSession | null {
  return current
}

export function startSession(userId: string, role: Role): AuthSession {
  const now = Date.now()
  current = { userId, role, issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + SESSION_TTL_MS).toISOString() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current))
  } catch {
    /* in-memory session only */
  }
  notify()
  return current
}

export function endSession() {
  const had = current !== null
  current = null
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
  if (had) notify()
}

/** True (and the session is ended) if the current session has passed its expiry. */
export function expireIfStale(now = Date.now()): boolean {
  if (current && Date.parse(current.expiresAt) <= now) {
    endSession()
    return true
  }
  return false
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// Keep tabs in sync: signing out in one tab signs out the others.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return
    current = read()
    notify()
  })
}
