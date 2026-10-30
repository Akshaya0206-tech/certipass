import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../context/ToastContext'
import { registerAccessTokenProvider } from '../services/auth/accessToken'
import type { ListedCertificate } from '../services/certificateStorage'
import { FakeXHR } from '../testing/fakeXhr'
import StudentCertificatesPage, { validateCertificateForm } from './StudentCertificatesPage'

const API = 'https://certs.example.test'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const item = (over: Partial<ListedCertificate> = {}): ListedCertificate => ({
  id: 'cert-1',
  achievementId: 'cert-aaa',
  fileName: 'my-cert.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 2048,
  uploadedAt: '2026-10-29T10:00:00Z',
  category: 'Hackathon',
  title: 'CodeHarbour Hackathon',
  issuer: 'Rajalakshmi Institute of Technology',
  issueDate: '2026-09-14',
  studentId: 's1',
  studentName: 'Aarav Menon',
  registerNumber: '2023CSE0417',
  department: 'CSE',
  batch: '2023',
  ...over,
})

let stored: ListedCertificate[]
let fetchMock: ReturnType<typeof vi.fn>
const pdf = (name = 'my-cert.pdf') => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 4])], name, { type: 'application/pdf' })

beforeEach(() => {
  stored = []
  FakeXHR.reset()
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  URL.createObjectURL = vi.fn(() => 'blob:certificate')
  URL.revokeObjectURL = vi.fn()
  fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes('/file?')) return new Response('file-bytes', { headers: { 'Content-Type': 'application/pdf' } })
    return json({ certificates: stored, total: stored.length, limit: 200, offset: 0, facets: { departments: [], batches: [] } })
  })
  vi.stubGlobal('fetch', fetchMock)
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
  vi.stubEnv('VITE_CERT_API_URL', API)
  registerAccessTokenProvider(async () => 'student-token')
})
afterEach(() => {
  cleanup()
  registerAccessTokenProvider(null)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

const renderPage = () =>
  render(
    <MemoryRouter>
      <ToastProvider>
        <StudentCertificatesPage />
      </ToastProvider>
    </MemoryRouter>,
  )

function fill(over: Partial<Record<'title' | 'category' | 'issuer' | 'issueDate', string>> = {}) {
  const v = { title: 'CodeHarbour Hackathon', category: 'Hackathon', issuer: 'Rajalakshmi Institute of Technology', issueDate: '2025-01-15', ...over }
  fireEvent.change(screen.getByLabelText(/Certificate title/), { target: { value: v.title } })
  fireEvent.change(screen.getByLabelText(/Category/), { target: { value: v.category } })
  fireEvent.change(screen.getByLabelText(/Issuing organisation/), { target: { value: v.issuer } })
  fireEvent.change(screen.getByLabelText(/Issue date/), { target: { value: v.issueDate } })
}
async function choose(file: File) {
  fireEvent.change(screen.getByLabelText(/Certificate file/), { target: { files: [file] } })
  await screen.findByText(/Ready to upload/, undefined, { timeout: 5000 })
}
const uploadButton = () => screen.getByRole('button', { name: /Upload certificate|Uploading/ })
const lastXhr = async () => {
  await waitFor(() => expect(FakeXHR.instances.length).toBeGreaterThan(0))
  return FakeXHR.instances[FakeXHR.instances.length - 1]
}

describe('the form', () => {
  it('asks for every detail, says what is missing, and sends nothing', () => {
    renderPage()
    fireEvent.click(uploadButton())
    expect(screen.getByText('Enter a title for the certificate.')).toBeTruthy()
    expect(screen.getByText('Select a category.')).toBeTruthy()
    expect(screen.getByText('Enter who issued the certificate.')).toBeTruthy()
    expect(screen.getByText('Enter the date on the certificate.')).toBeTruthy()
    expect(screen.getByText('Choose the certificate file.')).toBeTruthy()
    expect(FakeXHR.instances).toHaveLength(0)
  })

  it('refuses a file that is not a PDF, JPG or PNG as soon as it is chosen', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/Certificate file/), { target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText(/not a supported format/)).toBeTruthy()
    expect(screen.queryByText(/Ready to upload/)).toBeNull()
  })

  it('refuses a file that only pretends to be a PDF', async () => {
    renderPage()
    fireEvent.change(screen.getByLabelText(/Certificate file/), { target: { files: [new File(['this is not a pdf at all'], 'fake.pdf', { type: 'application/pdf' })] } })
    expect(await screen.findByText(/look like a valid PDF file/, undefined, { timeout: 5000 })).toBeTruthy()
    expect(screen.queryByText(/Ready to upload/)).toBeNull()
  })

  it('offers the same categories as the rest of CertiPass', () => {
    renderPage()
    const options = within(screen.getByLabelText(/Category/)).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Select a category', 'Hackathon', 'Workshop', 'Internship', 'Competition', 'Conference', 'Paper Presentation', 'Sports', 'Cultural', 'Other'])
  })

  it('does not accept a date in the future', () => {
    expect(validateCertificateForm({ title: 'Valid title', category: 'Sports', issuer: 'Org', issueDate: '2026-12-31' }, true, '2026-10-30').issueDate).toMatch(/future/)
    expect(validateCertificateForm({ title: 'Valid title', category: 'Sports', issuer: 'Org', issueDate: '2026-10-30' }, true, '2026-10-30')).toEqual({})
    expect(validateCertificateForm({ title: 'Valid title', category: 'Sports', issuer: 'Org', issueDate: '1985-01-01' }, true, '2026-10-30').issueDate).toMatch(/1990/)
    expect(validateCertificateForm({ title: 'ab', category: 'Nope', issuer: 'x', issueDate: 'nonsense' }, false)).toMatchObject({
      title: expect.any(String),
      category: expect.any(String),
      issuer: expect.any(String),
      issueDate: expect.any(String),
      file: expect.any(String),
    })
  })
})

describe('uploading a certificate', () => {
  it('sends the details and the file to the server, shows progress, then says it is stored', async () => {
    renderPage()
    fill()
    await choose(pdf())
    fireEvent.click(uploadButton())

    const xhr = await lastXhr()
    expect(xhr.url).toBe(`${API}/api/certificates`)
    expect(xhr.headers.Authorization).toBe('Bearer student-token')
    expect(xhr.field('title')).toBe('CodeHarbour Hackathon')
    expect(xhr.field('category')).toBe('Hackathon')
    expect(xhr.field('issuer')).toBe('Rajalakshmi Institute of Technology')
    expect(xhr.field('issueDate')).toBe('2025-01-15')
    expect((xhr.field('file') as File).name).toBe('my-cert.pdf')
    // The browser never sends who the student is: the server knows that from the session.
    expect([...xhr.body!.keys()].sort()).toEqual(['achievementId', 'category', 'file', 'issueDate', 'issuer', 'title', 'uploadId'])

    act(() => xhr.progress(500, 1000))
    expect(await screen.findByText('Uploading… 50%')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Upload progress' }).getAttribute('aria-valuenow')).toBe('50')
    expect((uploadButton() as HTMLButtonElement).disabled).toBe(true)

    act(() => xhr.progress(1000, 1000))
    expect(await screen.findByText('Saving to Google Drive…')).toBeTruthy()

    stored = [item()]
    act(() => xhr.respond(201, { certificate: stored[0] }))
    expect(await screen.findByText(/Uploaded\./)).toBeTruthy()
    // The form is ready for the next one, and the list shows the new certificate.
    expect((screen.getByLabelText(/Certificate title/) as HTMLInputElement).value).toBe('')
    const table = await screen.findByRole('table', { name: 'Your uploaded certificates' })
    expect(within(table).getByText('CodeHarbour Hackathon')).toBeTruthy()
    expect(within(table).getByText('Rajalakshmi Institute of Technology')).toBeTruthy()
  })

  it('makes one request even if Upload is pressed twice', async () => {
    renderPage()
    fill()
    await choose(pdf())
    fireEvent.click(uploadButton())
    fireEvent.click(uploadButton())
    fireEvent.submit(uploadButton().closest('form')!)
    await lastXhr()
    expect(FakeXHR.instances).toHaveLength(1)
  })

  it('says plainly when it fails, saves nothing, and lets the student try again with the same upload reference', async () => {
    renderPage()
    fill()
    await choose(pdf())
    fireEvent.click(uploadButton())
    const first = await lastXhr()
    act(() => first.respond(503, { error: { code: 'drive_unavailable', message: 'Google Drive could not be reached. Your certificate was not lost — try again in a moment.', retryable: true } }))

    expect(await screen.findByText(/Your certificate was not uploaded/)).toBeTruthy()
    expect(screen.getByText(/Google Drive could not be reached/)).toBeTruthy()
    // Their details are still there, so nothing has to be typed again.
    expect((screen.getByLabelText(/Certificate title/) as HTMLInputElement).value).toBe('CodeHarbour Hackathon')

    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(2))
    const second = FakeXHR.instances[1]
    // The same reference means the server can tell this is a retry and never stores the file twice.
    expect(second.field('uploadId')).toBe(first.field('uploadId'))
    expect(second.field('achievementId')).toBe(first.field('achievementId'))

    stored = [item()]
    act(() => second.respond(201, { certificate: stored[0] }))
    expect(await screen.findByText(/Uploaded\./)).toBeTruthy()
  })

  it('shows the server’s reason when it refuses the file', async () => {
    renderPage()
    fill()
    await choose(pdf())
    fireEvent.click(uploadButton())
    act(() => void lastXhr().then((x) => x.respond(415, { error: { code: 'signature_mismatch', message: '“my-cert.pdf” does not look like a valid file of the type its name claims.', retryable: false } })))
    expect(await screen.findByText(/does not look like a valid file/)).toBeTruthy()
  })

  it('treats a lost connection as something to retry', async () => {
    renderPage()
    fill()
    await choose(pdf())
    fireEvent.click(uploadButton())
    const xhr = await lastXhr()
    act(() => xhr.failNetwork())
    expect(await screen.findByText(/Couldn’t reach certificate storage/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Try again/ })).toBeTruthy()
  })

  it('uses a new upload reference when a different file is chosen', async () => {
    renderPage()
    fill()
    await choose(pdf('first.pdf'))
    fireEvent.click(uploadButton())
    const first = await lastXhr()
    act(() => first.respond(503, { error: { code: 'drive_unavailable', message: 'Down.', retryable: true } }))
    await screen.findByText(/Your certificate was not uploaded/)

    await choose(pdf('second.pdf'))
    fireEvent.click(uploadButton())
    await waitFor(() => expect(FakeXHR.instances).toHaveLength(2))
    expect(FakeXHR.instances[1].field('uploadId')).not.toBe(first.field('uploadId'))
  })
})

describe('your certificates', () => {
  it('lists what the student has stored, with the details they entered', async () => {
    stored = [item(), item({ id: 'cert-2', title: null, issuer: null, issueDate: null, fileName: 'scan.png', mimeType: 'image/png', category: 'Sports' })]
    renderPage()
    const table = await screen.findByRole('table', { name: 'Your uploaded certificates' })
    expect(within(table).getByText('CodeHarbour Hackathon')).toBeTruthy()
    expect(within(table).getByText('scan.png')).toBeTruthy() // no title: the file name stands in
    expect(screen.getByText('2 stored')).toBeTruthy()
  })

  it('says so when there are none yet', async () => {
    renderPage()
    expect(await screen.findByText('No certificates yet')).toBeTruthy()
  })

  it('opens a preview fetched through the authenticated API, never from a link', async () => {
    stored = [item()]
    renderPage()
    fireEvent.click(await screen.findByRole('button', { name: /Preview/ }))
    await screen.findByRole('button', { name: /^Download$/ })
    const fileCalls = fetchMock.mock.calls.filter(([url]) => String(url).includes('/file?'))
    expect(String(fileCalls[0][0])).toBe(`${API}/api/certificates/cert-1/file?disposition=inline`)
    expect((fileCalls[0][1] as RequestInit).headers).toEqual({ Authorization: 'Bearer student-token' })
    // The details are shown above the file (the table row shows the organisation too, so twice in all).
    expect(screen.getAllByText('Rajalakshmi Institute of Technology')).toHaveLength(2)
  })

  it('downloads through the API as an attachment', async () => {
    stored = [item()]
    renderPage()
    const row = await screen.findByRole('table', { name: 'Your uploaded certificates' })
    fireEvent.click(within(row).getByRole('button', { name: /Download/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith('/file?disposition=attachment'))).toBe(true))
  })

  it('explains a failed list instead of showing an empty one, and can try again', async () => {
    fetchMock.mockImplementationOnce(async () => json({ error: { code: 'database_unavailable', message: 'The records database could not be reached.', retryable: true } }, 503))
    renderPage()
    expect(await screen.findByText('Couldn’t load your certificates')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText('No certificates yet')).toBeTruthy()
  })
})

describe('when the app is not connected to the server', () => {
  it('says certificate storage is not set up, and offers no upload form', () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    renderPage()
    expect(screen.getByText('Certificate storage isn’t set up yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Upload certificate/ })).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says so when nobody is signed in to the server', () => {
    registerAccessTokenProvider(null)
    renderPage()
    expect(screen.getByText(/can’t verify this sign-in/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Upload certificate/ })).toBeNull()
  })
})
