import type { AuthSession, LoginCredentials, Role, StudentRegistration, User } from '../../types'

export type AuthErrorCode =
  | 'invalid_credentials'
  | 'wrong_portal'
  | 'inactive'
  | 'duplicate_username'
  | 'duplicate_register_number'
  | 'invalid_input'
  | 'unavailable'
  /** The account exists but an administrator has not approved it yet (after registering, or at sign-in). */
  | 'pending_approval'

export class AuthError extends Error {
  readonly code: AuthErrorCode
  /** Registration field the error belongs to, when it is field-specific. */
  readonly field?: keyof StudentRegistration
  /** For `wrong_portal`: the role whose sign-in page the user should use. */
  readonly portal?: Role

  constructor(code: AuthErrorCode, message: string, extra: { field?: keyof StudentRegistration; portal?: Role } = {}) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.field = extra.field
    this.portal = extra.portal
  }
}

/**
 * The contract the UI depends on. Phase 2 ships a mock implementation;
 * the real provider (workerAuthProvider, which talks to the CertiPass Worker) replaces it without UI changes.
 */
export interface AuthProvider {
  /** Verify credentials and start a session, but only for `expectedRole`. */
  login(credentials: LoginCredentials, expectedRole: Role): Promise<User>
  /** Create a student account (role is always "student") and start a session. */
  registerStudent(input: StudentRegistration): Promise<User>
  /** End the current session. Never deletes accounts or records. */
  logout(): void
  /** Current session, or null when absent, malformed or expired. */
  getSession(): AuthSession | null
  /** Notified whenever the session starts, ends or changes in another tab. */
  subscribe(listener: () => void): () => void
}
