import { beforeEach, describe, expect, it } from 'vitest'
import { IDS, PDF, PNG, body, makeWorld, seedStored, upload } from './harness'
import type { Who, World } from './harness'

let w: World
let cert: { id: string; uploadId: string }
beforeEach(async () => {
  w = await makeWorld()
  // Aarav (CSE) has one stored certificate.
  cert = await seedStored(w, { achievementId: 'ach-1', name: 'Hackathon Winner.pdf' })
})

const mediaFetches = (world: World) => world.drive.calls.filter((c) => c.url.includes('alt=media')).length
const file = (who: Who | null, id = cert.id, query = '') => w.request(`/api/certificates/${id}/file${query}`, who)

describe('previewing and downloading: who can', () => {
  it('lets the student open their own certificate, byte for byte', async () => {
    const res = await file('aarav')
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF())
  })

  it('lets faculty open a certificate for a student in their department', async () => {
    const res = await file('meera')
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PDF())
  })

  it('lets an admin open any certificate', async () => {
    expect((await file('admin')).status).toBe(200)
  })

  it('lets faculty download as well as preview', async () => {
    const res = await file('meera', cert.id, '?disposition=attachment')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-disposition')).toMatch(/^attachment;/)
  })
})

describe('previewing and downloading: who cannot', () => {
  it('requires a bearer token', async () => {
    const res = await file(null)
    expect(res.status).toBe(401)
    expect(mediaFetches(w)).toBe(0)
  })

  it('hides a certificate from a different student, and never asks Drive for it', async () => {
    const res = await file('diya')
    expect(res.status).toBe(404)
    expect((await body(res)).error.code).toBe('certificate_not_available')
    expect(mediaFetches(w)).toBe(0)
  })

  it('hides a certificate from faculty outside the student’s department, and never asks Drive for it', async () => {
    const res = await file('anand') // ECE / EEE only
    expect(res.status).toBe(404)
    expect(mediaFetches(w)).toBe(0)
  })

  it('answers "out of scope" and "does not exist" identically, so nothing leaks', async () => {
    const outOfScope = await file('anand')
    const unknown = await file('anand', crypto.randomUUID())
    expect(outOfScope.status).toBe(unknown.status)
    expect(await outOfScope.json()).toEqual(await unknown.json())
  })

  it('turns away a deactivated faculty account even though the department matches', async () => {
    const res = await file('suresh')
    expect(res.status).toBe(403)
    expect(mediaFetches(w)).toBe(0)
  })

  it('follows a student’s CURRENT department, not the one they uploaded under', async () => {
    w.setUser('aarav', { department: 'ECE' })
    expect((await file('meera')).status).toBe(404) // CSE faculty lose access
    expect((await file('anand')).status).toBe(200) // ECE faculty gain it
  })

  it('treats malformed ids as simply not available', async () => {
    for (const id of ['not-a-uuid', '../../etc/passwd', "1' or '1'='1"]) {
      const res = await file('admin', encodeURIComponent(id))
      expect(res.status).toBe(404)
    }
  })

  it('does not serve a certificate that is not stored', async () => {
    for (const status of ['pending', 'failed', 'replaced', 'removed'] as const) {
      w.setCert({ storage_status: status })
      expect((await file('aarav')).status).toBe(404)
      expect((await file('admin')).status).toBe(404)
    }
    expect(mediaFetches(w)).toBe(0)
  })
})

describe('previewing and downloading: the response', () => {
  it('previews inline by default and downloads on request', async () => {
    expect((await file('aarav')).headers.get('content-disposition')).toMatch(/^inline;/)
    expect((await file('aarav', cert.id, '?disposition=attachment')).headers.get('content-disposition')).toMatch(/^attachment;/)
    expect((await file('aarav', cert.id, '?disposition=bogus')).headers.get('content-disposition')).toMatch(/^inline;/)
  })

  it('is never cached, never sniffed, and sandboxed', async () => {
    const res = await file('aarav')
    expect(res.headers.get('cache-control')).toBe('private, no-store')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('content-security-policy')).toContain('sandbox')
  })

  it('uses the type verified at upload, not whatever Drive claims', async () => {
    w.drive.files.get(w.drive.uploads()[0].id)!.mimeType = 'text/html'
    expect((await file('aarav')).headers.get('content-type')).toBe('application/pdf')
  })

  it('serves an image with its image type', async () => {
    const png = await seedStored(w, { achievementId: 'ach-png', name: 'c.png', type: 'image/png', bytes: PNG() })
    const res = await file('aarav', png.id)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(PNG())
  })

  it('names the file safely, including non-ASCII names', async () => {
    const odd = await seedStored(w, { achievementId: 'ach-odd', name: 'சான்றிதழ் "final".pdf' })
    const header = (await file('aarav', odd.id, '?disposition=attachment')).headers.get('content-disposition')!
    expect(header).toContain("filename*=UTF-8''")
    expect(header).not.toMatch(/filename="[^"]*"[^;]*"/) // no unescaped quote breaks out of the header
  })

  it('carries no Drive id, token or secret in any response', async () => {
    const texts = [await (await w.request(`/api/certificates/${cert.id}`, 'meera')).text(), await (await w.request('/api/certificates/by-achievement/ach-1', 'aarav')).text()]
    const driveId = w.drive.uploads()[0].id
    for (const t of texts) {
      expect(t).not.toContain(driveId)
      expect(t).not.toMatch(/refresh-token|client-secret|service-role-key|tok-\d/)
    }
  })
})

describe('previewing and downloading: when storage misbehaves', () => {
  it('says "not available" when the file has gone from Drive', async () => {
    w.drive.files.delete(w.drive.uploads()[0].id)
    const res = await file('aarav')
    expect(res.status).toBe(404)
    expect((await body(res)).error.code).toBe('certificate_not_available')
  })

  it('reports Drive being down as retryable', async () => {
    w.drive.failNext((c) => c.url.includes('alt=media'), 503, 10)
    const res = await file('aarav')
    expect(res.status).toBe(503)
    expect((await body(res)).error.retryable).toBe(true)
  })

  it('reports revoked Drive credentials without leaking them', async () => {
    w.drive.tokenFails = true
    const { clearDriveCaches } = await import('../src/drive')
    clearDriveCaches()
    const res = await file('aarav')
    expect((await body(res)).error.code).toBe('drive_auth_failed')
  })
})

describe('looking up a certificate', () => {
  const byAchievement = (who: Who | null, achievementId: string, student?: string) =>
    w.request(`/api/certificates/by-achievement/${achievementId}${student ? `?student=${student}` : ''}`, who)

  it('finds the certificate for an achievement for its owner and for faculty in scope', async () => {
    for (const [who, student] of [['aarav', undefined], ['meera', IDS.aarav], ['admin', IDS.aarav]] as const) {
      const res = await byAchievement(who, 'ach-1', student)
      expect(res.status).toBe(200)
      expect((await body(res)).certificate).toMatchObject({ id: cert.id, fileName: 'Hackathon Winner.pdf', mimeType: 'application/pdf' })
    }
  })

  it('says "not available" to anyone else, and for an achievement with no certificate', async () => {
    expect((await byAchievement('diya', 'ach-1')).status).toBe(404)
    expect((await byAchievement('diya', 'ach-1', IDS.aarav)).status).toBe(404) // naming the owner does not help a student
    expect((await byAchievement('anand', 'ach-1', IDS.aarav)).status).toBe(404)
    expect((await byAchievement('meera', 'never-uploaded', IDS.aarav)).status).toBe(404)
    expect((await byAchievement(null, 'ach-1', IDS.aarav)).status).toBe(401)
  })

  it('makes faculty and admin say whose achievement they mean', async () => {
    for (const who of ['meera', 'admin'] as const) {
      const res = await byAchievement(who, 'ach-1')
      expect(res.status).toBe(400)
      expect((await body(res)).error.code).toBe('student_required')
    }
    expect((await byAchievement('meera', 'ach-1', 'not-a-uuid')).status).toBe(400)
  })

  it('only finds a certificate under the student it was uploaded for', async () => {
    // Faculty cover Aarav and Diya, but ach-1 belongs to Aarav.
    expect((await byAchievement('meera', 'ach-1', IDS.diya)).status).toBe(404)
    expect((await byAchievement('admin', 'ach-1', IDS.ece)).status).toBe(404)
  })

  it('keeps two students who happened to use the same achievement id apart', async () => {
    const dia = await seedStored(w, { who: 'diya', achievementId: 'ach-1', name: 'Diya Certificate.pdf', bytes: new Uint8Array([...PDF(), 4, 2]) })
    expect(dia.id).not.toBe(cert.id)
    const seen = async (who: Who, student?: string) => (await body(await byAchievement(who, 'ach-1', student))).certificate
    expect(await seen('aarav')).toMatchObject({ id: cert.id, fileName: 'Hackathon Winner.pdf' })
    expect(await seen('diya')).toMatchObject({ id: dia.id, fileName: 'Diya Certificate.pdf' })
    expect(await seen('meera', IDS.aarav)).toMatchObject({ id: cert.id })
    expect(await seen('meera', IDS.diya)).toMatchObject({ id: dia.id })
    // And neither can open the other's file by id.
    expect((await file('diya', cert.id)).status).toBe(404)
    expect((await file('aarav', dia.id)).status).toBe(404)
  })

  it('returns metadata for one certificate under the same rules', async () => {
    expect((await w.request(`/api/certificates/${cert.id}`, 'meera')).status).toBe(200)
    expect((await w.request(`/api/certificates/${cert.id}`, 'anand')).status).toBe(404)
  })
})

describe('administration', () => {
  it('lets only an admin remove a certificate, and removal also clears the Drive file', async () => {
    for (const who of ['aarav', 'meera'] as const) {
      expect((await w.request(`/api/certificates/${cert.id}`, who, { method: 'DELETE' })).status).toBe(403)
    }
    expect(w.certs[0].storage_status).toBe('stored')

    const res = await w.request(`/api/certificates/${cert.id}`, 'admin', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(w.certs[0].storage_status).toBe('removed')
    expect(w.drive.uploads()[0].trashed).toBe(true)
    expect((await file('aarav')).status).toBe(404)
  })

  it('lets only an admin check storage, and tells them what is wrong', async () => {
    expect((await w.request('/api/storage/status', 'meera')).status).toBe(403)
    expect((await w.request('/api/storage/status', 'aarav')).status).toBe(403)

    const ok = await body((await w.request('/api/storage/status', 'admin')))
    expect(ok.storage).toMatchObject({ ok: true, canAddChildren: true, authMode: 'oauth' })

    w.drive.rootCanAdd = false
    const readOnly = await body(await w.request('/api/storage/status', 'admin'))
    expect(readOnly.storage).toMatchObject({ ok: false, code: 'drive_folder_inaccessible' })

    w.drive.rootVisible = false
    const hidden = await body(await w.request('/api/storage/status', 'admin'))
    expect(hidden.storage).toMatchObject({ ok: false, code: 'drive_folder_inaccessible' })
  })

  it('gives an admin the link to open the folder in Google Drive, and nobody else', async () => {
    const out = await body(await w.request('/api/storage/status', 'admin'))
    expect(out.storage.folderUrl).toBe('https://drive.google.com/drive/folders/ROOT_FOLDER')
    expect(out.storage.publiclyShared).toBe(false)
    for (const who of ['aarav', 'meera'] as const) {
      const res = await w.request('/api/storage/status', who)
      expect(res.status).toBe(403)
      expect(await res.text()).not.toContain('ROOT_FOLDER')
    }
  })

  it('warns an admin when the folder is open to anyone with the link', async () => {
    w.drive.rootPublic = true
    const out = await body(await w.request('/api/storage/status', 'admin'))
    expect(out.storage).toMatchObject({ ok: false, code: 'drive_folder_public', publiclyShared: true })
    expect(out.storage.message).toMatch(/Restricted/)
  })

  it('lets only an admin run reconciliation', async () => {
    expect((await w.request('/api/admin/reconcile', 'meera', { method: 'POST' })).status).toBe(403)
    expect((await w.request('/api/admin/reconcile', 'admin', { method: 'POST' })).status).toBe(200)
  })
})

describe('HTTP surface', () => {
  it('answers /api/health without a token and reveals nothing', async () => {
    const res = await w.request('/api/health', null)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('returns 404 for unknown routes and 401 before it reveals which routes exist', async () => {
    expect((await w.request('/api/nope', 'aarav')).status).toBe(404)
    expect((await w.request('/api/nope', null)).status).toBe(401)
  })

  it('allows only the listed origins, with no wildcard', async () => {
    const allowed = await w.request('/api/health', null, { headers: { Origin: 'https://certipass.test' } })
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://certipass.test')
    const denied = await w.request('/api/health', null, { headers: { Origin: 'https://evil.example' } })
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()

    const preflightOk = await w.request('/api/certificates', null, { method: 'OPTIONS', headers: { Origin: 'https://certipass.test' } })
    expect(preflightOk.status).toBe(204)
    const preflightBad = await w.request('/api/certificates', null, { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } })
    expect(preflightBad.status).toBe(403)
  })

  it('still answers an unknown error with a generic message', async () => {
    w.deps.fetch = async () => {
      throw new TypeError('boom: https://secret.internal/key=abc')
    }
    const res = await upload(w)
    const text = await res.text()
    expect(text).not.toContain('secret.internal')
    expect(text).not.toContain('abc')
  })
})
