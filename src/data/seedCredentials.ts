/*
 * DEVELOPMENT-ONLY seed credentials for the fictional demo accounts.
 *
 * These exist so the mock auth provider can sign people in. They are never
 * written to browser storage: at runtime they are hashed in memory
 * (see services/auth/credentials.ts). Real accounts will be provisioned by
 * the backend in a later phase — never ship real passwords like this.
 */
import type { Role } from '../types'

export const DEMO_CREDENTIALS: Record<Role, { username: string; password: string }> = {
  student: { username: 'aarav.demo', password: 'Student@123' },
  faculty: { username: 'meera.faculty', password: 'Faculty@123' },
  admin: { username: 'records.admin', password: 'Admin@123' },
}

const STUDENT_DEFAULT = 'Student@123'
const FACULTY_DEFAULT = 'Faculty@123'

/** Seed user id → password. Every seeded student / faculty shares the role default. */
export function seedPasswordFor(userId: string): string | undefined {
  if (userId === 'adm-01') return DEMO_CREDENTIALS.admin.password
  if (/^stu-\d\d$/.test(userId)) return STUDENT_DEFAULT
  if (/^fac-\d\d$/.test(userId)) return FACULTY_DEFAULT
  return undefined
}
