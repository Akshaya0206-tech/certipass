/*
 * Authentication: who is calling?
 *
 * Accounts live in this Worker's own database. Signing in with an email and a
 * password gives the browser a random session token; only a HASH of it is
 * stored, so a leaked database cannot be used to sign in. Every request is
 * authenticated by looking that hash up, and the person's role and status are
 * read from the database at that moment: nothing the browser sends (a role, a
 * student id, a department) is ever treated as proof of who someone is.
 */
import { normalizeEmail, registrationIsOpen, toPublicUser, validDepartment, validEmail, validName, validRegisterNumber, validSection, validYear, duplicateOf } from './accounts'
import type { Ctx } from './ctx'
import { DbError, toProfile } from './db'
import { ApiError, invalidField } from './errors'
import { json, readJson } from './http'
import { constantTimeEqual, decoyHash, hashPassword, newSessionToken, passwordProblem, sha256Text, verifyPassword } from './passwords'
import { assertNotLocked, clearAttempts, clientAddress, emailKey, LOGIN_EMAIL, LOGIN_IP, recordAttempt, REGISTER_IP, SECRET_GUESS } from './throttle'
import type { Caller, Role, UserRow } from './types'

const ROLES: Role[] = ['student', 'faculty', 'admin']
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{32,128}$/

const sessionMs = (ctx: Ctx) => Math.min(24 * 30, Math.max(1, Number(ctx.env.SESSION_HOURS ?? '8') || 8)) * 3_600_000
const rounds = (ctx: Ctx) => ctx.deps.pbkdf2Iterations

function pepper(ctx: Ctx): string {
  const value = ctx.env.AUTH_PEPPER
  if (!value || value.length < 32) {
    throw new ApiError(503, 'auth_not_configured', 'Sign-in has not been set up yet. Ask the records office to finish the setup.')
  }
  return value
}

const hash = (ctx: Ctx, password: string) => hashPassword(password, pepper(ctx), rounds(ctx))

// ── Who is calling ───────────────────────────────────────────────────────────

export async function authenticate(request: Request, ctx: Ctx): Promise<Caller> {
  const match = /^Bearer\s+(\S+)$/.exec(request.headers.get('authorization') ?? '')
  if (!match) throw new ApiError(401, 'unauthenticated', 'Sign in to continue.')
  if (!TOKEN_FORMAT.test(match[1])) throw new ApiError(401, 'invalid_token', 'Your session has expired. Sign in again.')

  const sessionHash = await sha256Text(match[1])
  const found = await ctx.db.getSession(sessionHash)
  if (!found) throw new ApiError(401, 'invalid_token', 'Your session has expired. Sign in again.')
  if (Date.parse(found.expiresAt) <= ctx.deps.now().getTime()) {
    await ctx.db.deleteSession(sessionHash).catch(() => 0)
    throw new ApiError(401, 'invalid_token', 'Your session has expired. Sign in again.')
  }
  const user = found.user
  if (user.status === 'pending') throw new ApiError(403, 'account_pending', 'Your account is waiting for approval by the records office.')
  if (user.status !== 'active') throw new ApiError(403, 'account_inactive', 'This account has been deactivated.')
  return { id: user.id, role: user.role, active: true, profile: toProfile(user), sessionHash }
}

async function openSession(ctx: Ctx, user: UserRow) {
  const token = newSessionToken()
  const expiresAt = new Date(ctx.deps.now().getTime() + sessionMs(ctx)).toISOString()
  await ctx.db.createSession(await sha256Text(token), user.id, expiresAt)
  await ctx.db.purgeExpiredSessions().catch(() => 0)
  return { token, expiresAt }
}

// ── Sign in ──────────────────────────────────────────────────────────────────

export async function login(ctx: Ctx, request: Request): Promise<Response> {
  const body = await readJson(request)
  const email = normalizeEmail(body.email ?? body.username)
  const password = typeof body.password === 'string' ? body.password : ''
  const portal = typeof body.portal === 'string' && (ROLES as string[]).includes(body.portal) ? (body.portal as Role) : undefined
  if (!email || email.length > 254 || !password || password.length > 128) {
    throw new ApiError(400, 'invalid_input', 'Enter your email and password.')
  }
  const pepperValue = pepper(ctx)

  const byEmail = await emailKey(email)
  const byAddress = `login:ip:${clientAddress(request)}`
  await assertNotLocked(ctx, [byEmail, byAddress])

  const user = await ctx.db.getUserByEmail(email)
  // Always do the same amount of hashing work, so "no such account" and "wrong password" take equally long.
  const correct = await verifyPassword(password, user?.password_hash ?? (await decoyHash(pepperValue, rounds(ctx))), pepperValue)
  if (!user || !correct) {
    await recordAttempt(ctx, byEmail, LOGIN_EMAIL)
    await recordAttempt(ctx, byAddress, LOGIN_IP)
    throw new ApiError(401, 'invalid_credentials', 'That email and password combination wasn’t recognised. Check both and try again.')
  }
  await clearAttempts(ctx, byEmail)

  // The password was right, so it is safe (and kinder) to say which page to use.
  if (portal && user.role !== portal) {
    throw new ApiError(403, 'wrong_portal', `Your account is a ${user.role === 'admin' ? 'administrator' : user.role} account. Please use the ${user.role === 'admin' ? 'administrator' : user.role} sign-in page.`, false, { portal: user.role })
  }
  let account: UserRow = user
  if (account.status === 'pending' && registrationIsOpen(ctx.env) && (await ctx.db.activatePending(account.id))) {
    // They registered while new accounts had to be approved. That is no longer the rule, so nobody is left waiting.
    await ctx.db.audit(account.id, 'account_auto_approved', account.id, 'registration is open')
    account = { ...account, status: 'active' }
  }
  if (account.status === 'pending') throw new ApiError(403, 'account_pending', 'Your account is waiting for approval by the records office. You will be able to sign in once it is approved.')
  if (account.status !== 'active') throw new ApiError(403, 'account_inactive', 'This account has been deactivated. Please contact the Office of Academic Records.')

  const session = await openSession(ctx, account)
  return json({ ...session, user: toPublicUser(account) })
}

export async function logout(ctx: Ctx, caller: Caller): Promise<Response> {
  await ctx.db.deleteSession(caller.sessionHash)
  return json({ ok: true })
}

export async function me(ctx: Ctx, caller: Caller): Promise<Response> {
  const user = await ctx.db.getUser(caller.id)
  if (!user) throw new ApiError(401, 'invalid_token', 'Your session has expired. Sign in again.')
  return json({ user: toPublicUser(user) })
}

// ── Registration ─────────────────────────────────────────────────────────────

/**
 * Students register themselves. The role is ALWAYS student: nothing in the request can choose it. By default the
 * account is active at once and the student is signed in. REGISTRATION_MODE=approval makes it wait for an
 * administrator instead, which is the only check available while there is no email service to prove that someone
 * owns their college address.
 */
export async function register(ctx: Ctx, request: Request): Promise<Response> {
  const addressKey = `register:ip:${clientAddress(request)}`
  await assertNotLocked(ctx, [addressKey])
  await recordAttempt(ctx, addressKey, REGISTER_IP)

  const body = await readJson(request)
  const email = validEmail(body.email ?? body.username, ctx.env)
  const fullName = validName(body.fullName)
  const registerNumber = validRegisterNumber(body.registerNumber)
  const department = validDepartment(body.department)
  const year = validYear(body.year)
  const section = validSection(body.section ?? '')
  const problem = passwordProblem(body.password)
  if (problem) throw invalidField('password', problem)

  const open = registrationIsOpen(ctx.env)
  let user: UserRow
  try {
    user = await ctx.db.insertUser({
      email,
      password_hash: await hash(ctx, body.password as string),
      role: 'student',
      status: open ? 'active' : 'pending',
      full_name: fullName,
      department,
      review_departments: null,
      register_number: registerNumber,
      year,
      section: section || null,
      designation: null,
    })
  } catch (err) {
    if (err instanceof DbError && err.isUniqueViolation) throw duplicateOf(err.message)
    throw err
  }
  await ctx.db.audit(user.id, 'account_registered', user.id, open ? 'active' : 'pending')

  if (!open) return json({ status: 'pending', user: toPublicUser(user) }, 202)
  return json({ ...(await openSession(ctx, user)), user: toPublicUser(user) }, 201)
}

// ── Password change ──────────────────────────────────────────────────────────

export async function changePassword(ctx: Ctx, caller: Caller, request: Request): Promise<Response> {
  const body = await readJson(request)
  const current = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const problem = passwordProblem(body.newPassword)
  if (problem) throw invalidField('newPassword', problem)

  const guessKey = `password:user:${caller.id}`
  await assertNotLocked(ctx, [guessKey])
  const user = await ctx.db.getUser(caller.id)
  if (!user || !(await verifyPassword(current, user.password_hash, pepper(ctx)))) {
    await recordAttempt(ctx, guessKey, SECRET_GUESS)
    throw new ApiError(403, 'invalid_credentials', 'Your current password isn’t right.', false, { field: 'currentPassword' })
  }
  await clearAttempts(ctx, guessKey)

  await ctx.db.updateUser(caller.id, { password_hash: await hash(ctx, body.newPassword as string) })
  // Anyone else holding a session for this account (a lost phone, a shared computer) is signed out.
  await ctx.db.deleteUserSessions(caller.id, caller.sessionHash)
  await ctx.db.audit(caller.id, 'password_changed', caller.id, null)
  return json({ ok: true })
}

// ── The very first administrator ─────────────────────────────────────────────

/**
 * Nobody can be an administrator until one exists, so the first one is created with a one-time setup secret
 * (SETUP_TOKEN, set as a Worker secret). Once ANY administrator exists this endpoint refuses for good, whatever
 * the token. The create-if-none-exists check is a single SQL statement, so two simultaneous requests cannot both win.
 */
export async function firstAdmin(ctx: Ctx, request: Request): Promise<Response> {
  const configured = ctx.env.SETUP_TOKEN
  // Not set up for this: behave as if the route does not exist.
  if (!configured || configured.length < 20) throw new ApiError(404, 'not_found', 'Not found.')

  const guessKey = `setup:ip:${clientAddress(request)}`
  await assertNotLocked(ctx, [guessKey])
  const body = await readJson(request)
  const supplied = typeof body.setupToken === 'string' ? body.setupToken : ''
  const enc = new TextEncoder()
  // Compare hashes of both, in constant time, so neither the length nor the content of the secret leaks.
  const same = constantTimeEqual(enc.encode(await sha256Text(supplied)), enc.encode(await sha256Text(configured)))
  if (!same) {
    await recordAttempt(ctx, guessKey, SECRET_GUESS)
    throw new ApiError(403, 'invalid_setup_token', 'The setup token is not right.')
  }

  const email = validEmail(body.email, ctx.env)
  const fullName = validName(body.fullName)
  const problem = passwordProblem(body.password)
  if (problem) throw invalidField('password', problem)

  const created = await ctx.db.insertFirstAdmin({ email, password_hash: await hash(ctx, body.password as string), full_name: fullName, designation: 'Administrator' })
  if (!created) throw new ApiError(409, 'setup_closed', 'An administrator already exists. Ask them to create your account.')
  const user = (await ctx.db.getUserByEmail(email))!
  await ctx.db.audit(user.id, 'first_admin_created', user.id, null)
  return json({ user: toPublicUser(user) }, 201)
}
