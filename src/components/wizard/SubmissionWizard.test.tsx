/*
 * The real submission wizard, driven end to end in jsdom against a mocked storage
 * API: a student re-attaches a certificate to one of their achievements and
 * submits. These cover the parts of the Drive feature that live in the browser:
 * the upload happens first, a failure shows an error with a retry and saves
 * nothing, a retry reuses the same upload reference (so the file can't be stored
 * twice), and a double click makes one request.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../context/ToastContext'
import { SEED_USERS } from '../../data/mockData'
import { registerAccessTokenProvider } from '../../services/auth/accessToken'
import { getState, resetDemoData } from '../../services/store'
import type { Achievement, StudentUser } from '../../types'
import { SubmissionWizard } from './SubmissionWizard'

vi.mock('../../hooks/useData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../hooks/useData')>()),
  useStudent: () => SEED_USERS.find((u) => u.id === 'stu-01') as StudentUser,
}))

const API = 'https://certs.example.test'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const stored = (a: Achievement) => ({ id: 'cert-1', achievementId: a.id, fileName: 'my-cert.pdf', mimeType: 'application/pdf', sizeBytes: 9, uploadedAt: '2026-10-29T10:00:00Z' })
const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3, 4])], 'my-cert.pdf', { type: 'application/pdf' })

let achievement: Achievement
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  resetDemoData()
  achievement = getState().achievements.find((a) => a.studentId === 'stu-01')!
  URL.createObjectURL = vi.fn(() => 'blob:preview')
  URL.revokeObjectURL = vi.fn()
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo // jsdom doesn't implement it
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_CERT_API_URL', API)
  registerAccessTokenProvider(async () => 'student-token')
})
afterEach(() => {
  cleanup()
  registerAccessTokenProvider(null)
})

/** Walk an edit of `achievement` to its review step with a certificate chosen. */
async function reachReview() {
  render(
    <MemoryRouter>
      <ToastProvider>
        <SubmissionWizard mode={{ kind: 'edit', achievement }} />
      </ToastProvider>
    </MemoryRouter>,
  )
  for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }))
  fireEvent.change(document.getElementById('certificate-file')!, { target: { files: [pdf()] } })
  await screen.findByText(/Valid file/, undefined, { timeout: 5000 })
  fireEvent.click(screen.getByRole('button', { name: /^Review$/ }))
  return screen.findByRole('button', { name: /Resubmit Certificate/ })
}

const uploads = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/api/certificates'))
const formOf = (call: unknown[]) => (call[1] as RequestInit).body as FormData

describe('submitting with real certificate storage', () => {
  it('uploads the file first, then saves the achievement with a storage reference — never the file itself', async () => {
    fetchMock.mockResolvedValue(json({ certificate: stored(achievement) }, 201))
    fireEvent.click(await reachReview())

    await waitFor(() => expect(getState().achievements.find((a) => a.id === achievement.id)!.certificate.storage).toEqual({ provider: 'drive', certificateId: 'cert-1' }), { timeout: 5000 })

    expect(uploads()).toHaveLength(1)
    const form = formOf(uploads()[0])
    expect(form.get('achievementId')).toBe(achievement.id)
    expect(form.get('category')).toBe(achievement.category)
    expect((form.get('file') as File).name).toBe('my-cert.pdf')

    const saved = getState().achievements.find((a) => a.id === achievement.id)!.certificate
    expect(saved.previewDataUrl).toBeUndefined() // no browser-side copy of the file is kept
    expect(JSON.stringify(getState())).not.toContain('student-token')
  })

  it('on a failed upload: shows the error with Retry, and saves nothing', async () => {
    fetchMock.mockResolvedValue(json({ error: { code: 'drive_unavailable', message: 'Google Drive could not be reached.', retryable: true } }, 503))
    const before = JSON.stringify(getState().achievements.find((a) => a.id === achievement.id))
    fireEvent.click(await reachReview())

    expect(await screen.findByText('Your certificate was not uploaded', undefined, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByText('Google Drive could not be reached.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Retry upload' })).toBeTruthy()
    expect(JSON.stringify(getState().achievements.find((a) => a.id === achievement.id))).toBe(before)
  })

  it('Retry succeeds with the SAME upload reference, so the file cannot be stored twice', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'drive_unavailable', message: 'Google Drive could not be reached.', retryable: true } }, 503))
    fetchMock.mockResolvedValue(json({ certificate: stored(achievement) }, 201))
    fireEvent.click(await reachReview())
    fireEvent.click(await screen.findByRole('button', { name: 'Retry upload' }, { timeout: 5000 }))

    await waitFor(() => expect(getState().achievements.find((a) => a.id === achievement.id)!.certificate.storage?.certificateId).toBe('cert-1'), { timeout: 5000 })
    expect(uploads()).toHaveLength(2)
    expect(formOf(uploads()[1]).get('uploadId')).toBe(formOf(uploads()[0]).get('uploadId'))
    expect(formOf(uploads()[1]).get('achievementId')).toBe(formOf(uploads()[0]).get('achievementId'))
  })

  it('a double click sends one upload', async () => {
    let finish: (r: Response) => void = () => undefined
    fetchMock.mockReturnValue(new Promise<Response>((r) => (finish = r)))
    const submit = await reachReview()
    fireEvent.click(submit)
    fireEvent.click(submit)
    fireEvent.click(submit)
    await waitFor(() => expect(uploads()).toHaveLength(1))
    finish(json({ certificate: stored(achievement) }, 201))
    await waitFor(() => expect(getState().achievements.find((a) => a.id === achievement.id)!.certificate.storage).toBeTruthy(), { timeout: 5000 })
    expect(uploads()).toHaveLength(1)
  })

  it('says the upload goes to private storage, and that drafts keep no file', async () => {
    render(
      <MemoryRouter>
        <ToastProvider>
          <SubmissionWizard mode={{ kind: 'edit', achievement }} />
        </ToastProvider>
      </MemoryRouter>,
    )
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: /^Continue$/ }))
    expect(screen.getByText(/uploaded to the college’s private Google Drive/)).toBeTruthy()
    expect(screen.getByText(/not the file itself/)).toBeTruthy()
  })
})

describe('without storage configured (prototype mode)', () => {
  it('makes no storage request and keeps the prototype behaviour', async () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    fireEvent.click(await reachReview())
    await waitFor(() => expect(getState().achievements.find((a) => a.id === achievement.id)!.certificate.fileName).toBe('my-cert.pdf'), { timeout: 5000 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(getState().achievements.find((a) => a.id === achievement.id)!.certificate.storage).toBeUndefined()
  })
})
