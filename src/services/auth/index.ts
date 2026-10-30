/*
 * Public entry point for authentication. The rest of the app imports from
 * here (usually via AuthContext), never from a provider directly.
 *
 * Offline, the prototype's local sign-in is used, exactly as before. When the
 * build is connected to the CertiPass Worker (VITE_CERT_API_URL), sign-in goes
 * through it instead: real accounts, real passwords, and a session token that
 * the Worker checks on every request. That same token is what lets the browser
 * upload and read certificates stored in Google Drive.
 */
import type { Role } from '../../types'
import { registerAccessTokenProvider } from './accessToken'
import { backendEnabled } from './backend'
import { mockAuthProvider } from './mockAuthProvider'
import { createWorkerAuthProvider } from './workerAuthProvider'
import type { AuthProvider } from './types'

/** True when sign-in goes through the CertiPass Worker rather than the prototype's local accounts. */
export const usesBackendAuth = backendEnabled()

function selectProvider(): AuthProvider {
  if (!usesBackendAuth) return mockAuthProvider
  const provider = createWorkerAuthProvider()
  registerAccessTokenProvider(provider.getAccessToken)
  return provider
}

export const authProvider: AuthProvider = selectProvider()

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
