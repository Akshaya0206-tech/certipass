import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../context/ToastContext'
import { rememberUser, toAppUser } from '../services/auth/backend'
import { verifyPassword } from '../services/auth/credentials'
import { endSession, startSession } from '../services/auth/session'
import { getState, resetDemoData } from '../services/store'
import FacultyManagementPage from './FacultyManagementPage'

// The prototype's seed data holds four faculty accounts: three active and one (Prof. Suresh Natarajan) inactive.
vi.mock('../hooks/useData', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../hooks/useData')>()),
  useRequiredUser: () => getState().users.find((u) => u.id === 'adm-01')!,
}))

beforeEach(() => {
  resetDemoData()
  startSession('adm-01', 'admin')
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open')
  }
})
afterEach(() => {
  cleanup()
  endSession()
})

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/admin/faculty']}>
      <ToastProvider>
        <Routes>
          <Route path="/admin/faculty" element={<FacultyManagementPage />} />
          <Route path="/admin/users/:id" element={<p>Account page</p>} />
        </Routes>
      </ToastProvider>
    </MemoryRouter>,
  )

const cards = () => within(screen.getByRole('region', { name: 'Faculty accounts' }))
const table = () => screen.getByRole('table', { name: 'Faculty accounts' })
const names = () => within(table()).queryAllByRole('row').slice(1).map((r) => within(r).queryAllByRole('cell')[0]?.textContent ?? '')
const figure = (label: string) => cards().getByText(label).closest('div')!.querySelector('dd')!.textContent
const rowOf = (name: string) => within(table()).getAllByRole('row').find((r) => r.textContent?.includes(name))!

describe('the faculty summary', () => {
  it('shows total, active and inactive faculty', () => {
    renderPage()
    expect(figure('Total Faculty')).toBe('4')
    expect(figure('Active Faculty')).toBe('3')
    expect(figure('Inactive Faculty')).toBe('1')
  })

  it('counts every faculty account, whatever the search and filters are showing', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Search faculty'), { target: { value: 'Anand' } })
    expect(names()).toHaveLength(1)
    expect(figure('Total Faculty')).toBe('4')
    fireEvent.change(screen.getByLabelText('Account status'), { target: { value: 'inactive' } })
    expect(figure('Active Faculty')).toBe('3')
  })

  it('follows a change at once: deactivating moves one from active to inactive', async () => {
    renderPage()
    fireEvent.click(within(rowOf('Anand')).getByRole('button', { name: /^Deactivate/ }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Deactivate this account?' })).getByRole('button', { name: 'Deactivate account' }))
    await waitFor(() => expect(figure('Inactive Faculty')).toBe('2'))
    expect(figure('Active Faculty')).toBe('2')
    expect(figure('Total Faculty')).toBe('4')
  })
})

describe('when connected to the CertiPass server', () => {
  it('lists only the faculty the server holds, not the prototype’s demo faculty, and counts those', () => {
    vi.stubEnv('VITE_CERT_API_URL', 'https://api.test')
    rememberUser(
      toAppUser({
        id: '44444444-4444-4444-8444-444444444444',
        email: 'real.faculty@rajalakshmi.edu.in',
        username: 'real.faculty@rajalakshmi.edu.in',
        role: 'faculty',
        status: 'active',
        active: true,
        fullName: 'Dr Real Faculty',
        department: 'CSE',
        reviewDepartments: ['CSE'],
        registerNumber: null,
        year: null,
        section: null,
        designation: 'Professor',
        createdAt: '2026-10-01T00:00:00Z',
      }),
    )
    renderPage()
    expect(names()).toHaveLength(1)
    expect(names()[0]).toContain('Dr Real Faculty')
    expect(figure('Total Faculty')).toBe('1')
    expect(figure('Active Faculty')).toBe('1')
    expect(figure('Inactive Faculty')).toBe('0')
  })
})

describe('the faculty list', () => {
  it('lists every faculty account with its email, department and status, and never a password', () => {
    renderPage()
    expect(names()).toHaveLength(4)
    expect(rowOf('Meera').textContent).toContain('@meera.faculty')
    expect(rowOf('Meera').textContent).toContain('CSE')
    expect(rowOf('Suresh').textContent).toContain('Inactive')
    expect(document.body.textContent).not.toMatch(/password_hash|pbkdf2|Faculty@123/i)
  })

  it('searches by name and filters by department', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Search faculty'), { target: { value: 'kavitha' } })
    expect(names().join()).toContain('Kavitha')
    expect(names()).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('Search faculty'), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText('Department'), { target: { value: 'ECE' } })
    expect(names().join()).toContain('Anand')
    expect(names().join()).not.toContain('Meera')
  })

  it('offers Edit, Reset password, Deactivate or Activate, and Delete on each row', () => {
    renderPage()
    for (const name of ['Meera', 'Suresh']) {
      const row = within(rowOf(name))
      expect(row.getByRole('link', { name: /^Edit/ }).getAttribute('href')).toMatch(/^\/admin\/users\/fac-0\d\?edit=1$/)
      expect(row.getByRole('button', { name: /^Reset password/ })).toBeTruthy()
      expect(row.getByRole('button', { name: /^Delete/ })).toBeTruthy()
    }
    expect(within(rowOf('Meera')).getByRole('button', { name: /^Deactivate/ })).toBeTruthy()
    expect(within(rowOf('Suresh')).getByRole('button', { name: /^Activate/ })).toBeTruthy()
  })
})

describe('resetting a password', () => {
  const open = async (name: string) => {
    fireEvent.click(within(rowOf(name)).getByRole('button', { name: /^Reset password/ }))
    return within(await screen.findByRole('dialog', { name: 'Reset password' }))
  }

  it('sets the new password, which then works, and the old one does not', async () => {
    renderPage()
    const dialog = await open('Meera')
    expect(await verifyPassword('fac-01', 'Faculty@123')).toBe(true)
    fireEvent.change(dialog.getByLabelText(/^New password/), { target: { value: 'Br4ndNewPass' } })
    fireEvent.change(dialog.getByLabelText(/^Confirm new password/), { target: { value: 'Br4ndNewPass' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByText('Password reset')).toBeTruthy()
    expect(await verifyPassword('fac-01', 'Br4ndNewPass')).toBe(true)
    expect(await verifyPassword('fac-01', 'Faculty@123')).toBe(false)
  })

  it('says what is wrong, and changes nothing, for a weak or mismatched password', async () => {
    renderPage()
    const dialog = await open('Meera')
    fireEvent.click(dialog.getByRole('button', { name: 'Reset password' }))
    expect(await dialog.findByText('Enter the new password.')).toBeTruthy()
    fireEvent.change(dialog.getByLabelText(/^New password/), { target: { value: 'weak' } })
    expect(dialog.getByText(/At least 8 characters, with upper and lower case/, { selector: '[id$="-error"]' })).toBeTruthy()
    fireEvent.change(dialog.getByLabelText(/^New password/), { target: { value: 'Br4ndNewPass' } })
    fireEvent.change(dialog.getByLabelText(/^Confirm new password/), { target: { value: 'Different1Pass' } })
    expect(dialog.getByText('The two passwords do not match.')).toBeTruthy()
    expect(await verifyPassword('fac-01', 'Faculty@123')).toBe(true)
  })

  it('can be cancelled', async () => {
    renderPage()
    const dialog = await open('Meera')
    fireEvent.change(dialog.getByLabelText(/^New password/), { target: { value: 'Br4ndNewPass' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(await verifyPassword('fac-01', 'Faculty@123')).toBe(true)
  })
})

describe('deleting a faculty account', () => {
  const open = async (name: string) => {
    fireEvent.click(within(rowOf(name)).getByRole('button', { name: /^Delete/ }))
    return within(await screen.findByRole('dialog', { name: 'Delete this faculty account?' }))
  }

  it('asks first, and cancelling deletes nothing', async () => {
    renderPage()
    const dialog = await open('Anand')
    expect(dialog.getByText(/Student records and certificates are not affected/)).toBeTruthy()
    fireEvent.click(dialog.getByRole('button', { name: 'Cancel' }))
    expect(names()).toHaveLength(4)
    expect(getState().users.some((u) => u.id === 'fac-02')).toBe(true)
  })

  it('deletes after confirmation: the row goes, the totals follow, and no student record is touched', async () => {
    renderPage()
    const achievementsBefore = getState().achievements.length
    const studentsBefore = getState().users.filter((u) => u.role === 'student').length
    const dialog = await open('Anand')
    fireEvent.click(dialog.getByRole('button', { name: 'Delete account' }))
    await waitFor(() => expect(names()).toHaveLength(3))
    expect(names().join()).not.toContain('Anand')
    expect(figure('Total Faculty')).toBe('3')
    expect(getState().users.some((u) => u.id === 'fac-02')).toBe(false)
    expect(getState().achievements).toHaveLength(achievementsBefore)
    expect(getState().users.filter((u) => u.role === 'student')).toHaveLength(studentsBefore)
    expect(getState().audit.some((e) => e.action === 'faculty_deleted' && e.targetUserId === 'fac-02')).toBe(true)
  })
})

describe('adding a faculty account', () => {
  it('creates it with the role Faculty, in the chosen department, and signs nobody else out', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Faculty' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a faculty account' }))
    expect((dialog.getByLabelText('Role') as HTMLInputElement).value).toBe('Faculty')
    fireEvent.change(dialog.getByLabelText(/^Full name/), { target: { value: 'Dr Priya Nair' } })
    fireEvent.change(dialog.getByLabelText(/^Email address/), { target: { value: 'priya.nair@rajalakshmi.edu.in' } })
    fireEvent.change(dialog.getByLabelText(/^Designation/), { target: { value: 'Assistant Professor' } })
    fireEvent.change(dialog.getByLabelText(/^Department/), { target: { value: 'AIDS' } })
    fireEvent.change(dialog.getByLabelText(/^Initial password/), { target: { value: 'Facult1Pass' } })
    fireEvent.change(dialog.getByLabelText(/^Confirm password/), { target: { value: 'Facult1Pass' } })
    await act(async () => {
      fireEvent.click(dialog.getByRole('button', { name: 'Create account' }))
    })
    expect(await screen.findByText('Account page', undefined, { timeout: 15_000 })).toBeTruthy()
    const created = getState().users.find((u) => u.username === 'priya.nair@rajalakshmi.edu.in')!
    expect(created).toMatchObject({ role: 'faculty', department: 'AIDS', fullName: 'Dr Priya Nair', active: true })
    expect(await verifyPassword(created.id, 'Facult1Pass')).toBe(true)
    expect(JSON.stringify(getState())).not.toContain('Facult1Pass')
  }, 30_000)

  it('refuses an email that is already in use, and a weak password, without creating anything', async () => {
    renderPage()
    const before = getState().users.length
    fireEvent.click(screen.getByRole('button', { name: 'Add Faculty' }))
    const dialog = within(await screen.findByRole('dialog', { name: 'Add a faculty account' }))
    fireEvent.change(dialog.getByLabelText(/^Full name/), { target: { value: 'Dr Copy Cat' } })
    fireEvent.change(dialog.getByLabelText(/^Email address/), { target: { value: 'meera.faculty' } })
    fireEvent.change(dialog.getByLabelText(/^Designation/), { target: { value: 'Professor' } })
    fireEvent.change(dialog.getByLabelText(/^Department/), { target: { value: 'CSE' } })
    fireEvent.change(dialog.getByLabelText(/^Initial password/), { target: { value: 'weak' } })
    fireEvent.change(dialog.getByLabelText(/^Confirm password/), { target: { value: 'weak' } })
    fireEvent.click(dialog.getByRole('button', { name: 'Create account' }))
    expect(await dialog.findByText('This email or username is already taken.')).toBeTruthy()
    expect(dialog.getByText('At least 8 characters, with upper and lower case letters and a number.', { selector: '[id$="-error"]' })).toBeTruthy()
    expect(getState().users).toHaveLength(before)
  })
})
