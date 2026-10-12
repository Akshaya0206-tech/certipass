/*
 * React bindings for the student passport service. Every hook is scoped to
 * the authenticated student; none of them can return another student's data.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { getMyAchievements, getMyNotifications, loadPassport } from '../services/passportService'
import { useStore } from '../services/store'
import { getDrafts } from '../services/submissionService'
import { useStudent } from './useData'

/** The signed-in student's achievements (re-renders when they change). */
export function useMyAchievements() {
  const student = useStudent()
  const all = useStore((s) => s.achievements)
  return useMemo(() => getMyAchievements(student.id, all), [student.id, all])
}

export function useMyNotifications() {
  const student = useStudent()
  const all = useStore((s) => s.notifications)
  return useMemo(() => getMyNotifications(student.id, all), [student.id, all])
}

/** The signed-in student's unfinished submissions, most recently saved first. */
export function useMyDrafts() {
  const student = useStudent()
  const all = useStore((s) => s.drafts)
  return useMemo(() => getDrafts(student.id, all), [student.id, all])
}

export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; message: string }

/**
 * Simulated initial fetch for passport pages, so loading and error states are
 * real. Data itself is read synchronously from the store once ready.
 */
export function usePassportLoad(): { state: LoadState; retry: () => void } {
  const student = useStudent()
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    loadPassport(student.id).then(
      () => !cancelled && setState({ status: 'ready' }),
      (err: unknown) => !cancelled && setState({ status: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' }),
    )
    return () => {
      cancelled = true
    }
  }, [student.id, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, retry }
}
