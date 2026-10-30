import { describe, expect, it } from 'vitest'
import { canDownloadCertificate, canManageAccounts, canManageCertificates, canUploadCertificate, canViewCertificate, facultyScope } from '../src/access'
import type { Caller, Profile } from '../src/types'

const caller = (role: Caller['role'], over: Partial<Profile> = {}, active = true): Caller => {
  const profile: Profile = { id: `${role}-1`, role, active, full_name: role, department: null, review_departments: null, register_number: null, year: null, ...over }
  return { id: profile.id, role, active, profile, sessionHash: 'h' }
}

describe('faculty scope', () => {
  it('uses review departments when present, else the faculty member’s own department', () => {
    expect(facultyScope({ department: 'CSE', review_departments: ['CSE', 'AIDS'] })).toEqual(['CSE', 'AIDS'])
    expect(facultyScope({ department: 'ECE', review_departments: [] })).toEqual(['ECE'])
    expect(facultyScope({ department: 'ECE', review_departments: null })).toEqual(['ECE'])
    expect(facultyScope({ department: null, review_departments: null })).toEqual([])
  })
})

describe('certificate access policy', () => {
  it('lets a student view only their own certificate', () => {
    const me = caller('student', { id: 's1' })
    expect(canViewCertificate(me, 's1', 'CSE')).toBe(true)
    expect(canViewCertificate(me, 's2', 'CSE')).toBe(false)
  })

  it('lets faculty view only students in their departments', () => {
    const f = caller('faculty', { department: 'CSE', review_departments: ['CSE', 'AIDS'] })
    expect(canViewCertificate(f, 's1', 'CSE')).toBe(true)
    expect(canViewCertificate(f, 's1', 'AIDS')).toBe(true)
    expect(canViewCertificate(f, 's1', 'ECE')).toBe(false)
    expect(canViewCertificate(f, 's1', null)).toBe(false)
  })

  it('lets an admin view everything', () => {
    expect(canViewCertificate(caller('admin'), 's1', 'MECH')).toBe(true)
  })

  it('refuses everything for an inactive account', () => {
    expect(canViewCertificate(caller('student', { id: 's1' }, false), 's1', 'CSE')).toBe(false)
    expect(canViewCertificate(caller('faculty', { department: 'CSE' }, false), 's1', 'CSE')).toBe(false)
    expect(canViewCertificate(caller('admin', {}, false), 's1', 'CSE')).toBe(false)
    expect(canManageCertificates(caller('admin', {}, false))).toBe(false)
    expect(canUploadCertificate(caller('student', {}, false))).toBe(false)
  })

  it('allows upload only for students, and management only for admins', () => {
    expect(canUploadCertificate(caller('student'))).toBe(true)
    expect(canUploadCertificate(caller('faculty'))).toBe(false)
    expect(canUploadCertificate(caller('admin'))).toBe(false)
    expect(canManageCertificates(caller('admin'))).toBe(true)
    expect(canManageCertificates(caller('faculty'))).toBe(false)
    expect(canManageCertificates(caller('student'))).toBe(false)
  })

  it('treats download exactly like view', () => {
    expect(canDownloadCertificate).toBe(canViewCertificate)
  })
})
