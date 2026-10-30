/*
 * Certificate file handling — the prototype's storage boundary.
 *
 * Files are checked and previewed in browser memory only. Nothing is
 * uploaded: `storeCertificate` returns metadata (plus a small inline preview
 * for images), never a download link. When real storage arrives (Google Drive through the Worker
 * Storage, Phase 7) `storeCertificate` is the single function to replace;
 * callers already treat it as asynchronous.
 *
 * These checks improve the experience and catch honest mistakes. They are
 * not a security control: a server must re-validate and scan every upload.
 */
import type { CertificateFile, CertificateFileType } from '../types'

/** Every upload rule lives here — change the limit or formats in one place. */
export const FILE_RULES = {
  maxBytes: 10 * 1024 * 1024,
  /** Images up to this size keep an inline preview in the prototype's local data. */
  maxInlinePreviewBytes: 900 * 1024,
  types: {
    'application/pdf': { label: 'PDF', extensions: ['pdf'] },
    'image/jpeg': { label: 'JPG', extensions: ['jpg', 'jpeg'] },
    'image/png': { label: 'PNG', extensions: ['png'] },
  } satisfies Record<CertificateFileType, { label: string; extensions: string[] }>,
} as const

export const MAX_FILE_BYTES = FILE_RULES.maxBytes
export const ACCEPTED_TYPES: Record<CertificateFileType, string> = {
  'application/pdf': FILE_RULES.types['application/pdf'].label,
  'image/jpeg': FILE_RULES.types['image/jpeg'].label,
  'image/png': FILE_RULES.types['image/png'].label,
}
const TYPE_KEYS = Object.keys(FILE_RULES.types) as CertificateFileType[]
export const ACCEPT_ATTRIBUTE = TYPE_KEYS.flatMap((t) => [...FILE_RULES.types[t].extensions.map((e) => `.${e}`), t]).join(',')
export const ACCEPTED_LABEL = 'PDF, JPG or PNG'

export type FileValidation = { ok: true; type: CertificateFileType } | { ok: false; message: string }

function typeFromExtension(name: string): CertificateFileType | undefined {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : ''
  return TYPE_KEYS.find((t) => (FILE_RULES.types[t].extensions as readonly string[]).includes(ext))
}

/** Identify a file from its first bytes, independent of its name or reported type. */
function typeFromSignature(bytes: Uint8Array): CertificateFileType | undefined {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  if (starts(0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf' // %PDF-
  if (starts(0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png'
  return undefined
}

/** Quick checks that need no file reading: name, reported type and size. */
export function validateCertificateFile(file: File | undefined | null): FileValidation {
  if (!file) return { ok: false, message: 'No file was selected. Choose a certificate to attach.' }
  const byExt = typeFromExtension(file.name)
  if (!byExt) {
    return { ok: false, message: `“${file.name}” is not a supported format. Upload a ${ACCEPTED_LABEL} file.` }
  }
  // Browsers don't always report a MIME type; when they do, it must agree with the extension.
  if (file.type && file.type !== byExt) {
    const known = (TYPE_KEYS as string[]).includes(file.type)
    return {
      ok: false,
      message: known
        ? `“${file.name}” has a .${file.name.split('.').pop()} extension but is reported as ${ACCEPTED_TYPES[file.type as CertificateFileType]}. Rename or re-export the file.`
        : `“${file.name}” is reported as “${file.type}”, which isn’t a supported format. Upload a ${ACCEPTED_LABEL} file.`,
    }
  }
  if (file.size === 0) return { ok: false, message: 'This file is empty. Choose a different file.' }
  if (file.size > FILE_RULES.maxBytes) {
    return { ok: false, message: `This file is ${formatBytes(file.size)}. The maximum size is ${formatBytes(FILE_RULES.maxBytes)}.` }
  }
  return { ok: true, type: byExt }
}

/**
 * Full check: the quick checks, then the file's signature bytes are read
 * locally to confirm the content really is the format its name claims.
 */
export async function inspectCertificateFile(file: File | undefined | null): Promise<FileValidation> {
  const quick = validateCertificateFile(file)
  if (!quick.ok || !file) return quick
  let head: Uint8Array
  try {
    head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  } catch {
    return { ok: false, message: 'This file couldn’t be read. It may have been moved or deleted — select it again.' }
  }
  const actual = typeFromSignature(head)
  if (actual !== quick.type) {
    return {
      ok: false,
      message: `“${file.name}” doesn’t look like a valid ${ACCEPTED_TYPES[quick.type]} file${actual ? ` — its contents are ${ACCEPTED_TYPES[actual]}` : ''}. Export the certificate again and retry.`,
    }
  }
  return quick
}

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/**
 * Prototype stand-in for an upload. Returns metadata only (and an inline
 * preview for small images). It does NOT store the file anywhere.
 */
export async function storeCertificate(file: File, type: CertificateFileType): Promise<CertificateFile> {
  const meta: CertificateFile = { fileName: file.name, fileType: type, sizeBytes: file.size }
  if (type !== 'application/pdf' && file.size <= FILE_RULES.maxInlinePreviewBytes) {
    try {
      meta.previewDataUrl = await readAsDataUrl(file)
    } catch {
      /* preview is optional */
    }
  }
  return meta
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  const mb = bytes / (1024 * 1024)
  return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`
}
