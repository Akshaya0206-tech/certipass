import { useEffect, useState } from 'react'
import { CertificateStorageError, listCertificates } from '../services/certificateStorage'
import type { CertificateListing, ListQuery } from '../services/certificateStorage'

type State = { status: 'loading'; data?: CertificateListing } | { status: 'ready'; data: CertificateListing } | { status: 'error'; error: CertificateStorageError; data?: CertificateListing }

/**
 * The certificates the signed-in person may see, for one search/filter/page. The server applies the person's role;
 * this only asks. The previous rows stay on screen while the next page loads, so the table does not flash empty.
 */
export function useCertificateList(query: ListQuery, enabled: boolean) {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify(query)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setState((prev) => ({ status: 'loading', data: prev.data }))
    listCertificates(query, controller.signal).then(
      (data) => !controller.signal.aborted && setState({ status: 'ready', data }),
      (err) => {
        if (controller.signal.aborted) return
        const error = err instanceof CertificateStorageError ? err : new CertificateStorageError('unknown', 'The certificates could not be loaded.', true)
        setState((prev) => ({ status: 'error', error, data: prev.data }))
      },
    )
    return () => controller.abort()
    // `key` stands for `query`; the attempt counter lets "Try again" re-run the same request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt])

  return { ...state, reload: () => setAttempt((n) => n + 1) }
}
