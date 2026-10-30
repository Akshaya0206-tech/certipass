/*
 * Test harness: the real Worker running against a real SQLite database (the real migration files) and an
 * in-memory stand-in for the Google Drive API, wired through the Worker's injectable `fetch`. Nothing here talks
 * to the network, and no test uses a real credential.
 */
import { clearDriveCaches } from '../src/drive'
import { mapCertificate } from '../src/db'
import { handleRequest } from '../src/index'
import { hashPassword, sha256Text } from '../src/passwords'
import type { CertificateRow, Deps, Env, Role } from '../src/types'
import { TestD1 } from './d1'

export const ROOT = 'ROOT_FOLDER'
const FOLDER = 'application/vnd.google-apps.folder'
export const PEPPER = 'test-pepper-test-pepper-test-pepper-0123'
export const SETUP_TOKEN = 'setup-token-setup-token-123456'
/** Fewer rounds than production so the suite stays fast; the hash format records how many were used. */
export const TEST_ROUNDS = 1000
export const PASSWORD = 'Passw0rd!'

export class Clock {
  constructor(public ms = Date.parse('2026-10-29T10:00:00Z')) {}
  now = () => new Date(this.ms)
  advance(minutes: number) {
    this.ms += minutes * 60_000
  }
}

interface Injected {
  match: (call: { method: string; url: string }) => boolean
  times: number
  status: number
  reason?: string
  code?: string
}

const jsonRes = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

// ── Google Drive ────────────────────────────────────────────────────────────

export interface FakeFile {
  id: string
  name: string
  mimeType: string
  parents: string[]
  trashed: boolean
  createdTime: string
  appProperties: Record<string, string>
  bytes?: Uint8Array
}

export class FakeDrive {
  files = new Map<string, FakeFile>()
  calls: { method: string; url: string }[] = []
  failures: Injected[] = []
  tokenFails = false
  rootVisible = true
  rootCanAdd = true
  /** The root folder is shared with "anyone with the link". */
  rootPublic = false
  /** Drive doesn't list permissions to this account (it isn't allowed to share the folder). */
  permissionsHidden = false
  permissionCalls = 0
  tokenCalls = 0
  private n = 0

  constructor(private readonly clock: Clock) {
    this.files.set(ROOT, { id: ROOT, name: 'CertiPass certificates', mimeType: FOLDER, parents: [], trashed: false, createdTime: new Date(0).toISOString(), appProperties: {} })
  }

  failNext(match: Injected['match'], status = 503, times = 1, reason?: string) {
    this.failures.push({ match, times, status, reason })
  }

  uploads() {
    return [...this.files.values()].filter((f) => f.mimeType !== FOLDER && f.id !== ROOT)
  }
  folders() {
    return [...this.files.values()].filter((f) => f.mimeType === FOLDER && f.id !== ROOT && !f.trashed)
  }
  pathOf(file: FakeFile): string {
    const names: string[] = []
    let cur: FakeFile | undefined = file
    while (cur && cur.id !== ROOT) {
      names.unshift(cur.name)
      cur = this.files.get(cur.parents[0])
    }
    return names.join('/')
  }

  async handle(req: Request): Promise<Response> {
    const url = new URL(req.url)
    if (url.hostname === 'oauth2.googleapis.com') {
      this.tokenCalls++
      return this.tokenFails ? jsonRes({ error: 'invalid_grant' }, 400) : jsonRes({ access_token: `tok-${this.tokenCalls}`, expires_in: 3600 })
    }
    const call = { method: req.method, url: url.pathname + url.search }
    this.calls.push(call)
    if (url.pathname.includes('/permissions')) this.permissionCalls++
    if (!/^Bearer tok-\d+$/.test(req.headers.get('authorization') ?? '')) return this.error(401, 'authError')
    for (const f of this.failures) {
      if (f.times > 0 && f.match(call)) {
        f.times--
        return this.error(f.status, f.reason ?? 'backendError')
      }
    }

    const upload = url.pathname === '/upload/drive/v3/files'
    if (upload && req.method === 'POST') return this.uploadFile(req)
    if (url.pathname === '/drive/v3/files') {
      if (req.method === 'GET') return this.list(url.searchParams.get('q') ?? '')
      if (req.method === 'POST') return this.createFolder((await req.json()) as { name: string; parents: string[] })
    }
    const one = /^\/drive\/v3\/files\/([^/]+)$/.exec(url.pathname)
    if (one) {
      const file = this.files.get(decodeURIComponent(one[1]))
      if (!file || (file.id === ROOT && !this.rootVisible)) return this.error(404, 'notFound')
      if (req.method === 'GET' && url.searchParams.get('alt') === 'media') {
        return file.bytes ? new Response(file.bytes, { headers: { 'Content-Length': String(file.bytes.length) } }) : this.error(404, 'notFound')
      }
      if (req.method === 'GET') return jsonRes(this.describe(file))
      if (req.method === 'PATCH') {
        const patch = (await req.json()) as { trashed?: boolean }
        if (patch.trashed !== undefined) file.trashed = patch.trashed
        return jsonRes(this.describe(file))
      }
    }
    return this.error(404, 'notFound')
  }

  private error(status: number, reason: string) {
    return jsonRes({ error: { code: status, message: reason, errors: [{ reason }] } }, status)
  }

  private describe(f: FakeFile) {
    return {
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.bytes ? String(f.bytes.length) : undefined,
      parents: f.parents,
      trashed: f.trashed,
      createdTime: f.createdTime,
      appProperties: f.appProperties,
      capabilities: { canAddChildren: f.id === ROOT ? this.rootCanAdd : true },
      webViewLink: `https://drive.google.com/drive/folders/${f.id}`,
      ...(f.id === ROOT && !this.permissionsHidden
        ? { permissions: [{ type: 'user', role: 'owner' }, ...(this.rootPublic ? [{ type: 'anyone', role: 'reader' }] : [])] }
        : {}),
    }
  }

  private newId(prefix: string) {
    return `${prefix}${++this.n}`
  }

  private stamp() {
    return new Date(this.clock.ms + this.n).toISOString()
  }

  /** A parent that doesn't exist, or a root the account can't see, both answer 404 — as real Drive does. */
  private parentMissing(parent: string) {
    return !this.files.has(parent) || (parent === ROOT && !this.rootVisible)
  }

  private createFolder(body: { name: string; parents: string[] }) {
    if (this.parentMissing(body.parents[0])) return this.error(404, 'notFound')
    const id = this.newId('folder')
    const f: FakeFile = { id, name: body.name, mimeType: FOLDER, parents: body.parents, trashed: false, createdTime: this.stamp(), appProperties: {} }
    this.files.set(id, f)
    return jsonRes(this.describe(f))
  }

  private list(q: string) {
    const unesc = (s: string) => s.replace(/\\(.)/g, '$1')
    const name = /name = '((?:[^'\\]|\\.)*)'/.exec(q)?.[1]
    const parent = /'((?:[^'\\]|\\.)*)' in parents/.exec(q)?.[1]
    const mimeEq = /mimeType = '([^']*)'/.exec(q)?.[1]
    const mimeNe = /mimeType != '([^']*)'/.exec(q)?.[1]
    const apps = [...q.matchAll(/appProperties has \{ key='([^']*)' and value='((?:[^'\\]|\\.)*)' \}/g)]
    const files = [...this.files.values()]
      .filter((f) => f.id !== ROOT)
      .filter((f) => !q.includes('trashed = false') || !f.trashed)
      .filter((f) => name === undefined || f.name === unesc(name))
      .filter((f) => parent === undefined || f.parents.includes(unesc(parent)))
      .filter((f) => mimeEq === undefined || f.mimeType === mimeEq)
      .filter((f) => mimeNe === undefined || f.mimeType !== mimeNe)
      .filter((f) => apps.every((m) => f.appProperties[m[1]] === unesc(m[2])))
      .sort((a, b) => a.createdTime.localeCompare(b.createdTime))
    return jsonRes({ files: files.map((f) => this.describe(f)) })
  }

  private async uploadFile(req: Request) {
    const boundary = /boundary=(.+)$/.exec(req.headers.get('content-type') ?? '')?.[1]
    if (!boundary) return this.error(400, 'badRequest')
    const raw = Buffer.from(await req.arrayBuffer()).toString('latin1')
    const parts = raw.split(`--${boundary}`).slice(1, -1)
    const body = (p: string) => p.slice(p.indexOf('\r\n\r\n') + 4, p.length - 2)
    const meta = JSON.parse(Buffer.from(body(parts[0]), 'latin1').toString('utf8')) as { name: string; mimeType: string; parents: string[]; appProperties: Record<string, string> }
    if (!this.files.has(meta.parents[0])) return this.error(404, 'notFound')
    const id = this.newId('file')
    const f: FakeFile = {
      id,
      name: meta.name,
      mimeType: meta.mimeType,
      parents: meta.parents,
      trashed: false,
      createdTime: this.stamp(),
      appProperties: meta.appProperties ?? {},
      bytes: new Uint8Array(Buffer.from(body(parts[1]), 'latin1')),
    }
    this.files.set(id, f)
    return jsonRes(this.describe(f))
  }
}

// ── The world ───────────────────────────────────────────────────────────────

export const IDS = {
  aarav: '11111111-1111-4111-8111-111111111111',
  diya: '22222222-2222-4222-8222-222222222222',
  ece: '33333333-3333-4333-8333-333333333333',
  meera: '44444444-4444-4444-8444-444444444444',
  anand: '55555555-5555-4555-8555-555555555555',
  admin: '66666666-6666-4666-8666-666666666666',
  suresh: '77777777-7777-4777-8777-777777777777',
} as const

export type Who = keyof typeof IDS

interface Seed {
  role: Role
  name: string
  status?: 'active' | 'pending' | 'inactive'
  department?: string
  review?: string[]
  register?: string
  year?: number
  designation?: string
}

const SEEDS: Record<Who, Seed> = {
  aarav: { role: 'student', name: 'Aarav Menon', department: 'CSE', register: '2023CSE0417', year: 3 },
  diya: { role: 'student', name: 'Diya R', department: 'CSE', register: '2023CSE0418', year: 3 },
  ece: { role: 'student', name: 'Esha K', department: 'ECE', register: '2022ECE0101', year: 4 },
  meera: { role: 'faculty', name: 'Dr Meera', department: 'CSE', review: ['CSE', 'AIDS'], designation: 'Professor' },
  anand: { role: 'faculty', name: 'Dr Anand', department: 'ECE', review: ['ECE', 'EEE'], designation: 'Professor' },
  admin: { role: 'admin', name: 'Records Admin', designation: 'Records Officer' },
  suresh: { role: 'faculty', name: 'Dr Suresh', department: 'CSE', status: 'inactive', designation: 'Professor' },
}

export const emailOf = (who: Who) => `${who}@rajalakshmi.edu.in`
/** A session token that satisfies the Worker's format check. */
export const tokenOf = (who: Who) => `test-session-token-${who}-0123456789abcdef0123`

let sharedHash: Promise<string> | undefined
const passwordHash = () => (sharedHash ??= hashPassword(PASSWORD, PEPPER, TEST_ROUNDS))

export async function makeWorld(envOverrides: Partial<Env> = {}) {
  clearDriveCaches()
  const clock = new Clock()
  const db = new TestD1()
  const drive = new FakeDrive(clock)
  const hash = await passwordHash()
  const at = clock.now().toISOString()
  const expires = new Date(clock.ms + 8 * 3_600_000).toISOString()

  for (const who of Object.keys(IDS) as Who[]) {
    const s = SEEDS[who]
    db.exec(
      `INSERT INTO users (id, email, password_hash, role, status, full_name, department, review_departments, register_number, year, designation, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      IDS[who], emailOf(who), hash, s.role, s.status ?? 'active', s.name, s.department ?? null, s.review ? JSON.stringify(s.review) : null, s.register ?? null, s.year ?? null, s.designation ?? null, at, at,
    )
    db.exec('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', await sha256Text(tokenOf(who)), IDS[who], at, expires)
  }
  db.calls = []

  const env: Env = {
    DB: db,
    AUTH_PEPPER: PEPPER,
    SETUP_TOKEN,
    GOOGLE_DRIVE_ROOT_FOLDER_ID: ROOT,
    GOOGLE_AUTH_MODE: 'oauth',
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
    ALLOWED_ORIGINS: 'https://certipass.test',
    PENDING_STALE_MINUTES: '10',
    ...envOverrides,
  }

  let counter = 0
  const deps: Deps = {
    now: clock.now,
    sleep: async () => undefined,
    uuid: () => `b${++counter}`,
    pbkdf2Iterations: TEST_ROUNDS,
    fetch: async (input, init) => {
      const req = new Request(input as string, init)
      const host = new URL(req.url).hostname
      if (host.endsWith('googleapis.com')) return drive.handle(req)
      throw new Error(`unexpected network call to ${host}`)
    },
  }

  /** `who` signs the request with that user's session; `null` sends no credentials. */
  const request = (path: string, who: Who | null, init: RequestInit = {}) =>
    handleRequest(
      new Request(`https://worker.test${path}`, { ...init, headers: { ...(who ? { Authorization: `Bearer ${tokenOf(who)}` } : {}), ...(init.headers as Record<string, string>) } }),
      env,
      deps,
    )

  /** Send a JSON body. */
  const send = (method: string, path: string, who: Who | null, payload: unknown, headers: Record<string, string> = {}) =>
    request(path, who, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) })

  return {
    clock,
    db,
    drive,
    env,
    deps,
    request,
    send,
    /** Every certificate row, oldest first. */
    get certs(): CertificateRow[] {
      return db.rows('SELECT * FROM certificate_files ORDER BY created_at, rowid').map(mapCertificate)
    },
    /** Change one of the seeded users directly in the database. */
    setUser(who: Who, patch: Record<string, string | number | null>) {
      const cols = Object.keys(patch)
      db.exec(`UPDATE users SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...(Object.values(patch) as (string | number | null)[]), IDS[who])
    },
    /** Change a certificate row directly in the database (the first one by default). */
    setCert(patch: Record<string, string | number | null>, id?: string) {
      const target = id ?? (db.rows<{ id: string }>('SELECT id FROM certificate_files ORDER BY created_at, rowid LIMIT 1')[0]?.id as string)
      const cols = Object.keys(patch)
      // The partial unique indexes mean only one row per achievement can be "stored"; the tests set other states.
      db.exec(`UPDATE certificate_files SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, ...(Object.values(patch) as (string | number | null)[]), target)
    },
    user(who: Who) {
      return db.rows<Record<string, unknown>>('SELECT * FROM users WHERE id = ?', IDS[who])[0]
    },
  }
}

export type World = Awaited<ReturnType<typeof makeWorld>>

// ── Files and requests ──────────────────────────────────────────────────────

export const PDF = () => new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, ...new TextEncoder().encode('%certificate body')])
export const PNG = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6])
export const JPG = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46])

export interface UploadOptions {
  who?: Who | null
  achievementId?: string
  uploadId?: string
  category?: string
  name?: string
  type?: string
  bytes?: Uint8Array
  title?: string
  issuer?: string
  issueDate?: string
}

export function upload(world: World, o: UploadOptions = {}) {
  const form = new FormData()
  form.set('achievementId', o.achievementId ?? 'ach-1')
  form.set('uploadId', o.uploadId ?? crypto.randomUUID())
  form.set('category', o.category ?? 'Hackathon')
  if (o.title !== undefined) form.set('title', o.title)
  if (o.issuer !== undefined) form.set('issuer', o.issuer)
  if (o.issueDate !== undefined) form.set('issueDate', o.issueDate)
  form.set('file', new File([o.bytes ?? PDF()], o.name ?? 'certificate.pdf', { type: o.type ?? 'application/pdf' }))
  return world.request('/api/certificates', o.who === undefined ? 'aarav' : o.who, { method: 'POST', body: form })
}

export async function body<T = any>(res: Response): Promise<T> {
  return (await res.json()) as T
}

/** Upload as Aarav and return the stored certificate's id. */
export async function seedStored(world: World, o: UploadOptions = {}): Promise<{ id: string; uploadId: string }> {
  const uploadId = o.uploadId ?? crypto.randomUUID()
  const res = await upload(world, { ...o, uploadId })
  if (res.status !== 201) throw new Error(`seed upload failed: ${res.status} ${await res.text()}`)
  return { id: (await body(res)).certificate.id, uploadId }
}
