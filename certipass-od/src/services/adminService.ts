import type { FacultyPermissions, PublicUser, Role, User } from '../types'
import { hashPassword, newSalt } from '../data/seed'
import { ApiError, delay, passwordProblem, requireUser, toPublic } from './auth'
import { getState, mutate } from './store'

function requireAdmin(): PublicUser {
  const u = requireUser()
  if (u.role !== 'admin') throw new ApiError('forbidden', 'Administrator access is required.')
  return u
}

export function listUsers(): PublicUser[] {
  requireAdmin()
  return getState().users.map(toPublic)
}

export interface NewUserInput {
  role: 'student' | 'faculty'
  name: string
  username: string
  email: string
  department: string
  tempPassword: string
  registerNo?: string
  year?: User['year']
  section?: string
  designation?: string
}

export function validateNewUser(i: NewUserInput): Partial<Record<keyof NewUserInput, string>> {
  const e: Partial<Record<keyof NewUserInput, string>> = {}
  if (i.name.trim().length < 3) e.name = 'Enter the full name.'
  if (!/^[a-z0-9._-]{3,24}$/i.test(i.username)) e.username = 'Use 3–24 letters, numbers, dots or dashes.'
  if (!/^[^\s@]+@rajalakshmi\.edu\.in$/i.test(i.email)) e.email = 'Use a college address ending in @rajalakshmi.edu.in.'
  if (!i.department) e.department = 'Choose a department.'
  const pw = passwordProblem(i.tempPassword)
  if (pw) e.tempPassword = pw
  if (i.role === 'student') {
    if (!/^\d{13}$/.test(i.registerNo ?? '')) e.registerNo = 'A register number has 13 digits.'
    if (!i.year) e.year = 'Choose a year.'
    if (!i.section) e.section = 'Choose a section.'
  } else if (!i.designation?.trim()) {
    e.designation = 'Enter a designation.'
  }
  return e
}

export async function createUser(input: NewUserInput): Promise<PublicUser> {
  await delay(450)
  requireAdmin()
  if (Object.keys(validateNewUser(input)).length) throw new ApiError('invalid', 'Check the highlighted fields.')
  const salt = newSalt()
  const passwordHash = await hashPassword(input.tempPassword, salt)
  return mutate((s) => {
    const dupe = s.users.find(
      (u) =>
        u.username.toLowerCase() === input.username.toLowerCase() ||
        u.email.toLowerCase() === input.email.toLowerCase() ||
        (input.registerNo && u.registerNo === input.registerNo),
    )
    if (dupe) throw new ApiError('conflict', 'An account with that username, email or register number already exists.')
    const user: User = {
      id: `u-${Date.now().toString(36)}`,
      role: input.role,
      name: input.name.trim(),
      username: input.username.trim(),
      email: input.email.trim().toLowerCase(),
      department: input.department,
      active: true,
      registerNo: input.role === 'student' ? input.registerNo : undefined,
      year: input.role === 'student' ? input.year : undefined,
      section: input.role === 'student' ? input.section : undefined,
      designation: input.role === 'faculty' ? input.designation?.trim() : undefined,
      permissions: input.role === 'faculty' ? { canReview: true, scope: 'department' } : undefined,
      salt,
      passwordHash,
    }
    s.users.push(user)
    return toPublic(user)
  })
}

export async function setActive(userId: string, active: boolean): Promise<void> {
  await delay(250)
  const admin = requireAdmin()
  if (userId === admin.id) throw new ApiError('invalid', 'You cannot disable your own account.')
  mutate((s) => {
    const u = s.users.find((x) => x.id === userId)
    if (!u) throw new ApiError('not_found', 'Account not found.')
    u.active = active
  })
}

export async function changeRole(userId: string, role: Role): Promise<void> {
  await delay(250)
  const admin = requireAdmin()
  if (userId === admin.id) throw new ApiError('invalid', 'You cannot change your own role.')
  mutate((s) => {
    const u = s.users.find((x) => x.id === userId)
    if (!u) throw new ApiError('not_found', 'Account not found.')
    if (u.role === role) return
    if (u.role === 'student' || role === 'student') {
      throw new ApiError('invalid', 'Student accounts carry a register number, so they cannot be converted. Create a new account instead.')
    }
    u.role = role
    u.permissions = role === 'faculty' ? { canReview: true, scope: 'department' } : undefined
    u.designation ||= role === 'admin' ? 'Administrative Officer' : 'Faculty'
  })
}

export async function updatePermissions(userId: string, perms: FacultyPermissions): Promise<void> {
  await delay(250)
  requireAdmin()
  mutate((s) => {
    const u = s.users.find((x) => x.id === userId)
    if (!u || u.role !== 'faculty') throw new ApiError('not_found', 'Faculty account not found.')
    u.permissions = { ...perms }
  })
}

export async function adminResetPassword(userId: string, tempPassword: string): Promise<void> {
  await delay(300)
  requireAdmin()
  const problem = passwordProblem(tempPassword)
  if (problem) throw new ApiError('invalid', problem)
  const salt = newSalt()
  const passwordHash = await hashPassword(tempPassword, salt)
  mutate((s) => {
    const u = s.users.find((x) => x.id === userId)
    if (!u) throw new ApiError('not_found', 'Account not found.')
    u.salt = salt
    u.passwordHash = passwordHash
  })
}

export async function updateOwnProfile(patch: { phone?: string }): Promise<void> {
  await delay(250)
  const me = requireUser()
  mutate((s) => {
    const u = s.users.find((x) => x.id === me.id)!
    u.phone = patch.phone?.trim() || undefined
  })
}
