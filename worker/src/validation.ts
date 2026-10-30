/*
 * Server-side checks on an uploaded certificate. These repeat the browser's
 * checks on purpose: the browser's are a courtesy, these are the ones that
 * count. A file is accepted only if its extension, its reported MIME type, its
 * first bytes and its size all agree.
 *
 * Keep the limits in step with src/services/fileService.ts (FILE_RULES).
 */
import { ApiError, invalidField } from './errors'

export const MAX_FILE_BYTES = 10 * 1024 * 1024

export type CertificateMime = 'application/pdf' | 'image/jpeg' | 'image/png'

const EXTENSIONS: Record<CertificateMime, string[]> = {
  'application/pdf': ['pdf'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
}

export const ACCEPTED_CATEGORIES = [
  'Hackathon',
  'Workshop',
  'Internship',
  'Competition',
  'Conference',
  'Paper Presentation',
  'Sports',
  'Cultural',
  'Other',
] as const

const MIMES = Object.keys(EXTENSIONS) as CertificateMime[]

function mimeFromExtension(name: string): CertificateMime | undefined {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return undefined
  const ext = name.slice(dot + 1).toLowerCase()
  return MIMES.find((m) => EXTENSIONS[m].includes(ext))
}

/** Identify a file from its first bytes, independent of its name or reported type. */
export function mimeFromSignature(bytes: Uint8Array): CertificateMime | undefined {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf' // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  return undefined
}

export interface ValidatedFile {
  mimeType: CertificateMime
  /** A safe version of the original name: no path parts, no control characters. */
  fileName: string
  bytes: Uint8Array
  sizeBytes: number
}

/**
 * Throws an ApiError (400/413/415) naming the first rule broken. `declaredType`
 * is whatever the browser reported; an empty string means it reported nothing.
 */
export function validateCertificate(name: string, declaredType: string, bytes: Uint8Array, maxBytes = MAX_FILE_BYTES): ValidatedFile {
  const safeName = sanitizeFileName(name)
  const byExtension = mimeFromExtension(safeName)
  if (!byExtension) {
    throw new ApiError(415, 'unsupported_type', `“${safeName}” is not a supported format. Upload a PDF, JPG or PNG file.`)
  }
  if (declaredType && declaredType !== byExtension) {
    throw new ApiError(415, 'type_mismatch', `“${safeName}” has a ${byExtension === 'application/pdf' ? 'PDF' : 'image'} extension but is reported as “${declaredType}”.`)
  }
  if (bytes.byteLength === 0) throw new ApiError(400, 'empty_file', 'This file is empty.')
  if (bytes.byteLength > maxBytes) {
    throw new ApiError(413, 'file_too_large', `This file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`)
  }
  const actual = mimeFromSignature(bytes)
  if (actual !== byExtension) {
    throw new ApiError(415, 'signature_mismatch', `“${safeName}” does not look like a valid file of the type its name claims.`)
  }
  return { mimeType: byExtension, fileName: safeName, bytes, sizeBytes: bytes.byteLength }
}

/** Strips directory parts and control characters, caps the length, never returns an empty name. */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '').trim().replace(/^\.+/, '')
  if (!cleaned) return 'certificate'
  if (cleaned.length <= 120) return cleaned
  const dot = cleaned.lastIndexOf('.')
  const ext = dot > 0 ? cleaned.slice(dot) : ''
  return cleaned.slice(0, 120 - ext.length) + ext
}

const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isUuid = (v: string) => UUID_PATTERN.test(v)

export function requireAchievementId(value: unknown): string {
  if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
    throw new ApiError(400, 'invalid_achievement_id', 'The achievement reference is missing or malformed.')
  }
  return value
}

export function requireUploadId(value: unknown): string {
  if (typeof value !== 'string' || !isUuid(value)) {
    throw new ApiError(400, 'invalid_upload_id', 'The upload reference is missing or malformed.')
  }
  return value.toLowerCase()
}

/** An optional text field of a form: absent or blank becomes null, otherwise it must be 1..max plain characters. */
export function optionalText(value: unknown, field: string, label: string, max = 120): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  // eslint-disable-next-line no-control-regex
  if (!text || text.length > max || /[\u0000-\u001f\u007f<>]/.test(text)) throw invalidField(field, `${label} must be 1–${max} characters, without < or >.`)
  return text
}

/** An optional YYYY-MM-DD date that is a real calendar day, not before 1990 and not later than tomorrow (time zones). */
export function optionalIssueDate(value: unknown, now: Date): string | null {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return null
  const text = typeof value === 'string' ? value.trim() : ''
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text)
  const bad = () => invalidField('issueDate', 'Enter the issue date as a real date, not in the future.')
  if (!m) throw bad()
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const day = new Date(Date.UTC(y, mo - 1, d))
  if (day.getUTCFullYear() !== y || day.getUTCMonth() !== mo - 1 || day.getUTCDate() !== d) throw bad()
  if (y < 1990 || day.getTime() > now.getTime() + 36 * 3_600_000) throw bad()
  return text
}

export function requireCategory(value: unknown): (typeof ACCEPTED_CATEGORIES)[number] {
  if (typeof value !== 'string' || !(ACCEPTED_CATEGORIES as readonly string[]).includes(value)) {
    throw new ApiError(400, 'invalid_category', 'The achievement category is missing or not recognised.')
  }
  return value as (typeof ACCEPTED_CATEGORIES)[number]
}

/** Reads a request body but gives up as soon as it is larger than `max` bytes. */
export async function readBodyLimited(request: Request, max: number): Promise<Uint8Array> {
  const declared = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(declared) && declared > max) throw tooLarge()
  if (!request.body) return new Uint8Array(0)
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > max) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }
  const out = new Uint8Array(total)
  let offset = 0
  for (const c of chunks) {
    out.set(c, offset)
    offset += c.byteLength
  }
  return out
}

function tooLarge() {
  return new ApiError(413, 'file_too_large', `This upload is larger than the ${Math.round(MAX_FILE_BYTES / (1024 * 1024))} MB limit.`)
}

/** SHA-256 of the file, hex encoded. Stored so a later integrity check is possible. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('')
}
