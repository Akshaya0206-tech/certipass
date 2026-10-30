import { useCallback, useEffect, useState } from 'react'
import { CertificateStorageError, getStorageStatus, storageAvailability } from '../services/certificateStorage'
import type { StorageStatus } from '../services/certificateStorage'

export type StorageStatusState =
  | { status: 'unavailable'; reason: 'unconfigured' | 'no_session' }
  | { status: 'loading' }
  | { status: 'error'; error: CertificateStorageError }
  | { status: 'loaded'; value: StorageStatus }

/** The Drive folder's health, for administrators. Asks the storage service; shows nothing it didn't say. */
export function useStorageStatus(): { state: StorageStatusState; reload: () => void } {
  const [state, setState] = useState<StorageStatusState>(() => {
    const availability = storageAvailability()
    return availability === 'ready' ? { status: 'loading' } : { status: 'unavailable', reason: availability }
  })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const availability = storageAvailability()
    if (availability !== 'ready') {
      setState({ status: 'unavailable', reason: availability })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    getStorageStatus(controller.signal).then(
      (value) => !controller.signal.aborted && setState({ status: 'loaded', value }),
      (err) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', error: err instanceof CertificateStorageError ? err : new CertificateStorageError('unknown', 'Storage status could not be loaded.', true) })
      },
    )
    return () => controller.abort()
  }, [attempt])

  return { state, reload: useCallback(() => setAttempt((n) => n + 1), []) }
}
