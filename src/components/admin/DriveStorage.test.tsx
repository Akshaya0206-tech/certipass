import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerAccessTokenProvider } from '../../services/auth/accessToken'
import { DriveStorageSettings, OpenDriveFolderButton } from './DriveStorage'

const API = 'https://certs.example.test'
const FOLDER = 'https://drive.google.com/drive/folders/folder-from-service'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const status = (over: Record<string, unknown> = {}) =>
  json({
    storage: { ok: true, message: 'The folder is reachable and the account can add files to it.', folderName: 'OD certificate', inSharedDrive: false, canAddChildren: true, authMode: 'oauth', folderUrl: FOLDER, publiclyShared: false, ...over },
  })

// The exact folder the college gave us. Used only as a build-time setting in these tests.
const CONFIGURED_FOLDER = 'https://drive.google.com/drive/folders/folder-from-build-config?usp=drive_link'

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  // Start every test from a clean slate, whatever a developer's own .env.local says.
  vi.stubEnv('VITE_DRIVE_FOLDER_URL', '')
  vi.stubEnv('VITE_CERT_API_URL', '')
})
afterEach(() => {
  cleanup()
  registerAccessTokenProvider(null)
})
const configure = () => {
  vi.stubEnv('VITE_CERT_API_URL', API)
  registerAccessTokenProvider(async () => 'admin-token')
}

describe('Settings: certificate storage', () => {
  it('says storage is not set up, and makes no request, in prototype mode', () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    render(<DriveStorageSettings />)
    expect(screen.getByText('Certificate storage isn’t set up yet')).toBeTruthy()
    expect(screen.queryByRole('link')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('shows the connected folder and a link into Drive taken from the service', async () => {
    configure()
    fetchMock.mockResolvedValue(status())
    render(<DriveStorageSettings />)
    expect(await screen.findByText('Google Drive folder connected')).toBeTruthy()
    expect(screen.getByText(/OD certificate/)).toBeTruthy()
    const link = screen.getByRole('link', { name: /Open Google Drive Folder/ })
    expect(link.getAttribute('href')).toBe(FOLDER)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/api/storage/status`)
  })

  it('warns loudly when the folder is open to anyone with the link', async () => {
    configure()
    fetchMock.mockResolvedValue(status({ ok: false, code: 'drive_folder_public', publiclyShared: true, message: 'The folder is shared with anyone who has the link. Set General access to Restricted.' }))
    render(<DriveStorageSettings />)
    expect(await screen.findByText('Uploads need attention')).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain('Restricted')
    expect(screen.queryByText('Google Drive folder connected')).toBeNull()
  })

  it('asks the admin to check sharing by hand when Google does not say', async () => {
    configure()
    fetchMock.mockResolvedValue(status({ publiclyShared: undefined }))
    render(<DriveStorageSettings />)
    expect(await screen.findByText(/make sure General access is “Restricted”/)).toBeTruthy()
  })

  it('shows a clear error with Try again when the service cannot be reached', async () => {
    configure()
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fetchMock.mockResolvedValue(status())
    render(<DriveStorageSettings />)
    expect(await screen.findByText('Couldn’t check certificate storage')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(await screen.findByText('Google Drive folder connected')).toBeTruthy()
  })
})

describe('Open Google Drive Folder: the folder configured for the site', () => {
  it('opens exactly the folder provided, even before the storage service is connected', () => {
    vi.stubEnv('VITE_DRIVE_FOLDER_URL', CONFIGURED_FOLDER)
    render(<DriveStorageSettings />)
    const link = screen.getByRole('link', { name: /Open Google Drive Folder/ })
    expect(link.getAttribute('href')).toBe(CONFIGURED_FOLDER)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    // The honest status is still shown beside it: opening the folder is not the same as uploads working.
    expect(screen.getByText('Certificate storage isn’t set up yet')).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('prefers the link the storage service reports once connected', async () => {
    vi.stubEnv('VITE_DRIVE_FOLDER_URL', CONFIGURED_FOLDER)
    configure()
    fetchMock.mockResolvedValue(status())
    render(<DriveStorageSettings />)
    await screen.findByText('Google Drive folder connected')
    expect(screen.getAllByRole('link')).toHaveLength(1)
    expect(screen.getByRole('link', { name: /Open Google Drive Folder/ }).getAttribute('href')).toBe(FOLDER)
  })

  it('also appears on the Achievement Records page', () => {
    vi.stubEnv('VITE_DRIVE_FOLDER_URL', CONFIGURED_FOLDER)
    render(<OpenDriveFolderButton />)
    expect(screen.getByRole('link', { name: /Open Google Drive Folder/ }).getAttribute('href')).toBe(CONFIGURED_FOLDER)
  })

  it('refuses anything that is not a plain Google Drive folder link', () => {
    for (const bad of ['javascript:alert(1)', 'https://evil.example/drive/folders/abc', 'http://drive.google.com/drive/folders/abc', 'https://drive.google.com/file/d/abc/view', 'https://drive.google.com/drive/folders/abc def']) {
      vi.stubEnv('VITE_DRIVE_FOLDER_URL', bad)
      const { container, unmount } = render(<OpenDriveFolderButton />)
      expect(container.querySelector('a'), bad).toBeNull()
      unmount()
    }
  })
})

describe('Achievement Records: Open Google Drive Folder', () => {
  it('is absent when no folder is known', () => {
    const { container } = render(<OpenDriveFolderButton />)
    expect(container.textContent).toBe('')
  })

  it('links to the folder the service reported', async () => {
    configure()
    fetchMock.mockResolvedValue(status())
    render(<OpenDriveFolderButton />)
    const link = await screen.findByRole('link', { name: /Open Google Drive Folder/ })
    expect(link.getAttribute('href')).toBe(FOLDER)
  })

  it('is absent when the service refuses (for example, the user is not an admin)', async () => {
    configure()
    fetchMock.mockResolvedValue(json({ error: { code: 'forbidden', message: 'Only administrators can check storage.', retryable: false } }, 403))
    const { container } = render(<OpenDriveFolderButton />)
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(container.querySelector('a')).toBeNull()
  })
})
