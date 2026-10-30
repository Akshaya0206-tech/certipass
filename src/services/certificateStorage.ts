/*
 * Client for the certificate storage API (the Cloudflare Worker in /worker).
 *
 * The real certificate lives in the college's private Google Drive. This
 * module only ever holds the signed-in session token and the storage
 * service's own certificate ids. There are no Drive credentials, Drive ids or
 * share links anywhere in the browser, and files are fetched with an
 * Authorization header (never from a public URL) and shown from a temporary
 * in-memory blob.
 *
 * Availability is explicit so screens can say honestly why a file can't be
 * shown instead of faking a preview:
 *   unconfigured – VITE_CERT_API_URL is not set (this is the prototype/demo mode)
 *   no_session   – the API is configured but nobody is signed in to it, so the
 *                  service can't tell who is asking
 *   ready        – requests can be made; the server decides who may see what
 */
import { getAccessToken, hasAccessTokenProvider } from './auth/accessToken'

export type StorageAvailability = 'unconfigured' | 'no_session' | 'ready'

/** What a signed-in user is told when storage can't be used, by availability state. */
export const UNAVAILABLE_COPY: Record<Exclude<StorageAvailability, 'ready'>, { title: string; reason: string }> = {
  unconfigured: {
    title: 'Certificate storage isn’t set up yet',
    reason: 'Google Drive storage has not been configured for this deployment, so the certificate file cannot be retrieved. Only the file’s details are on record.',
  },
  no_session: {
    title: 'Certificate storage can’t verify this sign-in',
    reason: 'Storage is configured, but you are not signed in to the CertiPass server, so it cannot tell who is asking. Sign in again.',
  },
}

export function apiBaseUrl(): string | undefined {
  const url = import.meta.env.VITE_CERT_API_URL as string | undefined
  return url ? url.trim().replace(/\/+$/, '') || undefined : undefined
}

/**
 * The certificate folder's link, if one was configured at build time (VITE_DRIVE_FOLDER_URL). Only a plain
 * Google Drive folder link is accepted, so nothing else can end up in an href.
 *
 * The folder id is public in the built site, so this is only safe because the folder is Restricted:
 * knowing the id lets nobody in. The storage service also returns this link to administrators, which is
 * preferred when available (it is then not in the page source at all).
 */
export function driveFolderUrl(): string | undefined {
  const url = (import.meta.env.VITE_DRIVE_FOLDER_URL as string | undefined)?.trim()
  return url && /^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/[A-Za-z0-9_-]+(?:\?[^\s#]*)?$/.test(url) ? url : undefined
}

export function storageAvailability(): StorageAvailability {
  if (!apiBaseUrl()) return 'unconfigured'
  return hasAccessTokenProvider() ? 'ready' : 'no_session'
}

/** What the storage service tells a client about a stored certificate. */
export interface StoredCertificate {
  id: string
  achievementId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  uploadedAt: string | null
  category?: string
  /** What the student called it, who issued it, and when (YYYY-MM-DD). Absent for certificates attached to an achievement. */
  title?: string | null
  issuer?: string | null
  issueDate?: string | null
}

export class CertificateStorageError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number
  constructor(code: string, message: string, retryable: boolean, status = 0) {
    super(message)
    this.name = 'CertificateStorageError'
    this.code = code
    this.retryable = retryable
    this.status = status
  }
  /** The file or record simply isn't there (or isn't yours to see): shown as "Certificate not available". */
  get notAvailable() {
    return this.code === 'certificate_not_available'
  }
}

async function call(path: string, init: RequestInit = {}): Promise<Response> {
  const base = apiBaseUrl()
  if (!base) throw new CertificateStorageError('not_configured', UNAVAILABLE_COPY.unconfigured.reason, false)
  const token = await getAccessToken()
  if (!token) throw new CertificateStorageError('no_session', UNAVAILABLE_COPY.no_session.reason, false)

  let res: Response
  try {
    res = await fetch(`${base}${path}`, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new CertificateStorageError('network', 'Couldn’t reach certificate storage. Check your connection and try again.', true)
  }
  if (res.ok) return res

  let body: unknown
  try {
    body = await res.json()
  } catch {
    /* keep the generic message */
  }
  throw storageErrorFrom(res.status, body)
}

/** The typed error for a refusal: the server's own code and message when it sent them, a generic one otherwise. */
function storageErrorFrom(status: number, body: unknown): CertificateStorageError {
  const error = (body as { error?: { code?: string; message?: string; retryable?: boolean } } | undefined)?.error
  return new CertificateStorageError(
    error?.code ?? 'request_failed',
    error?.message ?? `Certificate storage returned an error (${status}).`,
    typeof error?.retryable === 'boolean' ? error.retryable : status >= 500,
    status,
  )
}

export interface UploadInput {
  achievementId: string
  /** Reused for every retry of the same file, which is what makes retries safe. */
  uploadId: string
  category: string
  file: File
  /** What the student calls it, who issued it and when (YYYY-MM-DD). All optional. */
  title?: string
  issuer?: string
  issueDate?: string
  /**
   * Called with how much of the request has been sent (0 to 1). While it is 1 the file has reached the server but
   * the server has not finished with it yet (it is still saving to Google Drive), so "100%" does not mean "done".
   */
  onProgress?: (fraction: number) => void
}

/** Upload a certificate. Resolves only after the file is in Drive AND its record is saved. */
export async function uploadCertificate(input: UploadInput, signal?: AbortSignal): Promise<StoredCertificate> {
  const form = new FormData()
  form.set('achievementId', input.achievementId)
  form.set('uploadId', input.uploadId)
  form.set('category', input.category)
  for (const [key, value] of [['title', input.title], ['issuer', input.issuer], ['issueDate', input.issueDate]] as const) {
    if (value) form.set(key, value)
  }
  form.set('file', input.file, input.file.name)
  if (input.onProgress) return sendWithProgress(form, input.onProgress, signal)
  const res = await call('/api/certificates', { method: 'POST', body: form, signal })
  return ((await res.json()) as { certificate: StoredCertificate }).certificate
}

/** Same request as above, but over XMLHttpRequest, because `fetch` cannot report how much of an upload has been sent. */
async function sendWithProgress(form: FormData, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<StoredCertificate> {
  const base = apiBaseUrl()
  if (!base) throw new CertificateStorageError('not_configured', UNAVAILABLE_COPY.unconfigured.reason, false)
  const token = await getAccessToken()
  if (!token) throw new CertificateStorageError('no_session', UNAVAILABLE_COPY.no_session.reason, false)

  return new Promise<StoredCertificate>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${base}/api/certificates`)
    xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.responseType = 'text'
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(Math.min(1, e.loaded / e.total))
    }
    xhr.onload = () => {
      let parsed: unknown
      try {
        parsed = JSON.parse(xhr.responseText)
      } catch {
        /* not JSON: generic message below */
      }
      if (xhr.status >= 200 && xhr.status < 300 && (parsed as { certificate?: StoredCertificate } | undefined)?.certificate) {
        onProgress(1)
        resolve((parsed as { certificate: StoredCertificate }).certificate)
      } else reject(storageErrorFrom(xhr.status, parsed))
    }
    xhr.onerror = () => reject(new CertificateStorageError('network', 'Couldn’t reach certificate storage. Check your connection and try again.', true))
    xhr.ontimeout = xhr.onerror
    xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'))
    if (signal) {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
      signal.addEventListener('abort', () => xhr.abort(), { once: true })
    }
    xhr.send(form)
  })
}

/**
 * Look a certificate up by achievement. Throws `notAvailable` when there isn't one this user may see.
 * Achievement ids are only unique per student, so faculty and admin must pass the student the achievement
 * belongs to; for a student the service always uses the signed-in student and ignores it.
 */
export async function lookupCertificate(achievementId: string, studentId?: string, signal?: AbortSignal): Promise<StoredCertificate> {
  const student = studentId ? `?student=${encodeURIComponent(studentId)}` : ''
  const res = await call(`/api/certificates/by-achievement/${encodeURIComponent(achievementId)}${student}`, { signal })
  return ((await res.json()) as { certificate: StoredCertificate }).certificate
}

/** A certificate in a listing: the details, whose it is, and nothing that points into Google Drive. */
export interface ListedCertificate extends StoredCertificate {
  category: string
  studentId: string
  studentName: string
  registerNumber: string
  /** The student's department now. */
  department: string
  /** Admission year, e.g. "2023". */
  batch: string
}

export interface CertificateListing {
  certificates: ListedCertificate[]
  total: number
  limit: number
  offset: number
  /** The departments and batches present among the certificates this person may see, for filter dropdowns. */
  facets: { departments: string[]; batches: string[] }
}

export interface ListQuery {
  /** Matches the student's name or id, or the certificate's title, issuer or file name. */
  q?: string
  department?: string
  /** Admission year, e.g. "2023". */
  batch?: string
  category?: string
  /** Narrow to one student. Faculty and administrators only; a student always gets just their own. */
  studentId?: string
  achievementId?: string
  limit?: number
  offset?: number
}

/**
 * The certificates the signed-in person may see, newest first. The server decides what that means (a student: their
 * own; faculty: students in the departments they cover; an administrator: all); these filters can only narrow it.
 */
export async function listCertificates(query: ListQuery = {}, signal?: AbortSignal): Promise<CertificateListing> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== '') params.set(key, String(value))
  const qs = params.toString()
  const res = await call(`/api/certificates${qs ? `?${qs}` : ''}`, { signal })
  const listing = (await res.json()) as CertificateListing
  return { ...listing, facets: listing.facets ?? { departments: [], batches: [] } }
}

/** Remove a certificate (administrators only; the Drive file goes to the bin, where it can be recovered for 30 days). */
export async function removeCertificate(certificateId: string, signal?: AbortSignal): Promise<void> {
  await call(`/api/certificates/${encodeURIComponent(certificateId)}`, { method: 'DELETE', signal })
}

/** Upload and account statistics for the administrator's overview. */
export interface UploadStats {
  certificates: { total: number; totalBytes: number; studentsWithCertificates: number; last7Days: number; last30Days: number }
  byCategory: { category: string; count: number }[]
  byDepartment: { department: string; count: number }[]
  /** The last 12 calendar months, oldest first, including months with no uploads. */
  byMonth: { month: string; count: number }[]
  accounts: Record<'student' | 'faculty' | 'admin', { active: number; pending: number; inactive: number }>
  /** Students who have registered and are waiting for an administrator. */
  pendingApprovals: number
}

export async function getUploadStats(signal?: AbortSignal): Promise<UploadStats> {
  const res = await call('/api/admin/stats', { signal })
  return ((await res.json()) as { stats: UploadStats }).stats
}
/** Fetch the certificate's bytes. The server checks authorisation on every call. */
export async function fetchCertificateBlob(certificateId: string, disposition: 'inline' | 'attachment' = 'inline', signal?: AbortSignal): Promise<Blob> {
  const res = await call(`/api/certificates/${encodeURIComponent(certificateId)}/file?disposition=${disposition}`, { signal })
  return res.blob()
}

/** Download through the API (so the server authorises the download itself) and hand the file to the browser. */
export async function downloadCertificate(certificateId: string, fileName: string, signal?: AbortSignal): Promise<void> {
  const blob = await fetchCertificateBlob(certificateId, 'attachment', signal)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before the blob goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** What the storage service reports about its Drive folder. Administrators only. */
export interface StorageStatus {
  ok: boolean
  code?: string
  message: string
  folderName?: string
  inSharedDrive?: boolean
  canAddChildren?: boolean
  authMode: 'oauth' | 'service_account'
  /** Opens the folder in Google Drive. Drive itself decides who may actually see it. */
  folderUrl?: string
  /** True when anyone with the link can open the folder; undefined when Drive doesn't say. */
  publiclyShared?: boolean
}

export async function getStorageStatus(signal?: AbortSignal): Promise<StorageStatus> {
  const res = await call('/api/storage/status', { signal })
  return ((await res.json()) as { storage: StorageStatus }).storage
}

/** A short, plain-language line for a failed storage call, suited to a toast or inline message. */
export function storageErrorMessage(err: unknown): string {
  if (err instanceof CertificateStorageError) return err.message
  return 'Something went wrong with certificate storage. Please try again.'
}
