/*
 * Account management through the CertiPass Worker (administrators only; the Worker checks that on every call).
 *
 * The admin screens read the app's local user list, so after each call the result is placed there. The accounts the
 * Worker owns (ids that are UUIDs) are replaced wholesale by its answer; the prototype's demo accounts are left alone.
 */
import type { User } from '../types'
import { backendCall, isServerId, rememberUser, toAppUser } from './auth/backend'
import type { BackendUser } from './auth/backend'
import { setState } from './store'

/** Reload every account from the Worker into the app's user list. */
export async function refreshDirectory(): Promise<void> {
  const all: BackendUser[] = []
  for (let offset = 0; offset < 10_000; offset += 200) {
    const page = await backendCall<{ users: BackendUser[]; total: number }>(`/api/admin/users?limit=200&offset=${offset}`)
    all.push(...page.users)
    if (page.users.length === 0 || all.length >= page.total) break
  }
  const accounts = all.map(toAppUser)
  setState((s) => ({ ...s, users: [...s.users.filter((u) => !isServerId(u.id)), ...accounts] }))
}

export interface NewStaff {
  role: 'faculty' | 'admin'
  email: string
  fullName: string
  department?: string
  designation: string
  reviewDepartments?: string[]
  password: string
}

export async function createStaffOnServer(input: NewStaff): Promise<User> {
  const { user } = await backendCall<{ user: BackendUser }>('/api/admin/users', { method: 'POST', body: input })
  const app = toAppUser(user)
  rememberUser(app)
  return app
}

/** Set a new password for an account. The Worker hashes it and signs the person out everywhere. */
export async function resetPasswordOnServer(id: string, newPassword: string): Promise<void> {
  await backendCall(`/api/admin/users/${encodeURIComponent(id)}/reset-password`, { method: 'POST', body: { newPassword } })
}

/** Delete a faculty account (the Worker refuses anyone else) and drop it from the app's list. */
export async function deleteAccountOnServer(id: string): Promise<void> {
  await backendCall(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'DELETE' })
  setState((s) => ({ ...s, users: s.users.filter((u) => u.id !== id) }))
}

export interface AccountChanges {
  status?: 'active' | 'inactive'
  fullName?: string
  department?: string
  designation?: string
  reviewDepartments?: string[]
  year?: number
  section?: string
}

export async function updateAccountOnServer(id: string, changes: AccountChanges): Promise<User> {
  const { user } = await backendCall<{ user: BackendUser }>(`/api/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: changes })
  const app = toAppUser(user)
  rememberUser(app)
  return app
}
