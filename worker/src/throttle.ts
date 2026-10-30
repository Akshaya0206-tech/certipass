/*
 * Brute-force protection for sign-in and registration, kept in the database so it
 * holds across Worker instances. A key (an email, or an IP address) that fails too
 * often inside a window is locked out for a while. The email key is a hash, so the
 * table holds no addresses.
 */
import type { Ctx } from './ctx'
import { ApiError } from './errors'
import { sha256Text } from './passwords'

export interface Rule {
  max: number
  windowMs: number
  lockMs: number
}

const MINUTE = 60_000
/** 5 wrong passwords for one email in 15 minutes locks that email for 15 minutes. */
export const LOGIN_EMAIL: Rule = { max: 5, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE }
/** Many different emails from one address is password spraying. */
export const LOGIN_IP: Rule = { max: 30, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE }
/** Every registration attempt counts, to stop account flooding. */
export const REGISTER_IP: Rule = { max: 10, windowMs: 60 * MINUTE, lockMs: 60 * MINUTE }
/** Guesses at the one-time setup token, and at one's current password. */
export const SECRET_GUESS: Rule = { max: 5, windowMs: 15 * MINUTE, lockMs: 15 * MINUTE }

export const clientAddress = (request: Request) => request.headers.get('cf-connecting-ip')?.slice(0, 64) || 'unknown'
export const emailKey = async (email: string) => `login:email:${(await sha256Text(email)).slice(0, 32)}`

export async function assertNotLocked(ctx: Ctx, keys: string[]): Promise<void> {
  const now = ctx.deps.now().getTime()
  for (const key of keys) {
    const row = await ctx.db.getThrottle(key)
    const until = row?.locked_until ? Date.parse(row.locked_until) : 0
    if (until > now) {
      const seconds = Math.max(1, Math.ceil((until - now) / 1000))
      throw new ApiError(429, 'too_many_attempts', `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).`, true, { retryAfterSeconds: seconds })
    }
  }
}

/** Counts one attempt against `key`, locking it once `rule.max` is reached inside the window. */
export async function recordAttempt(ctx: Ctx, key: string, rule: Rule): Promise<void> {
  const now = ctx.deps.now().getTime()
  const row = await ctx.db.getThrottle(key)
  const lockExpired = !!row?.locked_until && Date.parse(row.locked_until) <= now
  const fresh = !row || lockExpired || Date.parse(row.window_start) + rule.windowMs <= now
  const failures = fresh ? 1 : row.failures + 1
  const windowStart = fresh ? new Date(now).toISOString() : row.window_start
  await ctx.db.putThrottle(key, failures, windowStart, failures >= rule.max ? new Date(now + rule.lockMs).toISOString() : null)
}

export const clearAttempts = (ctx: Ctx, key: string) => ctx.db.deleteThrottle(key)
