import { beforeEach, describe, expect, it } from 'vitest'
import { IDS, PDF, body, makeWorld, seedStored, upload } from './harness'
import type { Who, World } from './harness'

let w: World
beforeEach(async () => {
  w = await makeWorld()
})

/** Move the test clock, and keep everyone signed in (the harness sessions only last 8 hours). */
const jumpTo = (world: World, iso: string) => {
  world.clock.ms = Date.parse(iso)
  world.db.exec("UPDATE sessions SET expires_at = '2099-01-01T00:00:00.000Z'")
}

const DETAILS = { title: 'CodeHarbour 36-Hour Hackathon', issuer: 'Rajalakshmi Institute of Technology', issueDate: '2026-09-14' }

describe('what a student says about a certificate', () => {
  it('is stored with it and shown back, so people can find it without opening the file', async () => {
    const res = await upload(w, { category: 'Hackathon', ...DETAILS })
    expect(res.status).toBe(201)
    const out = (await body(res)).certificate
    expect(out).toMatchObject({ category: 'Hackathon', title: DETAILS.title, issuer: DETAILS.issuer, issueDate: '2026-09-14', fileName: 'certificate.pdf' })
    expect(w.certs[0]).toMatchObject({ title: DETAILS.title, issuer: DETAILS.issuer, issue_date: '2026-09-14' })
    // …and in the lookup and listing.
    const listed = (await body(await w.request('/api/certificates', 'aarav'))).certificates[0]
    expect(listed).toMatchObject({ title: DETAILS.title, issuer: DETAILS.issuer, issueDate: '2026-09-14', category: 'Hackathon', batch: '2023', department: 'CSE', studentName: 'Aarav Menon' })
  })

  it('is optional: a certificate attached to an achievement carries none', async () => {
    const out = (await body(await upload(w))).certificate
    expect(out).toMatchObject({ title: null, issuer: null, issueDate: null })
  })

  it('tidies spaces and treats blank as absent', async () => {
    const out = (await body(await upload(w, { title: '  Spaced    out   title ', issuer: '   ', issueDate: '' }))).certificate
    expect(out).toMatchObject({ title: 'Spaced out title', issuer: null, issueDate: null })
  })

  it.each([
    ['a title that is too long', { title: 'x'.repeat(121) }, 'title'],
    ['a title with markup', { title: '<script>alert(1)</script>' }, 'title'],
    ['an issuer that is too long', { issuer: 'y'.repeat(121) }, 'issuer'],
    ['an issuer with markup', { issuer: 'Org <b>' }, 'issuer'],
    ['a date that is not a date', { issueDate: 'yesterday' }, 'issueDate'],
    ['a date in the wrong format', { issueDate: '14/09/2026' }, 'issueDate'],
    ['a day that does not exist', { issueDate: '2026-02-30' }, 'issueDate'],
    ['a month that does not exist', { issueDate: '2026-13-01' }, 'issueDate'],
    ['a date long before any certificate could exist', { issueDate: '1985-01-01' }, 'issueDate'],
    ['a date well in the future', { issueDate: '2027-12-31' }, 'issueDate'],
  ])('refuses %s, before anything is stored', async (_label, over, field) => {
    const res = await upload(w, { ...DETAILS, ...over })
    expect(res.status).toBe(400)
    expect((await body(res)).error).toMatchObject({ code: 'invalid_input', field })
    expect(w.certs).toHaveLength(0)
    expect(w.drive.calls).toHaveLength(0)
  })

  it('accepts today’s date, even a day ahead for time zones, but not further', async () => {
    expect((await upload(w, { achievementId: 'a1', issueDate: '2026-10-29' })).status).toBe(201)
    expect((await upload(w, { achievementId: 'a2', issueDate: '2026-10-30' })).status).toBe(201)
    expect((await upload(w, { achievementId: 'a3', issueDate: '2026-11-05' })).status).toBe(400)
  })

  it('takes the corrected details when a failed upload is retried with them fixed', async () => {
    const uploadId = crypto.randomUUID()
    w.drive.failNext((c) => c.method === 'POST' && c.url.startsWith('/upload/'), 503, 5)
    expect((await upload(w, { uploadId, category: 'Hackathon', title: 'Mistyped titel', issuer: 'RIT', issueDate: '2026-09-14' })).status).toBe(503)
    const retry = await upload(w, { uploadId, category: 'Workshop', title: 'Corrected title', issuer: 'RIT Chennai', issueDate: '2026-09-15' })
    expect(retry.status).toBe(201)
    expect(w.certs).toHaveLength(1)
    expect(w.certs[0]).toMatchObject({ storage_status: 'stored', category: 'Workshop', title: 'Corrected title', issuer: 'RIT Chennai', issue_date: '2026-09-15' })
    expect(w.drive.uploads()[0].name).toBe('2023CSE0417_Workshop_Certificate.pdf')
  })

  it('does not change when an upload that already succeeded is repeated', async () => {
    const uploadId = crypto.randomUUID()
    await upload(w, { uploadId, ...DETAILS })
    const again = await upload(w, { uploadId, ...DETAILS, title: 'A different title' })
    expect(again.status).toBe(200)
    expect(w.certs).toHaveLength(1)
    expect(w.certs[0].title).toBe(DETAILS.title)
  })
})

describe('the year folder', () => {
  it('is the year of the upload', async () => {
    await upload(w, { achievementId: 'a1' })
    jumpTo(w, '2027-02-03T10:00:00Z')
    await upload(w, { achievementId: 'a2' })
    const paths = w.drive.uploads().map((f) => w.drive.pathOf(f)).sort()
    expect(paths).toEqual([
      'CertiPass/2026/CSE/2023CSE0417/Certificates/2023CSE0417_Hackathon_Certificate.pdf',
      'CertiPass/2027/CSE/2023CSE0417/Certificates/2023CSE0417_Hackathon_Certificate.pdf',
    ])
  })

  it('does not move when a failed upload is retried after New Year', async () => {
    jumpTo(w, '2026-12-31T23:50:00Z')
    const uploadId = crypto.randomUUID()
    w.drive.failNext((c) => c.method === 'POST' && c.url.startsWith('/upload/'), 503, 5)
    expect((await upload(w, { uploadId })).status).toBe(503)
    jumpTo(w, '2027-01-01T00:20:00Z')
    expect((await upload(w, { uploadId })).status).toBe(201)
    expect(w.drive.pathOf(w.drive.uploads()[0])).toBe('CertiPass/2026/CSE/2023CSE0417/Certificates/2023CSE0417_Hackathon_Certificate.pdf')
  })

  it('puts every certificate of one student in the same Certificates folder, never overwriting', async () => {
    await upload(w, { achievementId: 'a1', category: 'Hackathon' })
    await upload(w, { achievementId: 'a2', category: 'Hackathon', bytes: new Uint8Array([...PDF(), 1]) })
    await upload(w, { achievementId: 'a3', category: 'Workshop' })
    const names = w.drive.uploads().map((f) => w.drive.pathOf(f).split('/').slice(-2).join('/')).sort()
    expect(names).toEqual(['Certificates/2023CSE0417_Hackathon_Certificate.pdf', 'Certificates/2023CSE0417_Hackathon_Certificate_2.pdf', 'Certificates/2023CSE0417_Workshop_Certificate.pdf'])
    expect(w.drive.uploads()).toHaveLength(3)
  })

  it('creates each folder once, however many certificates follow', async () => {
    for (let i = 0; i < 4; i++) await upload(w, { achievementId: `a${i}`, bytes: new Uint8Array([...PDF(), i]) })
    expect(w.drive.folders().map((f) => f.name).sort()).toEqual(['2026', 'CSE', 'Certificates', 'CertiPass', '2023CSE0417'].sort())
  })
})

describe('searching and filtering the listing', () => {
  const as = (who: Who, query: string) => w.request(`/api/certificates${query}`, who).then(async (r) => ({ status: r.status, out: await body(r) }))
  const titles = async (who: Who, query: string) => (await as(who, query)).out.certificates.map((c: { title: string | null }) => c.title).sort()

  beforeEach(async () => {
    await seedStored(w, { who: 'aarav', achievementId: 'a1', category: 'Hackathon', title: 'CodeHarbour Hackathon', issuer: 'RIT', issueDate: '2026-09-14' })
    await seedStored(w, { who: 'diya', achievementId: 'a2', category: 'Workshop', title: 'Cloud Workshop', issuer: 'AWS Academy', issueDate: '2026-08-01' })
    await seedStored(w, { who: 'ece', achievementId: 'a3', category: 'Sports', title: 'Inter-college Cricket', issuer: 'State Sports Council', issueDate: '2026-07-20' })
  })

  it('searches by student name, student id, title or issuer', async () => {
    expect(await titles('admin', '?q=Aarav')).toEqual(['CodeHarbour Hackathon'])
    expect(await titles('admin', '?q=2023CSE0418')).toEqual(['Cloud Workshop'])
    expect(await titles('admin', '?q=cricket')).toEqual(['Inter-college Cricket'])
    expect(await titles('admin', '?q=AWS')).toEqual(['Cloud Workshop'])
    expect(await titles('admin', '?q=nothing-matches-this')).toEqual([])
  })

  it('filters by department, batch and category, alone or together', async () => {
    expect(await titles('admin', '?department=ECE')).toEqual(['Inter-college Cricket'])
    expect(await titles('admin', '?batch=2022')).toEqual(['Inter-college Cricket'])
    expect(await titles('admin', '?batch=2023')).toEqual(['Cloud Workshop', 'CodeHarbour Hackathon'])
    expect(await titles('admin', '?category=Workshop')).toEqual(['Cloud Workshop'])
    expect(await titles('admin', '?department=CSE&batch=2023&category=Hackathon')).toEqual(['CodeHarbour Hackathon'])
    expect(await titles('admin', '?department=CSE&batch=2022')).toEqual([])
  })

  it('treats % and _ in a search as ordinary characters', async () => {
    expect(await titles('admin', '?q=%25')).toEqual([])
    expect(await titles('admin', '?q=_')).toEqual([])
  })

  it('never lets a filter reach outside what the person may see', async () => {
    // Faculty for CSE and AIDS asking for ECE, or for a batch only ECE has, still see nothing from ECE.
    expect(await titles('meera', '?department=ECE')).toEqual([])
    expect(await titles('meera', '?batch=2022')).toEqual([])
    expect(await titles('meera', '?q=cricket')).toEqual([])
    // A student searching for someone else's certificate finds nothing.
    expect(await titles('aarav', '?q=Cloud')).toEqual([])
    expect(await titles('aarav', '?department=ECE')).toEqual([])
  })

  it('offers dropdown choices drawn only from what the person may see', async () => {
    const admin = (await as('admin', '')).out.facets
    expect(admin).toEqual({ departments: ['CSE', 'ECE'], batches: ['2023', '2022'] })
    const faculty = (await as('meera', '')).out.facets
    expect(faculty).toEqual({ departments: ['CSE'], batches: ['2023'] })
    const student = (await as('aarav', '')).out.facets
    expect(student).toEqual({ departments: ['CSE'], batches: ['2023'] })
    // The choices ignore the filters in force, so a filter can always be changed back.
    expect((await as('admin', '?department=ECE')).out.facets).toEqual(admin)
  })

  it('refuses a malformed batch and keeps the other checks', async () => {
    expect((await as('admin', '?batch=20x3')).status).toBe(400)
    expect((await as('admin', "?batch=2023' OR '1'='1")).status).toBe(400)
  })

  it('returns the matching total for paging', async () => {
    const page = (await as('admin', '?limit=1&offset=0')).out
    expect(page.certificates).toHaveLength(1)
    expect(page.total).toBe(3)
    expect(IDS.aarav).toBeTruthy()
  })
})
