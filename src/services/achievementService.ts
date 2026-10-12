import { describeAchievement } from '../data/mockData'
import type { Achievement, AchievementFilters, SubmissionStatus } from '../types'

export { describeAchievement }

export function filterAchievements<T extends Achievement>(list: T[], filters: AchievementFilters): T[] {
  const q = filters.query?.trim().toLowerCase()
  return list.filter((a) => {
    if (filters.category && filters.category !== 'all' && a.category !== filters.category) return false
    if (filters.status && filters.status !== 'all' && a.status !== filters.status) return false
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

export interface StatusSummary {
  total: number
  verified: number
  submitted: number
  underReview: number
  needsAttention: number
}

/** total = all records; each other field counts records currently in that status. */
export function summarize(list: Achievement[]): StatusSummary {
  const count = (s: SubmissionStatus) => list.filter((a) => a.status === s).length
  return {
    total: list.length,
    verified: count('verified'),
    submitted: count('submitted'),
    underReview: count('under_review'),
    needsAttention: count('needs_attention'),
  }
}

export function eventYears(list: Achievement[]) {
  return [...new Set(list.map((a) => a.eventDate.slice(0, 4)))].sort().reverse()
}
