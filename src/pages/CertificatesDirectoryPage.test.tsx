import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../context/ToastContext'
import { registerAccessTokenProvider } from '../services/auth/accessToken'
import type { ListedCertificate, UploadStats } from '../services/certificateStorage'
import CertificatesDirectoryPage from './CertificatesDirectoryPage'

const me = vi.hoisted(() => ({ role: 'faculty' as 'faculty' | 'admin' }))
vi.mock('../hooks/useData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useData')>()),
  useRequiredUser: () => ({ id: 'user-1', role: me.role, fullName: 'Test User', username: 'test@rajalakshmi.edu.in', department: 'CSE', createdAt: '2026-01-01T00:00:00Z', active: true }),
}))

const API = 'https://certs.example.test'
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const refuse = (status: number, code: string, message: string) => json({ error: { code, message, retryable: status >= 500 } }, status)

const cert = (over: Partial<ListedCertificate>): ListedCertificate => ({
  id: 'c0',
  achievementId: 'cert-x',
  fileName: 'scan.pdf',
  mimeType: 'application/pdf',
  sizeBytes: 4096,
  uploadedAt: '2026-10-29T10:00:00Z',
  category: 'Hackathon',
  title: null,
  issuer: null,
  issueDate: '2026-09-14',
  studentId: 's0',
  studentName: 'Student',
  registerNumber: 'R0',
  department: 'CSE',
  batch: '2023',
  ...over,
})
const SEED: ListedCertificate[] = [
  cert({ id: 'c1', studentId: 's1', studentName: 'Aarav Menon', registerNumber: '2023CSE0417', department: 'CSE', batch: '2023', title: 'CodeHarbour Hackathon', issuer: 'RIT', category: 'Hackathon', uploadedAt: '2026-10-29T10:00:00Z' }),
  cert({ id: 'c2', studentId: 's2', studentName: 'Priya Krishnan', registerNumber: '2023AIDS0101', department: 'AIDS', batch: '2023', title: 'Cloud Workshop', issuer: 'AWS Academy', category: 'Workshop', uploadedAt: '2026-10-28T10:00:00Z' }),
  cert({ id: 'c3', studentId: 's3', studentName: 'Dev Sharma', registerNumber: '2022CSE0099', department: 'CSE', batch: '2022', title: 'Cricket Cup', issuer: 'State Council', category: 'Sports', uploadedAt: '2026-10-27T10:00:00Z' }),
]
const STATS: UploadStats = {
  certificates: { total: 3, totalBytes: 12288, studentsWithCertificates: 3, last7Days: 3, last30Days: 3 },
  byCategory: [{ category: 'Hackathon', count: 1 }, { category: 'Sports', count: 1 }, { category: 'Workshop', count: 1 }],
  byDepartment: [{ department: 'CSE', count: 2 }, { department: 'AIDS', count: 1 }],
  byMonth: Array.from({ length: 12 }, (_, i) => ({ month: `2025-${String(i + 11 > 12 ? i - 1 : i + 11).padStart(2, '0')}`, count: 0 })),
  accounts: { student: { active: 3, pending: 2, inactive: 0 }, faculty: { active: 1, pending: 0, inactive: 0 }, admin: { active: 1, pending: 0, inactive: 0 } },
  pendingApprovals: 2,
}

let data: ListedCertificate[]
let listCalls: URL[]
let deletes: string[]
let statsCalls: number
let fetchMock: ReturnType<typeof vi.fn>

/** A tiny stand-in for the server: filters and pages exactly as the real one is asked to. */
function serve(url: string, init: RequestInit = {}): Response {
  const u = new URL(url)
  if (u.pathname === '/api/admin/stats') {
    statsCalls++
    return json({ stats: STATS })
  }
  if (u.pathname.endsWith('/file')) return new Response('file-bytes', { headers: { 'Content-Type': 'application/pdf' } })
  if (init.method === 'DELETE') {
    const id = u.pathname.split('/').pop()!
    deletes.push(id)
    data = data.filter((c) => c.id !== id)
    return json({ removed: true })
  }
  listCalls.push(u)
  const p = u.searchParams
  const q = (p.get('q') ?? '').toLowerCase()
  const rows = data
    .filter((c) => !p.get('department') || c.department === p.get('department'))
    .filter((c) => !p.get('batch') || c.batch === p.get('batch'))
    .filter((c) => !p.get('category') || c.category === p.get('category'))
    .filter((c) => !q || `${c.studentName} ${c.registerNumber} ${c.title} ${c.issuer}`.toLowerCase().includes(q))
  const limit = Number(p.get('limit') ?? 50)
  const offset = Number(p.get('offset') ?? 0)
  return json({
    certificates: rows.slice(offset, offset + limit),
    total: rows.length,
    limit,
    offset,
    facets: { departments: ['AIDS', 'CSE'], batches: ['2023', '2022'] },
  })
}

beforeEach(() => {
  data = [...SEED]
  listCalls = []
  deletes = []
  statsCalls = 0
  me.role = 'faculty'
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
  URL.createObjectURL = vi.fn(() => 'blob:certificate')
  URL.revokeObjectURL = vi.fn()
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => serve(url, init))
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('VITE_CERT_API_URL', API)
  registerAccessTokenProvider(async () => 'staff-token')
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
        <CertificatesDirectoryPage />
      </ToastProvider>
    </MemoryRouter>,
  )
const table = () => screen.findByRole('table', { name: 'Student certificates' })
const names = async () => within(await table()).queryAllByRole('row').slice(1).map((r) => within(r).queryAllByRole('cell')[0]?.textContent ?? '')
const lastList = () => listCalls[listCalls.length - 1]

describe('faculty', () => {
  it('see the certificates the server returns, with who each belongs to', async () => {
    renderPage()
    const t = await table()
    expect(within(t).getByText('Aarav Menon')).toBeTruthy()
    expect(within(t).getByText('2023CSE0417')).toBeTruthy()
    expect(within(t).getByText('CodeHarbour Hackathon')).toBeTruthy()
    expect(within(t).getByText('Cloud Workshop')).toBeTruthy()
    expect(screen.getByText('3 certificates')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Student Certificates' })).toBeTruthy()
  })

  it('get no statistics and no way to remove anything', async () => {
    renderPage()
    await table()
    expect(screen.queryByText('Upload statistics')).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
    expect(statsCalls).toBe(0)
  })

  it('search by student name or ID, asking the server and showing only what it returns', async () => {
    renderPage()
    await table()
    fireEvent.change(screen.getByLabelText('Search certificates'), { target: { value: 'priya' } })
    await waitFor(() => expect(lastList().searchParams.get('q')).toBe('priya'))
    await waitFor(async () => expect(await names()).toEqual(['Priya Krishnan2023AIDS0101']))

    fireEvent.change(screen.getByLabelText('Search certificates'), { target: { value: '2022CSE' } })
    await waitFor(async () => expect(await names()).toEqual(['Dev Sharma2022CSE0099']))
  })

  it('wait for a pause in typing instead of asking the server on every key', async () => {
    renderPage()
    await table()
    const before = listCalls.length
    const box = screen.getByLabelText('Search certificates')
    for (const text of ['p', 'pr', 'pri', 'priy']) fireEvent.change(box, { target: { value: text } })
    await waitFor(() => expect(lastList().searchParams.get('q')).toBe('priy'))
    expect(listCalls.length - before).toBe(1)
  })

  it('filter by department, batch and category, offering only choices that exist', async () => {
    renderPage()
    await table()
    await waitFor(() => expect(within(screen.getByLabelText('Department')).getAllByRole('option').map((o) => o.textContent)).toEqual(['All departments', 'AIDS', 'CSE']))
    expect(within(screen.getByLabelText('Batch')).getAllByRole('option').map((o) => o.textContent)).toEqual(['All batches', '2023–2027', '2022–2026'])

    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'CSE' } })
    await waitFor(async () => expect(await names()).toEqual(['Aarav Menon2023CSE0417', 'Dev Sharma2022CSE0099']))
    fireEvent.change(screen.getByLabelText('Batch'), { target: { value: '2022' } })
    await waitFor(async () => expect(await names()).toEqual(['Dev Sharma2022CSE0099']))
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Sports' } })
    await waitFor(() => expect(lastList().searchParams.get('category')).toBe('Sports'))
    expect(lastList().searchParams.get('department')).toBe('CSE')
    expect(lastList().searchParams.get('batch')).toBe('2022')
  })

  it('say when nothing matches, and clear the filters in one click', async () => {
    renderPage()
    await table()
    fireEvent.change(screen.getByLabelText('Search certificates'), { target: { value: 'nobody-by-that-name' } })
    expect(await screen.findByText('No certificates match')).toBeTruthy()
    fireEvent.click(screen.getAllByRole('button', { name: 'Clear filters' })[0])
    await waitFor(async () => expect(await names()).toHaveLength(3))
    expect((screen.getByLabelText('Search certificates') as HTMLInputElement).value).toBe('')
  })

  it('open a preview with the student’s details, fetching the file through the authenticated API', async () => {
    renderPage()
    const t = await table()
    fireEvent.click(within(t).getByRole('button', { name: /Preview: CodeHarbour Hackathon by Aarav Menon/ }))
    await screen.findByRole('button', { name: /^Download$/ })
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Aarav Menon')).toBeTruthy()
    expect(within(dialog).getByText('2023CSE0417')).toBeTruthy()
    expect(within(dialog).getByText('2023–2027')).toBeTruthy()
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/file?'))!
    expect(String(call[0])).toBe(`${API}/api/certificates/c1/file?disposition=inline`)
    expect((call[1] as RequestInit).headers).toEqual({ Authorization: 'Bearer staff-token' })
  })

  it('download a certificate as an attachment', async () => {
    renderPage()
    const t = await table()
    fireEvent.click(within(t).getByRole('button', { name: /Download: Cricket Cup by Dev Sharma/ }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url) === `${API}/api/certificates/c3/file?disposition=attachment`)).toBe(true))
  })

  it('page through a long list from the server', async () => {
    data = Array.from({ length: 60 }, (_, i) => cert({ id: `p${i}`, studentName: `Student ${String(i).padStart(2, '0')}`, registerNumber: `R${i}`, title: `Cert ${i}` }))
    renderPage()
    await table()
    expect(screen.getByText('Page 1 of 3')).toBeTruthy()
    expect(lastList().searchParams.get('limit')).toBe('25')
    expect(lastList().searchParams.get('offset')).toBe('0')
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    await waitFor(() => expect(lastList().searchParams.get('offset')).toBe('25'))
    expect(await screen.findByText('Page 2 of 3')).toBeTruthy()
  })

  it('go back to the first page when a filter changes', async () => {
    data = Array.from({ length: 60 }, (_, i) => cert({ id: `p${i}`, studentName: `Student ${i}`, registerNumber: `R${i}`, category: i % 2 ? 'Sports' : 'Workshop' }))
    renderPage()
    await table()
    fireEvent.click(screen.getByRole('button', { name: /Next/ }))
    await screen.findByText('Page 2 of 3')
    fireEvent.change(screen.getByLabelText('Category'), { target: { value: 'Sports' } })
    await waitFor(() => expect(lastList().searchParams.get('offset')).toBe('0'))
    expect(await screen.findByText('Page 1 of 2')).toBeTruthy()
  })

  it('see the server’s reason when it cannot answer, and can try again', async () => {
    fetchMock.mockImplementationOnce(async () => refuse(503, 'database_unavailable', 'The records database could not be reached. Try again in a moment.'))
    renderPage()
    expect(await screen.findByText('Couldn’t load the certificates')).toBeTruthy()
    expect(screen.getByText(/records database could not be reached/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect(within(await table()).getByText('Aarav Menon')).toBeTruthy()
  })

  it('are told when the app is not connected to the server, and nothing is requested', () => {
    vi.stubEnv('VITE_CERT_API_URL', '')
    renderPage()
    expect(screen.getByText('Certificate storage isn’t set up yet')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('administrators', () => {
  beforeEach(() => {
    me.role = 'admin'
  })

  it('see the upload statistics above the list', async () => {
    renderPage()
    expect(await screen.findByText('Upload statistics')).toBeTruthy()
    const tiles = within(await screen.findByRole('region', { name: 'Key figures' }))
    expect(await tiles.findByText('Certificates stored')).toBeTruthy()
    expect(tiles.getByText('12 KB')).toBeTruthy() // storage used
    expect(tiles.getByText('Awaiting approval')).toBeTruthy()
    expect(tiles.getByRole('link', { name: 'Review students' }).getAttribute('href')).toBe('/admin/users')
    const byCategory = within(screen.getByRole('region', { name: 'By category' }))
    expect(byCategory.getByText('Hackathon')).toBeTruthy()
    expect(within(screen.getByRole('region', { name: 'By department' })).getByText('CSE')).toBeTruthy()
    expect(screen.getByRole('region', { name: 'Uploads per month' })).toBeTruthy()
    expect(statsCalls).toBe(1)
  })

  it('are not shown an "Awaiting approval" tile when nobody is waiting', async () => {
    STATS.pendingApprovals = 0
    try {
      renderPage()
      const tiles = within(await screen.findByRole('region', { name: 'Key figures' }))
      expect(await tiles.findByText('Certificates stored')).toBeTruthy()
      expect(tiles.queryByText('Awaiting approval')).toBeNull()
      expect(tiles.queryByRole('link', { name: 'Review students' })).toBeNull()
    } finally {
      STATS.pendingApprovals = 2
    }
  })

  it('see every certificate and can search and filter like faculty', async () => {
    renderPage()
    expect(await names()).toHaveLength(3)
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'AIDS' } })
    await waitFor(async () => expect(await names()).toEqual(['Priya Krishnan2023AIDS0101']))
  })

  it('can remove a certificate, after confirming, and the list and statistics refresh', async () => {
    renderPage()
    const t = await table()
    fireEvent.click(within(t).getByRole('button', { name: /Remove: Cloud Workshop by Priya Krishnan/ }))
    const dialog = await screen.findByRole('dialog', { name: /Remove this certificate/ })
    expect(within(dialog).getByText(/30 days/)).toBeTruthy()
    expect(deletes).toEqual([]) // nothing happens until it is confirmed
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove certificate' }))

    await waitFor(() => expect(deletes).toEqual(['c2']))
    await waitFor(async () => expect(await names()).toEqual(['Aarav Menon2023CSE0417', 'Dev Sharma2022CSE0099']))
    await waitFor(() => expect(statsCalls).toBe(2))
    expect(fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'DELETE')![1]).toMatchObject({ headers: { Authorization: 'Bearer staff-token' } })
  })

  it('can change their mind', async () => {
    renderPage()
    const t = await table()
    fireEvent.click(within(t).getByRole('button', { name: /Remove: Cricket Cup/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }))
    expect(deletes).toEqual([])
    expect(await names()).toHaveLength(3)
  })

  it('see why when the server refuses a removal, and nothing changes', async () => {
    const original = (url: string, init?: RequestInit) => serve(url, init)
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === 'DELETE' ? refuse(403, 'forbidden', 'Only administrators can remove certificates.') : original(url, init)))
    renderPage()
    const t = await table()
    fireEvent.click(within(t).getByRole('button', { name: /Remove: Cricket Cup/ }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove certificate' }))
    expect(await screen.findByText('Only administrators can remove certificates.')).toBeTruthy()
    expect(await names()).toHaveLength(3)
  })

  it('see a plain message if the statistics cannot be loaded, while the list still works', async () => {
    const original = (url: string, init?: RequestInit) => serve(url, init)
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => (String(url).endsWith('/api/admin/stats') ? refuse(503, 'database_unavailable', 'The records database could not be reached.') : original(url, init)))
    renderPage()
    expect(await screen.findByText('Couldn’t load the statistics')).toBeTruthy()
    expect(within(await table()).getByText('Aarav Menon')).toBeTruthy()
  })
})
