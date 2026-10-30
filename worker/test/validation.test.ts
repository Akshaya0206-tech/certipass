import { describe, expect, it } from 'vitest'
import { ApiError } from '../src/errors'
import { MAX_FILE_BYTES, sanitizeFileName, validateCertificate } from '../src/validation'
import { JPG, PDF, PNG } from './harness'

function reject(name: string, type: string, bytes: Uint8Array) {
  try {
    validateCertificate(name, type, bytes)
  } catch (e) {
    expect(e).toBeInstanceOf(ApiError)
    return e as ApiError
  }
  throw new Error('expected the file to be rejected')
}

describe('certificate file validation', () => {
  it('accepts a real PDF, JPG and PNG', () => {
    expect(validateCertificate('a.pdf', 'application/pdf', PDF()).mimeType).toBe('application/pdf')
    expect(validateCertificate('a.jpg', 'image/jpeg', JPG()).mimeType).toBe('image/jpeg')
    expect(validateCertificate('a.JPEG', 'image/jpeg', JPG()).mimeType).toBe('image/jpeg')
    expect(validateCertificate('a.png', 'image/png', PNG()).mimeType).toBe('image/png')
  })

  it('accepts a file whose browser reported no MIME type, when the bytes agree', () => {
    expect(validateCertificate('a.png', '', PNG()).mimeType).toBe('image/png')
  })

  it('rejects an unsupported extension', () => {
    expect(reject('a.docx', '', PDF()).code).toBe('unsupported_type')
    expect(reject('noextension', '', PDF()).code).toBe('unsupported_type')
  })

  it('rejects a MIME type that disagrees with the extension', () => {
    expect(reject('a.pdf', 'image/png', PDF()).code).toBe('type_mismatch')
  })

  it('rejects a text file renamed to .pdf (signature check)', () => {
    expect(reject('a.pdf', 'application/pdf', new TextEncoder().encode('just some text')).code).toBe('signature_mismatch')
  })

  it('rejects a PNG renamed to .jpg', () => {
    expect(reject('a.jpg', 'image/jpeg', PNG()).code).toBe('signature_mismatch')
  })

  it('rejects an empty file and one over the size limit', () => {
    expect(reject('a.pdf', 'application/pdf', new Uint8Array(0)).code).toBe('empty_file')
    const big = new Uint8Array(MAX_FILE_BYTES + 1)
    big.set(PDF())
    const err = reject('a.pdf', 'application/pdf', big)
    expect(err.code).toBe('file_too_large')
    expect(err.status).toBe(413)
  })

  it('accepts a file of exactly the size limit', () => {
    const exact = new Uint8Array(MAX_FILE_BYTES)
    exact.set(PDF())
    expect(validateCertificate('a.pdf', 'application/pdf', exact).sizeBytes).toBe(MAX_FILE_BYTES)
  })
})

describe('file name sanitising', () => {
  it('removes directory parts, control characters and leading dots', () => {
    expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('passwd.pdf')
    expect(sanitizeFileName('C:\\Users\\x\\cert.pdf')).toBe('cert.pdf')
    expect(sanitizeFileName('..hidden.pdf')).toBe('hidden.pdf')
    expect(sanitizeFileName('a\u0000b\u001f.pdf')).toBe('ab.pdf')
  })

  it('never returns an empty name and caps the length while keeping the extension', () => {
    expect(sanitizeFileName('///')).toBe('certificate')
    const long = sanitizeFileName(`${'x'.repeat(300)}.pdf`)
    expect(long.length).toBeLessThanOrEqual(120)
    expect(long.endsWith('.pdf')).toBe(true)
  })
})
