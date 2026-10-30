/*
 * Account management. Administrators only, decided here from the database on
 * every request — never from anything the browser claims.
 *
 *   GET   /api/admin/users              list / search accounts
 *   POST  /api/admin/users              create a faculty or administrator account
 *   PATCH /api/admin/users/:id          edit, approve, deactivate, change role
 *   DELETE /api/admin/users/:id         delete a faculty account (never a student or an administrator)
 *   POST  /api/admin/users/:id/reset-password
 *   GET   /api/admin/audit              who changed what
 *
 * Students are never created here: they register themselves and are approved here.
 * Nobody can lock the institution out: an administrator cannot deactivate or demote
 * themselves, and the last active administrator cannot be removed by anyone.
 */
import { duplicateOf, toPublicUser, validDepartment, validDepartmentList, validDesignation, validEmail, validName, validRole, validSection, validYear } from './accounts'
import { canManageAccounts } from './access'
import type { Ctx } from './ctx'
import { DbError } from './db'
import type { UserPatch } from './db'
import { ApiError, invalidField } from './errors'
import { json, readJson } from './http'
import { hashPassword, passwordProblem } from './passwords'
import type { AccountStatus, Caller, Role, UserRow } from './types'
import { isUuid } from './validation'

const STATUSES: AccountStatus[] = ['pending', 'active', 'inactive']
const need = (caller: Caller) => {
  if (!canManageAccounts(caller)) throw new ApiError(403, 'forbidden', 'Only administrators can manage accounts.')
}

function pepper(ctx: Ctx): string {
  if (!ctx.env.AUTH_PEPPER || ctx.env.AUTH_PEPPER.length < 32) throw new ApiError(503, 'auth_not_configured', 'Sign-in has not been set up yet.')
  return ctx.env.AUTH_PEPPER
}

async function target(ctx: Ctx, id: string): Promise<UserRow> {
  const user = isUuid(id) ? await ctx.db.getUser(id) : null
  if (!user) throw new ApiError(404, 'user_not_found', 'That account no longer exists.')
  return user
}

const paging = (url: URL) => ({
  limit: Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50)),
  offset: Math.max(0, Number(url.searchParams.get('offset')) || 0),
})

export async function listUsersRoute(ctx: Ctx, caller: Caller, url: URL): Promise<Response> {
  need(caller)
  const role = url.searchParams.get('role')
  const status = url.searchParams.get('status')
  const { users, total } = await ctx.db.listUsers({
    role: role ? validRole(role, ['student', 'faculty', 'admin']) : undefined,
    status: status && (STATUSES as string[]).includes(status) ? (status as AccountStatus) : undefined,
    department: url.searchParams.get('department')?.slice(0, 40) || undefined,
    q: url.searchParams.get('q')?.trim().slice(0, 80) || undefined,
    ...paging(url),
  })
  return json({ users: users.map(toPublicUser), total })
}

export async function createUserRoute(ctx: Ctx, caller: Caller, request: Request): Promise<Response> {
  need(caller)
  const body = await readJson(request)
  const role = validRole(body.role, ['faculty', 'admin']) as 'faculty' | 'admin'
  const email = validEmail(body.email ?? body.username, ctx.env)
  const fullName = validName(body.fullName)
  const designation = validDesignation(body.designation)
  const department = role === 'faculty' ? validDepartment(body.department) : body.department ? validDepartment(body.department) : null
  const review = role === 'faculty' && body.reviewDepartments !== undefined ? validDepartmentList(body.reviewDepartments) : null
  const problem = passwordProblem(body.password)
  if (problem) throw invalidField('password', problem)

  let user: UserRow
  try {
    user = await ctx.db.insertUser({
      email,
      password_hash: await hashPassword(body.password as string, pepper(ctx), ctx.deps.pbkdf2Iterations),
      role,
      status: 'active',
      full_name: fullName,
      department,
      review_departments: review && review.length ? review : null,
      register_number: null,
      year: null,
      section: null,
      designation,
    })
  } catch (err) {
    if (err instanceof DbError && err.isUniqueViolation) throw duplicateOf(err.message)
    throw err
  }
  await ctx.db.audit(caller.id, 'account_created', user.id, `${role} ${email}`)
  return json({ user: toPublicUser(user) }, 201)
}

export async function updateUserRoute(ctx: Ctx, caller: Caller, id: string, request: Request): Promise<Response> {
  need(caller)
  const body = await readJson(request)
  const user = await target(ctx, id)
  const patch: UserPatch = {}
  const changed: string[] = []

  // Never let an administrator switch off or demote the account they are using. Checked before anything else.
  const switchingOff = body.status !== undefined && body.status !== user.status && body.status !== 'active'
  const changingRole = body.role !== undefined && body.role !== user.role
  if (user.id === caller.id && (switchingOff || changingRole)) {
    throw new ApiError(409, 'cannot_change_self', 'You can’t deactivate or change the role of the account you’re signed in with.')
  }

  if (body.fullName !== undefined) (patch.full_name = validName(body.fullName), changed.push('name'))

  if (body.department !== undefined) {
    if (user.role === 'admin') throw invalidField('department', 'Administrators do not belong to a department.')
    patch.department = validDepartment(body.department)
    changed.push('department')
  }
  if (body.designation !== undefined) {
    if (user.role === 'student') throw invalidField('designation', 'Students have no designation.')
    patch.designation = validDesignation(body.designation)
    changed.push('designation')
  }
  if (body.reviewDepartments !== undefined) {
    if (user.role !== 'faculty') throw invalidField('reviewDepartments', 'Only faculty have review departments.')
    const list = validDepartmentList(body.reviewDepartments)
    patch.review_departments = list.length ? list : null
    changed.push('review departments')
  }
  if (body.year !== undefined) {
    if (user.role !== 'student') throw invalidField('year', 'Only students have a year.')
    patch.year = validYear(body.year)
    changed.push('year')
  }
  if (body.section !== undefined) {
    if (user.role !== 'student') throw invalidField('section', 'Only students have a section.')
    patch.section = validSection(body.section) || null
    changed.push('section')
  }

  let newRole: Role = user.role
  if (body.role !== undefined && body.role !== user.role) {
    if (user.role === 'student') throw invalidField('role', 'A student account cannot be turned into a staff account.')
    newRole = validRole(body.role, ['faculty', 'admin'])
    if (newRole === 'faculty' && !(patch.department ?? user.department)) throw invalidField('department', 'Give the faculty member a department first.')
    patch.role = newRole
    changed.push('role')
  }

  let newStatus: AccountStatus = user.status
  if (body.status !== undefined && body.status !== user.status) {
    if (body.status !== 'active' && body.status !== 'inactive') throw invalidField('status', 'The status must be active or inactive.')
    newStatus = body.status
    patch.status = newStatus
  }

  // Never lock the institution out.
  const losesAdmin = user.role === 'admin' && (newRole !== 'admin' || newStatus !== 'active')
  if (Object.keys(patch).length === 0) return json({ user: toPublicUser(user) })
  // For an administrator being switched off or demoted, the "another active administrator exists" rule is part of
  // the UPDATE statement itself, so it cannot be raced.
  const updated = await ctx.db.updateUser(user.id, patch, { requireOtherActiveAdmin: losesAdmin })
  if (!updated) throw new ApiError(409, 'last_admin', 'This is the only active administrator. Create or activate another one first.')

  // A deactivated account or a changed role takes effect on the next request, not at the next sign-in.
  if (newStatus !== 'active' || newRole !== user.role) await ctx.db.deleteUserSessions(user.id)

  const action = patch.status ? (user.status === 'pending' && newStatus === 'active' ? 'account_approved' : newStatus === 'active' ? 'account_activated' : 'account_deactivated') : 'account_updated'
  await ctx.db.audit(caller.id, action, user.id, changed.join(', ') || null)
  return json({ user: toPublicUser(updated) })
}

/**
 * Delete a faculty account. Only faculty: students keep their records and are deactivated instead, and an
 * administrator is never removed this way. The faculty member's sign-ins end with the account, and the trail keeps
 * who was removed and by whom.
 */
export async function deleteUserRoute(ctx: Ctx, caller: Caller, id: string): Promise<Response> {
  need(caller)
  const user = await target(ctx, id)
  if (user.role !== 'faculty') {
    throw new ApiError(403, 'not_deletable', 'Only faculty accounts can be deleted. Deactivate other accounts instead; their records are kept.')
  }
  await ctx.db.deleteUserSessions(user.id)
  if (!(await ctx.db.deleteFaculty(user.id))) throw new ApiError(404, 'user_not_found', 'That account no longer exists.')
  await ctx.db.audit(caller.id, 'faculty_deleted', user.id, `${user.full_name} <${user.email}> in ${user.department ?? 'no department'}`)
  return json({ deleted: true })
}

export async function resetPasswordRoute(ctx: Ctx, caller: Caller, id: string, request: Request): Promise<Response> {
  need(caller)
  const body = await readJson(request)
  const user = await target(ctx, id)
  const problem = passwordProblem(body.newPassword)
  if (problem) throw invalidField('newPassword', problem)
  await ctx.db.updateUser(user.id, { password_hash: await hashPassword(body.newPassword as string, pepper(ctx), ctx.deps.pbkdf2Iterations) })
  // Whoever was signed in as this account (including an attacker) is signed out.
  await ctx.db.deleteUserSessions(user.id)
  await ctx.db.audit(caller.id, 'password_reset', user.id, null)
  return json({ ok: true })
}

export async function auditRoute(ctx: Ctx, caller: Caller, url: URL): Promise<Response> {
  need(caller)
  const rows = await ctx.db.listAudit(Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50)))
  return json({ entries: rows.map((r) => ({ id: r.id, at: r.at, actorId: r.actor_id, action: r.action, targetId: r.target_id, detail: r.detail })) })
}

/** Upload and account statistics for the administrator's overview. Counts only certificates that are really stored. */
export async function statsRoute(ctx: Ctx, caller: Caller): Promise<Response> {
  need(caller)
  const now = ctx.deps.now()
  const raw = await ctx.db.stats(now)
  // The last 12 calendar months, oldest first, with zero where nothing was uploaded.
  const counts = new Map(raw.byMonth.map((m) => [m.month, m.n]))
  const months: { month: string; count: number }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = d.toISOString().slice(0, 7)
    months.push({ month: key, count: counts.get(key) ?? 0 })
  }
  const accounts = { student: { active: 0, pending: 0, inactive: 0 }, faculty: { active: 0, pending: 0, inactive: 0 }, admin: { active: 0, pending: 0, inactive: 0 } }
  for (const row of raw.accounts) accounts[row.role][row.status] = row.n
  return json({
    stats: {
      certificates: { total: raw.totals.n, totalBytes: raw.totals.bytes, studentsWithCertificates: raw.totals.students, last7Days: raw.totals.week, last30Days: raw.totals.month },
      byCategory: raw.byCategory.map((r) => ({ category: r.category, count: r.n })),
      byDepartment: raw.byDepartment.map((r) => ({ department: r.department ?? 'Unknown', count: r.n })),
      byMonth: months,
      accounts,
      pendingApprovals: accounts.student.pending,
    },
  })
}