/*
 * Admin analytics — the single place every admin figure is calculated.
 *
 * Pure functions over the current users and achievement records, so the
 * overview, the analytics page and the CSV exports can never disagree, and
 * every number updates as soon as a record changes.
 *
 * Ground rules:
 *  - "Achievement records" means submitted records only. Drafts are a
 *    separate collection and are never passed in here.
 *  - Each record has exactly one recorded result, so the result counts add
 *    up to the total with no double counting.
 *  - "Winner", "Runner-up" and "Participant" are achievement results read
 *    from the record itself. They are never workflow states, and nothing
 *    here depends on an approval step: there isn't one.
 *  - A record belongs to the department of the student who submitted it.
 *  - Time-based figures use `submittedAt`: when the record was first submitted.
 */
import { countByResult, resultGroupOf } from '../domain/result'
import type { ResultCounts, ResultGroup } from '../domain/result'
import { activeRecords } from '../domain/status'
import { batchCodeOf, batchLabel } from '../domain/batch'
import { ACHIEVEMENT_CATEGORIES } from '../types'
import type { Achievement, AchievementCategory, AchievementDraft, Department, StudentUser, User } from '../types'

// ── Overview ─────────────────────────────────────────────────────────────────

export interface AdminOverview extends ResultCounts {
  totalStudents: number
  activeStudents: number
  totalFaculty: number
  activeFaculty: number
  /** Active (non-archived) records. Equals `total`. */
  totalRecords: number
  /** Records retired by an administrator. Not part of the result counts. */
  archived: number
  /** Records first submitted in the last 30 days. */
  recent: number
  /** Students with at least one active record. */
  studentsWithRecords: number
  /** Unfinished drafts. Shown for context; not part of any other figure. */
  draftsInProgress: number
}

export type OverviewMetric = 'totalStudents' | 'totalFaculty' | 'totalRecords' | 'winners' | 'runnersUp' | 'participants' | 'recent'

/** What each headline figure means, in plain words. Shown next to the figure. */
export const METRIC_DEFINITIONS: Record<OverviewMetric | 'other' | 'archived', string> = {
  totalStudents: 'Every student account, active or deactivated.',
  totalFaculty: 'Every faculty account, active or deactivated.',
  totalRecords: 'Every submitted achievement record. Drafts and archived records are not included.',
  winners: 'Records whose recorded result is Winner.',
  runnersUp: 'Records whose recorded result is Runner-up.',
  participants: 'Records whose recorded result is Participant.',
  other: 'Records recorded as Finalist, Best Paper, Best Project or Other.',
  recent: 'Records first submitted in the last 30 days.',
  archived: 'Records retired by the Office of Academic Records. Kept in full, but left out of active figures.',
}

const DAYS_30 = 30 * 86_400_000

export function getAdminOverview(users: User[], achievements: Achievement[], drafts: AchievementDraft[] = [], now = new Date()): AdminOverview {
  const students = users.filter((u) => u.role === 'student')
  const faculty = users.filter((u) => u.role === 'faculty')
  const active = activeRecords(achievements)
  const since = now.getTime() - DAYS_30
  return {
    ...countByResult(active),
    totalStudents: students.length,
    activeStudents: students.filter((u) => u.active).length,
    totalFaculty: faculty.length,
    activeFaculty: faculty.filter((u) => u.active).length,
    totalRecords: active.length,
    archived: achievements.length - active.length,
    recent: active.filter((a) => {
      const t = Date.parse(a.submittedAt)
      return Number.isFinite(t) && t >= since
    }).length,
    studentsWithRecords: new Set(active.map((a) => a.studentId)).size,
    draftsInProgress: drafts.length,
  }
}

/**
 * The share of records with a winning result (Winner, Runner-up or any
 * other award) × 100, to one decimal place. Null when there are no records,
 * so the UI shows "—" rather than 0% or NaN.
 */
export function getAwardRate(achievements: Achievement[]): number | null {
  const active = activeRecords(achievements)
  if (active.length === 0) return null
  const awarded = active.filter((a) => resultGroupOf(a) !== 'participant').length
  return Math.round((awarded / active.length) * 1000) / 10
}

export const formatRate = (rate: number | null) => (rate === null ? '—' : `${rate}%`)

/** Records per recorded result. Counts always sum to the active total. */
export function getResultDistribution(achievements: Achievement[]): { group: ResultGroup; count: number }[] {
  const counts = countByResult(activeRecords(achievements))
  return (['winner', 'runner_up', 'participant', 'other'] as ResultGroup[]).map((group) => ({ group, count: counts[group] }))
}

export interface BatchStats {
  code: string
  label: string
  students: number
  counts: ResultCounts
}

/**
 * Per-batch figures, newest cohort first. A record counts toward the batch
 * of the student who submitted it, derived from their register number.
 */
export function getBatchAchievementStats(achievements: Achievement[], users: User[], now = new Date()): BatchStats[] {
  const students = users.filter((u): u is StudentUser => u.role === 'student')
  const batchOfStudent = new Map(students.map((u) => [u.id, batchCodeOf(u, now)]))
  const active = activeRecords(achievements)
  const codes = new Set<string>([...batchOfStudent.values()])
  for (const a of active) codes.add(batchOfStudent.get(a.studentId) ?? 'unknown')
  return [...codes]
    .map((code) => ({
      code,
      label: batchLabel(code),
      students: students.filter((u) => batchOfStudent.get(u.id) === code).length,
      counts: countByResult(active.filter((a) => (batchOfStudent.get(a.studentId) ?? 'unknown') === code)),
    }))
    .sort((a, b) => {
      if (a.code === 'unknown') return 1
      if (b.code === 'unknown') return -1
      return b.code.localeCompare(a.code)
    })
}

// ── Departments ──────────────────────────────────────────────────────────────

export interface DepartmentStats {
  code: string
  name: string
  /** Student accounts in the department. */
  students: number
  /** Distinct students in the department with at least one record. */
  studentsWithAchievements: number
  /** Active records, and their breakdown by recorded result. */
  counts: ResultCounts
  total: number
  /** Records per student with records, or null when the department has none. */
  perStudent: number | null
}

export const UNASSIGNED = '—'

/**
 * Per-department figures. A record counts toward the department of the
 * student who submitted it (looked up from the student's account, not typed
 * on the record). Records whose student or department can't be resolved are
 * grouped under "Unassigned" rather than dropped, so totals still add up.
 */
export function getDepartmentAchievementStats(achievements: Achievement[], users: User[], departments: Department[]): DepartmentStats[] {
  const students = users.filter((u) => u.role === 'student')
  const deptOfStudent = new Map(students.map((u) => [u.id, u.department]))
  const known = new Set(departments.map((d) => d.code))
  const groupOf = (a: Achievement) => {
    const code = deptOfStudent.get(a.studentId)
    return code && known.has(code) ? code : UNASSIGNED
  }
  const build = (code: string, name: string): DepartmentStats => {
    const records = activeRecords(achievements).filter((a) => groupOf(a) === code)
    const withRecords = new Set(records.map((a) => a.studentId)).size
    return {
      code,
      name,
      students: code === UNASSIGNED ? students.filter((u) => !known.has(u.department)).length : students.filter((u) => u.department === code).length,
      studentsWithAchievements: withRecords,
      counts: countByResult(records),
      total: records.length,
      perStudent: withRecords ? Math.round((records.length / withRecords) * 10) / 10 : null,
    }
  }
  const rows = departments.map((d) => build(d.code, d.name))
  const unassigned = build(UNASSIGNED, 'Unassigned')
  return unassigned.total > 0 || unassigned.students > 0 ? [...rows, unassigned] : rows
}

// ── Categories ───────────────────────────────────────────────────────────────

export interface CategoryStats {
  category: AchievementCategory
  count: number
  /** Records in this category whose recorded result is Winner. */
  winners: number
  /** For "Other": the custom labels students gave, with how often each was used. */
  customLabels?: { label: string; count: number }[]
}

/** Records per category, across the fixed category list. Counts sum to the total. */
export function getCategoryAchievementStats(achievements: Achievement[]): CategoryStats[] {
  const active = activeRecords(achievements)
  return ACHIEVEMENT_CATEGORIES.map((category) => {
    const records = active.filter((a) => a.category === category)
    const stats: CategoryStats = { category, count: records.length, winners: records.filter((a) => resultGroupOf(a) === 'winner').length }
    if (category === 'Other') {
      const labels = new Map<string, number>()
      for (const a of records) {
        const label = a.customCategory?.trim()
        if (label) labels.set(label, (labels.get(label) ?? 0) + 1)
      }
      stats.customLabels = [...labels.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    }
    return stats
  })
}

// ── Time ─────────────────────────────────────────────────────────────────────

export type TimeRange = '30d' | '90d' | 'academic_year' | 'all'
export const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: 'academic_year', label: 'This academic year' },
  { value: 'all', label: 'All records' },
]

const DAY = 86_400_000
/** The academic year is taken to start on 1 June. */
const ACADEMIC_YEAR_START_MONTH = 5

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const validTime = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isFinite(t) ? t : null
}

export function academicYearStart(now = new Date()): Date {
  const year = now.getMonth() >= ACADEMIC_YEAR_START_MONTH ? now.getFullYear() : now.getFullYear() - 1
  return new Date(year, ACADEMIC_YEAR_START_MONTH, 1)
}

/** The start of a range (inclusive), or null for "all records". The end is always `now`. */
export function rangeStart(range: TimeRange, now = new Date()): Date | null {
  if (range === '30d') return new Date(startOfDay(now).getTime() - 29 * DAY)
  if (range === '90d') return new Date(startOfDay(now).getTime() - 89 * DAY)
  if (range === 'academic_year') return academicYearStart(now)
  return null
}

/** Records first submitted inside the range. Records with an unreadable date are left out of ranged views. */
export function filterByTimeRange(achievements: Achievement[], range: TimeRange, now = new Date()): Achievement[] {
  const from = rangeStart(range, now)
  if (!from) return achievements
  return achievements.filter((a) => {
    const t = validTime(a.submittedAt)
    return t !== null && t >= from.getTime() && t <= now.getTime()
  })
}

export interface TrendBucket {
  key: string
  label: string
  count: number
}

const monthLabel = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', withYear ? { month: 'short', year: '2-digit' } : { month: 'short' })

/**
 * Submissions over time, by `submittedAt`: daily for 30 days, weekly for 90
 * days, monthly otherwise. Empty periods are real zeros — nothing is filled in.
 */
export function getAchievementTrends(achievements: Achievement[], range: TimeRange, now = new Date()): { buckets: TrendBucket[]; granularity: 'day' | 'week' | 'month' } {
  const times = filterByTimeRange(achievements, range, now)
    .map((a) => validTime(a.submittedAt))
    .filter((t): t is number => t !== null)
  const buckets: TrendBucket[] = []

  if (range === '30d') {
    const start = rangeStart(range, now)!
    for (let i = 0; i < 30; i++) {
      const day = new Date(start.getTime() + i * DAY)
      buckets.push({ key: day.toISOString(), label: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), count: times.filter((t) => t >= day.getTime() && t < day.getTime() + DAY).length })
    }
    return { buckets, granularity: 'day' }
  }

  if (range === '90d') {
    const start = rangeStart(range, now)!
    for (let from = start.getTime(); from <= now.getTime(); from += 7 * DAY) {
      const day = new Date(from)
      buckets.push({ key: day.toISOString(), label: day.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), count: times.filter((t) => t >= from && t < from + 7 * DAY).length })
    }
    return { buckets, granularity: 'week' }
  }

  // Monthly: from the academic year start, or from the earliest record for "all".
  const first = range === 'academic_year' ? academicYearStart(now) : times.length ? new Date(Math.min(...times)) : null
  if (!first) return { buckets, granularity: 'month' }
  const spansYears = first.getFullYear() !== now.getFullYear()
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= now; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime()
    buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: monthLabel(d, spansYears), count: times.filter((t) => t >= d.getTime() && t < next).length })
  }
  return { buckets, granularity: 'month' }
}

/** The earliest and latest submission dates present, for explaining what a range covers. */
export function submissionSpan(achievements: Achievement[]): { first: string; last: string } | null {
  const times = achievements.map((a) => validTime(a.submittedAt)).filter((t): t is number => t !== null)
  if (!times.length) return null
  return { first: new Date(Math.min(...times)).toISOString(), last: new Date(Math.max(...times)).toISOString() }
}
