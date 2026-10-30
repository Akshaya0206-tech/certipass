/*
 * Where a certificate goes in Drive, and what it is called.
 *
 *   <root>/CertiPass/<year>/<department>/<student id>/Certificates/<student id>_<category>_Certificate.<ext>
 *   e.g.   CertiPass/2026/AIDS/2023AIDS0417/Certificates/2023AIDS0417_Hackathon_Certificate.pdf
 *
 * <year> is the calendar year of the upload, <student id> is the student's register number, and the department
 * is the student's own. A second certificate in the same category gets _2, _3… and nothing is ever overwritten.
 *
 * Shared by the upload handler and the sample-upload script, so what you see
 * after `npm run drive:sample` is exactly what a student's upload produces.
 * Nothing here is used for authorisation: the folder a file sits in is for
 * people browsing Drive, never a security boundary.
 */
import type { CertificateMime } from './validation'

export const PROGRAMME_YEARS = 4

export const EXTENSION: Record<CertificateMime, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
}

/** Admission year from the register number (2023CSE0417 → 2023), else from year of study, else "unknown". */
export function admissionBatch(registerNumber: string, year: number | null, now: Date): string {
  const m = /^(\d{4})/.exec(registerNumber.trim())
  if (m) {
    const y = Number(m[1])
    if (y >= 2000 && y <= 2099) return String(y)
  }
  if (year && year >= 1 && year <= PROGRAMME_YEARS) {
    const startYear = now.getMonth() >= 5 ? now.getFullYear() : now.getFullYear() - 1
    return String(startYear - (year - 1))
  }
  return 'unknown'
}


/** A folder name: no slashes or control characters, no leading dots, never empty, never absurdly long. */
export function folderSegment(value: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = value.replace(/[\u0000-\u001f\u007f/\\]/g, ' ').replace(/^[.\s]+/, '').replace(/\s+/g, ' ').trim()
  return (cleaned || 'unknown').slice(0, 80)
}

export interface CertificatePlacement {
  /** Calendar year of the upload, e.g. "2026". */
  year: string
  department: string
  registerNumber: string
}

/** Everything CertiPass writes lives under this one folder inside the configured Drive folder. */
export const CERTIPASS_FOLDER = 'CertiPass'
/** The folder inside each student's folder that holds their certificate files. */
export const CERTIFICATES_FOLDER = 'Certificates'

/** The calendar year (UTC) of an ISO timestamp, as a folder name. */
export const uploadYear = (iso: string): string => (/^\d{4}/.test(iso) ? iso.slice(0, 4) : 'unknown')

/** The five folders, outermost first. */
export const certificateFolderPath = (p: CertificatePlacement): string[] => [
  CERTIPASS_FOLDER,
  folderSegment(p.year),
  folderSegment(p.department),
  folderSegment(p.registerNumber),
  CERTIFICATES_FOLDER,
]
/** A piece of a file name: letters and digits only, anything else becomes a single hyphen. */
export function fileNamePart(value: string, fallback: string): string {
  const cleaned = value
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return cleaned || fallback
}

/** `2023AIDS0417_Hackathon_Certificate`, `2023AIDS0417_Paper-Presentation_Certificate`. */
export const certificateBaseName = (registerNumber: string, category: string): string =>
  `${fileNamePart(registerNumber, 'student')}_${fileNamePart(category, 'Other')}_Certificate`

/**
 * The first free name for `base.ext` among `existing`: `base.ext`, then
 * `base_2.ext`, `base_3.ext`… A student can have several certificates in one
 * category; Drive allows duplicate names but people browsing shouldn't have to.
 */
export function pickFileName(existing: Iterable<string>, base: string, ext: string): string {
  const taken = new Set([...existing].map((n) => n.toLowerCase()))
  let candidate = `${base}.${ext}`
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${base}_${n}.${ext}`
  return candidate
}
