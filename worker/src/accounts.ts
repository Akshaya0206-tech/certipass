/*
 * What counts as a valid account, shared by self-registration and by an
 * administrator creating or editing an account, plus the one shape in which a
 * user ever leaves the Worker. The password hash is never part of it.
 */
import { parseDepartments } from './db'
import { ApiError, invalidField } from './errors'
import type { Env, Role, UserRow } from './types'

export const DEFAULT_EMAIL_DOMAIN = 'rajalakshmi.edu.in'

export function allowedDomains(env: Env): string[] {
  const list = (env.ALLOWED_EMAIL_DOMAINS ?? DEFAULT_EMAIL_DOMAIN)
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean)
  return list.length ? list : [DEFAULT_EMAIL_DOMAIN]
}

/**
 * A student who registers can sign in at once. REGISTRATION_MODE=approval makes each new account wait for an
 * administrator instead. Only "open" (or no setting at all) opens registration: any other value, a misspelling
 * included, is read as approval, so a typo can never leave registration open when someone meant to restrict it.
 */
export function registrationIsOpen(env: Env): boolean {
  const mode = (env.REGISTRATION_MODE ?? '').trim().toLowerCase()
  return mode === '' || mode === 'open'
}

export const normalizeEmail = (raw: unknown) => (typeof raw === 'string' ? raw.trim().toLowerCase() : '')

/** The address must be on an allowed domain; anything before the @ is fine as long as it is a plain address. */
export function validEmail(raw: unknown, env: Env): string {
  const email = normalizeEmail(raw)
  const at = email.lastIndexOf('@')
  const domains = allowedDomains(env)
  if (!email || at < 1 || email.length > 254) throw invalidField('email', 'Enter your college email address.')
  const local = email.slice(0, at)
  if (!domains.includes(email.slice(at + 1))) {
    throw invalidField('email', `Use your college email, which ends in @${domains[0]}.`)
  }
  if (!/^[a-z0-9][a-z0-9._+-]{0,63}$/.test(local) || local.endsWith('.') || local.includes('..')) {
    throw invalidField('email', 'Before the @, use letters, numbers, dots, underscores or hyphens, starting with a letter or number.')
  }
  return email
}

const spaces = (s: string) => s.trim().replace(/\s+/g, ' ')

export function validName(raw: unknown): string {
  const name = typeof raw === 'string' ? spaces(raw) : ''
  if (name.length < 2 || name.length > 80) throw invalidField('fullName', 'Enter a full name of 2–80 characters.')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(name)) throw invalidField('fullName', 'The name contains characters that are not allowed.')
  return name
}

export function validDepartment(raw: unknown): string {
  const dept = typeof raw === 'string' ? spaces(raw) : ''
  if (!/^[A-Za-z0-9][A-Za-z0-9 &.()/-]{0,39}$/.test(dept)) throw invalidField('department', 'Select a department.')
  return dept
}

/** There is no required format for a register number; it just has to be a short plain identifier. */
export function validRegisterNumber(raw: unknown): string {
  const reg = typeof raw === 'string' ? raw.trim().toUpperCase() : ''
  if (!/^[A-Z0-9][A-Z0-9 ._/-]{0,29}$/.test(reg)) throw invalidField('registerNumber', 'Enter your register number (up to 30 letters, numbers, dots, hyphens or slashes).')
  return reg
}

export function validYear(raw: unknown): number {
  const year = typeof raw === 'string' && /^\d$/.test(raw) ? Number(raw) : raw
  if (typeof year !== 'number' || !Number.isInteger(year) || year < 1 || year > 4) throw invalidField('year', 'Select a year from 1 to 4.')
  return year
}

export function validSection(raw: unknown): string {
  const section = typeof raw === 'string' ? raw.trim() : ''
  if (!/^[A-Za-z0-9 -]{0,10}$/.test(section)) throw invalidField('section', 'Enter a section of up to 10 letters or numbers.')
  return section
}

export function validDesignation(raw: unknown): string {
  const text = typeof raw === 'string' ? spaces(raw) : ''
  if (text.length < 1 || text.length > 80) throw invalidField('designation', 'Enter a designation, e.g. Assistant Professor.')
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(text)) throw invalidField('designation', 'The designation contains characters that are not allowed.')
  return text
}

export function validDepartmentList(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > 30) throw invalidField('reviewDepartments', 'Review departments must be a list of departments.')
  return [...new Set(raw.map(validDepartment))]
}

export function validRole(raw: unknown, allowed: readonly Role[]): Role {
  if (typeof raw !== 'string' || !(allowed as readonly string[]).includes(raw)) throw invalidField('role', `The role must be one of: ${allowed.join(', ')}.`)
  return raw as Role
}

/** A user as the browser sees them. No password hash, ever. */
export interface PublicUser {
  id: string
  email: string
  /** The sign-in name. Accounts sign in with their email. */
  username: string
  role: Role
  status: UserRow['status']
  active: boolean
  fullName: string
  department: string | null
  reviewDepartments: string[] | null
  registerNumber: string | null
  year: number | null
  section: string | null
  designation: string | null
  createdAt: string
}

export const toPublicUser = (u: UserRow): PublicUser => ({
  id: u.id,
  email: u.email,
  username: u.email,
  role: u.role,
  status: u.status,
  active: u.status === 'active',
  fullName: u.full_name,
  department: u.department,
  reviewDepartments: parseDepartments(u.review_departments),
  registerNumber: u.register_number,
  year: u.year,
  section: u.section,
  designation: u.designation,
  createdAt: u.created_at,
})

/** Which field of a user a unique-constraint failure was about. */
export function duplicateOf(message: string): ApiError {
  if (/users\.register_number/i.test(message)) return new ApiError(409, 'duplicate_register_number', 'An account with this register number already exists. If it’s yours, sign in instead.', false, { field: 'registerNumber' })
  return new ApiError(409, 'duplicate_email', 'An account with this email already exists. Sign in instead.', false, { field: 'email' })
}
