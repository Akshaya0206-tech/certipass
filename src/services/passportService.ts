/*
 * Student Achievement Passport — student-scoped queries and actions.
 *
 * Every function takes the authenticated student's id and only ever returns
 * or changes that student's records. Pages pass in the store slice they are
 * subscribed to (so they re-render on change); the default reads the store.
 *
 * Prototype note: scoping here is enforced in the browser. A real backend
 * must enforce the same rule server-side (e.g. row-level security).
 */
import { bucketOf } from '../domain/status'
import { isKnownDepartment, isKnownSection } from './academicService'
import type { Achievement, AchievementCategory, AppNotification, StudentUser, SubmissionStatus, User } from '../types'
import { filterAchievements } from './achievementService'
import { delay, getState, setState } from './store'

// ── Errors ───────────────────────────────────────────────────────────────────

export class PassportError extends Error {
  readonly code: 'not_found' | 'not_editable' | 'invalid_profile' | 'invalid_input' | 'service_unavailable'
  constructor(code: PassportError['code'], message: string) {
    super(message)
    this.name = 'PassportError'
    this.code = code
  }
}

/**
 * Development aid: add `?mockFail=1` to any student page URL to make the next
 * mock service call fail, so error states can be demonstrated and tested.
 */
export function simulateFailureIfRequested() {
  if (import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('mockFail') === '1') {
    throw new PassportError('service_unavailable', 'The achievement service didn’t respond. This is a simulated failure.')
  }
}

// ── Profile ──────────────────────────────────────────────────────────────────

/** Problems that would make the passport header or scoping unreliable. */
export function validateStudentProfile(user: User | null | undefined): string[] {
  if (!user) return ['No student profile is associated with this session.']
  if (user.role !== 'student') return ['This account is not a student account.']
  const issues: string[] = []
  if (!user.registerNumber) issues.push('Register number is missing.')
  if (!isKnownDepartment(user.department)) issues.push('Department is not recognised.')
  if (![1, 2, 3, 4].includes(user.year)) issues.push('Year of study is missing.')
  if (!isKnownSection(user.section)) issues.push('Section is missing.')
  return issues
}

/** Simulated "fetch" of the passport: confirms the profile and that the service is reachable. */
export async function loadPassport(studentId: string): Promise<StudentUser> {
  await delay(300)
  simulateFailureIfRequested()
  const user = getState().users.find((u) => u.id === studentId)
  if (!user || user.role !== 'student') throw new PassportError('invalid_profile', 'We couldn’t find a student profile for this session.')
  return user
}

// ── Queries ──────────────────────────────────────────────────────────────────

const source = () => getState().achievements

/** The only entry point to a student's records: everything else builds on it. */
export function getMyAchievements(studentId: string, all: Achievement[] = source()): Achievement[] {
  return all.filter((a) => a.studentId === studentId)
}

/** Returns null both for unknown ids and for other students' records, so existence isn't revealed. */
export function getAchievementById(studentId: string, achievementId: string, all: Achievement[] = source()): Achievement | null {
  return all.find((a) => a.id === achievementId && a.studentId === studentId) ?? null
}

export type SortKey = 'event_desc' | 'event_asc' | 'updated_desc'
export const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'event_desc', label: 'Event date · newest' },
  { value: 'event_asc', label: 'Event date · oldest' },
  { value: 'updated_desc', label: 'Recently updated' },
]

export interface PassportFilters {
  query?: string
  category?: AchievementCategory | 'all'
  status?: SubmissionStatus | 'all'
  year?: string
  /** Inclusive event-date range, YYYY-MM-DD. */
  from?: string
  to?: string
  sort?: SortKey
}

/** Ties are broken by reference, then id, so equal dates always order the same way. */
function compareBy(sort: SortKey) {
  const tie = (a: Achievement, b: Achievement) => a.reference.localeCompare(b.reference) || a.id.localeCompare(b.id)
  switch (sort) {
    case 'event_asc':
      return (a: Achievement, b: Achievement) => a.eventDate.localeCompare(b.eventDate) || tie(a, b)
    case 'updated_desc':
      return (a: Achievement, b: Achievement) => b.updatedAt.localeCompare(a.updatedAt) || tie(b, a)
    default:
      return (a: Achievement, b: Achievement) => b.eventDate.localeCompare(a.eventDate) || tie(b, a)
  }
}

export function sortAchievements(list: Achievement[], sort: SortKey = 'event_desc') {
  return [...list].sort(compareBy(sort))
}

/**
 * Search + filters + sort, all applied together. Search covers event name,
 * organiser, category, result/position, certificate file name and reference.
 */
export function searchAchievements(studentId: string, filters: PassportFilters, all: Achievement[] = source()): Achievement[] {
  const mine = getMyAchievements(studentId, all)
  const matched = filterAchievements(mine, {
    query: filters.query,
    category: filters.category,
    status: filters.status,
    year: filters.year,
  }).filter((a) => (!filters.from || a.eventDate >= filters.from) && (!filters.to || a.eventDate <= filters.to))
  return sortAchievements(matched, filters.sort)
}

export interface AchievementSummary {
  total: number
  verified: number
  /** submitted + under review: waiting on faculty. */
  inReview: number
  submitted: number
  underReview: number
  /** Waiting on the student. */
  needsAttention: number
}

/** Each record counts in exactly one of verified / inReview / needsAttention. */
export function getAchievementSummary(studentId: string, all: Achievement[] = source()): AchievementSummary {
  const mine = getMyAchievements(studentId, all)
  const summary: AchievementSummary = { total: mine.length, verified: 0, inReview: 0, submitted: 0, underReview: 0, needsAttention: 0 }
  for (const a of mine) {
    summary[bucketOf(a.status)]++
    if (a.status === 'submitted') summary.submitted++
    if (a.status === 'under_review') summary.underReview++
  }
  return summary
}

export interface TimelineYear {
  year: string
  entries: Achievement[]
  verified: number
}

/** Records grouped by event year (newest year first), each year ordered newest event first. */
export function getAchievementTimeline(studentId: string, all: Achievement[] = source()): TimelineYear[] {
  return groupByYear(getMyAchievements(studentId, all))
}

export function groupByYear(list: Achievement[]): TimelineYear[] {
  const groups = new Map<string, Achievement[]>()
  for (const a of sortAchievements(list, 'event_desc')) {
    const y = a.eventDate.slice(0, 4)
    groups.set(y, [...(groups.get(y) ?? []), a])
  }
  return [...groups.entries()].map(([year, entries]) => ({ year, entries, verified: entries.filter((e) => e.status === 'verified').length }))
}

export function eventYearsOf(list: Achievement[]) {
  return [...new Set(list.map((a) => a.eventDate.slice(0, 4)))].sort().reverse()
}

export type ActivityType = 'submitted' | 'resubmitted' | 'review_started' | 'review_reopened' | 'correction_requested' | 'verified' | 'returned' | 'comment'

export interface ActivityItem {
  id: string
  type: ActivityType
  label: string
  at: string
  actor: string
  achievementId: string
  eventName: string
  excerpt?: string
}

const ACTIVITY_LABEL: Record<ActivityType, string> = {
  submitted: 'Certificate submitted',
  resubmitted: 'Achievement updated and resubmitted',
  review_started: 'Review started',
  review_reopened: 'Review reopened by faculty',
  correction_requested: 'Faculty requested clarification',
  verified: 'Certificate verified',
  returned: 'Returned to the review queue',
  comment: 'Faculty comment',
}

function activityType(e: Achievement['history'][number]): ActivityType {
  if (e.kind === 'resubmitted') return 'resubmitted'
  if (e.kind === 'submitted') return 'submitted'
  switch (e.status) {
    case 'under_review':
      return e.fromStatus === 'verified' ? 'review_reopened' : 'review_started'
    case 'needs_attention':
      return 'correction_requested'
    case 'verified':
      return 'verified'
    default:
      return 'returned'
  }
}

/**
 * Activity feed built from each record's own status history and faculty
 * comments, so it can never contradict a record's actual status.
 * (Correction requests already include the reviewer's note, so the comment
 * posted alongside one isn't listed twice.)
 */
export function getRecentActivity(studentId: string, all: Achievement[] = source(), limit = 8): ActivityItem[] {
  const items: ActivityItem[] = []
  for (const a of getMyAchievements(studentId, all)) {
    a.history.forEach((h, i) => {
      const type = activityType(h)
      // A reviewer's reason is recorded on the history entry (older records only have it as a comment).
      const reason =
        h.kind === 'status' || h.kind === undefined
          ? (h.note ?? (type === 'correction_requested' ? a.comments.find((c) => c.createdAt === h.at && c.authorRole !== 'student')?.body : undefined))
          : undefined
      items.push({ id: `${a.id}-h${i}`, type, label: ACTIVITY_LABEL[type], at: h.at, actor: h.byName, achievementId: a.id, eventName: a.eventName, excerpt: reason })
    })
    for (const c of a.comments) {
      if (c.authorRole === 'student') continue
      // Comments posted as part of a review action are already shown with that action.
      if (c.type === 'correction_request' || c.type === 'review_update') continue
      if (a.history.some((h) => h.at === c.createdAt && h.kind === 'status')) continue
      items.push({ id: `${a.id}-${c.id}`, type: 'comment', label: ACTIVITY_LABEL.comment, at: c.createdAt, actor: c.authorName, achievementId: a.id, eventName: a.eventName, excerpt: c.body })
    }
  }
  return items.sort((x, y) => y.at.localeCompare(x.at) || x.id.localeCompare(y.id)).slice(0, limit)
}

const RESULT_WEIGHT: Record<string, number> = { Winner: 5, 'Best Paper': 5, 'Best Project': 5, 'Runner-up': 4, Finalist: 3, Other: 2, Participant: 1 }

/** The most notable verified achievement: highest result, then most recent. Null when nothing is verified. */
export function getFeaturedAchievement(studentId: string, all: Achievement[] = source()): Achievement | null {
  const verified = getMyAchievements(studentId, all).filter((a) => a.status === 'verified')
  if (!verified.length) return null
  return [...verified].sort((a, b) => (RESULT_WEIGHT[b.achievementType] ?? 0) - (RESULT_WEIGHT[a.achievementType] ?? 0) || b.eventDate.localeCompare(a.eventDate))[0]
}

// ── Notifications ────────────────────────────────────────────────────────────

export function getMyNotifications(studentId: string, all: AppNotification[] = getState().notifications): AppNotification[] {
  return all.filter((n) => n.userId === studentId).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id))
}

export function markNotificationAsRead(studentId: string, notificationId: string) {
  setState((s) => ({
    ...s,
    notifications: s.notifications.map((n) => (n.id === notificationId && n.userId === studentId ? { ...n, read: true } : n)),
  }))
}

export function markAllNotificationsAsRead(studentId: string) {
  setState((s) => ({ ...s, notifications: s.notifications.map((n) => (n.userId === studentId && !n.read ? { ...n, read: true } : n)) }))
}

// ── Correction requests ──────────────────────────────────────────────────────

export interface CorrectionRequest {
  body: string
  authorName: string
  createdAt: string
}

/**
 * The reviewer's current correction request on a record that needs attention:
 * the reason recorded with the latest "needs attention" decision. Falls back
 * to the matching comment on older records. Undefined when nothing is pending.
 */
export function getCorrectionRequest(a: Achievement): CorrectionRequest | undefined {
  if (a.status !== 'needs_attention') return undefined
  const decision = [...a.history].reverse().find((h) => h.status === 'needs_attention')
  if (decision?.note) return { body: decision.note, authorName: decision.byName, createdAt: decision.at }
  const comment =
    [...a.comments].reverse().find((c) => c.type === 'correction_request') ??
    [...a.comments].reverse().find((c) => c.authorRole !== 'student' && (!decision || c.createdAt <= decision.at)) ??
    [...a.comments].reverse().find((c) => c.authorRole !== 'student')
  return comment ? { body: comment.body, authorName: comment.authorName, createdAt: comment.createdAt } : undefined
}
