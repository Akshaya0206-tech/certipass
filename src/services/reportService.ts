/*
 * Academic reports — the HOD's report generator.
 *
 * One pure pipeline so a preview and a download can never disagree:
 *
 *   buildReport(facultyId, filters) → ReportResult { rows, totals, … }
 *                                        ├── the table the page previews
 *                                        └── reportCsv(result) for the download
 *
 * Ground rules:
 *  - reports are built from submitted achievement records, with no bearing on
 *    any approval or verification state — that workflow no longer exists;
 *  - "Winner", "Runner-up" and "Participant" are read from the record's own
 *    recorded result, never inferred from anything else;
 *  - archived records are left out unless explicitly asked for;
 *  - every record is scoped to the departments the signed-in faculty cover;
 *  - drafts are a separate collection and can never appear in a report.
 */
import { batchLabel } from '../domain/batch'
import { RESULT_GROUPS, RESULT_GROUP_ORDER, countByResult } from '../domain/result'
import type { ResultCounts, ResultGroup } from '../domain/result'
import { recordStatusLabel } from '../domain/status'
import { toCsv } from '../lib/csv'
import type { CsvValue } from '../lib/csv'
import { formatDate } from '../lib/format'
import { ACHIEVEMENT_CATEGORIES } from '../types'
import type { AchievementCategory } from '../types'
import { departmentName } from './academicService'
import { getFacultyRecords } from './facultyService'
import type { FacultyRecordRow } from './facultyService'
import { getState } from './store'
import type { Achievement, User } from '../types'

export interface ReportFilters {
  /** Admission-year batch code, e.g. "2023". */
  batch: string | 'all'
  department: string | 'all'
  category: AchievementCategory | 'all'
  /** Recorded achievement result. */
  result: ResultGroup | 'all'
  /** Free text matched against the event name. */
  event: string
  /** Inclusive event-date range, YYYY-MM-DD. */
  from: string
  to: string
  includeArchived: boolean
}

export const EMPTY_REPORT_FILTERS: ReportFilters = {
  batch: 'all',
  department: 'all',
  category: 'all',
  result: 'all',
  event: '',
  from: '',
  to: '',
  includeArchived: false,
}

export interface ReportRow extends FacultyRecordRow {
  batchLabel: string
  departmentLabel: string
}

export interface ReportResult {
  rows: ReportRow[]
  /** Counts by recorded result over exactly `rows`. */
  totals: ResultCounts
  /** Records per batch, most records first. */
  byBatch: { code: string; label: string; count: number }[]
  /** Records per category, only categories that appear. */
  byCategory: { category: AchievementCategory; count: number }[]
  /** Distinct students represented in `rows`. */
  students: number
  /** Distinct events represented in `rows`. */
  events: number
  /** True when any filter is narrowing the report. */
  filtered: boolean
  /** The filters the rows were built from, as applied. */
  applied: ReportFilters
}

const text = (v: string) => v.trim().toLowerCase()

export function isFiltered(filters: ReportFilters): boolean {
  return (
    filters.batch !== 'all' ||
    filters.department !== 'all' ||
    filters.category !== 'all' ||
    filters.result !== 'all' ||
    filters.event.trim() !== '' ||
    filters.from !== '' ||
    filters.to !== '' ||
    filters.includeArchived
  )
}

/** True when the range can never match anything, so the page can say so. */
export const rangeInvalid = (filters: Pick<ReportFilters, 'from' | 'to'>) => !!filters.from && !!filters.to && filters.from > filters.to

/**
 * The report dataset. The event-date range and the event-name search are
 * applied here, on top of the scoping and filtering the faculty service does.
 */
export function buildReport(
  facultyId: string,
  filters: ReportFilters,
  achievements: Achievement[] = getState().achievements,
  users: User[] = getState().users,
  now = new Date(),
): ReportResult {
  const event = text(filters.event)
  const rows: ReportRow[] = getFacultyRecords(
    facultyId,
    {
      batch: filters.batch,
      department: filters.department,
      category: filters.category,
      result: filters.result,
      includeArchived: filters.includeArchived,
      sort: 'event_desc',
    },
    achievements,
    users,
    now,
  )
    .filter((r) => {
      const date = r.achievement.eventDate
      if (filters.from && date < filters.from) return false
      if (filters.to && date > filters.to) return false
      if (event && !r.achievement.eventName.toLowerCase().includes(event)) return false
      return true
    })
    .map((r) => ({ ...r, batchLabel: batchLabel(r.batch), departmentLabel: departmentName(r.department) }))

  const batches = new Map<string, number>()
  for (const r of rows) batches.set(r.batch, (batches.get(r.batch) ?? 0) + 1)

  return {
    rows,
    totals: countByResult(rows.map((r) => r.achievement)),
    byBatch: [...batches.entries()]
      .map(([code, count]) => ({ code, label: batchLabel(code), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    byCategory: ACHIEVEMENT_CATEGORIES.map((category) => ({ category, count: rows.filter((r) => r.achievement.category === category).length })).filter(
      (c) => c.count > 0,
    ),
    students: new Set(rows.map((r) => r.studentId)).size,
    events: new Set(rows.map((r) => r.achievement.eventName.trim().toLowerCase())).size,
    filtered: isFiltered(filters),
    applied: filters,
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

/**
 * Report columns. There is deliberately no verification or approval column:
 * the recorded result is the outcome a report is about.
 */
export const REPORT_HEADERS = [
  'Reference',
  'Student',
  'Username',
  'Register number',
  'Batch',
  'Department',
  'Year',
  'Section',
  'Event',
  'Organiser',
  'Event date',
  'Location',
  'Mode',
  'Category',
  'Result',
  'Prize or position',
  'Submitted',
  'Certificate file',
  'Record state',
]

function toCells(r: ReportRow): CsvValue[] {
  const a = r.achievement
  return [
    a.reference,
    r.studentName,
    r.username ? `@${r.username}` : '',
    r.registerNumber,
    r.batchLabel,
    r.departmentLabel,
    r.year ?? '',
    r.section,
    a.eventName,
    a.organizer,
    a.eventDate,
    a.location ?? '',
    a.eventMode ?? '',
    a.customCategory ? `${a.category} — ${a.customCategory}` : a.category,
    a.achievementType,
    a.position ?? '',
    a.submittedAt.slice(0, 10),
    a.certificate?.fileName ?? '',
    recordStatusLabel(a.status),
  ]
}

/** The same rows the page previewed, as CSV. */
export function reportCsv(result: ReportResult): string {
  return toCsv(REPORT_HEADERS, result.rows.map(toCells))
}

/** A short description of what the report covers, for the page and the file name. */
export function describeReport(filters: ReportFilters): string {
  const parts: string[] = []
  if (filters.batch !== 'all') parts.push(`Batch ${batchLabel(filters.batch)}`)
  if (filters.department !== 'all') parts.push(departmentName(filters.department))
  if (filters.result !== 'all') parts.push(RESULT_GROUPS[filters.result].label)
  if (filters.category !== 'all') parts.push(filters.category)
  if (filters.event.trim()) parts.push(`“${filters.event.trim()}”`)
  if (filters.from && filters.to) parts.push(`${formatDate(filters.from)} – ${formatDate(filters.to)}`)
  else if (filters.from) parts.push(`from ${formatDate(filters.from)}`)
  else if (filters.to) parts.push(`up to ${formatDate(filters.to)}`)
  if (filters.includeArchived) parts.push('archived included')
  return parts.length ? parts.join(' · ') : 'All achievement records in your departments'
}

const slug = (v: string) =>
  v
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** A stable, descriptive file name for the download. */
export function reportFileName(filters: ReportFilters, date: string): string {
  const parts = ['certipass-report']
  if (filters.batch !== 'all') parts.push(`batch-${filters.batch}`)
  if (filters.department !== 'all') parts.push(slug(filters.department))
  if (filters.result !== 'all') parts.push(slug(RESULT_GROUPS[filters.result].label))
  parts.push(date)
  return `${parts.join('-')}.csv`
}

/** Result-group tabs and their counts, for the report summary. */
export function resultBreakdown(totals: ResultCounts): { group: ResultGroup; label: string; count: number }[] {
  return RESULT_GROUP_ORDER.map((group) => ({ group, label: RESULT_GROUPS[group].label, count: totals[group] }))
}
