/*
 * Admin management — mock service.
 *
 * Accounts (view, edit permitted fields, activate/deactivate, create faculty),
 * the achievement register (search, filter, sort, CSV export) and the activity
 * feed. Figures and charts live in analyticsService.ts.
 *
 * Every change requires a signed-in administrator (services/auth/actor.ts)
 * and is written to the audit trail. Records are never deleted: accounts are
 * deactivated, and achievements are read-only for administrators so the
 * faculty verification workflow can't be bypassed from here.
 *
 * Prototype note: these checks run in the browser. They keep the prototype
 * consistent; they are not security. A backend must enforce them.
 */
import { STATUS_ORDER, statusLabel } from '../domain/status'
import { toCsv } from '../lib/csv'
import type { CsvValue } from '../lib/csv'
import type { Achievement, AchievementCategory, AdminUser, AuditEvent, FacultyUser, StudentUser, SubmissionStatus, User, Year } from '../types'
import { activeDepartments, departmentName, getAcademicConfig, isActiveDepartment, isKnownDepartment, isKnownSection } from './academicService'
import { categoryLabel } from './achievementValidation'
import {
  formatRate,
  getAchievementStatusDistribution,
  getAchievementTrends,
  getAdminOverview,
  getCategoryAchievementStats,
  getDepartmentAchievementStats,
  getVerificationRate,
} from './analyticsService'
import type { TimeRange } from './analyticsService'
import { PermissionError, requireActor } from './auth/actor'
import { setPassword } from './auth/credentials'
import { PASSWORD_RULES, USERNAME_PATTERN } from './auth/validation'
import { recordAudit } from './auditService'
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
export function setUserActive(userId: string, active: boolean): User {
  const admin = requireActor('admin')
  const target = getState().users.find((u) => u.id === userId)
  if (!target) throw new AdminError('not_found', 'That account no longer exists.')
  if (target.id === admin.id && !active) throw new AdminError('not_allowed', 'You can’t deactivate the account you’re signed in with.')
  if (target.active === active) return target
  const updated = { ...target, active } as User
  setState((s) => ({ ...s, users: s.users.map((u) => (u.id === userId ? updated : u)) }))
  recordAudit(admin, active ? 'account_activated' : 'account_deactivated', `${active ? 'Activated' : 'Deactivated'} ${describe(target)}`, target.id)
  return updated
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
  if (!username) e.username = 'Choose a username.'
  else if (!USERNAME_PATTERN.test(username)) e.username = '3–24 characters: lowercase letters, numbers, dots or underscores. Must start with a letter or number.'
  else if (users.some((u) => u.username.toLowerCase() === username)) e.username = 'This username is already taken.'
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
  if (clash) throw new AdminError('duplicate', 'This username is already taken.', 'username')
  recordAudit(admin, 'faculty_created', `Created faculty account ${describe(faculty)} in ${faculty.department}`, faculty.id)
  return faculty
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

// ── Account details ──────────────────────────────────────────────────────────

export interface ReviewActivityItem {
  at: string
  action: string
  achievementId: string
  eventName: string
  reference: string
}

const REVIEW_ACTION_LABEL: Record<SubmissionStatus, string> = { under_review: 'Started review', needs_attention: 'Requested correction', verified: 'Verified', submitted: 'Returned to queue' }

/** A reviewer's recorded actions, newest first, taken from the records' own status history. */
export function getFacultyReviewActivity(faculty: Pick<FacultyUser, 'id' | 'fullName'>, achievements: Achievement[] = getState().achievements): ReviewActivityItem[] {
  const items: ReviewActivityItem[] = []
  for (const a of achievements) {
    a.history.forEach((h, i) => {
      if (h.kind !== 'status') return
      // Older entries have no actorId; fall back to the recorded name.
      const mine = h.actorId ? h.actorId === faculty.id : h.byName === faculty.fullName
      if (!mine) return
      const reopened = h.status === 'under_review' && (h.fromStatus ?? a.history[i - 1]?.status) === 'verified'
      items.push({ at: h.at, action: reopened ? 'Reopened review' : REVIEW_ACTION_LABEL[h.status], achievementId: a.id, eventName: a.eventName, reference: a.reference })
    })
  }
  return items.sort((x, y) => y.at.localeCompare(x.at))
}

// ── Achievement register ─────────────────────────────────────────────────────

export interface AdminRecordRow {
  achievement: Achievement
  studentName: string
  registerNumber: string
  department: string
  year: number | null
  section: string
  reviewerName: string
}

export type RecordSort = 'date_desc' | 'date_asc' | 'status'
export const RECORD_SORT_OPTIONS: { value: RecordSort; label: string }[] = [
  { value: 'date_desc', label: 'Newest submitted' },
  { value: 'date_asc', label: 'Oldest submitted' },
  { value: 'status', label: 'By status' },
]

export interface RecordFilters {
  query?: string
  status?: SubmissionStatus | 'all'
  department?: string
  year?: string
  category?: AchievementCategory | 'all'
  sort?: RecordSort
}

/**
 * The register of submitted achievements (drafts are a separate collection
 * and are never included), with search and filters applied together.
 * Search covers student name, register number, event name and reference ID.
 */
export function getAdminRecords(filters: RecordFilters = {}, achievements: Achievement[] = getState().achievements, users: User[] = getState().users): AdminRecordRow[] {
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
      reviewerName: (a.reviewerId && byId.get(a.reviewerId)?.fullName) || '',
    }
    if (filters.status && filters.status !== 'all' && a.status !== filters.status) continue
    if (filters.category && filters.category !== 'all' && a.category !== filters.category) continue
    if (filters.department && filters.department !== 'all' && row.department !== filters.department) continue
    if (filters.year && filters.year !== 'all' && String(row.year) !== filters.year) continue
    if (q && !`${row.studentName} ${row.registerNumber} ${a.eventName} ${a.reference}`.toLowerCase().includes(q)) continue
    rows.push(row)
  }
  const tie = (x: AdminRecordRow, y: AdminRecordRow) => x.achievement.reference.localeCompare(y.achievement.reference) || x.achievement.id.localeCompare(y.achievement.id)
  const byDateDesc = (x: AdminRecordRow, y: AdminRecordRow) => y.achievement.submittedAt.localeCompare(x.achievement.submittedAt) || tie(x, y)
  if (filters.sort === 'date_asc') return rows.sort((x, y) => x.achievement.submittedAt.localeCompare(y.achievement.submittedAt) || tie(x, y))
  if (filters.sort === 'status') return rows.sort((x, y) => STATUS_ORDER.indexOf(x.achievement.status) - STATUS_ORDER.indexOf(y.achievement.status) || byDateDesc(x, y))
  return rows.sort(byDateDesc)
}

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
  'Achievement type',
  'Prize or position',
  'Status',
  'Submitted at',
  'Last updated',
  'Reviewer',
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
    a.achievementType,
    a.position ?? '',
    statusLabel(a.status),
    a.submittedAt,
    a.updatedAt,
    r.reviewerName,
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
    ['Overview', 'Total submitted achievements', overview.totalRecords],
    ['Overview', 'Verified', overview.verified],
    ['Overview', 'Pending review (submitted + under review)', overview.pendingVerification],
    ['Overview', 'Needs attention', overview.needsAttention],
    ['Overview', 'Verification rate (verified / total)', formatRate(getVerificationRate(achievements))],
    ...getAchievementStatusDistribution(achievements).map((s): CsvValue[] => ['Status', statusLabel(s.status), s.count]),
    ...getDepartmentAchievementStats(achievements, users, getAcademicConfig().departments).flatMap((d): CsvValue[][] => [
      ['Department', `${d.code} total`, d.total],
      ['Department', `${d.code} verified`, d.verified],
      ['Department', `${d.code} pending`, d.pending],
      ['Department', `${d.code} students with at least one achievement`, d.studentsWithAchievements],
    ]),
    ...getCategoryAchievementStats(achievements).map((c): CsvValue[] => ['Category', c.category, c.count]),
    ...getAchievementTrends(achievements, range, now).buckets.map((b): CsvValue[] => ['Submissions over time', b.label, b.count]),
  ]
  return toCsv(['Section', 'Metric', 'Value'], rows)
}

// ── Activity ─────────────────────────────────────────────────────────────────

export type AdminActivityType = 'submitted' | 'resubmitted' | 'review_started' | 'correction_requested' | 'verified' | 'review_reopened' | 'account_created' | 'admin_action'

export const ACTIVITY_TYPE_LABEL: Record<AdminActivityType, string> = {
  submitted: 'Submissions',
  resubmitted: 'Resubmissions',
  review_started: 'Reviews started',
  correction_requested: 'Correction requests',
  verified: 'Verifications',
  review_reopened: 'Reviews reopened',
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

function historyType(a: Achievement, i: number): AdminActivityType {
  const h = a.history[i]
  if (h.kind === 'submitted') return 'submitted'
  if (h.kind === 'resubmitted') return 'resubmitted'
  if (h.status === 'needs_attention') return 'correction_requested'
  if (h.status === 'verified') return 'verified'
  return (h.fromStatus ?? a.history[i - 1]?.status) === 'verified' ? 'review_reopened' : 'review_started'
}

const HISTORY_TITLE: Record<AdminActivityType, string> = {
  submitted: 'New achievement submitted',
  resubmitted: 'Student resubmitted an achievement',
  review_started: 'Achievement moved into review',
  correction_requested: 'Correction requested',
  verified: 'Achievement verified',
  review_reopened: 'Review reopened',
  account_created: 'Account created',
  admin_action: 'Admin action',
}

/**
 * Institution-wide activity, newest first. Built only from what is actually
 * recorded: each record's status history, account creation dates, and the
 * audit trail of admin actions. Nothing is invented to fill the feed.
 */
export function getAdminActivity(
  state: { achievements: Achievement[]; users: User[]; audit: AuditEvent[] } = getState(),
  options: { limit?: number; type?: AdminActivityType | 'all' } = {},
): AdminActivityItem[] {
  const items: AdminActivityItem[] = []
  for (const a of state.achievements) {
    a.history.forEach((h, i) => {
      const type = historyType(a, i)
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

/** Departments a new account may be placed in. */
export const assignableDepartments = () => activeDepartments()

export { PermissionError }
