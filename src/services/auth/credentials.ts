/*
 * Mock credential store.
 *
 * Passwords are NEVER persisted. Self-registered students' passwords are
 * stored only as salted PBKDF2-SHA-256 hashes; seed (demo) accounts are
 * hashed in memory at runtime from data/seedCredentials.ts and never written
 * to storage at all.
 *
 * This is still a browser-side prototype: anyone with access to the browser
 * profile can read the hashes, and the check runs on the client. It is not
 * production authentication.
 */
import { seedPasswordFor } from '../../data/seedCredentials'
import { onDemoReset, takeLegacyPasswords } from '../store'
import { AuthError } from './types'

const STORAGE_KEY = 'certipass.credentials.v1'
const ITERATIONS = 120_000

interface CredentialRecord {
  algorithm: 'PBKDF2-SHA-256'
  iterations: number
  salt: string
  hash: string
}

function loadRecords(): Record<string, CredentialRecord> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, CredentialRecord>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

let records = loadRecords()
const seedRecords = new Map<string, Promise<CredentialRecord>>()

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  } catch {
    /* Storage unavailable: credentials live for this tab only. */
  }
}

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new AuthError(
      'unavailable',
      'Sign-in needs a secure browser context. Open the app on localhost or over HTTPS.',
    )
  }
  return globalThis.crypto.subtle
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await subtle().importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256)
  return toBase64(new Uint8Array(bits))
}

async function createRecord(password: string): Promise<CredentialRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return { algorithm: 'PBKDF2-SHA-256', iterations: ITERATIONS, salt: toBase64(salt), hash: await derive(password, salt, ITERATIONS) }
}

/** Length-independent comparison so the check doesn't short-circuit on the first differing character. */
function safeEqual(a: string, b: string) {
  let diff = a.length ^ b.length
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0)
  return diff === 0
}

function recordFor(userId: string): Promise<CredentialRecord> | undefined {
  const stored = records[userId]
  if (stored) return Promise.resolve(stored)
  const seed = seedPasswordFor(userId)
  if (!seed) return undefined
  let pending = seedRecords.get(userId)
  if (!pending) {
    pending = createRecord(seed)
    seedRecords.set(userId, pending)
  }
  return pending
}

/** Store a hash for `userId`. The plaintext is discarded once hashed. */
export async function setPassword(userId: string, password: string) {
  records = { ...records, [userId]: await createRecord(password) }
  persist()
}

/**
 * Check a password. When `userId` is undefined (unknown username) a dummy
 * derivation still runs so both paths take similar time.
 */
export async function verifyPassword(userId: string | undefined, password: string): Promise<boolean> {
  const pending = userId ? recordFor(userId) : undefined
  if (!pending) {
    await derive(password, new Uint8Array(16), ITERATIONS)
    return false
  }
  const record = await pending
  const candidate = await derive(password, fromBase64(record.salt), record.iterations)
  return safeEqual(candidate, record.hash)
}

// Phase 1 kept plain-text passwords in localStorage; hash any that were migrated.
const legacy = takeLegacyPasswords()
if (legacy.length) {
  void Promise.all(legacy.map((l) => setPassword(l.userId, l.password))).catch(() => {
    /* If hashing is unavailable those accounts simply can't sign in. */
  })
}

// Resetting the demo dataset removes self-registered accounts, so drop their hashes too.
onDemoReset(() => {
  records = {}
  persist()
})
