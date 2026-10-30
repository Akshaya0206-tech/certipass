/*
 * MOCK auth provider for the prototype.
 *
 * Checks usernames against the mock user records and passwords against the
 * hashed credential store, then records a minimal session. Everything runs
 * in the browser, so this provides NO real security. A backend provider
 * implementing the same AuthProvider interface replaces it in a later phase.
 */
import type { StudentRegistration, StudentUser, User } from '../../types'
import { createId, delay, getState, setState } from '../store'
import { setPassword, verifyPassword } from './credentials'
import { endSession, getSession, startSession, subscribeSession } from './session'
import { AuthError } from './types'
import type { AuthProvider } from './types'
import { validateRegistrationData } from './validation'

const ROLE_NAME = { student: 'student', faculty: 'faculty', admin: 'administrator' } as const

export const mockAuthProvider: AuthProvider = {
  async login({ username, password }, expectedRole) {
    await delay(350)
    const name = username.trim().toLowerCase()
    const user = getState().users.find((u) => u.username.toLowerCase() === name)
    const ok = await verifyPassword(user?.id, password)

    if (!user || !ok) {
      throw new AuthError('invalid_credentials', 'That email or username and password combination wasn’t recognised. Check both and try again.')
    }
    // The password was correct, so it's safe (and kinder) to say which page to use.
    if (user.role !== expectedRole) {
      throw new AuthError('wrong_portal', `This is the ${ROLE_NAME[expectedRole]} sign-in. Your account is a ${ROLE_NAME[user.role]} account — please use the ${ROLE_NAME[user.role]} sign-in page.`, {
        portal: user.role,
      })
    }
    if (!user.active) {
      throw new AuthError('inactive', 'This account has been deactivated. Please contact the Office of Academic Records.')
    }
    startSession(user.id, user.role)
    return user
  },

  async registerStudent(input: StudentRegistration): Promise<User> {
    await delay(500)
    const errors = validateRegistrationData(input)
    const firstField = Object.keys(errors)[0] as keyof StudentRegistration | undefined
    if (firstField) throw new AuthError('invalid_input', errors[firstField]!, { field: firstField })

    const { users } = getState()
    if (users.some((u) => u.username.toLowerCase() === input.username)) {
      throw new AuthError('duplicate_username', 'This email or username is already taken. Try another.', { field: 'username' })
    }
    if (users.some((u) => u.role === 'student' && u.registerNumber === input.registerNumber)) {
      throw new AuthError('duplicate_register_number', 'An account with this register number already exists. If it’s yours, sign in instead.', {
        field: 'registerNumber',
      })
    }

    // Role is fixed here — registration can only ever create students.
    const student: StudentUser = {
      id: createId('stu'),
      role: 'student',
      username: input.username,
      fullName: input.fullName,
      registerNumber: input.registerNumber,
      department: input.department,
      year: input.year,
      section: input.section,
      createdAt: new Date().toISOString(),
      active: true,
    }
    await setPassword(student.id, input.password)
    setState((s) => ({
      ...s,
      users: [...s.users, student],
      notifications: [
        {
          id: createId('ntf'),
          userId: student.id,
          title: 'Welcome to CertiPass',
          body: 'Your achievement passport is ready. Add your first certificate to begin your record.',
          createdAt: new Date().toISOString(),
          read: false,
          tone: 'info',
          type: 'welcome',
        },
        ...s.notifications,
      ],
    }))
    startSession(student.id, 'student')
    return student
  },

  logout() {
    endSession()
  },

  getSession,
  subscribe: subscribeSession,
}
