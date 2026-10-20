/*
 * Faculty record management — mock service.
 *
 * Faculty track and report on their departments' achievement records; they do
 * not approve them. A record is part of the register the moment the student
 * submits it, so there is no queue, no decision and no status to change here.
 *
 * Rules enforced here, not just in the pages:
 *  - the acting user comes from the session (services/auth/actor.ts);
 *  - a member of faculty only ever sees records belonging to students in the
 *    departments they cover;
 *  - drafts are a separate collection and can never appear in any of this;
 *  - comments never change a record's details, result or certificate.
 *
 * Prototype note: all of this runs in the browser and can be bypassed by
 * anyone who edits local storage. Real authorisation belongs to the backend
 * and database.
 */
import { batchCodeOf, UNKNOWN_BATCH } from '../domain/batch'
import { activeRecords, isActiveRecord } from '../domain/status'
import { countByResult, resultGroupOf } from '../domain/result'
import type { ResultCounts, ResultGroup } from '../domain/result'
import type {
  Achievement,
  AchievementCategory,
  AppNotification,
  CommentType,
  FacultyUser,
  RecordComment,
  StudentUser,
  User,
} from '../types'
import { currentActor, PermissionError, requireActor } from './auth/actor'
import { createId, delay, getState, setState } from './store'

export class RecordAccessError extends Error {
  readonly code: 'not_found' | 'invalid_input' | 'duplicate'
  constructor(code: RecordAccessError['code'], message: string) {
    super(message)
    this.name = 'RecordAccessError'
    this.code = code
  }
}

export const COMMENT_MAX_LENGTH = 1000
/** Identical text from the same author inside this window is treated as an accidental repeat. */
const DUPLICATE_WINDOW_MS = 5000

// ── Scope ────────────────────────────────────────────────────────────────────

/** The departments whose students this member of faculty oversees. */
export function facultyScope(faculty: Pick<FacultyUser, 'department' | 'reviewDepartments'>): string[] {
  return faculty.reviewDepartments?.length ? faculty.reviewDepartments : [faculty.department]
}

function studentOf(a: Achievement, users: User[]): StudentUser | undefined {
  const u = users.find((x) => x.id === a.studentId)
  return u?.role === 'student' ? u : undefined
}

/** Faculty may open a record when its student belongs to one of their departments. */
export function canFacultyAccess(faculty: FacultyUser, a: Achievement, users: User[] = getState().users): boolean {
  const student = studentOf(a, users)
  return !!student && facultyScope(faculty).includes(student.department)
}

function facultyById(facultyId: string, users: User[]): FacultyUser | null {
  const u = users.find((x) => x.id === facultyId)
  return u?.role === 'faculty' ? u : null
}

/**
 * Every record in this member of faculty's scope, archived ones included.
 * Drafts are a separate collection and can never appear here.
 */
export function getFacultyAchievements(
  facultyId: string,
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
): Achievement[] {
  const faculty = facultyById(facultyId, users)
  if (!faculty) return []
  const scope = new Set(facultyScope(faculty))
  const dept = new Map(users.filter((u) => u.role === 'student').map((u) => [u.id, u.department]))
  return achievements.filter((a) => scope.has(dept.get(a.studentId) ?? ''))
}

/** Students in this member of faculty's scope. */
export function getFacultyStudents(facultyId: string, users: User[] = getState().users): StudentUser[] {
  const faculty = facultyById(facultyId, users)
  if (!faculty) return []
  const scope = facultyScope(faculty)
  return users.filter((u): u is StudentUser => u.role === 'student' && scope.includes(u.department))
}

/** Null for unknown ids and for records outside the scope alike. */
export function getFacultyAccessibleAchievement(
  facultyId: string,
  achievementId: string,
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
): Achievement | null {
  return getFacultyAchievements(facultyId, achievements, users).find((a) => a.id === achievementId) ?? null
}

// ── Record rows, filters and counts ──────────────────────────────────────────

export type RecordSort = 'newest' | 'oldest' | 'event_desc' | 'student'
export const RECORD_SORT_OPTIONS: { value: RecordSort; label: string }[] = [
  { value: 'newest', label: 'Recently submitted' },
  { value: 'oldest', label: 'Earliest submitted' },
  { value: 'event_desc', label: 'Event date · newest' },
  { value: 'student', label: 'Student name' },
]

export interface FacultyRecordFilters {
  query?: string
  category?: AchievementCategory | 'all'
  department?: string
  year?: string
  section?: string
  batch?: string
  /** Groups by recorded achievement result — never a workflow state. */
  result?: ResultGroup | 'all'
  sort?: RecordSort
  /** Archived records are left out unless this is set. */
  includeArchived?: boolean
}

/** One record with the student details a faculty list needs beside it. */
export interface FacultyRecordRow {
  achievement: Achievement
  studentId: string
  studentName: string
  username: string
  registerNumber: string
  department: string
  year: number | null
  section: string
  batch: string
  result: ResultGroup
}

function toRow(a: Achievement, student: StudentUser | undefined, now: Date): FacultyRecordRow {
  return {
    achievement: a,
    studentId: a.studentId,
    studentName: student?.fullName ?? 'Unknown student',
    username: student?.username ?? '',
    registerNumber: student?.registerNumber ?? '',
    department: student?.department ?? '',
    year: student?.year ?? null,
    section: student?.section ?? '',
    batch: student ? batchCodeOf(student, now) : UNKNOWN_BATCH,
    result: resultGroupOf(a),
  }
}

/** Every record in scope as a row, before filtering. */
export function getFacultyRecordRows(
  facultyId: string,
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
  now = new Date(),
): FacultyRecordRow[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  return getFacultyAchievements(facultyId, achievements, users).map((a) => {
    const u = byId.get(a.studentId)
    return toRow(a, u?.role === 'student' ? u : undefined, now)
  })
}

/**
 * Rows for a faculty list, with search and filters applied together.
 * Search covers student name, register number, username, event name and
 * reference ID.
 */
export function getFacultyRecords(
  facultyId: string,
  filters: FacultyRecordFilters = {},
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
  now = new Date(),
): FacultyRecordRow[] {
  const q = filters.query?.trim().toLowerCase()
  const rows = getFacultyRecordRows(facultyId, achievements, users, now).filter((r) => {
    const a = r.achievement
    if (!filters.includeArchived && !isActiveRecord(a.status)) return false
    if (filters.category && filters.category !== 'all' && a.category !== filters.category) return false
    if (filters.result && filters.result !== 'all' && r.result !== filters.result) return false
    if (filters.department && filters.department !== 'all' && r.department !== filters.department) return false
    if (filters.year && filters.year !== 'all' && String(r.year) !== filters.year) return false
    if (filters.section && filters.section !== 'all' && r.section !== filters.section) return false
    if (filters.batch && filters.batch !== 'all' && r.batch !== filters.batch) return false
    if (q && !`${r.studentName} ${r.registerNumber} ${r.username} ${a.eventName} ${a.reference}`.toLowerCase().includes(q)) return false
    return true
  })
  const tie = (x: FacultyRecordRow, y: FacultyRecordRow) =>
    x.achievement.reference.localeCompare(y.achievement.reference) || x.achievement.id.localeCompare(y.achievement.id)
  switch (filters.sort) {
    case 'oldest':
      return rows.sort((x, y) => x.achievement.submittedAt.localeCompare(y.achievement.submittedAt) || tie(x, y))
    case 'event_desc':
      return rows.sort((x, y) => y.achievement.eventDate.localeCompare(x.achievement.eventDate) || tie(x, y))
    case 'student':
      return rows.sort(
        (x, y) => x.studentName.localeCompare(y.studentName) || y.achievement.submittedAt.localeCompare(x.achievement.submittedAt) || tie(x, y),
      )
    default:
      return rows.sort((x, y) => y.achievement.submittedAt.localeCompare(x.achievement.submittedAt) || tie(x, y))
  }
}

export interface FacultyRecordSummary extends ResultCounts {
  /** Students in scope who have at least one active record. */
  studentsWithRecords: number
  /** Students in scope, whether or not they have records. */
  students: number
  /** Distinct batches among the students in scope. */
  batches: number
  /** Records submitted in the last 30 days. */
  recent: number
  /** Archived records in scope. Not part of the result counts above. */
  archived: number
}

const THIRTY_DAYS = 30 * 86_400_000

/**
 * Counts over exactly the records the faculty lists are built from: active
 * records only, grouped by recorded result.
 */
export function getFacultyRecordSummary(
  facultyId: string,
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
  now = new Date(),
): FacultyRecordSummary {
  const all = getFacultyAchievements(facultyId, achievements, users)
  const active = activeRecords(all)
  const students = getFacultyStudents(facultyId, users)
  const since = now.getTime() - THIRTY_DAYS
  return {
    ...countByResult(active),
    studentsWithRecords: new Set(active.map((a) => a.studentId)).size,
    students: students.length,
    batches: new Set(students.map((s) => batchCodeOf(s, now))).size,
    recent: active.filter((a) => {
      const t = Date.parse(a.submittedAt)
      return Number.isFinite(t) && t >= since
    }).length,
    archived: all.length - active.length,
  }
}

/** A student in scope with their record counts, for the Students list. */
export interface FacultyStudentRow {
  student: StudentUser
  batch: string
  counts: ResultCounts
  /** The most recent submission, or null when the student has none. */
  lastSubmittedAt: string | null
}

export function getFacultyStudentRows(
  facultyId: string,
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
  now = new Date(),
): FacultyStudentRow[] {
  const active = activeRecords(getFacultyAchievements(facultyId, achievements, users))
  const byStudent = new Map<string, Achievement[]>()
  for (const a of active) byStudent.set(a.studentId, [...(byStudent.get(a.studentId) ?? []), a])
  return getFacultyStudents(facultyId, users).map((student) => {
    const mine = byStudent.get(student.id) ?? []
    const last = mine.reduce<string | null>((latest, a) => (latest === null || a.submittedAt > latest ? a.submittedAt : latest), null)
    return { student, batch: batchCodeOf(student, now), counts: countByResult(mine), lastSubmittedAt: last }
  })
}

// ── Comments ─────────────────────────────────────────────────────────────────

/**
 * A record's conversation, oldest first. A comment is an ordinary message
 * between a student and the faculty who cover their department; it carries no
 * decision and changes nothing about the record.
 */
export function getAchievementComments(a: Achievement): (RecordComment & { achievementId: string; type: CommentType })[] {
  return [...a.comments]
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    .map((c) => ({ ...c, type: c.type ?? 'general', achievementId: a.id }))
}

const excerpt = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text)

function validateCommentBody(body: string): string {
  const text = body.trim()
  if (!text) throw new RecordAccessError('invalid_input', 'Write a comment before posting.')
  if (text.length > COMMENT_MAX_LENGTH) {
    throw new RecordAccessError('invalid_input', `Comments are limited to ${COMMENT_MAX_LENGTH.toLocaleString()} characters.`)
  }
  return text
}

/**
 * Post a comment as the signed-in user. Author id, name and role are taken
 * from the session, so a student can't post a faculty-authored comment.
 *  - Faculty: only on records in their scope; the student is notified.
 *  - Student: only on their own records.
 * An identical comment from the same author within a few seconds is rejected
 * as an accidental repeat.
 */
export async function addComment(achievementId: string, body: string): Promise<RecordComment> {
  const actor = currentActor()
  if (!actor) throw new PermissionError('not_signed_in', 'Your session has ended. Please sign in again.')
  if (actor.role === 'admin') throw new PermissionError('forbidden', 'Administrators can read conversations but not post in them.')
  const text = validateCommentBody(body)
  await delay(300)

  let posted: RecordComment | undefined
  let failure: Error | undefined
  setState((s) => {
    const author = s.users.find((u) => u.id === actor.id)
    const current = s.achievements.find((a) => a.id === achievementId)
    const allowed =
      !!author &&
      !!current &&
      (author.role === 'faculty' ? canFacultyAccess(author, current, s.users) : author.role === 'student' && current.studentId === author.id)
    if (!author || !current || !allowed) {
      failure = new RecordAccessError('not_found', 'This achievement isn’t available.')
      return s
    }
    const nowMs = Date.now()
    if (current.comments.some((c) => c.authorId === author.id && c.body === text && nowMs - Date.parse(c.createdAt) < DUPLICATE_WINDOW_MS)) {
      failure = new RecordAccessError('duplicate', 'That comment was just posted.')
      return s
    }
    const now = new Date(nowMs).toISOString()
    const comment: RecordComment = {
      id: createId('cmt'),
      authorId: author.id,
      authorName: author.fullName,
      authorRole: author.role,
      body: text,
      createdAt: now,
      type: 'general',
    }
    posted = comment
    const notifications: AppNotification[] =
      author.role === 'faculty'
        ? [
            {
              id: createId('ntf'),
              userId: current.studentId,
              achievementId: current.id,
              title: 'New comment from faculty',
              body: `${current.eventName}: “${excerpt(text)}”`,
              createdAt: now,
              read: false,
              tone: 'info',
              type: 'comment',
            },
            ...s.notifications,
          ]
        : s.notifications
    return {
      ...s,
      achievements: s.achievements.map((a) => (a.id === current.id ? { ...a, updatedAt: now, comments: [...a.comments, comment] } : a)),
      notifications,
    }
  })
  if (failure) throw failure
  return posted!
}

/** Faculty-only wrapper, for callers that want the role checked up front. */
export function addFacultyComment(facultyId: string, achievementId: string, body: string) {
  const actor = requireActor('faculty')
  if (actor.id !== facultyId) throw new PermissionError('forbidden', 'You can only comment as the signed-in account.')
  return addComment(achievementId, body)
}
