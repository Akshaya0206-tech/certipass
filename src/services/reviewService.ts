/*
 * Faculty verification & communication — mock service.
 *
 * Queue, summary, review actions and comments. Rules enforced here, not just
 * in the pages:
 *  - the acting user comes from the session (services/auth/actor.ts);
 *  - a reviewer only sees and acts on records in their review scope;
 *  - a status only changes through REVIEW_ACTIONS in domain/status.ts;
 *  - a status change, its history entry, its comment and the student's
 *    notification are written in one store update, so they can't drift apart;
 *  - review actions never touch the student's event details, description or
 *    certificate metadata.
 *
 * Prototype note: all of this runs in the browser and can be bypassed by
 * anyone who edits local storage. Real authorisation belongs to the backend
 * and database (Phase 7).
 */
import { canReview, isAwaitingReview, MIN_REASON_LENGTH, REVIEW_ACTIONS, statusLabel } from '../domain/status'
import type { ReviewAction } from '../domain/status'
import type {
  Achievement,
  AchievementCategory,
  AppNotification,
  CommentType,
  FacultyUser,
  ReviewComment,
  StatusEvent,
  StudentUser,
  SubmissionStatus,
  User,
} from '../types'
import { currentActor, PermissionError, requireActor } from './auth/actor'
import { createId, delay, getState, setState } from './store'

export class ReviewError extends Error {
  readonly code: 'not_found' | 'invalid_transition' | 'invalid_input' | 'duplicate'
  constructor(code: ReviewError['code'], message: string) {
    super(message)
    this.name = 'ReviewError'
    this.code = code
  }
}

export const COMMENT_MAX_LENGTH = 1000
/** Identical text from the same author inside this window is treated as an accidental repeat. */
const DUPLICATE_WINDOW_MS = 5000

// ── Scope ────────────────────────────────────────────────────────────────────

/** The departments whose students this reviewer handles. */
export function reviewScope(faculty: Pick<FacultyUser, 'department' | 'reviewDepartments'>): string[] {
  return faculty.reviewDepartments?.length ? faculty.reviewDepartments : [faculty.department]
}

function studentOf(a: Achievement, users: User[]): StudentUser | undefined {
  const u = users.find((x) => x.id === a.studentId)
  return u?.role === 'student' ? u : undefined
}

/** A reviewer may access a record when its student belongs to one of their departments. */
export function canFacultyAccess(faculty: FacultyUser, a: Achievement, users: User[] = getState().users): boolean {
  const student = studentOf(a, users)
  return !!student && reviewScope(faculty).includes(student.department)
}

function facultyById(facultyId: string, users: User[]): FacultyUser | null {
  const u = users.find((x) => x.id === facultyId)
  return u?.role === 'faculty' ? u : null
}

/** Every record in the reviewer's scope. Drafts are a separate collection and can never appear here. */
export function getFacultyAchievements(facultyId: string, achievements: Achievement[] = getState().achievements, users: User[] = getState().users): Achievement[] {
  const faculty = facultyById(facultyId, users)
  if (!faculty) return []
  const scope = new Set(reviewScope(faculty))
  const dept = new Map(users.filter((u) => u.role === 'student').map((u) => [u.id, u.department]))
  return achievements.filter((a) => scope.has(dept.get(a.studentId) ?? ''))
}

/** Students in the reviewer's scope. */
export function getFacultyStudents(facultyId: string, users: User[] = getState().users): StudentUser[] {
  const faculty = facultyById(facultyId, users)
  if (!faculty) return []
  const scope = reviewScope(faculty)
  return users.filter((u): u is StudentUser => u.role === 'student' && scope.includes(u.department))
}

/** Null for unknown ids and for records outside the reviewer's scope alike. */
export function getFacultyAccessibleAchievement(
  facultyId: string,
  achievementId: string,
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
): Achievement | null {
  return getFacultyAchievements(facultyId, achievements, users).find((a) => a.id === achievementId) ?? null
}

// ── Queue and summary ────────────────────────────────────────────────────────

export type QueueSort = 'newest' | 'oldest_pending'
export const QUEUE_SORT_OPTIONS: { value: QueueSort; label: string }[] = [
  { value: 'newest', label: 'Newest submission' },
  { value: 'oldest_pending', label: 'Oldest pending first' },
]

export interface QueueFilters {
  query?: string
  status?: SubmissionStatus | 'all'
  department?: string
  year?: string
  category?: AchievementCategory | 'all'
  sort?: QueueSort
}

export interface QueueRow {
  achievement: Achievement
  studentName: string
  registerNumber: string
  department: string
  year: number | null
  section: string
}

/** When the record last entered the queue: its latest (re)submission. */
export function enteredQueueAt(a: Achievement): string {
  const last = [...a.history].reverse().find((h) => h.kind === 'submitted' || h.kind === 'resubmitted')
  return last?.at ?? a.submittedAt
}

/**
 * Rows for the reviewer, with search and filters applied together.
 * Search covers student name, register number, event name and reference ID.
 */
export function getFacultyReviewQueue(
  facultyId: string,
  filters: QueueFilters = {},
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
): QueueRow[] {
  const byId = new Map(users.map((u) => [u.id, u]))
  const q = filters.query?.trim().toLowerCase()
  const rows: QueueRow[] = []
  for (const a of getFacultyAchievements(facultyId, achievements, users)) {
    const s = byId.get(a.studentId)
    const student = s?.role === 'student' ? s : undefined
    const row: QueueRow = {
      achievement: a,
      studentName: student?.fullName ?? 'Unknown student',
      registerNumber: student?.registerNumber ?? '',
      department: student?.department ?? '',
      year: student?.year ?? null,
      section: student?.section ?? '',
    }
    if (filters.status && filters.status !== 'all' && a.status !== filters.status) continue
    if (filters.category && filters.category !== 'all' && a.category !== filters.category) continue
    if (filters.department && filters.department !== 'all' && row.department !== filters.department) continue
    if (filters.year && filters.year !== 'all' && String(row.year) !== filters.year) continue
    if (q && !`${row.studentName} ${row.registerNumber} ${a.eventName} ${a.reference}`.toLowerCase().includes(q)) continue
    rows.push(row)
  }
  const tie = (x: QueueRow, y: QueueRow) => x.achievement.reference.localeCompare(y.achievement.reference) || x.achievement.id.localeCompare(y.achievement.id)
  if (filters.sort === 'oldest_pending') {
    // Records still waiting on faculty come first, longest-waiting at the top; the rest follow, newest first.
    return rows.sort((x, y) => {
      const xp = isAwaitingReview(x.achievement.status)
      const yp = isAwaitingReview(y.achievement.status)
      if (xp !== yp) return xp ? -1 : 1
      return xp
        ? enteredQueueAt(x.achievement).localeCompare(enteredQueueAt(y.achievement)) || tie(x, y)
        : enteredQueueAt(y.achievement).localeCompare(enteredQueueAt(x.achievement)) || tie(x, y)
    })
  }
  return rows.sort((x, y) => enteredQueueAt(y.achievement).localeCompare(enteredQueueAt(x.achievement)) || tie(x, y))
}

export interface FacultyReviewSummary {
  /** status = submitted: waiting for a reviewer to pick it up. */
  awaitingReview: number
  /** status = under_review. */
  underReview: number
  /** status = needs_attention: waiting on the student. */
  needsAttention: number
  /** status = verified. */
  verified: number
  /** All records in scope. Equals the sum of the four counts above. */
  total: number
}

/** Counts over exactly the records the queue is built from. */
export function getFacultyReviewSummary(facultyId: string, achievements: Achievement[] = getState().achievements, users: User[] = getState().users): FacultyReviewSummary {
  const mine = getFacultyAchievements(facultyId, achievements, users)
  const count = (s: SubmissionStatus) => mine.filter((a) => a.status === s).length
  return { awaitingReview: count('submitted'), underReview: count('under_review'), needsAttention: count('needs_attention'), verified: count('verified'), total: mine.length }
}

// ── Review actions ───────────────────────────────────────────────────────────

const NOTICE: Record<ReviewAction, Pick<AppNotification, 'title' | 'tone' | 'type'>> = {
  start_review: { title: 'Review started', tone: 'info', type: 'review_started' },
  request_correction: { title: 'Correction requested', tone: 'attention', type: 'correction_requested' },
  verify: { title: 'Certificate verified', tone: 'success', type: 'verified' },
  reopen: { title: 'Review reopened', tone: 'attention', type: 'review_reopened' },
}

const excerpt = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text)

function cleanReason(action: ReviewAction, reason: string | undefined): string | undefined {
  const text = reason?.trim().replace(/\s+\n/g, '\n')
  const rule = REVIEW_ACTIONS[action]
  if (rule.requiresReason) {
    if (!text) throw new ReviewError('invalid_input', action === 'request_correction' ? 'Explain what the student needs to correct.' : 'Give a reason for reopening this review.')
    if (text.length < MIN_REASON_LENGTH) {
      throw new ReviewError('invalid_input', `Please be more specific — at least ${MIN_REASON_LENGTH} characters, so the student knows what to do.`)
    }
  }
  if (text && text.length > COMMENT_MAX_LENGTH) throw new ReviewError('invalid_input', `Keep this to ${COMMENT_MAX_LENGTH.toLocaleString()} characters or fewer.`)
  return text || undefined
}

/**
 * The one place a reviewer's status change happens. Checks the actor, the
 * scope and the transition against the record as it is *now*, then writes the
 * status, history entry, comment and notification together.
 */
async function performReviewAction(action: ReviewAction, facultyId: string, achievementId: string, reason?: string): Promise<Achievement> {
  const actor = requireActor('faculty')
  if (actor.id !== facultyId) throw new PermissionError('forbidden', 'You can only review as the signed-in reviewer.')
  const note = cleanReason(action, reason)
  await delay(400)

  const rule = REVIEW_ACTIONS[action]
  let result: Achievement | undefined
  let failure: Error | undefined
  setState((s) => {
    // Re-read inside the update: a double click or another tab may have changed the record meanwhile.
    const reviewer = s.users.find((u) => u.id === actor.id)
    const current = s.achievements.find((a) => a.id === achievementId)
    if (!reviewer || reviewer.role !== 'faculty' || !reviewer.active || !current || !canFacultyAccess(reviewer, current, s.users)) {
      failure = new ReviewError('not_found', 'This submission isn’t available for you to review.')
      return s
    }
    if (!canReview(action, current.status)) {
      failure = new ReviewError('invalid_transition', `“${rule.label}” isn’t available while a submission is ${statusLabel(current.status).toLowerCase()}.`)
      return s
    }
    const now = new Date().toISOString()
    const event: StatusEvent = { status: rule.to, fromStatus: current.status, at: now, byName: reviewer.fullName, actorId: reviewer.id, actorRole: 'faculty', kind: 'status', note }
    const comment: ReviewComment | undefined = note
      ? { id: createId('cmt'), authorId: reviewer.id, authorName: reviewer.fullName, authorRole: 'faculty', body: note, createdAt: now, type: action === 'request_correction' ? 'correction_request' : 'review_update' }
      : undefined
    // Only status, review metadata, history and comments change — never the student's own details or certificate.
    const updated: Achievement = {
      ...current,
      status: rule.to,
      updatedAt: now,
      reviewerId: reviewer.id,
      history: [...current.history, event],
      comments: comment ? [...current.comments, comment] : current.comments,
    }
    result = updated
    const notification: AppNotification = {
      id: createId('ntf'),
      userId: current.studentId,
      achievementId: current.id,
      createdAt: now,
      read: false,
      ...NOTICE[action],
      body: note && rule.requiresReason ? `${current.eventName} (${current.reference}): “${excerpt(note)}”` : `${current.eventName} (${current.reference})`,
    }
    return { ...s, achievements: s.achievements.map((a) => (a.id === current.id ? updated : a)), notifications: [notification, ...s.notifications] }
  })
  if (failure) throw failure
  return result!
}

/** Submitted → Under review. */
export const startReview = (facultyId: string, achievementId: string) => performReviewAction('start_review', facultyId, achievementId)

/** Under review → Needs attention. The request is required; it becomes a comment and a notification. */
export function requestAchievementCorrection(facultyId: string, achievementId: string, request: string, additionalNotes?: string) {
  const extra = additionalNotes?.trim()
  // Validate the request on its own first, so notes can't stand in for a missing request.
  const main = cleanReason('request_correction', request)!
  return performReviewAction('request_correction', facultyId, achievementId, extra ? `${main}\n\nReviewer notes: ${extra}` : main)
}

/** Under review → Verified. An optional remark is recorded with the decision. */
export const verifyAchievement = (facultyId: string, achievementId: string, remark?: string) => performReviewAction('verify', facultyId, achievementId, remark)

/** Verified → Under review. A reason is required and shown to the student. */
export const reopenReview = (facultyId: string, achievementId: string, reason: string) => performReviewAction('reopen', facultyId, achievementId, reason)

// ── Comments ─────────────────────────────────────────────────────────────────

/** A record's conversation, oldest first, each comment tagged with its achievement. */
export function getAchievementComments(a: Achievement): (ReviewComment & { achievementId: string; type: CommentType })[] {
  return [...a.comments]
    .sort((x, y) => x.createdAt.localeCompare(y.createdAt))
    .map((c) => ({ ...c, type: c.type ?? 'general', achievementId: a.id }))
}

function validateCommentBody(body: string): string {
  const text = body.trim()
  if (!text) throw new ReviewError('invalid_input', 'Write a comment before posting.')
  if (text.length > COMMENT_MAX_LENGTH) throw new ReviewError('invalid_input', `Comments are limited to ${COMMENT_MAX_LENGTH.toLocaleString()} characters.`)
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
export async function addComment(achievementId: string, body: string): Promise<ReviewComment> {
  const actor = currentActor()
  if (!actor) throw new PermissionError('not_signed_in', 'Your session has ended. Please sign in again.')
  if (actor.role === 'admin') throw new PermissionError('forbidden', 'Administrators can read conversations but not post in them.')
  const text = validateCommentBody(body)
  await delay(300)

  let posted: ReviewComment | undefined
  let failure: Error | undefined
  setState((s) => {
    const author = s.users.find((u) => u.id === actor.id)
    const current = s.achievements.find((a) => a.id === achievementId)
    const allowed =
      !!author && !!current && (author.role === 'faculty' ? canFacultyAccess(author, current, s.users) : author.role === 'student' && current.studentId === author.id)
    if (!author || !current || !allowed) {
      failure = new ReviewError('not_found', 'This achievement isn’t available.')
      return s
    }
    const nowMs = Date.now()
    if (current.comments.some((c) => c.authorId === author.id && c.body === text && nowMs - Date.parse(c.createdAt) < DUPLICATE_WINDOW_MS)) {
      failure = new ReviewError('duplicate', 'That comment was just posted.')
      return s
    }
    const now = new Date(nowMs).toISOString()
    const comment: ReviewComment = { id: createId('cmt'), authorId: author.id, authorName: author.fullName, authorRole: author.role, body: text, createdAt: now, type: 'general' }
    posted = comment
    const notifications: AppNotification[] =
      author.role === 'faculty'
        ? [
            {
              id: createId('ntf'),
              userId: current.studentId,
              achievementId: current.id,
              title: 'New comment from your reviewer',
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
  if (actor.id !== facultyId) throw new PermissionError('forbidden', 'You can only comment as the signed-in reviewer.')
  return addComment(achievementId, body)
}
