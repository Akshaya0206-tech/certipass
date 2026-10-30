/*
 * Who may do what with a certificate. Pure functions, no I/O, so the whole
 * policy can be read (and tested) in one place. The route handlers call these
 * before they touch Google Drive; the React app's own guards are only for
 * navigation and play no part here.
 *
 *   student  – their own certificates only
 *   faculty  – certificates of students currently in a department they cover
 *   admin    – every certificate record (view, download, remove, reconcile)
 *
 * An inactive account can do nothing at all.
 */
import type { Caller, Profile } from './types'

/** Departments a member of faculty covers: their review departments, else their own. */
export function facultyScope(profile: Pick<Profile, 'department' | 'review_departments'>): string[] {
  if (profile.review_departments && profile.review_departments.length > 0) return profile.review_departments
  return profile.department ? [profile.department] : []
}

export function canUploadCertificate(caller: Caller): boolean {
  return caller.active && caller.role === 'student'
}

/**
 * `ownerId` is the student the certificate belongs to and `ownerDepartment`
 * their department *now* (not when they uploaded), so a student who moves
 * department moves out of the old department's faculty scope too.
 */
export function canViewCertificate(caller: Caller, ownerId: string, ownerDepartment: string | null): boolean {
  if (!caller.active) return false
  switch (caller.role) {
    case 'student':
      return caller.id === ownerId
    case 'faculty':
      return !!ownerDepartment && facultyScope(caller.profile).includes(ownerDepartment)
    case 'admin':
      return true
    default:
      return false
  }
}

/** Downloading is allowed to exactly the people who may view. */
export const canDownloadCertificate = canViewCertificate

export function canManageCertificates(caller: Caller): boolean {
  return caller.active && caller.role === 'admin'
}

/** Creating, editing, approving, deactivating and resetting accounts. Administrators only. */
export function canManageAccounts(caller: Caller): boolean {
  return caller.active && caller.role === 'admin'
}
