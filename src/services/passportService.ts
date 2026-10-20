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
import { countByResult, resultGroupOf } from '../domain/result'
import type { ResultCounts, ResultGroup } from '../domain/result'
import { activeRecords } from '../domain/status'
import { isKnownDepartment, isKnownSection } from './academicService'
import type { Achievement, AchievementCategory, AppNotification, RecordStatus, StudentUser, User } from '../types'
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
  status?: RecordStatus | 'all'
  /** Recorded achievement result group, e.g. only winners. */
  result?: ResultGroup | 'all'
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
    result: filters.result,
    year: filters.year,
  }).filter((a) => (!filters.from || a.eventDate >= filters.from) && (!filters.to || a.eventDate <= filters.to))
  return sortAchievements(matched, filters.sort)
}

export interface AchievementSummary extends ResultCounts {
  /** Archived records. Not part of the result counts above. */
  archived: number
}

/**
 * The student's own figures, by the result they recorded, so
 * winner + runner_up + participant + other = total. Drafts are a separate
 * collection and are never counted here.
 */
export function getAchievementSummary(studentId: string, all: Achievement[] = source()): AchievementSummary {
  const mine = getMyAchievements(studentId, all)
  const active = activeRecords(mine)
  return { ...countByResult(active), archived: mine.length - active.length }
}

export interface TimelineYear {
  year: string
  entries: Achievement[]
  /** Entries in this year whose recorded result is Winner. */
  wins: number
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
  return [...groups.entries()].map(([year, entries]) => ({ year, entries, wins: entries.filter((e) => resultGroupOf(e) === 'winner').length }))
}

export function eventYearsOf(list: Achievement[]) {
  return [...new Set(list.map((a) => a.eventDate.slice(0, 4)))].sort().reverse()
}

export type ActivityType = 'submitted' | 'updated' | 'archived' | 'restored' | 'comment'

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
  updated: 'Achievement details updated',
  archived: 'Record archived by the records office',
  restored: 'Record restored by the records office',
  comment: 'Faculty comment',
}

function activityType(e: Achievement['history'][number]): ActivityType {
  if (e.kind === 'updated') return 'updated'
  if (e.kind === 'archived') return 'archived'
  if (e.kind === 'restored') return 'restored'
  return 'submitted'
}

/**
 * Activity feed built from each record's own history and the comments
 * faculty left on it, so it can never contradict what the record says.
 */
export function getRecentActivity(studentId: string, all: Achievement[] = source(), limit = 8): ActivityItem[] {
  const items: ActivityItem[] = []
  for (const a of getMyAchievements(studentId, all)) {
    a.history.forEach((h, i) => {
      const type = activityType(h)
      items.push({ id: `${a.id}-h${i}`, type, label: ACTIVITY_LABEL[type], at: h.at, actor: h.byName, achievementId: a.id, eventName: a.eventName, excerpt: h.note })
    })
    for (const c of a.comments) {
      if (c.authorRole === 'student') continue
      items.push({ id: `${a.id}-${c.id}`, type: 'comment', label: ACTIVITY_LABEL.comment, at: c.createdAt, actor: c.authorName, achievementId: a.id, eventName: a.eventName, excerpt: c.body })
    }
  }
  return items.sort((x, y) => y.at.localeCompare(x.at) || x.id.localeCompare(y.id)).slice(0, limit)
}

const RESULT_WEIGHT: Record<string, number> = { Winner: 5, 'Best Paper': 5, 'Best Project': 5, 'Runner-up': 4, Finalist: 3, Other: 2, Participant: 1 }

/**
 * The student's most notable achievement, chosen by the result they recorded
 * and then by how recent it is. Null when they have no records yet.
 */
export function getFeaturedAchievement(studentId: string, all: Achievement[] = source()): Achievement | null {
  const mine = activeRecords(getMyAchievements(studentId, all))
  if (!mine.length) return null
  return [...mine].sort((a, b) => (RESULT_WEIGHT[b.achievementType] ?? 0) - (RESULT_WEIGHT[a.achievementType] ?? 0) || b.eventDate.localeCompare(a.eventDate))[0]
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
