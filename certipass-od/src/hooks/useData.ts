import { useMemo, useSyncExternalStore } from 'react'
import { currentUser } from '../services/auth'
import { listApplications, listNotifications } from '../services/odService'
import { getState, subscribe } from '../services/store'

/** Re-renders when the store changes; the returned state object is stable between changes. */
export function useAppState() {
  return useSyncExternalStore(subscribe, getState, getState)
}

export function useApplications() {
  const state = useAppState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (currentUser() ? listApplications() : []), [state])
}

export function useNotifications() {
  const state = useAppState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => (currentUser() ? listNotifications() : []), [state])
}
