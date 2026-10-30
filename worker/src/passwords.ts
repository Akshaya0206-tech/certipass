/*
 * Password storage.
 *
 *   stored = "pbkdf2-sha256$<rounds>$<salt>$<hash>"
 *
 * The password is first run through HMAC-SHA-256 keyed with a secret that lives
 * only in the Worker's secrets (the "pepper"), and the result is stretched with
 * PBKDF2-SHA-256 and a random per-password salt. So a stolen database is not
 * enough to start guessing passwords: the attacker also needs the pepper.
 *
 * Why only 100,000 rounds: the Workers runtime refuses PBKDF2 above that number,
 * which is below what OWASP suggests for PBKDF2 on its own. The pepper and the
 * sign-in lockouts (see throttle.ts) make up for it. The round count is stored in
 * each hash, so it can be raised later without invalidating existing passwords.
 */

export const PBKDF2_ROUNDS = 100_000
const MAX_ROUNDS = 1_000_000
const SALT_BYTES = 16
const HASH_BITS = 256
const PREFIX = 'pbkdf2-sha256'
const enc = new TextEncoder()

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 128

/** What is wrong with a new password, or null when it is fine. The same rules the sign-up form shows. */
export function passwordProblem(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) return 'Enter a password.'
  if (password.length < PASSWORD_MIN) return 'Use at least 8 characters.'
  if (password.length > PASSWORD_MAX) return 'Use 128 characters or fewer.'
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) return 'Use both upper and lower case letters.'
  if (!/\d/.test(password)) return 'Include at least one number.'
  return null
}

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
function unb64(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

/** Compares without stopping at the first difference, so timing reveals nothing about where they differ. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

async function derive(password: string, pepper: string, salt: Uint8Array, rounds: number): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey('raw', enc.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const peppered = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(password)))
  const key = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits'])
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, key, HASH_BITS))
}

export async function hashPassword(password: string, pepper: string, rounds = PBKDF2_ROUNDS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  return `${PREFIX}$${rounds}$${b64(salt)}$${b64(await derive(password, pepper, salt, rounds))}`
}

/** True only for the right password. A malformed stored value is simply "wrong", never an error. */
export async function verifyPassword(password: string, stored: string, pepper: string): Promise<boolean> {
  const [prefix, roundsText, saltText, hashText] = stored.split('$')
  const rounds = Number(roundsText)
  if (prefix !== PREFIX || !Number.isInteger(rounds) || rounds < 1 || rounds > MAX_ROUNDS || !saltText || !hashText) return false
  try {
    const expected = unb64(hashText)
    const actual = await derive(password, pepper, unb64(saltText), rounds)
    return constantTimeEqual(actual, expected)
  } catch {
    return false
  }
}

let decoy: Promise<string> | undefined
/**
 * A hash nobody knows the password for. Checking a login against it when the account does not exist makes
 * "no such account" take as long as "wrong password", so response time does not reveal which emails exist.
 */
export function decoyHash(pepper: string, rounds = PBKDF2_ROUNDS): Promise<string> {
  return (decoy ??= hashPassword(crypto.randomUUID() + crypto.randomUUID(), pepper, rounds))
}

export async function sha256Text(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text)))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** A new random session token (shown to the browser once) — 256 bits, URL-safe. */
export const newSessionToken = () => b64(crypto.getRandomValues(new Uint8Array(32)))
