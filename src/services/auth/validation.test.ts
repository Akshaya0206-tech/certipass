import { describe, expect, it } from 'vitest'
import { signInNameError, validateRegistration } from './validation'
import type { StudentRegistrationForm } from './validation'

const form = (over: Partial<StudentRegistrationForm> = {}): StudentRegistrationForm => ({
  fullName: 'Dinesh G',
  username: 'dinesh.g.2024.aids@rajalakshmi.edu.in',
  password: 'Student@123',
  confirmPassword: 'Student@123',
  registerNumber: '241801058',
  department: 'AIDS',
  year: '3',
  section: 'A',
  ...over,
})

describe('register number', () => {
  it('has no required format: a plain numeric roll number is accepted', () => {
    expect(validateRegistration(form({ registerNumber: '241801058' })).registerNumber).toBeUndefined()
  })

  it('still accepts the older letters-and-digits style, and any other style', () => {
    for (const reg of ['2024CSE0123', '24-AIDS-058', 'REC/24/1058', 'a1']) {
      expect(validateRegistration(form({ registerNumber: reg })).registerNumber, reg).toBeUndefined()
    }
  })

  it('is still required, and has a sane length cap', () => {
    expect(validateRegistration(form({ registerNumber: '   ' })).registerNumber).toMatch(/Enter your register number/)
    expect(validateRegistration(form({ registerNumber: '1'.repeat(31) })).registerNumber).toMatch(/30 characters/)
    expect(validateRegistration(form({ registerNumber: '1'.repeat(30) })).registerNumber).toBeUndefined()
  })
})

describe('college email as the sign-in name', () => {
  it('accepts any name or year before the fixed @rajalakshmi.edu.in', () => {
    for (const id of [
      'dinesh.g.2024.aids@rajalakshmi.edu.in',
      'priya.k@rajalakshmi.edu.in',
      'ravi_2023.cse@rajalakshmi.edu.in',
      'a-b+c@rajalakshmi.edu.in',
      'x@rajalakshmi.edu.in',
    ]) {
      expect(signInNameError(id), id).toBeNull()
    }
  })

  it('ignores case and surrounding spaces', () => {
    expect(signInNameError('  Dinesh.G.2024.AIDS@Rajalakshmi.Edu.In ')).toBeNull()
  })

  it('refuses any other domain, including look-alikes', () => {
    for (const id of [
      'dinesh@gmail.com',
      'dinesh@rajalakshmi.edu',
      'dinesh@rajalakshmi.edu.in.evil.com',
      'dinesh@mail.rajalakshmi.edu.in',
      'dinesh@xrajalakshmi.edu.in',
      'dinesh@',
    ]) {
      expect(signInNameError(id), id).toMatch(/ends in @rajalakshmi\.edu\.in/)
    }
  })

  it('refuses a malformed name before the @', () => {
    for (const id of ['.dinesh@rajalakshmi.edu.in', 'dinesh.@rajalakshmi.edu.in', 'din..esh@rajalakshmi.edu.in', 'din esh@rajalakshmi.edu.in', 'a@b@rajalakshmi.edu.in', '@rajalakshmi.edu.in']) {
      expect(signInNameError(id), id).toMatch(/Before the @/)
    }
  })

  it('still accepts the plain usernames of the demo accounts, and refuses bad ones', () => {
    for (const id of ['aarav.demo', 'meera.faculty', 'records.admin', 'diya.r']) expect(signInNameError(id), id).toBeNull()
    for (const id of ['ab', 'Has Space', '-start', 'x'.repeat(25)]) expect(signInNameError(id), id).not.toBeNull()
    expect(signInNameError('')).toMatch(/Enter a college email or username/)
  })

  it('lets a full registration with the college email and a numeric roll number through these two fields', () => {
    const errors = validateRegistration(form())
    expect(errors.username).toBeUndefined()
    expect(errors.registerNumber).toBeUndefined()
  })

  it('flags a non-college email in the registration form', () => {
    expect(validateRegistration(form({ username: 'dinesh@gmail.com' })).username).toMatch(/ends in @rajalakshmi\.edu\.in/)
  })
})
