/*
 * Registration rules shared by the form (inline feedback) and the auth
 * provider (authoritative check), so they can never drift apart.
 */
import { isActiveDepartment, isActiveSection } from '../academicService'
import type { StudentRegistration, Year } from '../../types'

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,23}$/
export const REGISTER_NUMBER_PATTERN = /^\d{4}[A-Z]{2,4}\d{3,4}$/

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

  const username = f.username.trim().toLowerCase()
  if (!username) e.username = 'Choose a username.'
  else if (!USERNAME_PATTERN.test(username))
    e.username = '3–24 characters: lowercase letters, numbers, dots or underscores. Must start with a letter or number.'

  if (!f.password) e.password = 'Create a password.'
  else if (!PASSWORD_RULES.every((r) => r.test(f.password))) e.password = 'Password does not meet all the requirements below.'
  if (!f.confirmPassword) e.confirmPassword = 'Re-enter your password.'
  else if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords do not match.'

  const reg = f.registerNumber.trim().toUpperCase()
  if (!reg) e.registerNumber = 'Enter your register number.'
  else if (!REGISTER_NUMBER_PATTERN.test(reg)) e.registerNumber = 'Use the format on your ID card, e.g. 2024CSE0123.'

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
