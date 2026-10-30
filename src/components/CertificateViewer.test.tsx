import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerAccessTokenProvider } from '../services/auth/accessToken'
import type { CertificateFile } from '../types'
import { CertificatePreview } from './CertificatePreview'
import { CertificateViewerDialog, ViewCertificateButton } from './CertificateViewer'
import type { ViewerTarget } from './CertificateViewer'

const API = 'https://certs.example.test'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const err = (code: string, message: string, status: number, retryable = false) => json({ error: { code, message, retryable } }, status)
const bytes = () => new Response('file-bytes', { headers: { 'Content-Type': 'application/pdf' } })

const pdfMeta: CertificateFile = { fileName: 'hackathon.pdf', fileType: 'application/pdf', sizeBytes: 2048 }
const inDrive: CertificateFile = { ...pdfMeta, storage: { provider: 'drive', certificateId: 'cert-1' } }
const target = (certificate: CertificateFile | undefined): ViewerTarget => ({
  achievementId: 'ach-1',
  studentId: '11111111-1111-4111-8111-111111111111',
  eventName: 'CodeHarbour 36-Hour Hackathon',
  reference: 'CP-2026-0140',
  certificate,
  studentName: 'Aarav Menon',
  registerNumber: '2023CSE0417',
  department: 'CSE',
})

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  // jsdom doesn't implement <dialog> modal behaviour or object URLs.
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  URL.createObjectURL = vi.fn(() => 'blob:certificate')
  URL.revokeObjectURL = vi.fn()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  cleanup()
  registerAccessTokenProvider(null)
})

const configure = () => {
  vi.stubEnv('VITE_CERT_API_URL', API)
  registerAccessTokenProvider(async () => 'access-token')
}

describe('View Certificate button', () => {
  it('is a real, labelled button when the record has a certificate', () => {
    const open = vi.fn()
    render(<ViewCertificateButton certificate={pdfMeta} label="Hackathon by Aarav" onOpen={open} />)
    fireEvent.click(screen.getByRole('button', { name: /View Certificate/ }))
    expect(open).toHaveBeenCalledOnce()
  })

  it('says "Certificate not available" instead of offering a dead button', () => {
    render(<ViewCertificateButton certificate={undefined} label="x" onOpen={() => undefined} />)
    expect(screen.getByText('Certificate not available')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
  })
})

describe('the viewer shows who, what and the certificate together', () => {
  it('lists the student, register number, department and achievement', () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    render(<CertificateViewerDialog target={target(pdfMeta)} onClose={() => undefined} />)
    expect(screen.getAllByText('Aarav Menon').length).toBeGreaterThan(0)
    expect(screen.getAllByText('2023CSE0417').length).toBeGreaterThan(0)
    expect(screen.getByText('CSE')).toBeTruthy()
    expect(screen.getByText('CodeHarbour 36-Hour Hackathon')).toBeTruthy()
  })
})

describe('when Drive storage is not set up', () => {
  it('says so honestly instead of faking a preview or a download', () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    render(<CertificateViewerDialog target={target(pdfMeta)} onClose={() => undefined} />)
    expect(screen.getByText('Certificate storage isn’t set up yet')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /download/i })).toBeNull()
    expect(screen.queryByRole('img')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('explains that the sign-in cannot be verified when storage is configured but there is no token source', () => {
    vi.stubEnv('VITE_CERT_API_URL', API)
    render(<CertificateViewerDialog target={target(pdfMeta)} onClose={() => undefined} />)
    expect(screen.getByText('Certificate storage can’t verify this sign-in')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('a record with no certificate', () => {
  it('says "Certificate not available"', () => {
    render(<CertificateViewerDialog target={target(undefined)} onClose={() => undefined} />)
    expect(screen.getByText('Certificate not available')).toBeTruthy()
  })
})

describe('a bundled demonstration file', () => {
  it('is shown, and labelled as not coming from Google Drive', () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    render(<CertificateViewerDialog target={target({ ...pdfMeta, fileType: 'image/png', previewUrl: '/demo-certificates/x.png' })} onClose={() => undefined} />)
    expect(screen.getByRole('img').getAttribute('src')).toBe('/demo-certificates/x.png')
    expect(screen.getByText(/not from Google Drive/)).toBeTruthy()
  })
})

describe('a certificate stored in Drive', () => {
  it('shows a loading state, then the real file fetched with the bearer token', async () => {
    configure()
    let release: (r: Response) => void = () => undefined
    fetchMock.mockReturnValue(new Promise<Response>((r) => (release = r)))
    render(<CertificatePreview certificate={{ ...inDrive, fileType: 'image/png', fileName: 'c.png' }} eventName="Hackathon" />)

    expect(screen.getByRole('status').textContent).toContain('Loading certificate')
    release(bytes())
    const img = await screen.findByRole('img')
    expect(img.getAttribute('src')).toBe('blob:certificate')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/api/certificates/cert-1/file?disposition=inline`)
    expect(init.headers).toEqual({ Authorization: 'Bearer access-token' })
  })

  it('offers Download, which asks the server for an attachment', async () => {
    configure()
    fetchMock.mockImplementation(async () => bytes())
    render(<CertificatePreview certificate={inDrive} eventName="Hackathon" />)
    const download = await screen.findByRole('button', { name: /Download/ })
    fireEvent.click(download)
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith('disposition=attachment'))).toBe(true))
  })

  it('says "Certificate not available" when the server refuses or has no such file', async () => {
    configure()
    fetchMock.mockResolvedValue(err('certificate_not_available', 'Certificate not available.', 404))
    render(<CertificatePreview certificate={inDrive} eventName="Hackathon" />)
    expect(await screen.findByText('Certificate not available')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
  })

  it('shows a clear error with Try again when storage is down, and recovers', async () => {
    configure()
    fetchMock.mockResolvedValueOnce(err('drive_unavailable', 'Google Drive could not be reached.', 503, true))
    fetchMock.mockImplementation(async () => bytes())
    render(<CertificatePreview certificate={inDrive} eventName="Hackathon" />)

    expect(await screen.findByText('Couldn’t load the certificate')).toBeTruthy()
    expect(screen.getByText('Google Drive could not be reached.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByRole('button', { name: /Download/ })).toBeTruthy()
  })

  it('looks a record up by achievement when it has file details but no storage reference', async () => {
    configure()
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('by-achievement') ? json({ certificate: { id: 'cert-9', achievementId: 'ach-1', fileName: 'hackathon.pdf', mimeType: 'application/pdf', sizeBytes: 2048, uploadedAt: null } }) : bytes(),
    )
    render(<CertificateViewerDialog target={target(pdfMeta)} onClose={() => undefined} />)
    await screen.findByRole('button', { name: /Download/ })
    // The lookup names the student the achievement belongs to: achievement ids are only unique per student.
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([
      `${API}/api/certificates/by-achievement/ach-1?student=11111111-1111-4111-8111-111111111111`,
      `${API}/api/certificates/cert-9/file?disposition=inline`,
    ])
  })

  it('says "Certificate not available" when the lookup finds nothing this user may see', async () => {
    configure()
    fetchMock.mockResolvedValue(err('certificate_not_available', 'Certificate not available.', 404))
    render(<CertificateViewerDialog target={target(pdfMeta)} onClose={() => undefined} />)
    expect(await screen.findByText('Certificate not available')).toBeTruthy()
  })
})
