/*
 * Admin management — mock service.
 *
 * Accounts (view, edit permitted fields, activate/deactivate, create faculty),
 * the achievement register (search, filter, sort, CSV export), archiving and
 * the activity feed. Figures and charts live in analyticsService.ts.
 *
 * Every change requires a signed-in administrator (services/auth/actor.ts)
 * and is written to the audit trail. Students and administrators are never
 * deleted: they are deactivated, and a record that should leave the active
 * register is archived, which keeps its details, result and certificate exactly
 * as submitted. Only a faculty account can be deleted, because it owns no records.
 *
 * Administrators do not judge achievements. Archiving is housekeeping, not a
 * verdict, and it is the only change an administrator can make to a record.
 *
 * Prototype note: these checks run in the browser. They keep the prototype
 * consistent; they are not security. A backend must enforce them.
 */
import { batchCodeOf, batchLabel } from '../domain/batch'
import { RESULT_GROUPS, resultGroupOf } from '../domain/result'
import type { ResultGroup } from '../domain/result'
import { isActiveRecord, MAX_NOTE_LENGTH, RECORD_STATUS_ORDER, recordStatusLabel } from '../domain/status'
import { toCsv } from '../lib/csv'
import type { CsvValue } from '../lib/csv'
import type {
  Achievement,
  AchievementCategory,
  AdminUser,
  AuditEvent,
  FacultyUser,
  RecordEvent,
  RecordStatus,
  StudentUser,
  User,
  Year,
} from '../types'
import { activeDepartments, departmentName, getAcademicConfig, isActiveDepartment, isKnownDepartment, isKnownSection } from './academicService'
import { categoryLabel } from './achievementValidation'
import {
  formatRate,
  getAchievementTrends,
  getAdminOverview,
  getAwardRate,
  getBatchAchievementStats,
  getCategoryAchievementStats,
  getDepartmentAchievementStats,
  getResultDistribution,
} from './analyticsService'
import type { TimeRange } from './analyticsService'
import { PermissionError, requireActor } from './auth/actor'
import { backendEnabled, BackendError, isServerId } from './auth/backend'
import { setPassword } from './auth/credentials'
import { COLLEGE_EMAIL_DOMAIN, PASSWORD_RULES, signInNameError } from './auth/validation'
import { recordAudit } from './auditService'
import { createStaffOnServer, deleteAccountOnServer, resetPasswordOnServer, updateAccountOnServer } from './accountApi'
import { ACCEPTED_TYPES } from './fileService'
import { createId, delay, getState, setState } from './store'

export class AdminError extends Error {
  readonly code: 'invalid' | 'duplicate' | 'not_found' | 'not_allowed'
  readonly field?: string
  constructor(code: AdminError['code'], message: string, field?: string) {
    super(message)
    this.name = 'AdminError'
    this.code = code
    this.field = field
  }
}

const describe = (u: Pick<User, 'fullName' | 'username'>) => `${u.fullName} (@${u.username})`

// ── Accounts ─────────────────────────────────────────────────────────────────

/**
 * Activate or deactivate an account. Deactivation blocks sign-in and ends any
 * open session, but keeps the account and all of its records.
 */
export async function setUserActive(userId: string, active: boolean): Promise<User> {
  const admin = requireActor('admin')
  const target = getState().users.find((u) => u.id === userId)
  if (!target) throw new AdminError('not_found', 'That account no longer exists.')
  if (target.id === admin.id && !active) throw new AdminError('not_allowed', 'You can’t deactivate the account you’re signed in with.')
  if (target.active === active) return target
  let updated: User
  if (backendEnabled() && isServerId(userId)) {
    // The server decides, from its own records, whether this administrator may do this. For a pending student, "active" is the approval.
    try {
      updated = await updateAccountOnServer(userId, { status: active ? 'active' : 'inactive' })
    } catch (err) {
      throw serverError(err)
    }
  } else {
    updated = { ...target, active } as User
    setState((s) => ({ ...s, users: s.users.map((u) => (u.id === userId ? updated : u)) }))
  }
  recordAudit(admin, active ? 'account_activated' : 'account_deactivated', `${active ? 'Activated' : 'Deactivated'} ${describe(target)}`, target.id)
  return updated
}

/** A refusal or failure from the server, as the error the admin screens already understand. */
function serverError(err: unknown): AdminError {
  if (!(err instanceof BackendError)) return new AdminError('invalid', 'Something went wrong. Please try again.')
  const field = err.extra.field === 'email' ? 'username' : typeof err.extra.field === 'string' ? err.extra.field : undefined
  if (err.code === 'duplicate_email') return new AdminError('duplicate', err.message, 'username')
  if (err.code === 'user_not_found') return new AdminError('not_found', err.message)
  if (err.status === 403 || err.status === 409) return new AdminError('not_allowed', err.message)
  return new AdminError('invalid', err.message, field)
}
export interface FacultyInput {
  fullName: string
  username: string
  department: string
  designation: string
  reviewDepartments: string[]
  password: string
  confirmPassword: string
}

export type FacultyErrors = Partial<Record<keyof FacultyInput, string>>

function validateFacultyProfile(input: Pick<FacultyInput, 'fullName' | 'department' | 'designation' | 'reviewDepartments'>, currentDepartment?: string): FacultyErrors {
  const e: FacultyErrors = {}
  const name = input.fullName.trim()
  if (!name) e.fullName = 'Enter the faculty member’s full name.'
  else if (name.length < 3 || name.length > 80) e.fullName = 'The name must be 3–80 characters.'
  if (!input.department) e.department = 'Select a department.'
  // An existing member may stay in a department that has since been deactivated.
  else if (!(isActiveDepartment(input.department) || (input.department === currentDepartment && isKnownDepartment(input.department)))) e.department = 'Select an active department.'
  const designation = input.designation.trim()
  if (!designation) e.designation = 'Enter a designation, e.g. Assistant Professor.'
  else if (designation.length > 80) e.designation = 'Designation must be 80 characters or fewer.'
  if (input.reviewDepartments.some((d) => !isKnownDepartment(d))) e.reviewDepartments = 'One of the review departments is not recognised.'
  return e
}

/** Rules for a new faculty account. Shared by the form and the service. */
export function validateFacultyInput(input: FacultyInput, users: User[] = getState().users): FacultyErrors {
  const e = validateFacultyProfile(input)
  const username = input.username.trim().toLowerCase()
  const usernameProblem = signInNameError(username)
  if (usernameProblem) e.username = usernameProblem
  // The CertiPass server signs people in by email, so a faculty account needs one.
  else if (backendEnabled() && !username.includes('@')) e.username = `Enter their college email address (name@${COLLEGE_EMAIL_DOMAIN}).`
  else if (users.some((u) => u.username.toLowerCase() === username)) e.username = 'This email or username is already taken.'
  if (!input.password) e.password = 'Set an initial password.'
  else if (!PASSWORD_RULES.every((r) => r.test(input.password))) e.password = 'At least 8 characters, with upper and lower case letters and a number.'
  if (!input.confirmPassword) e.confirmPassword = 'Re-enter the password.'
  else if (input.confirmPassword !== input.password) e.confirmPassword = 'Passwords do not match.'
  return e
}

/**
 * Create a faculty account. The role is always "faculty". The initial
 * password is hashed by the credential store and is never written anywhere in
 * plain text; it is not kept on the user record or in the audit trail.
 */
export async function createFacultyAccount(input: FacultyInput): Promise<FacultyUser> {
  const admin = requireActor('admin')
  const errors = validateFacultyInput(input)
  const firstField = Object.keys(errors)[0] as keyof FacultyInput | undefined
  if (firstField) throw new AdminError(errors[firstField]!.includes('already taken') ? 'duplicate' : 'invalid', errors[firstField]!, firstField)
  await delay(400)

  if (backendEnabled()) {
    // The server creates the account and hashes the password; the password is sent once, over HTTPS, and never kept here.
    let created: User
    try {
      created = await createStaffOnServer({
        role: 'faculty',
        email: input.username.trim().toLowerCase(),
        fullName: input.fullName.trim().replace(/\s+/g, ' '),
        department: input.department,
        designation: input.designation.trim(),
        reviewDepartments: input.reviewDepartments.length ? [...new Set(input.reviewDepartments)] : [input.department],
        password: input.password,
      })
    } catch (err) {
      throw serverError(err)
    }
    recordAudit(admin, 'faculty_created', `Created faculty account ${describe(created)} in ${created.department}`, created.id)
    return created as FacultyUser
  }

  const faculty: FacultyUser = {
    id: createId('fac'),
    role: 'faculty',
    username: input.username.trim().toLowerCase(),
    fullName: input.fullName.trim().replace(/\s+/g, ' '),
    department: input.department,
    designation: input.designation.trim(),
    reviewDepartments: input.reviewDepartments.length ? [...new Set(input.reviewDepartments)] : [input.department],
    createdAt: new Date().toISOString(),
    active: true,
  }
  // Hash first: if hashing isn't available, no half-created account is left behind.
  await setPassword(faculty.id, input.password)
  let clash = false
  setState((s) => {
    // Re-check uniqueness at the moment of writing (double submit, another tab).
    if (s.users.some((u) => u.username.toLowerCase() === faculty.username)) {
      clash = true
      return s
    }
    return { ...s, users: [...s.users, faculty] }
  })
  if (clash) throw new AdminError('duplicate', 'This email or username is already taken.', 'username')
  recordAudit(admin, 'faculty_created', `Created faculty account ${describe(faculty)} in ${faculty.department}`, faculty.id)
  return faculty
}

/** Why a new password isn't acceptable, or undefined when it is. The same rules the server applies. */
export function newPasswordError(password: string, confirmPassword: string): string | undefined {
  if (!password) return 'Enter the new password.'
  if (!PASSWORD_RULES.every((r) => r.test(password))) return 'At least 8 characters, with upper and lower case letters and a number.'
  if (password !== confirmPassword) return 'The two passwords do not match.'
  return undefined
}

function facultyTarget(userId: string): FacultyUser {
  const target = getState().users.find((u) => u.id === userId)
  if (!target) throw new AdminError('not_found', 'That account no longer exists.')
  if (target.role !== 'faculty') throw new AdminError('not_allowed', 'This is only for faculty accounts.')
  return target
}

/**
 * Set a new password for a faculty member. The old password stops working and their open sign-ins end. The new one is
 * hashed by whoever stores it and is kept nowhere in readable form, including the audit trail.
 */
export async function resetFacultyPassword(userId: string, password: string, confirmPassword: string): Promise<void> {
  const admin = requireActor('admin')
  const target = facultyTarget(userId)
  const problem = newPasswordError(password, confirmPassword)
  if (problem) throw new AdminError('invalid', problem, 'password')
  await delay(300)
  if (backendEnabled() && isServerId(userId)) {
    try {
      await resetPasswordOnServer(userId, password)
    } catch (err) {
      throw serverError(err)
    }
  } else {
    await setPassword(userId, password)
  }
  recordAudit(admin, 'faculty_password_reset', `Reset the password for ${describe(target)}`, target.id)
}

/**
 * Delete a faculty account. Only faculty can be deleted: students and administrators are deactivated instead, so the
 * records they own are never lost. The faculty member can no longer sign in; the student records they could see are untouched.
 */
export async function deleteFacultyAccount(userId: string): Promise<void> {
  const admin = requireActor('admin')
  const target = facultyTarget(userId)
  await delay(300)
  if (backendEnabled() && isServerId(userId)) {
    try {
      await deleteAccountOnServer(userId)
    } catch (err) {
      throw serverError(err)
    }
  } else {
    setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== userId) }))
  }
  recordAudit(admin, 'faculty_deleted', `Deleted faculty account ${describe(target)} in ${target.department}`, target.id)
}

/** The fields an administrator may correct on each kind of account. Username, role and register number are never editable. */
export const ADMIN_EDITABLE = {
  student: ['fullName', 'department', 'year', 'section'],
  faculty: ['fullName', 'department', 'designation', 'reviewDepartments'],
  admin: ['fullName', 'designation'],
} as const

export interface UserEdit {
  fullName: string
  department: string
  year: string
  section: string
  designation: string
  reviewDepartments: string[]
}

export function validateUserEdit(user: User, edit: UserEdit): Partial<Record<keyof UserEdit, string>> {
  const e: Partial<Record<keyof UserEdit, string>> = {}
  const name = edit.fullName.trim()
  if (!name) e.fullName = 'Enter a full name.'
  else if (name.length < 3 || name.length > 80) e.fullName = 'The name must be 3–80 characters.'
  if (user.role === 'student') {
    if (!(isActiveDepartment(edit.department) || (edit.department === user.department && isKnownDepartment(edit.department)))) e.department = 'Select an active department.'
    if (!['1', '2', '3', '4'].includes(edit.year)) e.year = 'Select a year.'
    if (!isKnownSection(edit.section)) e.section = 'Select a section from the list.'
  }
  if (user.role === 'faculty') Object.assign(e, validateFacultyProfile(edit, user.department))
  if (user.role === 'admin' && !edit.designation.trim()) e.designation = 'Enter a designation.'
  return e
}

/** Correct permitted fields on an account. Identity fields and credentials are never touched. */
export async function updateUserByAdmin(userId: string, edit: UserEdit): Promise<User> {
  const admin = requireActor('admin')
  const current = getState().users.find((u) => u.id === userId)
  if (!current) throw new AdminError('not_found', 'That account no longer exists.')
  const errors = validateUserEdit(current, edit)
  const firstField = Object.keys(errors)[0] as keyof UserEdit | undefined
  if (firstField) throw new AdminError('invalid', errors[firstField]!, firstField)
  await delay(300)

  if (backendEnabled() && isServerId(userId)) {
    const changes =
      current.role === 'student'
        ? { fullName: edit.fullName, department: edit.department, year: Number(edit.year), section: edit.section }
        : current.role === 'faculty'
          ? { fullName: edit.fullName, department: edit.department, designation: edit.designation, reviewDepartments: edit.reviewDepartments.length ? edit.reviewDepartments : [edit.department] }
          : { fullName: edit.fullName, designation: edit.designation }
    try {
      const updatedOnServer = await updateAccountOnServer(userId, changes)
      recordAudit(admin, 'profile_updated', `Updated details for ${describe(current)}`, current.id)
      return updatedOnServer
    } catch (err) {
      throw serverError(err)
    }
  }

  const fullName = edit.fullName.trim().replace(/\s+/g, ' ')
  let updated: User
  if (current.role === 'student') updated = { ...current, fullName, department: edit.department, year: Number(edit.year) as Year, section: edit.section } satisfies StudentUser
  else if (current.role === 'faculty') {
    updated = { ...current, fullName, department: edit.department, designation: edit.designation.trim(), reviewDepartments: edit.reviewDepartments.length ? [...new Set(edit.reviewDepartments)] : [edit.department] } satisfies FacultyUser
  } else updated = { ...current, fullName, designation: edit.designation.trim() } satisfies AdminUser

  const changed = (Object.keys(updated) as (keyof User)[]).filter((k) => JSON.stringify(updated[k]) !== JSON.stringify(current[k]))
  if (changed.length === 0) return current
  setState((s) => ({ ...s, users: s.users.map((u) => (u.id === userId ? updated : u)) }))
  recordAudit(admin, 'profile_updated', `Updated ${changed.join(', ')} for ${describe(current)}`, current.id)
  return updated
}

// ── Achievement register ─────────────────────────────────────────────────────// ── Achievement register ─────────────────────────────────────────────────────

export interface AdminRecordRow {
  achievement: Achievement
  studentName: string
  registerNumber: string
  department: string
  year: number | null
  section: string
  /** Admission-year batch code, derived from the register number. */
  batch: string
}

export type RecordSort = 'date_desc' | 'date_asc' | 'result'
export const RECORD_SORT_OPTIONS: { value: RecordSort; label: string }[] = [
  { value: 'date_desc', label: 'Newest submitted' },
  { value: 'date_asc', label: 'Oldest submitted' },
  { value: 'result', label: 'By recorded result' },
]

export interface RecordFilters {
  query?: string
  /** Record state. Archived records are left out unless this asks for them. */
  status?: RecordStatus | 'all'
  department?: string
  year?: string
  batch?: string
  /** Recorded achievement result. */
  result?: ResultGroup | 'all'
  category?: AchievementCategory | 'all'
  sort?: RecordSort
}

/**
 * The register of submitted achievements (drafts are a separate collection
 * and are never included), with search and filters applied together.
 * Search covers student name, register number, event name and reference ID.
 */
export function getAdminRecords(
  filters: RecordFilters = {},
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
  now = new Date(),
): AdminRecordRow[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  const q = filters.query?.trim().toLowerCase()
  const rows: AdminRecordRow[] = []
  for (const a of achievements) {
    const s = byId.get(a.studentId)
    const student = s?.role === 'student' ? s : undefined
    const row: AdminRecordRow = {
      achievement: a,
      studentName: student?.fullName ?? 'Unknown student',
      registerNumber: student?.registerNumber ?? '',
      department: student?.department ?? '',
      year: student?.year ?? null,
      section: student?.section ?? '',
      batch: student ? batchCodeOf(student, now) : 'unknown',
    }
    // Archived records stay out of the register unless asked for by name.
    if (!filters.status || filters.status === 'all' ? !isActiveRecord(a.status) : a.status !== filters.status) continue
    if (filters.category && filters.category !== 'all' && a.category !== filters.category) continue
    if (filters.result && filters.result !== 'all' && resultGroupOf(a) !== filters.result) continue
    if (filters.department && filters.department !== 'all' && row.department !== filters.department) continue
    if (filters.year && filters.year !== 'all' && String(row.year) !== filters.year) continue
    if (filters.batch && filters.batch !== 'all' && row.batch !== filters.batch) continue
    if (q && !`${row.studentName} ${row.registerNumber} ${a.eventName} ${a.reference}`.toLowerCase().includes(q)) continue
    rows.push(row)
  }
  const tie = (x: AdminRecordRow, y: AdminRecordRow) =>
    x.achievement.reference.localeCompare(y.achievement.reference) || x.achievement.id.localeCompare(y.achievement.id)
  const byDateDesc = (x: AdminRecordRow, y: AdminRecordRow) => y.achievement.submittedAt.localeCompare(x.achievement.submittedAt) || tie(x, y)
  if (filters.sort === 'date_asc') return rows.sort((x, y) => x.achievement.submittedAt.localeCompare(y.achievement.submittedAt) || tie(x, y))
  if (filters.sort === 'result') {
    const order = (r: AdminRecordRow) => RESULT_ORDER.indexOf(resultGroupOf(r.achievement))
    return rows.sort((x, y) => order(x) - order(y) || byDateDesc(x, y))
  }
  return rows.sort(byDateDesc)
}

const RESULT_ORDER: ResultGroup[] = ['winner', 'runner_up', 'participant', 'other']

export const RECORD_EXPORT_HEADERS = [
  'Reference ID',
  'Student name',
  'Register number',
  'Department',
  'Year',
  'Section',
  'Event name',
  'Category',
  'Organiser',
  'Event date',
  'Location',
  'Batch',
  'Achievement result',
  'Prize or position',
  'Record state',
  'Submitted at',
  'Last updated',
  'Certificate file',
  'Certificate type',
]

/**
 * CSV of exactly the rows given (i.e. the current filtered view). Contains
 * record and profile fields only — no usernames, credentials or session data.
 */
export function exportFilteredAchievements(rows: AdminRecordRow[]): string {
  const data: CsvValue[][] = rows.map(({ achievement: a, ...r }) => [
    a.reference,
    r.studentName,
    r.registerNumber,
    r.department,
    r.year ?? '',
    r.section,
    a.eventName,
    categoryLabel(a),
    a.organizer,
    a.eventDate,
    a.location ?? '',
    batchLabel(r.batch),
    a.achievementType,
    a.position ?? '',
    recordStatusLabel(a.status),
    a.submittedAt,
    a.updatedAt,
    a.certificate?.fileName ?? '',
    a.certificate?.fileType ? (ACCEPTED_TYPES[a.certificate.fileType] ?? '') : '',
  ])
  return toCsv(RECORD_EXPORT_HEADERS, data)
}

/** CSV of the analytics figures for a set of records (already filtered to a time range by the caller). */
export function exportAnalyticsSummary(achievements: Achievement[], users: User[], range: TimeRange, rangeLabel: string, now = new Date()): string {
  const overview = getAdminOverview(users, achievements)
  const rows: CsvValue[][] = [
    ['Overview', 'Time range', rangeLabel],
    ['Overview', 'Total achievement records', overview.totalRecords],
    ['Overview', 'Winners', overview.winner],
    ['Overview', 'Runners-up', overview.runner_up],
    ['Overview', 'Participants', overview.participant],
    ['Overview', 'Other / unclassified', overview.other],
    ['Overview', 'Awarded share (non-participant / total)', formatRate(getAwardRate(achievements))],
    ['Overview', 'Archived records', overview.archived],
    ...getResultDistribution(achievements).map((r): CsvValue[] => ['Result', RESULT_GROUPS[r.group].label, r.count]),
    ...RECORD_STATUS_ORDER.map((status): CsvValue[] => [
      'Record state',
      recordStatusLabel(status),
      achievements.filter((a) => a.status === status).length,
    ]),
    ...getDepartmentAchievementStats(achievements, users, getAcademicConfig().departments).flatMap((d): CsvValue[][] => [
      ['Department', `${d.code} total`, d.total],
      ['Department', `${d.code} winners`, d.counts.winner],
      ['Department', `${d.code} runners-up`, d.counts.runner_up],
      ['Department', `${d.code} participants`, d.counts.participant],
      ['Department', `${d.code} students with at least one achievement`, d.studentsWithAchievements],
    ]),
    ...getBatchAchievementStats(achievements, users, now).flatMap((b): CsvValue[][] => [
      ['Batch', `${b.label} records`, b.counts.total],
      ['Batch', `${b.label} winners`, b.counts.winner],
    ]),
    ...getCategoryAchievementStats(achievements).map((c): CsvValue[] => ['Category', c.category, c.count]),
    ...getAchievementTrends(achievements, range, now).buckets.map((b): CsvValue[] => ['Submissions over time', b.label, b.count]),
  ]
  return toCsv(['Section', 'Metric', 'Value'], rows)
}

// ── Activity ─────────────────────────────────────────────────────────────────

export type AdminActivityType = 'submitted' | 'updated' | 'archived' | 'restored' | 'account_created' | 'admin_action'

export const ACTIVITY_TYPE_LABEL: Record<AdminActivityType, string> = {
  submitted: 'Submissions',
  updated: 'Record updates',
  archived: 'Records archived',
  restored: 'Records restored',
  account_created: 'Accounts created',
  admin_action: 'Admin actions',
}

export interface AdminActivityItem {
  id: string
  type: AdminActivityType
  at: string
  title: string
  detail: string
  actor: string
  achievementId?: string
  userId?: string
}

function historyType(h: RecordEvent): AdminActivityType {
  if (h.kind === 'updated') return 'updated'
  if (h.kind === 'archived') return 'archived'
  if (h.kind === 'restored') return 'restored'
  return 'submitted'
}

const HISTORY_TITLE: Record<AdminActivityType, string> = {
  submitted: 'New achievement submitted',
  updated: 'Student updated an achievement',
  archived: 'Achievement record archived',
  restored: 'Achievement record restored',
  account_created: 'Account created',
  admin_action: 'Admin action',
}

/**
 * Institution-wide activity, newest first. Built only from what is actually
 * recorded: each record's own history, account creation dates, and the audit
 * trail of admin actions. Nothing is invented to fill the feed.
 */
export function getAdminActivity(
  state: { achievements: Achievement[]; users: User[]; audit: AuditEvent[] } = getState(),
  options: { limit?: number; type?: AdminActivityType | 'all' } = {},
): AdminActivityItem[] {
  const items: AdminActivityItem[] = []
  for (const a of state.achievements) {
    a.history.forEach((h, i) => {
      const type = historyType(h)
      items.push({ id: `${a.id}-${i}`, type, at: h.at, title: HISTORY_TITLE[type], detail: `${a.eventName} · ${a.reference}`, actor: h.byName, achievementId: a.id })
    })
  }
  // Accounts created through the admin workspace are already in the audit trail.
  const audited = new Set(state.audit.filter((e) => e.action === 'faculty_created').map((e) => e.targetUserId))
  for (const u of state.users) {
    if (audited.has(u.id) || !Number.isFinite(Date.parse(u.createdAt))) continue
    items.push({ id: `user-${u.id}`, type: 'account_created', at: u.createdAt, title: `${u.role === 'student' ? 'Student' : u.role === 'faculty' ? 'Faculty' : 'Administrator'} account created`, detail: `${u.fullName} · ${departmentName(u.department)}`, actor: u.fullName, userId: u.id })
  }
  for (const e of state.audit) {
    items.push({ id: e.id, type: e.action === 'faculty_created' ? 'account_created' : 'admin_action', at: e.at, title: e.action === 'faculty_created' ? 'Faculty account created' : 'Admin action', detail: e.summary, actor: e.actorName, userId: e.targetUserId })
  }
  const filtered = options.type && options.type !== 'all' ? items.filter((i) => i.type === options.type) : items
  const sorted = filtered.sort((x, y) => y.at.localeCompare(x.at) || x.id.localeCompare(y.id))
  return options.limit ? sorted.slice(0, options.limit) : sorted
}

// ── Archiving ────────────────────────────────────────────────────────────────

/**
 * Archive a record, or bring it back.
 *
 * This is the only change an administrator can make to an achievement, and
 * it is housekeeping rather than a judgement: an archived record keeps its
 * details, recorded result, certificate metadata, comments and history in
 * full, and simply stops appearing in active lists, counts and reports.
 * The change is appended to the record's history and the audit trail.
 */
export async function setRecordArchived(achievementId: string, archived: boolean, reason?: string): Promise<Achievement> {
  const admin = requireActor('admin')
  const note = reason?.trim().slice(0, MAX_NOTE_LENGTH) || undefined
  await delay(300)

  let result: Achievement | undefined
  let failure: Error | undefined
  setState((s) => {
    const current = s.achievements.find((a) => a.id === achievementId)
    if (!current) {
      failure = new AdminError('not_found', 'This achievement record no longer exists.')
      return s
    }
    const next: RecordStatus = archived ? 'archived' : 'submitted'
    if (current.status === next) {
      failure = new AdminError('not_allowed', archived ? 'This record is already archived.' : 'This record is already active.')
      return s
    }
    const at = new Date().toISOString()
    const updated: Achievement = {
      ...current,
      status: next,
      updatedAt: at,
      history: [
        ...current.history,
        {
          status: next,
          fromStatus: current.status,
          at,
          byName: admin.fullName,
          actorId: admin.id,
          actorRole: 'admin',
          kind: archived ? 'archived' : 'restored',
          note,
        },
      ],
    }
    result = updated
    return { ...s, achievements: s.achievements.map((a) => (a.id === current.id ? updated : a)) }
  })
  if (failure) throw failure
  recordAudit(
    admin,
    archived ? 'record_archived' : 'record_restored',
    `${archived ? 'Archived' : 'Restored'} ${result!.reference} — ${result!.eventName}${note ? `: ${note}` : ''}`,
  )
  return result!
}

/** Departments a new account may be placed in. */
export const assignableDepartments = () => activeDepartments()

export { PermissionError }
