import { describe, expect, it } from 'vitest'
import { admissionBatch, certificateBaseName, certificateFolderPath, fileNamePart, folderSegment, pickFileName, uploadYear } from '../src/naming'

describe('file names', () => {
  it('follows the pattern <register no.>_<category>_Certificate', () => {
    expect(certificateBaseName('2023AIDS0417', 'Hackathon')).toBe('2023AIDS0417_Hackathon_Certificate')
    expect(certificateBaseName('241801058', 'Paper Presentation')).toBe('241801058_Paper-Presentation_Certificate')
  })

  it('cannot be turned into a path or an odd file name', () => {
    expect(fileNamePart('../../etc/passwd', 'x')).toBe('etc-passwd')
    expect(fileNamePart('a/b\\c:d*e?', 'x')).toBe('a-b-c-d-e')
    expect(fileNamePart('***', 'fallback')).toBe('fallback')
    expect(fileNamePart('x'.repeat(100), 'f')).toHaveLength(40)
    expect(certificateBaseName('REC/24/1058', 'Sports')).toBe('REC-24-1058_Sports_Certificate')
  })

  it('picks the first free name for a second and third certificate', () => {
    const base = '2023AIDS0417_Hackathon_Certificate'
    expect(pickFileName([], base, 'pdf')).toBe(`${base}.pdf`)
    expect(pickFileName([`${base}.pdf`], base, 'pdf')).toBe(`${base}_2.pdf`)
    expect(pickFileName([`${base}.pdf`, `${base}_2.pdf`], base, 'pdf')).toBe(`${base}_3.pdf`)
    expect(pickFileName([`${base}.pdf`, `${base}_3.pdf`], base, 'pdf')).toBe(`${base}_2.pdf`)
  })

  it('treats names case-insensitively and keeps different extensions apart', () => {
    const base = 'X_Sports_Certificate'
    expect(pickFileName(['x_sports_certificate.PDF'], base, 'pdf')).toBe(`${base}_2.pdf`)
    expect(pickFileName([`${base}.pdf`], base, 'png')).toBe(`${base}.png`)
  })
})

describe('folders', () => {
  it('lays out CertiPass / year / department / student id / Certificates', () => {
    expect(certificateFolderPath({ year: '2026', department: 'AIDS', registerNumber: '2023AIDS0417' })).toEqual(['CertiPass', '2026', 'AIDS', '2023AIDS0417', 'Certificates'])
  })

  it('takes the year from the upload time', () => {
    expect(uploadYear('2026-10-30T09:15:00.000Z')).toBe('2026')
    expect(uploadYear('2027-01-01T00:00:00.000Z')).toBe('2027')
    expect(uploadYear('nonsense')).toBe('unknown')
  })

  it('keeps every part inside its own folder, whatever the department or student id contains', () => {
    expect(certificateFolderPath({ year: '2026', department: '../../etc', registerNumber: 'a/b\\c' })).toEqual(['CertiPass', '2026', 'etc', 'a b c', 'Certificates'])
  })
  it('never lets a value break out of its folder', () => {
    expect(folderSegment('../../x')).toBe('x')
    expect(folderSegment('a/b')).toBe('a b')
    expect(folderSegment('   ')).toBe('unknown')
    expect(folderSegment('x'.repeat(200))).toHaveLength(80)
  })
})

describe('admission batch', () => {
  const now = new Date('2026-10-29')
  it('reads the year from a register number that starts with one', () => {
    expect(admissionBatch('2023AIDS0417', 3, now)).toBe('2023')
  })
  it('falls back to the year of study for any other numbering', () => {
    expect(admissionBatch('241801058', 3, now)).toBe('2024')
    expect(admissionBatch('241801058', 1, now)).toBe('2026')
  })
  it('says unknown when neither works', () => {
    expect(admissionBatch('241801058', null, now)).toBe('unknown')
  })
})
