/*
 * Public entry point for authentication. The rest of the app imports from
 * here (usually via AuthContext), never from the mock implementation.
 * To switch providers, change the single assignment below.
 */
import type { Role } from '../../types'
import { mockAuthProvider } from './mockAuthProvider'
import type { AuthProvider } from './types'

export const authProvider: AuthProvider = mockAuthProvider

export { AuthError } from './types'
export type { AuthErrorCode, AuthProvider } from './types'
export { expireIfStale, SESSION_TTL_MS } from './session'
export { getRecoveryOptions } from './recovery'
export * from './validation'

export const HOME_PATH: Record<Role, string> = { student: '/student', faculty: '/faculty', admin: '/admin' }
export const LOGIN_PATH: Record<Role, string> = { student: '/login', faculty: '/faculty/login', admin: '/admin/login' }

export const homePathFor = (role: Role) => HOME_PATH[role]
export const loginPathFor = (role: Role) => LOGIN_PATH[role]

/** Which role's sign-in page a protected path belongs to. */
export function roleForPath(pathname: string): Role | null {
  if (pathname === '/student' || pathname.startsWith('/student/')) return 'student'
  if (pathname === '/faculty' || pathname.startsWith('/faculty/')) return 'faculty'
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin'
  return null
}
