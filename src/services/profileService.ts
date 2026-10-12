/*
 * Self-service profile edits. Each role may change only a whitelisted set of
 * fields; identity fields (username, role, register number, department) are
 * never accepted here — they're managed by the records office.
 */
import { isKnownSection } from './academicService'
import type { AdminProfileUpdate, ProfileUpdate, StaffProfileUpdate, StudentProfileUpdate, User, Year } from '../types'
import { delay, setState } from './store'

export const EDITABLE_FIELDS = {
  student: ['fullName', 'year', 'section'],
  faculty: ['fullName', 'designation'],
  admin: ['fullName'],
} as const

export type ProfileErrors = Partial<Record<'fullName' | 'year' | 'section' | 'designation', string>>

export function validateProfile(role: User['role'], patch: ProfileUpdate | Record<string, unknown>): ProfileErrors {
  const e: ProfileErrors = {}
  if ('fullName' in patch) {
    const n = String(patch.fullName ?? '').trim()
    if (n.length < 3) e.fullName = 'Enter your full name (at least 3 characters).'
    else if (n.length > 80) e.fullName = 'Name must be 80 characters or fewer.'
  }
  if (role === 'student') {
    const p = patch as StudentProfileUpdate
    if ('year' in p && ![1, 2, 3, 4].includes(Number(p.year))) e.year = 'Select a year from the list.'
    if ('section' in p && !isKnownSection(p.section ?? '')) e.section = 'Select a section from the list.'
  }
  if (role === 'faculty' && 'designation' in patch) {
    const d = (patch as StaffProfileUpdate).designation?.trim() ?? ''
    if (d.length < 2) e.designation = 'Enter your designation.'
    else if (d.length > 80) e.designation = 'Designation must be 80 characters or fewer.'
  }
  return e
}

/** Copy only the fields this role is allowed to change. */
function pickAllowed(user: User, patch: Record<string, unknown>): ProfileUpdate {
  const allowed = EDITABLE_FIELDS[user.role] as readonly string[]
  const out: Record<string, unknown> = {}
  for (const k of allowed) if (k in patch) out[k] = patch[k]
  if (user.role === 'student' && 'year' in out) out.year = Number(out.year) as Year
  if (typeof out.fullName === 'string') out.fullName = out.fullName.trim().replace(/\s+/g, ' ')
  if (typeof out.designation === 'string') out.designation = out.designation.trim()
  return out as StudentProfileUpdate | StaffProfileUpdate | AdminProfileUpdate
}

export async function updateProfile(user: User, patch: Record<string, unknown>): Promise<void> {
  const safe = pickAllowed(user, patch)
  const errors = validateProfile(user.role, safe)
  const first = Object.values(errors)[0]
  if (first) throw new Error(first)
  await delay(350)
  setState((s) => ({ ...s, users: s.users.map((u) => (u.id === user.id ? ({ ...u, ...safe } as User) : u)) }))
}
