/*
 * Sign-in against the CertiPass Worker (the real backend).
 *
 * The Worker checks the email and password, keeps the accounts, and decides on
 * every request what each person may do. This provider only asks it, remembers
 * the session token it hands back, and mirrors the signed-in person into the
 * app's local user list, because the rest of the UI (still browser-based for
 * everything but certificates) looks users up there.
 *
 * Used only when the build is connected to a Worker (VITE_CERT_API_URL).
 */
import type { StudentRegistration, User } from '../../types'
import { backendCall, BackendError, clearToken, currentToken, hasToken, rememberUser, saveToken, toAppUser, welcomeNotification } from './backend'
import type { BackendUser } from './backend'
import { endSession, getSession, startSession, subscribeSession } from './session'
import { AuthError } from './types'
import type { AuthProvider } from './types'
import { COLLEGE_EMAIL_DOMAIN, validateRegistrationData } from './validation'

export interface WorkerAuthProvider extends AuthProvider {
  /** The session token to send to the certificate service, or null when signed out. */
  getAccessToken(): Promise<string | null>
  /** Settles once the remembered session has been checked with the server. Mainly for tests. */
  ready: Promise<void>
}

interface SessionReply {
  token: string
  expiresAt: string
  user: BackendUser
}

const UNAVAILABLE = 'Sign-in is unavailable right now. Check your connection and try again.'
const PENDING = 'Your account has been created and is waiting for approval by the records office. You will be able to sign in once it is approved.'

/** The Worker names the email field "email"; the registration form calls it "username". */
const FORM_FIELD: Record<string, keyof StudentRegistration> = {
  email: 'username',
  fullName: 'fullName',
  password: 'password',
  registerNumber: 'registerNumber',
  department: 'department',
  year: 'year',
  section: 'section',
}

function signInError(err: unknown): AuthError {
  if (!(err instanceof BackendError)) return new AuthError('unavailable', UNAVAILABLE)
  switch (err.code) {
    case 'invalid_credentials':
    case 'invalid_input':
      return new AuthError('invalid_credentials', err.message)
    case 'wrong_portal':
      return new AuthError('wrong_portal', err.message, { portal: err.extra.portal as 'student' | 'faculty' | 'admin' })
    case 'account_pending':
      return new AuthError('pending_approval', err.message)
    case 'account_inactive':
      return new AuthError('inactive', err.message)
    default:
      // Includes "too many attempts": the Worker's own message says how long to wait.
      return new AuthError('unavailable', err.status === 429 || err.status === 503 ? err.message : UNAVAILABLE)
  }
}

function registerError(err: unknown): AuthError {
  if (!(err instanceof BackendError)) return new AuthError('unavailable', UNAVAILABLE)
  const field = typeof err.extra.field === 'string' ? FORM_FIELD[err.extra.field] : undefined
  if (err.code === 'duplicate_email') return new AuthError('duplicate_username', err.message, { field: 'username' })
  if (err.code === 'duplicate_register_number') return new AuthError('duplicate_register_number', err.message, { field: 'registerNumber' })
  if (err.status === 400) return new AuthError('invalid_input', err.message, { field })
  return new AuthError('unavailable', err.status === 429 || err.status === 503 ? err.message : UNAVAILABLE)
}

export function createWorkerAuthProvider(): WorkerAuthProvider {
  /** Start the session the rest of the app reads. */
  function begin(reply: SessionReply, expectedRole?: User['role']): User {
    const user = toAppUser(reply.user)
    if (expectedRole && user.role !== expectedRole) throw new AuthError('wrong_portal', 'Please use the sign-in page for your role.', { portal: user.role })
    saveToken(reply.token, reply.expiresAt)
    rememberUser(user)
    startSession(user.id, user.role)
    return user
  }

  /** On load: is the remembered session real? The server answers; nothing the browser stored is believed. */
  async function verifyRememberedSession(): Promise<void> {
    const local = getSession()
    if (!currentToken()) {
      // No usable token: a leftover local session is just a claim, so drop it.
      if (local) endSession()
      return
    }
    if (!local) {
      // A token but no session: finish signing out properly.
      await backendCall('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
      clearToken()
      return
    }
    try {
      const { user } = await backendCall<{ user: BackendUser }>('/api/auth/me')
      const app = toAppUser(user)
      if (app.id !== local.userId || app.role !== local.role) {
        // The server says this token belongs to someone else, or their role is not what the browser remembers.
        endSession()
        clearToken()
        return
      }
      rememberUser(app)
    } catch (err) {
      // Refused (expired, deactivated, removed): sign out. Merely unreachable: keep going, the server decides on every request anyway.
      if (err instanceof BackendError && (err.status === 401 || err.status === 403)) {
        endSession()
        clearToken()
      }
    }
  }

  const ready = verifyRememberedSession().catch(() => undefined)

  return {
    ready,

    async login({ username, password }, expectedRole) {
      const email = username.trim()
      if (!email.includes('@')) {
        throw new AuthError('invalid_credentials', `Sign in with your college email address (name@${COLLEGE_EMAIL_DOMAIN}).`)
      }
      let reply: SessionReply
      try {
        reply = await backendCall<SessionReply>('/api/auth/login', { method: 'POST', signedIn: false, body: { email, password, portal: expectedRole } })
      } catch (err) {
        throw signInError(err)
      }
      return begin(reply, expectedRole)
    },

    async registerStudent(input: StudentRegistration): Promise<User> {
      const errors = validateRegistrationData(input)
      const firstField = Object.keys(errors)[0] as keyof StudentRegistration | undefined
      if (firstField) throw new AuthError('invalid_input', errors[firstField]!, { field: firstField })
      if (!input.username.includes('@')) {
        throw new AuthError('invalid_input', `Use your college email (name@${COLLEGE_EMAIL_DOMAIN}) to create an account.`, { field: 'username' })
      }
      let reply: Partial<SessionReply> & { status?: string }
      try {
        // Only registration details are sent. The role is not among them, and the Worker would ignore it: registering
        // can only ever create a student.
        reply = await backendCall('/api/auth/register', {
          method: 'POST',
          signedIn: false,
          body: {
            fullName: input.fullName,
            email: input.username,
            password: input.password,
            registerNumber: input.registerNumber,
            department: input.department,
            year: input.year,
            section: input.section,
          },
        })
      } catch (err) {
        throw registerError(err)
      }
      if (!reply.token || !reply.expiresAt || !reply.user) throw new AuthError('pending_approval', PENDING)
      const user = begin(reply as SessionReply, 'student')
      welcomeNotification(user.id)
      return user
    },

    logout() {
      const token = currentToken()
      endSession()
      clearToken()
      // Tell the server too, so the token stops working everywhere, not just here.
      if (token) void backendCall('/api/auth/logout', { method: 'POST', signedIn: false, token }).catch(() => undefined)
    },

    getSession,
    subscribe: subscribeSession,

    async getAccessToken() {
      return currentToken()
    },
  }
}

export { hasToken }
