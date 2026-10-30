import { useCallback, useEffect, useState } from 'react'
import { CertificateStorageError, fetchCertificateBlob, storageAvailability } from '../services/certificateStorage'

export type CertificateFileState =
  | { status: 'idle' }
  /** Storage can't be used in this build or deployment (see storageAvailability). */
  | { status: 'unavailable'; reason: 'unconfigured' | 'no_session' }
  | { status: 'loading' }
  | { status: 'error'; error: CertificateStorageError }
  | { status: 'ready'; url: string; blob: Blob }

/**
 * Loads a stored certificate through the authenticated storage API and exposes
 * it as a temporary in-memory URL, revoked when the component goes away or the
 * certificate changes. Nothing public is involved: the bytes only reach the
 * browser if the server authorised this signed-in user.
 */
export function useCertificateFile(certificateId: string | undefined): { state: CertificateFileState; reload: () => void } {
  const [state, setState] = useState<CertificateFileState>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!certificateId) {
      setState({ status: 'idle' })
      return
    }
    const availability = storageAvailability()
    if (availability !== 'ready') {
      setState({ status: 'unavailable', reason: availability })
      return
    }

    const controller = new AbortController()
    let objectUrl: string | undefined
    setState({ status: 'loading' })
    fetchCertificateBlob(certificateId, 'inline', controller.signal).then(
      (blob) => {
        if (controller.signal.aborted) return
        objectUrl = URL.createObjectURL(blob)
        setState({ status: 'ready', url: objectUrl, blob })
      },
      (err) => {
        if (controller.signal.aborted) return
        setState({ status: 'error', error: err instanceof CertificateStorageError ? err : new CertificateStorageError('unknown', 'The certificate could not be loaded.', true) })
      },
    )
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [certificateId, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return { state, reload }
}
