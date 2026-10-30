/*
 * Registration rules shared by the form (inline feedback) and the auth
 * provider (authoritative check), so they can never drift apart.
 */
import { isActiveDepartment, isActiveSection } from '../academicService'
import type { StudentRegistration, Year } from '../../types'

/** The college's email domain. This is the only part of a college address that is fixed. */
export const COLLEGE_EMAIL_DOMAIN = 'rajalakshmi.edu.in'

/** A plain (non-email) username, as used by the demo and older accounts. */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,23}$/

/** The longest register number accepted. There is no required format: schools number students differently. */
export const REGISTER_NUMBER_MAX_LENGTH = 30

/**
 * What is wrong with a sign-in name, or null when it is fine. A sign-in name is
 * either a college email or a plain username.
 *
 * A college email may have any name and year in front (dinesh.g.2024.aids@…,
 * priya.k@…): only the domain after the @ is fixed. A different domain is refused.
 */
export function signInNameError(raw: string): string | null {
  const id = raw.trim().toLowerCase()
  if (!id) return 'Enter a college email or username.'
  if (id.includes('@')) {
    const at = id.lastIndexOf('@')
    const local = id.slice(0, at)
    if (id.slice(at + 1) !== COLLEGE_EMAIL_DOMAIN) return `Use your college email, which ends in @${COLLEGE_EMAIL_DOMAIN}.`
    // Letters, numbers, dots, underscores, hyphens and + are allowed before the @; no leading, trailing or doubled dots.
    if (!/^[a-z0-9][a-z0-9._+-]{0,63}$/.test(local) || local.endsWith('.') || local.includes('..')) {
      return 'Before the @, use letters, numbers, dots, underscores or hyphens, starting with a letter or number.'
    }
    return null
  }
  return USERNAME_PATTERN.test(id)
    ? null
    : `Use your college email (name@${COLLEGE_EMAIL_DOMAIN}), or a username of 3–24 lowercase letters, numbers, dots or underscores.`
}

export const PASSWORD_RULES: { test: (p: string) => boolean; label: string }[] = [
  { test: (p) => p.length >= 8, label: 'At least 8 characters' },
  { test: (p) => /[A-Z]/.test(p) && /[a-z]/.test(p), label: 'Upper and lower case letters' },
  { test: (p) => /\d/.test(p), label: 'At least one number' },
]

/** Raw form values, all strings, as typed by the student. */
export interface StudentRegistrationForm {
  fullName: string
  username: string
  password: string
  confirmPassword: string
  registerNumber: string
  department: string
  year: string
  section: string
}

export type RegistrationErrors = Partial<Record<keyof StudentRegistrationForm, string>>

export function validateRegistration(f: StudentRegistrationForm): RegistrationErrors {
  const e: RegistrationErrors = {}
  const name = f.fullName.trim()
  if (!name) e.fullName = 'Enter your full name.'
  else if (name.length < 3) e.fullName = 'Name looks too short.'
  else if (name.length > 80) e.fullName = 'Name must be 80 characters or fewer.'

  const usernameProblem = signInNameError(f.username)
  if (usernameProblem) e.username = usernameProblem

  if (!f.password) e.password = 'Create a password.'
  else if (!PASSWORD_RULES.every((r) => r.test(f.password))) e.password = 'Password does not meet all the requirements below.'
  if (!f.confirmPassword) e.confirmPassword = 'Re-enter your password.'
  else if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords do not match.'

  const reg = f.registerNumber.trim().toUpperCase()
  if (!reg) e.registerNumber = 'Enter your register number.'
  else if (reg.length > REGISTER_NUMBER_MAX_LENGTH) e.registerNumber = `Register number must be ${REGISTER_NUMBER_MAX_LENGTH} characters or fewer.`

  if (!f.department) e.department = 'Select your department.'
  else if (!isActiveDepartment(f.department)) e.department = 'Select a department from the list.'
  if (!f.year) e.year = 'Select your year.'
  else if (!['1', '2', '3', '4'].includes(f.year)) e.year = 'Select a year from the list.'
  if (!f.section) e.section = 'Select your section.'
  else if (!isActiveSection(f.section)) e.section = 'Select a section from the list.'
  return e
}

/**
 * Build the typed registration payload. Only the known fields are copied,
 * so nothing else (such as a "role") can ride along from the form.
 */
export function toRegistration(f: StudentRegistrationForm): StudentRegistration {
  return {
    fullName: f.fullName.trim().replace(/\s+/g, ' '),
    username: f.username.trim().toLowerCase(),
    password: f.password,
    registerNumber: f.registerNumber.trim().toUpperCase(),
    department: f.department,
    year: Number(f.year) as Year,
    section: f.section,
  }
}

/** Provider-side re-check of an already-typed payload. */
export function validateRegistrationData(r: StudentRegistration): RegistrationErrors {
  return validateRegistration({ ...r, confirmPassword: r.password, year: String(r.year) })
}
