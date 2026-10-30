/*
 * Certificate operations: upload, look up, stream, remove, reconcile.
 *
 * ── The upload, step by step ────────────────────────────────────────────────
 *  1. Authorise (student only), then validate the file bytes.
 *  2. Write a `pending` row FIRST. From here on, every Drive file has a row
 *     that explains it, so nothing can be orphaned without a trace.
 *  3. Put the file in Drive, in root/CertiPass/<year>/<department>/<student id>/Certificates.
 *     Each Drive file is tagged with the upload id, so a retry can find the
 *     file an earlier, interrupted attempt already created instead of
 *     uploading it again.
 *  4. Flip the row to `stored` with ONE atomic database call that also retires
 *     any earlier certificate for the same achievement.
 *  Only after step 4 does the client hear "uploaded".
 *
 * ── If only one half succeeds ───────────────────────────────────────────────
 *  Drive failed        → row marked `failed` (with a reason code); nothing in
 *                        Drive; the client retries with the same upload id.
 *  Drive ok, DB failed → the Drive file is KEPT and the row stays `pending`.
 *                        The client's retry (same upload id) finds the file,
 *                        skips the upload and just completes the row. If the
 *                        client never comes back, `reconcile` finishes the job.
 *  Worker dies midway  → same as above; `reconcile` adopts the file or marks
 *                        the abandoned row `failed`.
 */
import { canManageCertificates, canUploadCertificate, canViewCertificate, facultyScope } from './access'
import type { Ctx } from './ctx'
import { DbError } from './db'
import type { Where } from './db'
import { DriveError, ApiError, driveErrorToApi } from './errors'
import type { DriveErrorCode } from './errors'
import { json } from './http'
import { admissionBatch, certificateBaseName, certificateFolderPath, EXTENSION, pickFileName, uploadYear } from './naming'
import type { Caller, CertificateRow, CertificateView, Env } from './types'
import {
  MAX_FILE_BYTES,
  readBodyLimited,
  requireAchievementId,
  requireCategory,
  requireUploadId,
  sha256Hex,
  isUuid,
  optionalIssueDate,
  optionalText,
  validateCertificate,
} from './validation'

export type { Ctx }
export { json }

const MULTIPART_OVERHEAD = 256 * 1024
const FINALIZE_ATTEMPTS = 3

export const toView = (row: CertificateRow): CertificateView => ({
  id: row.id,
  achievementId: row.achievement_id,
  fileName: row.original_filename,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  uploadedAt: row.uploaded_at,
  category: row.category,
  title: row.title,
  issuer: row.issuer,
  issueDate: row.issue_date,
})

const staleMs = (env: Env) => Math.max(1, Number(env.PENDING_STALE_MINUTES ?? '10') || 10) * 60_000
const isStale = (ctx: Ctx, row: CertificateRow) => ctx.deps.now().getTime() - Date.parse(row.updated_at) > staleMs(ctx.env)

/** Wraps any database failure as a retryable 503 so callers never see raw Postgres text. */
async function db<T>(work: Promise<T>): Promise<T> {
  try {
    return await work
  } catch (err) {
    if (err instanceof DbError) {
      console.error(JSON.stringify({ event: 'database_error', code: err.code, detail: err.detail }))
      throw new ApiError(503, 'database_unavailable', 'The records database could not be reached. Try again in a moment.', true)
    }
    throw err
  }
}

// ── Upload ───────────────────────────────────────────────────────────────────

export async function uploadCertificate(ctx: Ctx, caller: Caller, request: Request): Promise<Response> {
  if (!canUploadCertificate(caller)) throw new ApiError(403, 'forbidden', 'Only students can upload certificates.')
  const { profile } = caller
  if (!profile.department || !profile.register_number) {
    throw new ApiError(409, 'profile_incomplete', 'Your profile is missing a department or register number. Contact the records office.')
  }

  const contentType = request.headers.get('content-type') ?? ''
  if (!/^multipart\/form-data/i.test(contentType)) throw new ApiError(415, 'invalid_form', 'Send the certificate as multipart form data.')
  const raw = await readBodyLimited(request, MAX_FILE_BYTES + MULTIPART_OVERHEAD)
  let form: FormData
  try {
    form = await new Request('https://upload.invalid/', { method: 'POST', headers: { 'content-type': contentType }, body: raw }).formData()
  } catch {
    throw new ApiError(400, 'invalid_form', 'The upload could not be read.')
  }

  const achievementId = requireAchievementId(form.get('achievementId'))
  const uploadId = requireUploadId(form.get('uploadId'))
  const category = requireCategory(form.get('category'))
  // What the student says about the certificate. Optional here (the long submission form sends none), checked before anything is stored.
  const title = optionalText(form.get('title'), 'title', 'The title')
  const issuer = optionalText(form.get('issuer'), 'issuer', 'The issuing organisation')
  const issueDate = optionalIssueDate(form.get('issueDate'), ctx.deps.now())
  const file = form.get('file')
  if (!file || typeof file === 'string') throw new ApiError(400, 'missing_file', 'Choose a certificate file to upload.')
  const validated = validateCertificate(file.name, file.type, new Uint8Array(await file.arrayBuffer()))

  // Fail before touching the database when Drive isn't set up at all.
  if (!ctx.drive.configured) throw driveErrorToApi(new DriveError('drive_not_configured', 'not configured'))

  const { row, replay } = await claimUpload(ctx, caller, { achievementId, uploadId, category, title, issuer, issueDate, validated })
  if (replay) return json({ certificate: toView(row), idempotent: true }, 200)

  const stored = await performUpload(ctx, row, validated.bytes, validated.mimeType)
  await retireReplaced(ctx, caller.id, achievementId)
  return json({ certificate: toView(stored) }, 201)
}

interface ClaimInput {
  achievementId: string
  uploadId: string
  category: string
  title: string | null
  issuer: string | null
  issueDate: string | null
  validated: { mimeType: string; fileName: string; sizeBytes: number; bytes: Uint8Array }
}

/**
 * Find or create the `pending` row for this upload, deciding what a repeat or
 * overlapping request means. `replay` is true when the upload had already
 * completed, so the caller can answer from the stored row.
 */
async function claimUpload(ctx: Ctx, caller: Caller, input: ClaimInput): Promise<{ row: CertificateRow; replay: boolean }> {
  const inProgress = () => new ApiError(409, 'upload_in_progress', 'This certificate is already being uploaded. Wait a moment and try again.', true)

  const hash = await sha256Hex(input.validated.bytes)
  const existing = await db(ctx.db.findByUploadId(input.uploadId))
  if (existing) {
    // A retry must be the very same file; a different file needs a new upload id.
    if (existing.student_id !== caller.id || existing.achievement_id !== input.achievementId || (existing.sha256 && existing.sha256 !== hash)) {
      throw new ApiError(409, 'upload_conflict', 'This upload reference is already in use. Start the upload again.')
    }
    if (existing.storage_status === 'stored') return { row: existing, replay: true }
    if (existing.storage_status === 'replaced' || existing.storage_status === 'removed') {
      throw new ApiError(409, 'upload_closed', 'This upload has already been completed and replaced. Start a new upload.')
    }
    if (existing.storage_status === 'pending' && !isStale(ctx, existing)) {
      // Recent and unfinished: either another request is mid-upload, or an earlier one got the file into
      // Drive and then failed to save its row. If the file is already in Drive there is nothing left to
      // upload, only the row to complete — and completing it is idempotent, so it is safe to do here.
      const inDrive = existing.drive_folder_id
        ? await ctx.drive.findByUploadId(existing.drive_folder_id, existing.upload_id).catch(() => null)
        : null
      if (!inDrive) throw inProgress()
      return { row: existing, replay: false }
    }
    // A failed or interrupted attempt: take it over. The guard makes sure only one request wins.
    const guard: Where =
      existing.storage_status === 'failed'
        ? { id: existing.id, storage_status: 'failed' }
        : { id: existing.id, storage_status: 'pending', updated_at: existing.updated_at }
    // Taking over an unfinished attempt: it is the same file, but the student may have corrected the details meanwhile.
    const claimed = await db(
      ctx.db.updateCertificates(guard, { storage_status: 'pending', failure_code: null, category: input.category, title: input.title, issuer: input.issuer, issue_date: input.issueDate }),
    )
    if (claimed.length === 0) throw inProgress()
    return { row: claimed[0], replay: false }
  }

  // Only this student's own rows count: the same achievement id used by anyone else is a different achievement.
  const live = await db(ctx.db.liveForAchievement(caller.id, input.achievementId))
  if (live.some((r) => r.storage_status === 'pending' && !isStale(ctx, r))) throw inProgress()
  for (const stale of live.filter((r) => r.storage_status === 'pending')) {
    await db(ctx.db.updateCertificates({ id: stale.id, storage_status: 'pending' }, { storage_status: 'failed', failure_code: 'superseded' }))
  }

  const profile = caller.profile
  try {
    const row = await ctx.db.insertCertificate({
      upload_id: input.uploadId,
      achievement_id: input.achievementId,
      student_id: caller.id,
      department: profile.department,
      admission_batch: admissionBatch(profile.register_number!, profile.year, ctx.deps.now()),
      register_number: profile.register_number,
      category: input.category,
      title: input.title,
      issuer: input.issuer,
      issue_date: input.issueDate,
      original_filename: input.validated.fileName,
      mime_type: input.validated.mimeType,
      size_bytes: input.validated.sizeBytes,
      sha256: hash,
      storage_status: 'pending',
    })
    return { row, replay: false }
  } catch (err) {
    if (err instanceof DbError) {
      if (err.isUniqueViolation) throw inProgress()
      console.error(JSON.stringify({ event: 'database_error', code: err.code, detail: err.detail }))
      throw new ApiError(503, 'database_unavailable', 'The records database could not be reached. Try again in a moment.', true)
    }
    throw err
  }
}

/** Steps 3 and 4: Drive, then the atomic row update. Returns the stored row. */
async function performUpload(ctx: Ctx, row: CertificateRow, bytes: Uint8Array, mimeType: string): Promise<CertificateRow> {
  let folderId: string
  let driveFileId: string
  try {
    await ctx.drive.assertPrivateRoot()
    const path = certificateFolderPath({ year: uploadYear(row.created_at), department: row.department, registerNumber: row.register_number })
    try {
      folderId = await ctx.drive.ensureFolderPath(path)
    } catch (err) {
      // A cached folder may have been deleted in Drive; look again from scratch once.
      if (!(err instanceof DriveError) || err.code !== 'drive_folder_missing') throw err
      ctx.drive.forgetFolders()
      try {
        folderId = await ctx.drive.ensureFolderPath(path)
      } catch (again) {
        // Still "not found" after starting over: usually the configured root folder isn't shared with
        // the account. Say that, rather than a vague "folder missing".
        if (again instanceof DriveError && again.code === 'drive_folder_missing') {
          const root = await ctx.drive.checkRoot()
          if (!root.ok) {
            const known: DriveErrorCode[] = ['drive_auth_failed', 'drive_unavailable', 'drive_not_configured', 'drive_quota', 'drive_rate_limited']
            throw new DriveError(known.find((c) => c === root.code) ?? 'drive_folder_inaccessible', root.message)
          }
        }
        throw again
      }
    }
    await db(ctx.db.updateCertificates({ id: row.id, storage_status: 'pending' }, { drive_folder_id: folderId }))

    // An earlier attempt may already have put this exact upload in Drive.
    const earlier = await ctx.drive.findByUploadId(folderId, row.upload_id)
    // Meaningful, browsable name: 2023AIDS0417_Hackathon_Certificate.pdf (…_2.pdf for a second one in the same category).
    const file =
      earlier ??
      (await ctx.drive.uploadFile({
        folderId,
        name: pickFileName(await ctx.drive.listFileNames(folderId), certificateBaseName(row.register_number, row.category), EXTENSION[mimeType as keyof typeof EXTENSION] ?? 'bin'),
        mimeType,
        bytes,
        appProperties: { uploadId: row.upload_id, achievementId: row.achievement_id, studentId: row.student_id },
      }))
    driveFileId = file.id
  } catch (err) {
    if (err instanceof DriveError) {
      await db(ctx.db.updateCertificates({ id: row.id, storage_status: 'pending' }, { storage_status: 'failed', failure_code: err.code })).catch(() => undefined)
      throw driveErrorToApi(err)
    }
    throw err
  }

  const stored = await finalize(ctx, row, driveFileId, folderId)
  if (!stored) {
    throw new ApiError(
      503,
      'metadata_save_failed',
      'Your certificate reached storage but could not be recorded yet. Try submitting again — it will not be uploaded twice.',
      true,
    )
  }
  return stored
}

/** Mark the row stored. Retries transient failures; returns null if the row could not be updated. */
async function finalize(ctx: Ctx, row: CertificateRow, driveFileId: string, folderId: string): Promise<CertificateRow | null> {
  for (let attempt = 1; attempt <= FINALIZE_ATTEMPTS; attempt++) {
    try {
      return await ctx.db.finalizeUpload(row.upload_id, driveFileId, folderId)
    } catch (err) {
      if (!(err instanceof DbError)) throw err
      // Someone else may have finished it first; that's fine.
      const current = await ctx.db.findByUploadId(row.upload_id).catch(() => null)
      if (current?.storage_status === 'stored') return current
      // Only a database hiccup is worth retrying; "already closed" or "stored under another file" will not change.
      if (err.code !== 'db') return null
      if (attempt < FINALIZE_ATTEMPTS) await ctx.deps.sleep(200 * attempt)
    }
  }
  return null
}

/** Trash the Drive files of certificates this achievement has outgrown. Best effort: the flag stays set if it fails. */
async function retireReplaced(ctx: Ctx, studentId: string, achievementId: string): Promise<void> {
  try {
    const rows = await ctx.db.needingDriveCleanup(50, studentId, achievementId)
    for (const r of rows) await cleanupRow(ctx, r)
  } catch {
    /* the reconcile job will pick these up */
  }
}

async function cleanupRow(ctx: Ctx, row: CertificateRow): Promise<boolean> {
  try {
    if (row.drive_file_id) await ctx.drive.trash(row.drive_file_id)
  } catch (err) {
    // Already gone counts as done; anything else leaves the flag for the next pass.
    if (!(err instanceof DriveError && err.code === 'drive_file_missing')) return false
  }
  await ctx.db.updateCertificates({ id: row.id }, { drive_cleanup_pending: false }).catch(() => undefined)
  return true
}

// ── Look up and stream ───────────────────────────────────────────────────────

const notAvailable = () => new ApiError(404, 'certificate_not_available', 'Certificate not available.')

/** Authorisation for one row. Faculty are checked against the owner's *current* department. */
async function mayView(ctx: Ctx, caller: Caller, row: CertificateRow): Promise<boolean> {
  if (caller.role === 'faculty') {
    const owner = await db(ctx.db.getUser(row.student_id))
    return canViewCertificate(caller, row.student_id, owner?.department ?? row.department)
  }
  return canViewCertificate(caller, row.student_id, row.department)
}

/** Unknown id, someone else's certificate and out-of-scope all look identical: 404. */
async function loadAuthorised(ctx: Ctx, caller: Caller, id: string): Promise<CertificateRow> {
  if (!isUuid(id)) throw notAvailable()
  const row = await db(ctx.db.getCertificate(id))
  if (!row || !(await mayView(ctx, caller, row))) throw notAvailable()
  return row
}

export async function getCertificateMeta(ctx: Ctx, caller: Caller, id: string): Promise<Response> {
  const row = await loadAuthorised(ctx, caller, id)
  if (row.storage_status !== 'stored') throw notAvailable()
  return json({ certificate: toView(row) })
}

/**
 * Achievement ids are chosen by browsers, so they are only unique per student. A student can therefore only ever look up
 * their own; faculty and admin must say whose achievement they mean (and are then checked against that student's department).
 */
export async function getCertificateByAchievement(ctx: Ctx, caller: Caller, achievementId: string, studentId: string | null): Promise<Response> {
  requireAchievementId(achievementId)
  let owner = caller.id
  if (caller.role !== 'student') {
    if (!studentId || !isUuid(studentId)) throw new ApiError(400, 'student_required', 'Say which student this achievement belongs to.')
    owner = studentId.toLowerCase()
  }
  const rows = await db(ctx.db.storedForAchievement(owner, achievementId))
  for (const row of rows) {
    if (await mayView(ctx, caller, row)) return json({ certificate: toView(row) })
  }
  throw notAvailable()
}

export async function serveCertificateFile(ctx: Ctx, caller: Caller, id: string, disposition: 'inline' | 'attachment'): Promise<Response> {
  const row = await loadAuthorised(ctx, caller, id)
  if (row.storage_status !== 'stored' || !row.drive_file_id) throw notAvailable()

  let upstream: Response
  try {
    upstream = await ctx.drive.download(row.drive_file_id)
  } catch (err) {
    if (err instanceof DriveError) throw driveErrorToApi(err)
    throw err
  }
  const headers = new Headers({
    // The type was verified from the file's own bytes at upload; never trust Drive's guess.
    'Content-Type': row.mime_type,
    'Content-Disposition': contentDisposition(disposition, row.original_filename),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'none'; sandbox",
  })
  const length = upstream.headers.get('content-length')
  if (length) headers.set('Content-Length', length)
  return new Response(upstream.body, { status: 200, headers })
}

export function contentDisposition(kind: 'inline' | 'attachment', fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

// ── Admin ────────────────────────────────────────────────────────────────────

export async function removeCertificate(ctx: Ctx, caller: Caller, id: string): Promise<Response> {
  if (!canManageCertificates(caller)) throw new ApiError(403, 'forbidden', 'Only administrators can remove certificates.')
  if (!isUuid(id)) throw notAvailable()
  const row = await db(ctx.db.getCertificate(id))
  if (!row || row.storage_status === 'removed') throw notAvailable()
  const [updated] = await db(ctx.db.updateCertificates({ id }, { storage_status: 'removed', drive_cleanup_pending: !!row.drive_file_id }))
  await ctx.db.audit(caller.id, 'certificate_removed', row.student_id, `certificate ${id}`)
  console.info(JSON.stringify({ event: 'certificate_removed', certificateId: id, by: caller.id }))
  await cleanupRow(ctx, updated ?? row)
  return json({ certificate: toView(updated ?? row), removed: true })
}

export async function storageStatus(ctx: Ctx, caller: Caller): Promise<Response> {
  if (!canManageCertificates(caller)) throw new ApiError(403, 'forbidden', 'Only administrators can check storage.')
  return json({ storage: await ctx.drive.checkRoot() })
}

export interface ReconcileReport {
  adopted: number
  abandoned: number
  cleaned: number
  errors: number
  orphans?: { fileId: string; name: string; trashed: boolean }[]
}

export async function reconcileRoute(ctx: Ctx, caller: Caller, url: URL): Promise<Response> {
  if (!canManageCertificates(caller)) throw new ApiError(403, 'forbidden', 'Only administrators can run reconciliation.')
  const report = await reconcile(ctx, { scanOrphans: url.searchParams.get('orphans') === '1', trashOrphans: url.searchParams.get('trash') === '1' })
  return json({ report })
}

/**
 * Safety net for the cases a request couldn't finish on its own:
 *  - stale `pending` rows: adopt the Drive file if there is one, else mark failed;
 *  - rows still flagged for Drive clean-up: trash the file;
 *  - optionally, Drive files this app created that no row accounts for.
 * Orphans are only reported unless `trashOrphans` is set.
 */
export async function reconcile(ctx: Ctx, options: { scanOrphans?: boolean; trashOrphans?: boolean } = {}): Promise<ReconcileReport> {
  const report: ReconcileReport = { adopted: 0, abandoned: 0, cleaned: 0, errors: 0 }
  if (!ctx.drive.configured) return report

  const cutoff = new Date(ctx.deps.now().getTime() - staleMs(ctx.env)).toISOString()
  const pending = await db(ctx.db.stalePending(cutoff, 50))
  for (const row of pending) {
    try {
      const found = row.drive_folder_id ? await ctx.drive.findByUploadId(row.drive_folder_id, row.upload_id) : null
      if (found) {
        await ctx.db.finalizeUpload(row.upload_id, found.id, row.drive_folder_id!)
        report.adopted++
      } else {
        await ctx.db.updateCertificates({ id: row.id, storage_status: 'pending' }, { storage_status: 'failed', failure_code: 'abandoned' })
        report.abandoned++
      }
    } catch {
      report.errors++
    }
  }

  const cleanup = await db(ctx.db.needingDriveCleanup(50))
  for (const row of cleanup) (await cleanupRow(ctx, row)) ? report.cleaned++ : report.errors++

  if (options.scanOrphans) report.orphans = await scanOrphans(ctx, !!options.trashOrphans)
  return report
}

async function scanOrphans(ctx: Ctx, trash: boolean): Promise<NonNullable<ReconcileReport['orphans']>> {
  const orphans: NonNullable<ReconcileReport['orphans']> = []
  let pageToken: string | undefined
  for (let page = 0; page < 10; page++) {
    const { files, nextPageToken } = await ctx.drive.listAppFiles(pageToken)
    if (files.length > 0) {
      const knownIds = await db(ctx.db.knownDriveFileIds(files.map((f) => f.id)))
      for (const file of files.filter((f) => !knownIds.has(f.id))) {
        const uploadId = file.appProperties?.uploadId
        // A pending row for this upload means it is merely mid-flight, not orphaned.
        if (uploadId && (await db(ctx.db.findByUploadId(uploadId)))) continue
        let trashed = false
        if (trash) trashed = await ctx.drive.trash(file.id).then(() => true, () => false)
        orphans.push({ fileId: file.id, name: file.name, trashed })
      }
    }
    if (!nextPageToken) break
    pageToken = nextPageToken
  }
  return orphans
}

// ── Listing ──────────────────────────────────────────────────────────────────

/**
 * GET /api/certificates — the stored certificates this person may see, newest first. A student gets their own, faculty
 * get those of students currently in a department they cover, an administrator gets all. The scope is applied in SQL
 * from the caller's role in the database; `studentId`, `category` and `achievementId` can only narrow it further.
 */
export async function listCertificatesRoute(ctx: Ctx, caller: Caller, url: URL): Promise<Response> {
  const studentId = url.searchParams.get('studentId')
  if (studentId && !isUuid(studentId)) throw new ApiError(400, 'invalid_student_id', 'The student reference is malformed.')
  const achievementId = url.searchParams.get('achievementId')
  if (achievementId) requireAchievementId(achievementId)
  const category = url.searchParams.get('category')
  if (category) requireCategory(category)
  const batch = url.searchParams.get('batch')
  if (batch && !/^(\d{4}|unknown)$/.test(batch)) throw new ApiError(400, 'invalid_batch', 'The batch must be a year such as 2023.')
  const department = url.searchParams.get('department')?.trim().slice(0, 40)
  const q = url.searchParams.get('q')?.trim().slice(0, 80)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)

  const departments = caller.role === 'faculty' ? facultyScope(caller.profile) : []
  const { items, total, facets } = await db(
    ctx.db.listCertificates(
      { role: caller.role, userId: caller.id, departments },
      { studentId: studentId?.toLowerCase() || undefined, category: category || undefined, achievementId: achievementId || undefined, department: department || undefined, batch: batch || undefined, q: q || undefined },
      limit,
      offset,
    ),
  )
  return json({ certificates: items, total, limit, offset, facets })
}