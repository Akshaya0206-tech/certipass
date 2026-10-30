import { useEffect } from 'react'
import { refreshDirectory } from '../services/accountApi'
import { backendEnabled } from '../services/auth/backend'

/**
 * For administrators connected to the CertiPass server: load the real list of accounts (including students who have
 * registered and are waiting for approval) when the admin area opens, and again whenever the tab regains focus.
 * Does nothing in the offline prototype.
 */
export function useDirectoryRefresh(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !backendEnabled()) return
    const load = () => void refreshDirectory().catch(() => undefined)
    load()
    const onFocus = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [enabled])
}
