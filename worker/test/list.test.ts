import { beforeEach, describe, expect, it } from 'vitest'
import { IDS, body, makeWorld, seedStored, upload } from './harness'
import type { Who, World } from './harness'

let w: World
let aarav: { id: string }
let diya: { id: string }
let esha: { id: string }

beforeEach(async () => {
  w = await makeWorld()
  aarav = await seedStored(w, { who: 'aarav', achievementId: 'ach-a', category: 'Hackathon', name: 'aarav hackathon.pdf' })
  w.clock.advance(1)
  diya = await seedStored(w, { who: 'diya', achievementId: 'ach-d', category: 'Workshop', name: 'diya workshop.pdf' })
  w.clock.advance(1)
  esha = await seedStored(w, { who: 'ece' as Who, achievementId: 'ach-e', category: 'Sports', name: 'esha sports.pdf' })
})

const list = async (who: Who | null, query = '') => {
  const res = await w.request(`/api/certificates${query}`, who)
  return { res, out: res.status === 200 ? await body(res) : await body(res).catch(() => ({})) }
}
const ids = (out: { certificates: { id: string }[] }) => out.certificates.map((c) => c.id).sort()

describe('listing certificates: who sees which', () => {
  it('shows a student only their own', async () => {
    expect(ids((await list('aarav')).out)).toEqual([aarav.id])
    expect(ids((await list('diya')).out)).toEqual([diya.id])
    expect(ids((await list('ece')).out)).toEqual([esha.id])
  })

  it('shows faculty the students of the departments they cover, and no others', async () => {
    expect(ids((await list('meera')).out)).toEqual([aarav.id, diya.id].sort()) // CSE and AIDS
    expect(ids((await list('anand')).out)).toEqual([esha.id]) // ECE and EEE
  })

  it('shows an administrator everything', async () => {
    expect(ids((await list('admin')).out)).toEqual([aarav.id, diya.id, esha.id].sort())
  })

  it('shows a deactivated or unauthenticated caller nothing at all', async () => {
    expect((await list('suresh')).res.status).toBe(403)
    expect((await list(null)).res.status).toBe(401)
  })

  it('follows a student’s CURRENT department, not the one they uploaded under', async () => {
    w.setUser('aarav', { department: 'ECE' })
    expect(ids((await list('meera')).out)).toEqual([diya.id])
    expect(ids((await list('anand')).out)).toEqual([aarav.id, esha.id].sort())
  })

  it('lets a faculty member whose review departments change see the change at once', async () => {
    w.setUser('meera', { review_departments: JSON.stringify(['AIDS']) })
    expect((await list('meera')).out.certificates).toHaveLength(0)
  })
})

describe('listing certificates: what narrowing cannot do', () => {
  it('never lets a student see another student’s certificates by asking for them', async () => {
    expect((await list('aarav', `?studentId=${IDS.diya}`)).out.certificates).toHaveLength(0)
    expect((await list('aarav', `?studentId=${IDS.admin}`)).out.certificates).toHaveLength(0)
  })

  it('never lets faculty see outside their departments by asking for a student', async () => {
    expect((await list('meera', `?studentId=${IDS.ece}`)).out.certificates).toHaveLength(0)
    expect(ids((await list('meera', `?studentId=${IDS.diya}`)).out)).toEqual([diya.id])
  })

  it('narrows an administrator’s view to one student, category or achievement', async () => {
    expect(ids((await list('admin', `?studentId=${IDS.ece}`)).out)).toEqual([esha.id])
    expect(ids((await list('admin', '?category=Workshop')).out)).toEqual([diya.id])
    expect(ids((await list('admin', '?achievementId=ach-a')).out)).toEqual([aarav.id])
  })

  it('refuses malformed filters', async () => {
    expect((await list('admin', '?studentId=not-a-uuid')).res.status).toBe(400)
    expect((await list('admin', '?category=Bitcoin')).res.status).toBe(400)
    expect((await list('admin', "?achievementId=../../x")).res.status).toBe(400)
  })

  it('cannot be tricked into SQL by a filter', async () => {
    const res = await list('admin', `?achievementId=${encodeURIComponent("x' OR '1'='1")}`)
    expect(res.res.status).toBe(400)
    expect(w.db.rows('SELECT COUNT(*) AS n FROM certificate_files')[0]).toEqual({ n: 3 })
  })
})

describe('listing certificates: what is in the answer', () => {
  it('describes each certificate and its owner, newest first', async () => {
    const { out } = await list('admin')
    expect(out.total).toBe(3)
    expect(out.certificates.map((c: { fileName: string }) => c.fileName)).toEqual(['esha sports.pdf', 'diya workshop.pdf', 'aarav hackathon.pdf'])
    expect(out.certificates[2]).toMatchObject({
      id: aarav.id,
      achievementId: 'ach-a',
      mimeType: 'application/pdf',
      category: 'Hackathon',
      studentId: IDS.aarav,
      studentName: 'Aarav Menon',
      registerNumber: '2023CSE0417',
      department: 'CSE',
    })
  })

  it('never includes a Google Drive id or link', async () => {
    const driveIds = w.drive.uploads().map((f) => f.id)
    const text = JSON.stringify((await list('admin')).out)
    for (const id of driveIds) expect(text).not.toContain(id)
    expect(text).not.toMatch(/drive_file_id|drive_folder|webViewLink|googleapis|sha256/i)
  })

  it('lists only certificates that are really stored', async () => {
    for (const status of ['pending', 'failed', 'replaced', 'removed']) {
      w.setCert({ storage_status: status }, esha.id)
      expect(ids((await list('admin')).out)).not.toContain(esha.id)
    }
  })

  it('does not list a replaced certificate next to its replacement', async () => {
    await upload(w, { who: 'aarav', achievementId: 'ach-a', name: 'better.pdf', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9, 9]) })
    const names = (await list('aarav')).out.certificates.map((c: { fileName: string }) => c.fileName)
    expect(names).toEqual(['better.pdf'])
  })

  it('pages through results', async () => {
    const first = (await list('admin', '?limit=2&offset=0')).out
    const second = (await list('admin', '?limit=2&offset=2')).out
    expect(first.certificates).toHaveLength(2)
    expect(second.certificates).toHaveLength(1)
    expect(first.total).toBe(3)
    expect(new Set([...first.certificates, ...second.certificates].map((c: { id: string }) => c.id)).size).toBe(3)
  })

  it('caps the page size', async () => {
    expect((await list('admin', '?limit=100000')).out.limit).toBe(200)
    expect((await list('admin', '?limit=-5&offset=-9')).out).toMatchObject({ limit: 1, offset: 0 })
  })
})

describe('listing certificates: failures', () => {
  it('reports a database outage as retryable', async () => {
    w.db.failNext((c) => /FROM certificate_files c JOIN users/i.test(c.sql), 1)
    const { res, out } = await list('admin')
    expect(res.status).toBe(503)
    expect(out.error).toMatchObject({ code: 'database_unavailable', retryable: true })
  })
})
