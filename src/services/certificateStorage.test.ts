import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeXHR } from '../testing/fakeXhr'
import { registerAccessTokenProvider } from './auth/accessToken'
import {
  CertificateStorageError,
  downloadCertificate,
  fetchCertificateBlob,
  getUploadStats,
  listCertificates,
  lookupCertificate,
  removeCertificate,
  storageAvailability,
  uploadCertificate,
} from './certificateStorage'

const API = 'https://certs.example.test'
const stored = { id: 'c1', achievementId: 'ach-1', fileName: 'cert.pdf', mimeType: 'application/pdf', sizeBytes: 12, uploadedAt: '2026-10-29T10:00:00Z' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const pdfFile = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'cert.pdf', { type: 'application/pdf' })

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_CERT_API_URL', API)
  registerAccessTokenProvider(async () => 'access-token')
})
afterEach(() => registerAccessTokenProvider(null))

describe('availability', () => {
  it('is "unconfigured" without an API url (prototype mode)', () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    expect(storageAvailability()).toBe('unconfigured')
  })

  it('is "no_session" when the API is set but sign-in cannot provide a token', () => {
    registerAccessTokenProvider(null)
    expect(storageAvailability()).toBe('no_session')
  })

  it('is "ready" when both exist', () => {
    expect(storageAvailability()).toBe('ready')
  })
})

describe('requests', () => {
  it('uploads a multipart form with the bearer token and nothing else secret', async () => {
    fetchMock.mockResolvedValue(json({ certificate: stored }, 201))
    const out = await uploadCertificate({ achievementId: 'ach-1', uploadId: 'u-1', category: 'Hackathon', file: pdfFile() })
    expect(out).toEqual(stored)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/api/certificates`)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({ Authorization: 'Bearer access-token' })
    const form = init.body as FormData
    expect([...form.keys()].sort()).toEqual(['achievementId', 'category', 'file', 'uploadId'])
    expect(form.get('uploadId')).toBe('u-1')
  })

  it('strips a trailing slash from the API url', async () => {
    vi.stubEnv('VITE_CERT_API_URL', `${API}/`)
    fetchMock.mockResolvedValue(json({ certificate: stored }))
    await lookupCertificate('ach-1')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/certificates/by-achievement/ach-1`)
  })

  it('names the student in an achievement lookup, encoded, so staff reach the right student’s certificate', async () => {
    fetchMock.mockResolvedValue(json({ certificate: stored }))
    await lookupCertificate('ach-1', 'a b&c')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/certificates/by-achievement/ach-1?student=a%20b%26c`)
  })

  it('lists the certificates the server allows, passing along only the filters it was given', async () => {
    fetchMock.mockImplementation(async () => json({ certificates: [{ ...stored, category: 'Hackathon', studentId: 's1', studentName: 'Aarav', registerNumber: 'R1', department: 'CSE' }], total: 1, limit: 50, offset: 0 }))
    const listing = await listCertificates({ studentId: 's1', category: 'Hackathon', limit: 10, offset: 0 })
    expect(listing.certificates[0]).toMatchObject({ id: 'c1', studentName: 'Aarav' })
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/certificates?studentId=s1&category=Hackathon&limit=10&offset=0`)
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer access-token' })

    fetchMock.mockClear()
    await listCertificates()
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/certificates`)
  })

  it('sends the details a student typed, only when they were typed', async () => {
    fetchMock.mockImplementation(async () => json({ certificate: stored }, 201))
    await uploadCertificate({ achievementId: 'a', uploadId: 'u', category: 'Workshop', file: pdfFile(), title: 'Cloud Workshop', issuer: 'AWS Academy', issueDate: '2026-08-01' })
    const form = fetchMock.mock.calls[0][1].body as FormData
    expect([...form.keys()].sort()).toEqual(['achievementId', 'category', 'file', 'issueDate', 'issuer', 'title', 'uploadId'])
    expect(form.get('title')).toBe('Cloud Workshop')
    expect(form.get('issueDate')).toBe('2026-08-01')
  })

  it('narrows a listing by search, department, batch and category, sending only what was asked', async () => {
    fetchMock.mockImplementation(async () => json({ certificates: [], total: 0, limit: 25, offset: 0, facets: { departments: ['CSE'], batches: ['2023'] } }))
    const out = await listCertificates({ q: 'aarav', department: 'CSE', batch: '2023', category: 'Hackathon', limit: 25, offset: 50 })
    expect(out.facets).toEqual({ departments: ['CSE'], batches: ['2023'] })
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/certificates?q=aarav&department=CSE&batch=2023&category=Hackathon&limit=25&offset=50`)
  })

  it('removes a certificate with DELETE and reads the upload statistics', async () => {
    fetchMock.mockImplementation(async () => json({ stats: { certificates: { total: 3 } } }))
    await removeCertificate('c1')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/certificates/c1`)
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE')
    expect((await getUploadStats()).certificates.total).toBe(3)
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/api/admin/stats`)
  })

  it('makes no network call at all when there is no token', async () => {
    registerAccessTokenProvider(async () => null)
    await expect(fetchCertificateBlob('c1')).rejects.toMatchObject({ code: 'no_session' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('makes no network call when storage is not configured', async () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    await expect(uploadCertificate({ achievementId: 'a', uploadId: 'u', category: 'Sports', file: pdfFile() })).rejects.toMatchObject({ code: 'not_configured' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches a file inline by default and as an attachment for downloads', async () => {
    fetchMock.mockImplementation(async () => new Response('bytes', { headers: { 'Content-Type': 'application/pdf' } }))
    await fetchCertificateBlob('c1')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/certificates/c1/file?disposition=inline`)

    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    await downloadCertificate('c1', 'cert.pdf')
    expect(fetchMock.mock.calls[1][0]).toBe(`${API}/api/certificates/c1/file?disposition=attachment`)
  })
})

describe('uploading with a progress bar', () => {
  beforeEach(() => {
    FakeXHR.reset()
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
  })
  const start = (extra: Partial<Parameters<typeof uploadCertificate>[0]> = {}, signal?: AbortSignal) => {
    const progress: number[] = []
    const promise = uploadCertificate({ achievementId: 'a', uploadId: 'u', category: 'Hackathon', file: pdfFile(), onProgress: (f) => progress.push(f), ...extra }, signal)
    return { promise, progress }
  }
  const request = async () => {
    await vi.waitFor(() => expect(FakeXHR.instances).toHaveLength(1))
    return FakeXHR.instances[0]
  }

  it('sends the same request as a normal upload, with the session token, and reports how much has gone', async () => {
    const { promise, progress } = start({ title: 'My certificate' })
    const xhr = await request()
    expect(xhr.method).toBe('POST')
    expect(xhr.url).toBe(`${API}/api/certificates`)
    expect(xhr.headers).toEqual({ Authorization: 'Bearer access-token' })
    expect(xhr.field('uploadId')).toBe('u')
    expect(xhr.field('title')).toBe('My certificate')
    expect((xhr.field('file') as File).name).toBe('cert.pdf')

    xhr.progress(250, 1000)
    xhr.progress(1000, 1000)
    expect(progress).toEqual([0.25, 1])
    xhr.respond(201, { certificate: stored })
    expect(await promise).toEqual(stored)
  })

  it('never reports more than 100%, and ignores progress it cannot measure', async () => {
    const { promise, progress } = start()
    const xhr = await request()
    xhr.progress(1200, 1000)
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 5, total: 0 })
    expect(progress).toEqual([1])
    xhr.respond(201, { certificate: stored })
    await promise
  })

  it('turns a refusal into the same typed error as a normal upload', async () => {
    const { promise } = start()
    const xhr = await request()
    xhr.respond(413, { error: { code: 'file_too_large', message: 'This file is larger than the 10 MB limit.', retryable: false } })
    expect(await promise.catch((e) => e)).toMatchObject({ code: 'file_too_large', message: 'This file is larger than the 10 MB limit.', status: 413, retryable: false })
  })

  it('copes with a server error that is not JSON, and with a success that has no certificate', async () => {
    const first = start()
    ;(await request()).respond(502, '<html>Bad gateway</html>')
    expect(await first.promise.catch((e) => e)).toMatchObject({ code: 'request_failed', retryable: true, status: 502 })

    FakeXHR.reset()
    const second = start()
    ;(await request()).respond(200, {})
    expect(await second.promise.catch((e) => e)).toBeInstanceOf(CertificateStorageError)
  })

  it('reports a lost connection as retryable', async () => {
    const { promise } = start()
    ;(await request()).failNetwork()
    expect(await promise.catch((e) => e)).toMatchObject({ code: 'network', retryable: true })
  })

  it('can be cancelled', async () => {
    const controller = new AbortController()
    const { promise } = start({}, controller.signal)
    const xhr = await request()
    controller.abort()
    expect(xhr.aborted).toBe(true)
    expect(await promise.catch((e) => e)).toMatchObject({ name: 'AbortError' })
  })

  it('does not send anything without a session or without a configured server', async () => {
    registerAccessTokenProvider(async () => null)
    expect(await start().promise.catch((e) => e)).toMatchObject({ code: 'no_session' })
    registerAccessTokenProvider(async () => 'access-token')
    vi.stubEnv('VITE_CERT_API_URL', '')
    expect(await start().promise.catch((e) => e)).toMatchObject({ code: 'not_configured' })
    expect(FakeXHR.instances).toHaveLength(0)
  })
})

describe('errors', () => {
  it('turns a server refusal into a typed error the UI can act on', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'drive_folder_inaccessible', message: 'The folder cannot be accessed.', retryable: false } }, 503))
    const err = (await uploadCertificate({ achievementId: 'a', uploadId: 'u', category: 'Sports', file: pdfFile() }).catch((e) => e)) as CertificateStorageError
    expect(err).toBeInstanceOf(CertificateStorageError)
    expect(err).toMatchObject({ code: 'drive_folder_inaccessible', message: 'The folder cannot be accessed.', retryable: false, status: 503 })
  })

  it('flags a "not available" answer so screens can say so plainly', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'certificate_not_available', message: 'Certificate not available.', retryable: false } }, 404))
    const err = (await lookupCertificate('ach-9').catch((e) => e)) as CertificateStorageError
    expect(err.notAvailable).toBe(true)
  })

  it('reports an unreachable service as retryable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const err = (await fetchCertificateBlob('c1').catch((e) => e)) as CertificateStorageError
    expect(err).toMatchObject({ code: 'network', retryable: true })
  })

  it('copes with a non-JSON error body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }))
    const err = (await fetchCertificateBlob('c1').catch((e) => e)) as CertificateStorageError
    expect(err).toMatchObject({ code: 'request_failed', retryable: true })
  })
})
