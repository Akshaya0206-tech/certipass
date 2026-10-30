import { beforeEach, describe, expect, it } from 'vitest'
import { body, makeWorld, seedStored } from './harness'
import type { World } from './harness'

let w: World
beforeEach(async () => {
  w = await makeWorld()
})

const stats = async () => (await body(await w.request('/api/admin/stats', 'admin'))).stats

describe('who may read upload statistics', () => {
  it('is for administrators only', async () => {
    for (const who of ['aarav', 'meera'] as const) expect((await w.request('/api/admin/stats', who)).status).toBe(403)
    expect((await w.request('/api/admin/stats', null)).status).toBe(401)
    expect((await w.request('/api/admin/stats', 'admin')).status).toBe(200)
  })

  it('is refused for a deactivated administrator', async () => {
    w.setUser('admin', { status: 'inactive' })
    expect((await w.request('/api/admin/stats', 'admin')).status).toBe(403)
  })
})

describe('upload statistics', () => {
  it('start at zero, with a full set of months', async () => {
    const s = await stats()
    expect(s.certificates).toEqual({ total: 0, totalBytes: 0, studentsWithCertificates: 0, last7Days: 0, last30Days: 0 })
    expect(s.byCategory).toEqual([])
    expect(s.byMonth).toHaveLength(12)
    expect(s.byMonth.every((m: { count: number }) => m.count === 0)).toBe(true)
    expect(s.byMonth.at(-1).month).toBe('2026-10')
    expect(s.byMonth[0].month).toBe('2025-11')
  })

  it('count what is stored: totals, size, students, categories, departments and months', async () => {
    await seedStored(w, { who: 'aarav', achievementId: 'a1', category: 'Hackathon' })
    await seedStored(w, { who: 'aarav', achievementId: 'a2', category: 'Hackathon', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, ...new Uint8Array(40)]) })
    await seedStored(w, { who: 'diya', achievementId: 'a3', category: 'Workshop' })
    w.clock.ms = Date.parse('2026-08-20T10:00:00Z')
    w.db.exec("UPDATE sessions SET expires_at = '2099-01-01T00:00:00.000Z'")
    await seedStored(w, { who: 'ece', achievementId: 'a4', category: 'Sports' })
    w.clock.ms = Date.parse('2026-10-29T10:00:00Z')

    const s = await stats()
    expect(s.certificates).toMatchObject({ total: 4, studentsWithCertificates: 3, last7Days: 3, last30Days: 3 })
    expect(s.certificates.totalBytes).toBe(w.certs.reduce((sum, c) => sum + c.size_bytes, 0))
    expect(s.byCategory).toEqual([
      { category: 'Hackathon', count: 2 },
      { category: 'Sports', count: 1 },
      { category: 'Workshop', count: 1 },
    ])
    expect(s.byDepartment).toEqual([
      { department: 'CSE', count: 3 },
      { department: 'ECE', count: 1 },
    ])
    expect(s.byMonth.find((m: { month: string }) => m.month === '2026-10').count).toBe(3)
    expect(s.byMonth.find((m: { month: string }) => m.month === '2026-08').count).toBe(1)
  })

  it('leave out anything that is not really stored', async () => {
    const a = await seedStored(w, { who: 'aarav', achievementId: 'a1' })
    const d = await seedStored(w, { who: 'diya', achievementId: 'a2' })
    const e = await seedStored(w, { who: 'ece', achievementId: 'a3' })
    w.setCert({ storage_status: 'removed' }, a.id)
    w.setCert({ storage_status: 'failed' }, d.id)
    expect((await stats()).certificates.total).toBe(1)
    expect(e.id).toBeTruthy()
  })

  it('count a replacement once', async () => {
    await seedStored(w, { who: 'aarav', achievementId: 'a1' })
    await seedStored(w, { who: 'aarav', achievementId: 'a1', bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 9]) })
    expect((await stats()).certificates.total).toBe(1)
  })

  it('count accounts by role and status, and the students waiting for approval', async () => {
    w.setUser('diya', { status: 'pending' })
    const s = await stats()
    expect(s.accounts.student).toEqual({ active: 2, pending: 1, inactive: 0 })
    expect(s.accounts.faculty).toEqual({ active: 2, pending: 0, inactive: 1 })
    expect(s.accounts.admin).toEqual({ active: 1, pending: 0, inactive: 0 })
    expect(s.pendingApprovals).toBe(1)
  })

  it('carry no student names, ids, file names or Drive ids', async () => {
    await seedStored(w, { who: 'aarav', achievementId: 'a1', name: 'secret-name.pdf', title: 'Private title' })
    const text = JSON.stringify(await stats())
    expect(text).not.toMatch(/Aarav|2023CSE0417|secret-name|Private title|drive/i)
  })

  it('report a database outage as retryable', async () => {
    w.db.failNext((c) => /FROM certificate_files WHERE storage_status/i.test(c.sql), 1)
    const res = await w.request('/api/admin/stats', 'admin')
    expect(res.status).toBe(503)
    expect((await body(res)).error).toMatchObject({ code: 'database_unavailable', retryable: true })
  })
})
