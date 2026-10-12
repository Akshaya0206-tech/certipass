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
 *  - Each record has exactly one status, so the status counts add up to the
 *    total with no double counting.
 *  - A record belongs to the department of the student who submitted it.
 *  - Time-based figures use `submittedAt`: when the record was first submitted.
 */
import { STATUS_ORDER } from '../domain/status'
import { ACHIEVEMENT_CATEGORIES } from '../types'
import type { Achievement, AchievementCategory, AchievementDraft, Department, SubmissionStatus, User } from '../types'

// ── Overview ─────────────────────────────────────────────────────────────────

export interface AdminOverview {
  totalStudents: number
  activeStudents: number
  totalFaculty: number
  activeFaculty: number
  totalRecords: number
  submitted: number
  underReview: number
  pendingVerification: number
  verified: number
  needsAttention: number
  /** Unfinished drafts. Shown for context; not part of any other figure. */
  draftsInProgress: number
}

export type OverviewMetric = 'totalStudents' | 'totalFaculty' | 'totalRecords' | 'pendingVerification' | 'verified' | 'needsAttention'

/** What each headline figure means, in plain words. Shown next to the figure. */
export const METRIC_DEFINITIONS: Record<OverviewMetric | 'verificationRate', string> = {
  totalStudents: 'Every student account, active or deactivated.',
  totalFaculty: 'Every faculty account, active or deactivated.',
  totalRecords: 'Every submitted achievement, whatever its status. Drafts are not included.',
  pendingVerification: 'Records waiting on faculty: status Submitted or Under review.',
  verified: 'Records a reviewer has verified.',
  needsAttention: 'Records sent back to the student for a correction.',
  verificationRate: 'Verified records ÷ all submitted records × 100. Drafts are not included. Shown as “—” when there are no records.',
}

const countStatus = (list: Achievement[], status: SubmissionStatus) => list.filter((a) => a.status === status).length

export function getAdminOverview(users: User[], achievements: Achievement[], drafts: AchievementDraft[] = []): AdminOverview {
  const students = users.filter((u) => u.role === 'student')
  const faculty = users.filter((u) => u.role === 'faculty')
  const submitted = countStatus(achievements, 'submitted')
  const underReview = countStatus(achievements, 'under_review')
  return {
    totalStudents: students.length,
    activeStudents: students.filter((u) => u.active).length,
    totalFaculty: faculty.length,
    activeFaculty: faculty.filter((u) => u.active).length,
    totalRecords: achievements.length,
    submitted,
    underReview,
    pendingVerification: submitted + underReview,
    verified: countStatus(achievements, 'verified'),
    needsAttention: countStatus(achievements, 'needs_attention'),
    draftsInProgress: drafts.length,
  }
}

/**
 * Verified ÷ all submitted records × 100, to one decimal place.
 * Null when there are no records, so the UI shows "—" rather than 0% or NaN.
 */
export function getVerificationRate(achievements: Achievement[]): number | null {
  if (achievements.length === 0) return null
  return Math.round((countStatus(achievements, 'verified') / achievements.length) * 1000) / 10
}

export const formatRate = (rate: number | null) => (rate === null ? '—' : `${rate}%`)

/** Records per current status, in lifecycle order. Counts always sum to the total. */
export function getAchievementStatusDistribution(achievements: Achievement[]): { status: SubmissionStatus; count: number }[] {
  return STATUS_ORDER.map((status) => ({ status, count: countStatus(achievements, status) }))
}

// ── Departments ──────────────────────────────────────────────────────────────

export interface DepartmentStats {
  code: string
  name: string
  /** Student accounts in the department. */
  students: number
  /** Distinct students in the department with at least one record. */
  studentsWithAchievements: number
  total: number
  verified: number
  pending: number
  needsAttention: number
  /** verified ÷ total × 100, or null when the department has no records. */
  rate: number | null
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
    const records = achievements.filter((a) => groupOf(a) === code)
    const verified = countStatus(records, 'verified')
    return {
      code,
      name,
      students: code === UNASSIGNED ? students.filter((u) => !known.has(u.department)).length : students.filter((u) => u.department === code).length,
      studentsWithAchievements: new Set(records.map((a) => a.studentId)).size,
      total: records.length,
      verified,
      pending: countStatus(records, 'submitted') + countStatus(records, 'under_review'),
      needsAttention: countStatus(records, 'needs_attention'),
      rate: records.length ? Math.round((verified / records.length) * 1000) / 10 : null,
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
  verified: number
  /** For "Other": the custom labels students gave, with how often each was used. */
  customLabels?: { label: string; count: number }[]
}

/** Records per category, across the fixed category list. Counts sum to the total. */
export function getCategoryAchievementStats(achievements: Achievement[]): CategoryStats[] {
  return ACHIEVEMENT_CATEGORIES.map((category) => {
    const records = achievements.filter((a) => a.category === category)
    const stats: CategoryStats = { category, count: records.length, verified: countStatus(records, 'verified') }
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
