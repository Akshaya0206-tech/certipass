import { beforeEach, describe, expect, it } from 'vitest'
import { reconcile } from '../src/certificates'
import { makeCtx } from '../src/index'
import { IDS, JPG, PDF, PNG, ROOT, body, makeWorld, seedStored, upload } from './harness'
import type { World } from './harness'

let w: World
beforeEach(async () => {
  w = await makeWorld()
})

const driveWrites = (world: World) => world.drive.calls.filter((c) => c.method !== 'GET').length

describe('upload: the happy path', () => {
  it('stores the real file in Drive, under CertiPass/year/department/student id/Certificates', async () => {
    const bytes = PDF()
    const res = await upload(w, { bytes, name: 'My Hackathon Certificate.pdf', category: 'Hackathon', achievementId: 'ach-77' })
    expect(res.status).toBe(201)

    const files = w.drive.uploads()
    expect(files).toHaveLength(1)
    expect(w.drive.pathOf(files[0])).toBe('CertiPass/2026/CSE/2023CSE0417/Certificates/2023CSE0417_Hackathon_Certificate.pdf')
    expect([...files[0].bytes!]).toEqual([...bytes])
    expect(files[0].mimeType).toBe('application/pdf')
    expect(files[0].appProperties.achievementId).toBe('ach-77')
  })

  it('saves the metadata and answers only after both halves succeeded', async () => {
    const res = await upload(w, { achievementId: 'ach-1', name: 'cert.pdf' })
    const out = await body(res)
    expect(out.certificate).toMatchObject({ achievementId: 'ach-1', fileName: 'cert.pdf', mimeType: 'application/pdf', sizeBytes: PDF().length })
    expect(out.certificate.uploadedAt).toBeTruthy()

    expect(w.certs).toHaveLength(1)
    const row = w.certs[0]
    expect(row).toMatchObject({
      student_id: IDS.aarav,
      achievement_id: 'ach-1',
      storage_status: 'stored',
      original_filename: 'cert.pdf',
      mime_type: 'application/pdf',
      department: 'CSE',
      admission_batch: '2023',
      register_number: '2023CSE0417',
    })
    expect(row.drive_file_id).toBe(w.drive.uploads()[0].id)
    expect(row.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('never reveals a Drive id to the client', async () => {
    const res = await upload(w)
    const text = await res.text()
    expect(text).not.toContain(w.drive.uploads()[0].id)
    expect(text).not.toContain('drive_file_id')
  })

  it('never shares the file: no permission is ever created', async () => {
    await upload(w)
    expect(w.drive.permissionCalls).toBe(0)
  })

  it('accepts JPG and PNG', async () => {
    expect((await upload(w, { achievementId: 'a-jpg', name: 'c.jpg', type: 'image/jpeg', bytes: JPG() })).status).toBe(201)
    expect((await upload(w, { achievementId: 'a-png', name: 'c.png', type: 'image/png', bytes: PNG() })).status).toBe(201)
  })

  it('names the Drive file from the student and category, never from what the student called it', async () => {
    await upload(w, { name: '../../evil/name.pdf' })
    const [file] = w.drive.uploads()
    expect(w.drive.pathOf(file)).toBe('CertiPass/2026/CSE/2023CSE0417/Certificates/2023CSE0417_Hackathon_Certificate.pdf')
    // The student's own (sanitised) file name is still kept in the database, and is what a download is called.
    expect(w.certs[0].original_filename).toBe('name.pdf')
  })

  it('uses the right extension for each type', async () => {
    await upload(w, { achievementId: 'a-jpg', name: 'scan.jpeg', type: 'image/jpeg', bytes: JPG() })
    await upload(w, { achievementId: 'a-png', name: 'scan.PNG', type: 'image/png', bytes: PNG() })
    expect(w.drive.uploads().map((f) => f.name).sort()).toEqual(['2023CSE0417_Hackathon_Certificate.jpg', '2023CSE0417_Hackathon_Certificate.png'])
  })

  it('gives a second certificate in the same category its own name instead of a confusing duplicate', async () => {
    await upload(w, { achievementId: 'a1' })
    await upload(w, { achievementId: 'a2' })
    await upload(w, { achievementId: 'a3' })
    expect(w.drive.uploads().map((f) => f.name).sort()).toEqual([
      '2023CSE0417_Hackathon_Certificate.pdf',
      '2023CSE0417_Hackathon_Certificate_2.pdf',
      '2023CSE0417_Hackathon_Certificate_3.pdf',
    ])
  })

  it('keeps the same name when a failed upload is retried', async () => {
    const uploadId = crypto.randomUUID()
    w.db.failNext((c) => c.kind === 'batch', 3)
    await upload(w, { uploadId })
    const first = w.drive.uploads().map((f) => f.name)
    await upload(w, { uploadId })
    expect(w.drive.uploads().map((f) => f.name)).toEqual(first)
  })

  it('writes a multi-word category with hyphens', async () => {
    await upload(w, { category: 'Paper Presentation' })
    expect(w.drive.pathOf(w.drive.uploads()[0])).toBe('CertiPass/2026/CSE/2023CSE0417/Certificates/2023CSE0417_Paper-Presentation_Certificate.pdf')
  })

  it('handles a plain numeric register number, with the batch taken from the year of study', async () => {
    // A third-year student in October 2026 joined in 2024.
    w.setUser('aarav', { register_number: '241801058' })
    await upload(w)
    expect(w.drive.pathOf(w.drive.uploads()[0])).toBe('CertiPass/2026/CSE/241801058/Certificates/241801058_Hackathon_Certificate.pdf')
    expect(w.certs[0].admission_batch).toBe('2024') // the batch is still recorded, for filtering
  })
})

describe('upload: folders', () => {
  it('reuses existing folders and does not create duplicates', async () => {
    await upload(w, { achievementId: 'a1' })
    const after1 = w.drive.folders().length
    await upload(w, { achievementId: 'a2' })
    expect(w.drive.folders()).toHaveLength(after1)
    expect(after1).toBe(5) // CertiPass / batch / department / register number / category
  })

  it('does not duplicate folders when uploads arrive at the same moment', async () => {
    await Promise.all([upload(w, { achievementId: 'a1' }), upload(w, { achievementId: 'a2' }), upload(w, { who: 'diya', achievementId: 'a3' })])
    const names = w.drive.folders().map((f) => w.drive.pathOf(f))
    expect(new Set(names).size).toBe(names.length)
    expect(w.drive.uploads()).toHaveLength(3)
  })

  it('reuses a folder someone already created by hand in Drive', async () => {
    w.drive.files.set('manual', { id: 'manual', name: 'CertiPass', mimeType: 'application/vnd.google-apps.folder', parents: [ROOT], trashed: false, createdTime: '2020-01-01T00:00:00Z', appProperties: {} })
    await upload(w)
    expect(w.drive.folders().filter((f) => f.name === 'CertiPass')).toHaveLength(1)
    expect(w.drive.pathOf(w.drive.uploads()[0])).toContain('CertiPass/2026/CSE')
  })

  it('separates students and categories', async () => {
    await upload(w, { achievementId: 'a1', category: 'Sports' })
    await upload(w, { who: 'ece', achievementId: 'a2', category: 'Workshop' })
    const paths = w.drive.uploads().map((f) => w.drive.pathOf(f))
    expect(paths).toContain('CertiPass/2026/CSE/2023CSE0417/Certificates/2023CSE0417_Sports_Certificate.pdf')
    expect(paths).toContain('CertiPass/2026/ECE/2022ECE0101/Certificates/2022ECE0101_Workshop_Certificate.pdf')
  })
})

describe('upload: who may upload', () => {
  it('requires a bearer token', async () => {
    const res = await upload(w, { who: null })
    expect(res.status).toBe(401)
    expect((await body(res)).error.code).toBe('unauthenticated')
    expect(w.drive.calls).toHaveLength(0)
  })

  it('rejects an invalid or revoked token', async () => {
    const res = await w.request('/api/certificates', null, { method: 'POST', headers: { Authorization: 'Bearer not-a-real-token' } })
    expect(res.status).toBe(401)
  })

  it('does not trust a user’s own claims: the role comes from the profiles table', async () => {
    // A faculty member cannot upload even though the request is otherwise perfectly valid.
    const res = await upload(w, { who: 'meera' })
    expect(res.status).toBe(403)
    expect((await upload(w, { who: 'admin' })).status).toBe(403)
    expect(w.drive.uploads()).toHaveLength(0)
    expect(w.certs).toHaveLength(0)
  })

  it('rejects a deactivated account', async () => {
    w.setUser('aarav', { status: 'inactive' })
    const res = await upload(w)
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('account_inactive')
  })

  it('rejects an account that is still waiting for approval', async () => {
    w.setUser('aarav', { status: 'pending' })
    const res = await upload(w)
    expect(res.status).toBe(403)
    expect((await body(res)).error.code).toBe('account_pending')
    expect(w.drive.calls).toHaveLength(0)
  })

  it('rejects a session whose account has since been removed', async () => {
    w.db.exec('DELETE FROM users WHERE id = ?', IDS.aarav) // the session goes with it
    const res = await upload(w)
    expect(res.status).toBe(401)
    expect((await body(res)).error.code).toBe('invalid_token')
  })
})

describe('upload: file validation happens on the server', () => {
  const untouched = () => {
    expect(w.drive.calls).toHaveLength(0)
    expect(w.certs).toHaveLength(0)
  }

  it('rejects a text file renamed to .pdf', async () => {
    const res = await upload(w, { bytes: new TextEncoder().encode('not a pdf at all') })
    expect(res.status).toBe(415)
    expect((await body(res)).error.code).toBe('signature_mismatch')
    untouched()
  })

  it('rejects an unsupported format and a MIME mismatch', async () => {
    expect((await body(await upload(w, { name: 'c.docx', type: '' }))).error.code).toBe('unsupported_type')
    expect((await body(await upload(w, { type: 'image/png' }))).error.code).toBe('type_mismatch')
    untouched()
  })

  it('rejects an empty file', async () => {
    expect((await body(await upload(w, { bytes: new Uint8Array(0) }))).error.code).toBe('empty_file')
    untouched()
  })

  it('rejects a file over 10 MB without storing anything', async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1)
    big.set(PDF())
    const res = await upload(w, { bytes: big })
    expect(res.status).toBe(413)
    untouched()
  })

  it('rejects malformed ids and categories', async () => {
    expect((await body(await upload(w, { achievementId: '../x' }))).error.code).toBe('invalid_achievement_id')
    expect((await body(await upload(w, { uploadId: 'nope' }))).error.code).toBe('invalid_upload_id')
    expect((await body(await upload(w, { category: 'Made Up' }))).error.code).toBe('invalid_category')
    untouched()
  })

  it('rejects a request that is not multipart', async () => {
    const res = await w.request('/api/certificates', 'aarav', { method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' } })
    expect(res.status).toBe(415)
  })
})

describe('upload: duplicates and retries', () => {
  it('treats a repeat of a finished upload as success without uploading again', async () => {
    const uploadId = crypto.randomUUID()
    const first = await upload(w, { uploadId })
    const again = await upload(w, { uploadId })
    expect(first.status).toBe(201)
    expect(again.status).toBe(200)
    const out = await body(again)
    expect(out.idempotent).toBe(true)
    expect(out.certificate.id).toBe((await body(first)).certificate.id)
    expect(w.drive.uploads()).toHaveLength(1)
    expect(w.certs).toHaveLength(1)
  })

  it('stores a double-click once', async () => {
    const uploadId = crypto.randomUUID()
    const results = await Promise.all([upload(w, { uploadId }), upload(w, { uploadId })])
    const statuses = results.map((r) => r.status).sort()
    // One request wins; the other is either told to wait or sees the finished result.
    expect(statuses[0]).toBeLessThan(300)
    expect(w.drive.uploads()).toHaveLength(1)
    expect(w.certs.filter((c) => c.storage_status === 'stored')).toHaveLength(1)
  })

  it('refuses to reuse an upload id for a different file', async () => {
    const uploadId = crypto.randomUUID()
    await upload(w, { uploadId })
    const res = await upload(w, { uploadId, bytes: new Uint8Array([...PDF(), 9, 9]) })
    expect(res.status).toBe(409)
    expect((await body(res)).error.code).toBe('upload_conflict')
  })

  it('refuses an upload id that belongs to another student', async () => {
    const uploadId = crypto.randomUUID()
    await upload(w, { uploadId })
    const res = await upload(w, { who: 'diya', uploadId, achievementId: 'ach-1' })
    expect(res.status).toBe(409)
  })

  it('treats the same achievement id from two students as two separate achievements, so nobody can pre-claim or block another', async () => {
    const aarav = await upload(w, { achievementId: 'shared' })
    const diya = await upload(w, { who: 'diya', achievementId: 'shared' })
    expect(aarav.status).toBe(201)
    expect(diya.status).toBe(201)
    expect(w.drive.uploads()).toHaveLength(2)
    const stored = w.certs.filter((c) => c.storage_status === 'stored')
    expect(stored.map((c) => c.student_id).sort()).toEqual([IDS.aarav, IDS.diya].sort())
  })

  it('does not retire or trash another student’s certificate when replacing your own', async () => {
    const aarav = await seedStored(w, { achievementId: 'shared' })
    await seedStored(w, { who: 'diya', achievementId: 'shared' })
    const aaravFile = w.drive.uploads().find((f) => f.appProperties?.studentId === IDS.aarav)!
    // Diya replaces her certificate; Aarav's must be untouched.
    const res = await upload(w, { who: 'diya', achievementId: 'shared', name: 'better.pdf', bytes: new Uint8Array([...PDF(), 8]) })
    expect(res.status).toBe(201)
    expect(w.certs.find((c) => c.id === aarav.id)!.storage_status).toBe('stored')
    expect(aaravFile.trashed).toBe(false)
    expect(w.certs.filter((c) => c.storage_status === 'stored')).toHaveLength(2)
  })

  it('records every upload under the signed-in student, whatever the form says', async () => {
    const form = new FormData()
    form.set('achievementId', 'ach-x')
    form.set('uploadId', crypto.randomUUID())
    form.set('category', 'Hackathon')
    form.set('studentId', IDS.diya) // fields the Worker does not know about are ignored
    form.set('student_id', IDS.diya)
    form.set('file', new File([PDF()], 'c.pdf', { type: 'application/pdf' }))
    const res = await w.request('/api/certificates', 'aarav', { method: 'POST', body: form })
    expect(res.status).toBe(201)
    expect(w.certs[0].student_id).toBe(IDS.aarav)
  })

  it('replaces a certificate: the new one is stored, the old one is retired and trashed', async () => {
    const first = await seedStored(w, { achievementId: 'ach-r' })
    const oldFile = w.drive.uploads()[0]
    const res = await upload(w, { achievementId: 'ach-r', name: 'better.pdf', bytes: new Uint8Array([...PDF(), 1, 2, 3]) })
    expect(res.status).toBe(201)

    const rows = w.certs
    expect(rows.find((r) => r.id === first.id)!.storage_status).toBe('replaced')
    expect(rows.filter((r) => r.storage_status === 'stored')).toHaveLength(1)
    expect(oldFile.trashed).toBe(true)
    expect(rows.find((r) => r.id === first.id)!.drive_cleanup_pending).toBe(false)
  })

  it('keeps the old Drive file flagged for clean-up when trashing fails, and reconcile finishes it', async () => {
    await seedStored(w, { achievementId: 'ach-r' })
    const oldFile = w.drive.uploads()[0]
    w.drive.failNext((c) => c.method === 'PATCH', 503, 5)
    const res = await upload(w, { achievementId: 'ach-r', bytes: new Uint8Array([...PDF(), 7]) })
    expect(res.status).toBe(201) // the replacement itself succeeded
    expect(oldFile.trashed).toBe(false)
    expect(w.certs.find((r) => r.drive_file_id === oldFile.id)!.drive_cleanup_pending).toBe(true)

    w.drive.failures = []
    const report = await reconcile(makeCtx(w.env, w.deps))
    expect(report.cleaned).toBe(1)
    expect(oldFile.trashed).toBe(true)
  })
})

describe('upload: failures', () => {
  it('reports a temporary Drive outage as retryable and records nothing as stored', async () => {
    w.drive.failNext((c) => c.url.startsWith('/upload/'), 503, 10)
    const uploadId = crypto.randomUUID()
    const res = await upload(w, { uploadId })
    expect(res.status).toBe(503)
    const err = (await body(res)).error
    expect(err).toMatchObject({ code: 'drive_unavailable', retryable: true })
    expect(w.certs.some((c) => c.storage_status === 'stored')).toBe(false)
    expect(w.certs[0]).toMatchObject({ storage_status: 'failed', failure_code: 'drive_unavailable' })
    expect(w.drive.uploads()).toHaveLength(0)
  })

  it('succeeds on retry with the same upload id once Drive recovers', async () => {
    const uploadId = crypto.randomUUID()
    w.drive.failNext((c) => c.url.startsWith('/upload/'), 503, 10)
    expect((await upload(w, { uploadId })).status).toBe(503)

    w.drive.failures = []
    const retry = await upload(w, { uploadId })
    expect(retry.status).toBe(201)
    expect(w.certs).toHaveLength(1)
    expect(w.certs[0].storage_status).toBe('stored')
    expect(w.drive.uploads()).toHaveLength(1)
  })

  it('retries a transient Drive error by itself', async () => {
    w.drive.failNext((c) => c.url.startsWith('/upload/'), 503, 1)
    const res = await upload(w)
    expect(res.status).toBe(201)
  })

  it('explains an inaccessible root folder and does not call it retryable', async () => {
    // The share link may open in a browser, yet the API account may not be able to see the folder at all.
    w.drive.rootVisible = false
    const res = await upload(w)
    expect(res.status).toBe(503)
    const err = (await body(res)).error
    expect(err).toMatchObject({ code: 'drive_folder_inaccessible', retryable: false })
    expect(err.message).toMatch(/sharing permissions/)
    expect(w.certs[0]).toMatchObject({ storage_status: 'failed', failure_code: 'drive_folder_inaccessible' })
    expect(w.drive.uploads()).toHaveLength(0)
  })

  it('explains a root folder the account can see but not write to', async () => {
    w.drive.rootCanAdd = false
    w.drive.failNext((c) => c.method === 'POST', 404, 5, 'notFound')
    const res = await upload(w)
    expect((await body(res)).error.code).toBe('drive_folder_inaccessible')
  })

  it('reports a folder the account may not write to as non-retryable', async () => {
    w.drive.failNext((c) => c.method === 'POST', 403, 5, 'insufficientFilePermissions')
    const res = await upload(w)
    const err = (await body(res)).error
    expect(err).toMatchObject({ code: 'drive_folder_inaccessible', retryable: false })
    expect(w.certs[0]).toMatchObject({ storage_status: 'failed', failure_code: 'drive_folder_inaccessible' })
  })

  it('reports a full Drive as a quota problem', async () => {
    w.drive.failNext((c) => c.url.startsWith('/upload/'), 403, 5, 'storageQuotaExceeded')
    const res = await upload(w)
    expect(res.status).toBe(507)
    expect((await body(res)).error.code).toBe('drive_quota')
  })

  it('says so plainly when Drive is not configured, and writes nothing', async () => {
    const world = await makeWorld({ GOOGLE_OAUTH_REFRESH_TOKEN: '' })
    const res = await upload(world)
    expect(res.status).toBe(503)
    expect((await body(res)).error.code).toBe('drive_not_configured')
    expect(world.certs).toHaveLength(0)
    expect(world.drive.calls).toHaveLength(0)
  })

  it('says so when Google has revoked the stored credentials', async () => {
    w.drive.tokenFails = true
    const res = await upload(w)
    expect(res.status).toBe(503)
    expect((await body(res)).error.code).toBe('drive_auth_failed')
  })

  it('refreshes an expired access token once and carries on', async () => {
    w.drive.failNext((c) => c.url.startsWith('/drive/v3/files?'), 401, 1)
    const res = await upload(w)
    expect(res.status).toBe(201)
    expect(w.drive.tokenCalls).toBeGreaterThanOrEqual(2)
  })

  it('does not mark a certificate stored when saving the metadata fails, and does not lose the Drive file', async () => {
    w.db.failNext((c) => c.kind === 'batch', 3)
    const uploadId = crypto.randomUUID()
    const res = await upload(w, { uploadId })
    expect(res.status).toBe(503)
    const err = (await body(res)).error
    expect(err).toMatchObject({ code: 'metadata_save_failed', retryable: true })

    expect(w.certs).toHaveLength(1)
    expect(w.certs[0].storage_status).toBe('pending')
    expect(w.certs[0].drive_file_id).toBeNull()
    expect(w.drive.uploads()).toHaveLength(1) // kept, not deleted
  })

  it('completes that upload on retry without uploading the file a second time', async () => {
    w.db.failNext((c) => c.kind === 'batch', 3)
    const uploadId = crypto.randomUUID()
    await upload(w, { uploadId })
    const writesBefore = w.drive.calls.filter((c) => c.url.startsWith('/upload/')).length

    const retry = await upload(w, { uploadId })
    expect(retry.status).toBe(201)
    expect(w.certs[0]).toMatchObject({ storage_status: 'stored', drive_file_id: w.drive.uploads()[0].id })
    expect(w.drive.uploads()).toHaveLength(1)
    expect(w.drive.calls.filter((c) => c.url.startsWith('/upload/')).length).toBe(writesBefore)
  })

  it('reports a database outage before it touches Drive', async () => {
    w.db.failNext((c) => /INSERT INTO certificate_files/i.test(c.sql), 1)
    const res = await upload(w)
    expect(res.status).toBe(503)
    expect((await body(res)).error.code).toBe('database_unavailable')
    expect(driveWrites(w)).toBe(0)
  })

  it('reports a database outage while checking who is signed in as retryable, before anything else happens', async () => {
    w.db.failNext((c) => /FROM sessions/i.test(c.sql), 1)
    const res = await upload(w)
    expect(res.status).toBe(503)
    expect((await body(res)).error).toMatchObject({ code: 'database_unavailable', retryable: true })
    expect(w.drive.calls).toHaveLength(0)
  })
})

describe('upload: a folder that anyone with the link can open', () => {
  it('refuses to put certificates there, because every file would inherit that sharing', async () => {
    w.drive.rootPublic = true
    const res = await upload(w)
    expect(res.status).toBe(503)
    const err = (await body(res)).error
    expect(err).toMatchObject({ code: 'drive_folder_public', retryable: false })
    expect(err.message).toMatch(/Restricted/)
    expect(w.drive.uploads()).toHaveLength(0)
    expect(w.drive.folders()).toHaveLength(0)
    expect(w.drive.calls.some((c) => c.method !== 'GET')).toBe(false)
    expect(w.certs[0]).toMatchObject({ storage_status: 'failed', failure_code: 'drive_folder_public' })
  })

  it('works again, with the same upload id, as soon as the folder is restricted', async () => {
    const uploadId = crypto.randomUUID()
    w.drive.rootPublic = true
    expect((await upload(w, { uploadId })).status).toBe(503)
    w.drive.rootPublic = false
    const retry = await upload(w, { uploadId })
    expect(retry.status).toBe(201)
    expect(w.drive.uploads()).toHaveLength(1)
  })

  it('does not block when Drive does not say who the folder is shared with', async () => {
    w.drive.rootPublic = true
    w.drive.permissionsHidden = true
    expect((await upload(w)).status).toBe(201)
  })

  it('can be allowed explicitly, for a deployment that really wants link-readable certificates', async () => {
    const open = await makeWorld({ ALLOW_PUBLIC_FOLDER: 'true' })
    open.drive.rootPublic = true
    expect((await upload(open)).status).toBe(201)
  })

  it('does not keep re-checking a folder that was already found private', async () => {
    await upload(w, { achievementId: 'a1' })
    const rootReads = () => w.drive.calls.filter((c) => c.url.includes('/files/ROOT_FOLDER') && c.url.includes('permissions')).length
    const before = rootReads()
    await upload(w, { achievementId: 'a2' })
    expect(rootReads()).toBe(before)
  })
})

describe('interrupted uploads and orphans', () => {
  it('adopts a Drive file whose upload was cut short before the row was completed', async () => {
    // Simulate a Worker that died after Drive accepted the file but before the database was updated.
    w.db.failNext((c) => c.kind === 'batch', 3)
    await upload(w)
    expect(w.certs[0].storage_status).toBe('pending')

    w.clock.advance(30)
    const report = await reconcile(makeCtx(w.env, w.deps))
    expect(report.adopted).toBe(1)
    expect(w.certs[0]).toMatchObject({ storage_status: 'stored', drive_file_id: w.drive.uploads()[0].id })
  })

  it('marks an abandoned upload failed when Drive never received the file', async () => {
    w.drive.failNext((c) => c.url.startsWith('/upload/'), 503, 10)
    await upload(w)
    // Force it back to "pending" as if the Worker died before it could record the failure.
    w.setCert({ storage_status: 'pending' })
    w.clock.advance(30)
    const report = await reconcile(makeCtx(w.env, w.deps))
    expect(report.abandoned).toBe(1)
    expect(w.certs[0]).toMatchObject({ storage_status: 'failed', failure_code: 'abandoned' })
  })

  it('leaves a recent pending upload alone', async () => {
    w.db.failNext((c) => c.kind === 'batch', 3)
    await upload(w)
    w.clock.advance(1)
    const report = await reconcile(makeCtx(w.env, w.deps))
    expect(report).toMatchObject({ adopted: 0, abandoned: 0 })
  })

  it('finds Drive files no database row accounts for, and only trashes them when asked', async () => {
    await seedStored(w, { achievementId: 'ok' })
    // A stray file this app created, with no row at all.
    w.drive.files.set('stray', {
      id: 'stray',
      name: 'ghost__cert.pdf',
      mimeType: 'application/pdf',
      parents: [ROOT],
      trashed: false,
      createdTime: '2026-01-01T00:00:00Z',
      appProperties: { certipass: '1', uploadId: crypto.randomUUID() },
      bytes: PDF(),
    })
    // A file someone dropped in by hand is not ours and must never be touched.
    w.drive.files.set('hand', { id: 'hand', name: 'notes.pdf', mimeType: 'application/pdf', parents: [ROOT], trashed: false, createdTime: '2026-01-01T00:00:00Z', appProperties: {}, bytes: PDF() })

    const ctx = makeCtx(w.env, w.deps)
    const report = await reconcile(ctx, { scanOrphans: true })
    expect(report.orphans).toEqual([{ fileId: 'stray', name: 'ghost__cert.pdf', trashed: false }])
    expect(w.drive.files.get('stray')!.trashed).toBe(false)

    const trashed = await reconcile(ctx, { scanOrphans: true, trashOrphans: true })
    expect(trashed.orphans![0].trashed).toBe(true)
    expect(w.drive.files.get('stray')!.trashed).toBe(true)
    expect(w.drive.files.get('hand')!.trashed).toBe(false)
  })
})
