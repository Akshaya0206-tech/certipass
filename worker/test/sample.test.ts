import { beforeEach, describe, expect, it } from 'vitest'
import { DriveClient } from '../src/drive'
import { validateCertificate } from '../src/validation'
import { runSample, samplePdf } from '../scripts/sampleFlow'
import { makeWorld } from './harness'
import type { World } from './harness'

let w: World
let log: string[]
beforeEach(async () => {
  w = await makeWorld()
  log = []
})

/** What an anonymous visitor gets for a private file: Google sends them to sign in. */
const anonymousDenied: typeof fetch = async () => new Response(null, { status: 302, headers: { Location: 'https://accounts.google.com/ServiceLogin' } })
const anonymousAllowed: typeof fetch = async () => new Response('%PDF-1.4', { status: 200, headers: { 'Content-Type': 'application/pdf' } })

const run = (opts: { cleanup?: boolean; anonymousFetch?: typeof fetch } = {}) =>
  runSample(new DriveClient(w.env, w.deps), { cleanup: opts.cleanup ?? false, anonymousFetch: opts.anonymousFetch ?? anonymousDenied, log: (s) => log.push(s), now: () => new Date('2026-10-30T09:00:00Z') })

describe('the sample PDF', () => {
  it('passes the very same file checks a student’s upload goes through', () => {
    const bytes = samplePdf()
    expect(validateCertificate('sample.pdf', 'application/pdf', bytes).mimeType).toBe('application/pdf')
    const text = new TextDecoder().decode(bytes)
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('has a correct cross-reference table, so viewers open it without repairing it', () => {
    const text = new TextDecoder().decode(samplePdf())
    const start = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(start, start + 4)).toBe('xref')
    const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]))
    expect(entries).toHaveLength(5)
    entries.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`))
  })
})

describe('drive:sample', () => {
  it('uploads a file named like a real certificate into the organised folders and reads it back', async () => {
    expect(await run()).toBe(true)
    const [file] = w.drive.uploads()
    expect(w.drive.pathOf(file)).toBe('_CertiPass sample/CertiPass/2026/AIDS/2023AIDS0417/Certificates/2023AIDS0417_Hackathon_Certificate.pdf')
    expect([...file.bytes!]).toEqual([...samplePdf()])
    expect(log.some((l) => l.includes('bytes are identical'))).toBe(true)
    expect(log.some((l) => l.includes('could not read the file'))).toBe(true)
  })

  it('leaves the file in Drive so the admin can look at it', async () => {
    await run()
    expect(w.drive.uploads()[0].trashed).toBe(false)
    expect(log.join('\n')).toContain('https://drive.google.com/drive/folders/ROOT_FOLDER')
  })

  it('does not mark the sample as a real certificate, so the orphan scan never touches it', async () => {
    await run()
    expect(w.drive.uploads()[0].appProperties.certipass).toBe('sample')
  })

  it('shares nothing', async () => {
    await run()
    expect(w.drive.permissionCalls).toBe(0)
  })

  it('FAILS if an anonymous visitor could read the file', async () => {
    expect(await run({ anonymousFetch: anonymousAllowed })).toBe(false)
    expect(log.some((l) => l.includes('COULD read the file'))).toBe(true)
  })

  it('FAILS, and uploads nothing, when the folder is open to anyone with the link', async () => {
    w.drive.rootPublic = true
    expect(await run()).toBe(false)
    expect(w.drive.uploads()).toHaveLength(0)
    expect(log.join('\n')).toContain('drive_folder_public')
  })

  it('FAILS, and uploads nothing, when the account only has view access', async () => {
    w.drive.rootCanAdd = false
    expect(await run()).toBe(false)
    expect(w.drive.uploads()).toHaveLength(0)
  })

  it('FAILS when the folder is not shared with the account at all', async () => {
    w.drive.rootVisible = false
    expect(await run()).toBe(false)
    expect(w.drive.uploads()).toHaveLength(0)
  })

  it('names a second run’s file _2 rather than overwriting the first', async () => {
    await run()
    await run()
    expect(w.drive.uploads().map((f) => f.name).sort()).toEqual(['2023AIDS0417_Hackathon_Certificate.pdf', '2023AIDS0417_Hackathon_Certificate_2.pdf'])
  })

  it('--cleanup moves the sample folder to the bin', async () => {
    await run()
    expect(await run({ cleanup: true })).toBe(true)
    const sample = [...w.drive.files.values()].find((f) => f.name === '_CertiPass sample')!
    expect(sample.trashed).toBe(true)
  })
})
