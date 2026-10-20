import { describeAchievement } from '../data/mockData'
import { countByResult, resultGroupOf } from '../domain/result'
import type { ResultCounts } from '../domain/result'
import { activeRecords } from '../domain/status'
import type { Achievement, AchievementFilters } from '../types'

export { describeAchievement }

export function filterAchievements<T extends Achievement>(list: T[], filters: AchievementFilters): T[] {
  const q = filters.query?.trim().toLowerCase()
  return list.filter((a) => {
    if (filters.category && filters.category !== 'all' && a.category !== filters.category) return false
    if (filters.status && filters.status !== 'all' && a.status !== filters.status) return false
    if (filters.result && filters.result !== 'all' && resultGroupOf(a) !== filters.result) return false
    if (filters.year && filters.year !== 'all' && !a.eventDate.startsWith(filters.year)) return false
    if (q) {
      const haystack = `${a.eventName} ${a.organizer} ${a.category} ${a.customCategory ?? ''} ${a.reference} ${a.achievementType} ${a.position ?? ''} ${a.certificate.fileName}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  })
}

export function sortByEventDateDesc(list: Achievement[]) {
  return [...list].sort((a, b) => b.eventDate.localeCompare(a.eventDate))
}

export function sortBySubmittedDesc(list: Achievement[]) {
  return [...list].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt))
}

export interface RecordSummary extends ResultCounts {
  /** Archived records. Not part of the result counts, which cover active records only. */
  archived: number
}

/**
 * Counts for a set of records, by the result the student recorded.
 * The result counts cover active records only, so
 * winner + runner_up + participant + other = total.
 */
export function summarize(list: Achievement[]): RecordSummary {
  const active = activeRecords(list)
  return { ...countByResult(active), archived: list.length - active.length }
}

export function eventYears(list: Achievement[]) {
  return [...new Set(list.map((a) => a.eventDate.slice(0, 4)))].sort().reverse()
}
