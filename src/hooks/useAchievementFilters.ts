import { useCallback, useMemo, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { STATUS_ORDER, statusLabel } from '../domain/status'
import { SORT_OPTIONS } from '../services/passportService'
import type { PassportFilters, SortKey } from '../services/passportService'
import { ACHIEVEMENT_CATEGORIES, SUBMISSION_STATUSES } from '../types'
import type { AchievementCategory, SubmissionStatus } from '../types'

type Param = 'q' | 'category' | 'status' | 'year' | 'from' | 'to' | 'sort'
const isDate = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)

export interface LibraryFilters extends Required<Omit<PassportFilters, 'from' | 'to'>> {
  from: string
  to: string
}

/**
 * Filter, search and sort state kept in the URL, so results are linkable and
 * survive refresh. Unknown or malformed values fall back to defaults.
 */
export function useAchievementFilters() {
  const [params, setParams] = useSearchParams()
  // React Router's functional setter sees the params from the last render, so
  // two quick updates (e.g. clear search, then pick a category) could undo each
  // other. Track the latest value ourselves so every update builds on it.
  const latest = useRef(params)
  latest.current = params

  const filters = useMemo<LibraryFilters>(() => {
    const category = params.get('category')
    const status = params.get('status')
    const sort = params.get('sort')
    const year = params.get('year')
    return {
      query: params.get('q') ?? '',
      category: (ACHIEVEMENT_CATEGORIES as readonly string[]).includes(category ?? '') ? (category as AchievementCategory) : 'all',
      status: SUBMISSION_STATUSES.includes(status as SubmissionStatus) ? (status as SubmissionStatus) : 'all',
      year: year && /^\d{4}$/.test(year) ? year : 'all',
      from: isDate(params.get('from')) ? params.get('from')! : '',
      to: isDate(params.get('to')) ? params.get('to')! : '',
      sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as SortKey) : 'event_desc',
    }
  }, [params])

  /** Merge changes into the current filters; other filters are left as they are. */
  const update = useCallback(
    (patch: Partial<Record<Param, string>>) => {
      const next = new URLSearchParams(latest.current)
      for (const [k, v] of Object.entries(patch)) {
        if (!v || v === 'all' || (k === 'sort' && v === 'event_desc')) next.delete(k)
        else next.set(k, v)
      }
      latest.current = next
      setParams(next, { replace: true })
    },
    [setParams],
  )

  /** Clears search and filters but keeps the chosen sort order. */
  const reset = useCallback(() => {
    const sort = latest.current.get('sort')
    const next = sort ? new URLSearchParams({ sort }) : new URLSearchParams()
    latest.current = next
    setParams(next, { replace: true })
  }, [setParams])
  const active =
    filters.query !== '' || filters.category !== 'all' || filters.status !== 'all' || filters.year !== 'all' || filters.from !== '' || filters.to !== ''

  return { filters, update, reset, active }
}

export const CATEGORY_OPTIONS: { value: AchievementCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All categories' },
  ...ACHIEVEMENT_CATEGORIES.map((c) => ({ value: c, label: c })),
]

export const STATUS_OPTIONS: { value: SubmissionStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  ...STATUS_ORDER.map((s) => ({ value: s, label: statusLabel(s) })),
]
