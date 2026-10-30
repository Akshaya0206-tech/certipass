/*
 * Google Drive, behind one small client.
 *
 * Credentials live only in `Env` and only here. Two ways to authorise:
 *   oauth            – a refresh token for a person/account that has Editor
 *                      access to the certificate folder (works for My Drive and
 *                      Shared Drives).
 *   service_account  – a Google service account (works for Shared Drives only:
 *                      service accounts have no storage quota of their own, so
 *                      they cannot own files in an ordinary My Drive folder).
 *
 * Files are never shared: no permission is ever created, so nothing here can
 * produce a public or link-shared file. Reads go through the Worker, which
 * checks authorisation first and streams the bytes back.
 */
import { DriveError } from './errors'
import type { Deps, Env } from './types'

const DRIVE = 'https://www.googleapis.com/drive/v3'
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/drive'
const FOLDER_MIME = 'application/vnd.google-apps.folder'
const FILE_FIELDS = 'id,name,mimeType,size,parents,trashed,createdTime,md5Checksum,appProperties'
/** Marks every file this app creates, so orphans can be found without touching anything else in the folder. */
export const APP_MARKER = { key: 'certipass', value: '1' } as const

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  parents?: string[]
  trashed?: boolean
  createdTime?: string
  md5Checksum?: string
  appProperties?: Record<string, string>
}

export interface RootCheck {
  ok: boolean
  code?: string
  message: string
  folderName?: string
  inSharedDrive?: boolean
  canAddChildren?: boolean
  authMode: 'oauth' | 'service_account'
  /** A link an administrator can open in Google Drive. Only people the folder is shared with can actually open it. */
  folderUrl?: string
  /** True/false when Drive tells us whether "anyone with the link" can open the folder; undefined when it doesn't say. */
  publiclyShared?: boolean
}

// Access tokens, folder ids and the "folder is private" check are cached per isolate. All are safe to lose.
const tokenCache = new Map<string, { token: string; expiresAt: number }>()
const folderCache = new Map<string, { id: string; at: number }>()
let privateUntil = 0
const FOLDER_TTL_MS = 10 * 60 * 1000
const PRIVACY_TTL_MS = 5 * 60 * 1000
export function clearDriveCaches() {
  tokenCache.clear()
  folderCache.clear()
  privateUntil = 0
}

const escapeQuery = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")

const b64url = (data: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export class DriveClient {
  constructor(
    private readonly env: Env,
    private readonly deps: Deps,
  ) {}

  get authMode(): 'oauth' | 'service_account' {
    return this.env.GOOGLE_AUTH_MODE === 'service_account' ? 'service_account' : 'oauth'
  }

  /** True when every credential this mode needs is present. It says nothing about whether Google accepts them. */
  get configured(): boolean {
    const e = this.env
    if (!e.GOOGLE_DRIVE_ROOT_FOLDER_ID) return false
    return this.authMode === 'oauth'
      ? !!(e.GOOGLE_OAUTH_CLIENT_ID && e.GOOGLE_OAUTH_CLIENT_SECRET && e.GOOGLE_OAUTH_REFRESH_TOKEN)
      : !!(e.GOOGLE_SERVICE_ACCOUNT_EMAIL && e.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
  }

  get rootFolderId(): string {
    return this.env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  }

  // ── Authorisation ──────────────────────────────────────────────────────────

  private async accessToken(forceRefresh = false): Promise<string> {
    if (!this.configured) throw new DriveError('drive_not_configured', 'Google Drive is not configured.')
    const cacheKey = `${this.authMode}:${this.env.GOOGLE_OAUTH_CLIENT_ID ?? this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`
    const cached = tokenCache.get(cacheKey)
    if (!forceRefresh && cached && cached.expiresAt > this.deps.now().getTime() + 60_000) return cached.token

    const body = this.authMode === 'oauth' ? this.oauthBody() : await this.serviceAccountBody()
    let res: Response
    try {
      res = await this.deps.fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body })
    } catch {
      throw new DriveError('drive_unavailable', 'Google sign-in could not be reached.', true)
    }
    if (!res.ok) {
      const detail = (await res.json().catch(() => ({}))) as { error?: string }
      // invalid_grant: the refresh token was revoked, expired (Google "Testing" apps expire in 7 days) or never valid.
      if (res.status === 400 || res.status === 401) throw new DriveError('drive_auth_failed', `Google rejected the stored credentials (${detail.error ?? res.status}).`)
      throw new DriveError('drive_unavailable', 'Google sign-in is temporarily unavailable.', true)
    }
    const json = (await res.json()) as { access_token?: string; expires_in?: number }
    if (!json.access_token) throw new DriveError('drive_auth_failed', 'Google did not return an access token.')
    tokenCache.set(cacheKey, { token: json.access_token, expiresAt: this.deps.now().getTime() + (json.expires_in ?? 3600) * 1000 })
    return json.access_token
  }

  private oauthBody(): string {
    return new URLSearchParams({
      client_id: this.env.GOOGLE_OAUTH_CLIENT_ID!,
      client_secret: this.env.GOOGLE_OAUTH_CLIENT_SECRET!,
      refresh_token: this.env.GOOGLE_OAUTH_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }).toString()
  }

  private async serviceAccountBody(): Promise<string> {
    const iat = Math.floor(this.deps.now().getTime() / 1000)
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
    const claims = b64url(
      JSON.stringify({ iss: this.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: SCOPE, aud: TOKEN_URL, iat, exp: iat + 3600 }),
    )
    const pem = this.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY!.replace(/\\n/g, '\n')
    const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0))
    let key: CryptoKey
    try {
      key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
    } catch {
      throw new DriveError('drive_auth_failed', 'The service account private key could not be read.')
    }
    const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))
    return new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }).toString()
  }

  // ── Requests ───────────────────────────────────────────────────────────────

  /**
   * Calls Drive with a fresh token, refreshing once on 401 and retrying
   * rate-limit and server errors a couple of times. Throws a classified
   * DriveError for anything that is still not a success.
   * `missing` says what a 404 means for this call.
   */
  private async request(url: string, init: RequestInit, missing: 'drive_folder_missing' | 'drive_folder_inaccessible' | 'drive_file_missing'): Promise<Response> {
    let refreshed = false
    for (let attempt = 0; ; attempt++) {
      const token = await this.accessToken(refreshed)
      let res: Response
      try {
        res = await this.deps.fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } })
      } catch {
        if (attempt < 2) {
          await this.deps.sleep(250 * 2 ** attempt)
          continue
        }
        throw new DriveError('drive_unavailable', 'Google Drive could not be reached.', true)
      }
      if (res.ok) return res
      if (res.status === 401 && !refreshed) {
        refreshed = true
        continue
      }
      const error = await classify(res, missing)
      if (error.retryable && attempt < 2) {
        await this.deps.sleep(250 * 2 ** attempt)
        continue
      }
      throw error
    }
  }

  private async json<T>(url: string, init: RequestInit, missing: Parameters<DriveClient['request']>[2]): Promise<T> {
    return (await (await this.request(url, init, missing)).json()) as T
  }

  // ── Folders ────────────────────────────────────────────────────────────────

  /**
   * Check that the configured folder is reachable and writable by the
   * configured account. This is what to run before trusting a share link:
   * a link that opens in a browser does not mean the API account can upload.
   */
  async checkRoot(): Promise<RootCheck> {
    const authMode = this.authMode
    if (!this.configured) return { ok: false, code: 'drive_not_configured', message: 'Google Drive credentials or folder id are missing.', authMode }
    try {
      const f = await this.json<{
        name: string
        mimeType: string
        trashed?: boolean
        driveId?: string
        webViewLink?: string
        capabilities?: { canAddChildren?: boolean }
        permissions?: { type?: string }[]
      }>(`${DRIVE}/files/${encodeURIComponent(this.rootFolderId)}?supportsAllDrives=true&fields=${encodeURIComponent('id,name,mimeType,trashed,driveId,webViewLink,capabilities(canAddChildren),permissions(type,role)')}`, {}, 'drive_folder_inaccessible')
      if (f.mimeType !== FOLDER_MIME) return { ok: false, code: 'not_a_folder', message: 'The configured id is a file, not a folder.', authMode }
      if (f.trashed) return { ok: false, code: 'folder_trashed', message: 'The configured folder is in the bin.', authMode }
      const canAdd = f.capabilities?.canAddChildren === true
      // Drive only lists permissions to accounts allowed to share the folder; otherwise this stays unknown.
      const publiclyShared = Array.isArray(f.permissions) ? f.permissions.some((p) => p.type === 'anyone') : undefined
      const base = {
        folderName: f.name,
        inSharedDrive: !!f.driveId,
        canAddChildren: canAdd,
        authMode,
        folderUrl: f.webViewLink ?? `https://drive.google.com/drive/folders/${encodeURIComponent(this.rootFolderId)}`,
        publiclyShared,
      }
      if (!canAdd) {
        return { ...base, ok: false, code: 'drive_folder_inaccessible', message: 'The folder is visible but the account only has view access. Give it Editor (or Content manager) access.' }
      }
      if (publiclyShared === true && this.env.ALLOW_PUBLIC_FOLDER !== 'true') {
        return {
          ...base,
          ok: false,
          code: 'drive_folder_public',
          message: 'The folder is shared with anyone who has the link, so certificates in it would not be private. In Google Drive, set the folder’s General access to Restricted.',
        }
      }
      return { ...base, ok: true, message: 'The folder is reachable and the account can add files to it.' }
    } catch (err) {
      if (err instanceof DriveError) return { ok: false, code: err.code, message: err.message, authMode }
      throw err
    }
  }

  /**
   * Refuse to put certificates in a folder that anyone with the link can open: every file inherits its
   * folder's sharing, so that would make them public. Only an explicit "anyone" permission blocks; if Drive
   * doesn't tell us (or the lookup fails) the upload carries on and later steps report real problems.
   */
  async assertPrivateRoot(): Promise<void> {
    if (this.env.ALLOW_PUBLIC_FOLDER === 'true' || this.deps.now().getTime() < privateUntil) return
    let permissions: { type?: string }[] | undefined
    try {
      const f = await this.json<{ permissions?: { type?: string }[] }>(
        `${DRIVE}/files/${encodeURIComponent(this.rootFolderId)}?supportsAllDrives=true&fields=${encodeURIComponent('permissions(type)')}`,
        {},
        'drive_folder_inaccessible',
      )
      permissions = f.permissions
    } catch (err) {
      if (err instanceof DriveError && err.code === 'drive_auth_failed') throw err
      return
    }
    if (permissions?.some((p) => p.type === 'anyone')) {
      throw new DriveError('drive_folder_public', 'The Drive folder is shared with anyone who has the link.')
    }
    privateUntil = this.deps.now().getTime() + PRIVACY_TTL_MS
  }

  private async listFolders(name: string, parentId: string): Promise<DriveFile[]> {
    const q = `name = '${escapeQuery(name)}' and '${escapeQuery(parentId)}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`
    const params = new URLSearchParams({
      q,
      fields: `files(${FILE_FIELDS})`,
      orderBy: 'createdTime',
      pageSize: '10',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
    })
    const out = await this.json<{ files: DriveFile[] }>(`${DRIVE}/files?${params}`, {}, 'drive_folder_missing')
    return out.files ?? []
  }

  /**
   * Find the folder called `name` under `parentId`, creating it only if it
   * doesn't exist. If two requests create it at the same moment, both then
   * agree on the oldest one and the loser trashes its (empty) copy, so no
   * duplicate folders are left behind.
   */
  async findOrCreateFolder(name: string, parentId: string): Promise<string> {
    const existing = await this.listFolders(name, parentId)
    if (existing.length > 0) return existing[0].id
    const created = await this.json<DriveFile>(
      `${DRIVE}/files?supportsAllDrives=true&fields=${encodeURIComponent(FILE_FIELDS)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }) },
      'drive_folder_missing',
    )
    const after = await this.listFolders(name, parentId)
    const winner = after[0] ?? created
    if (winner.id !== created.id) await this.trash(created.id).catch(() => undefined)
    return winner.id
  }

  /** Resolve (creating as needed) root/seg1/seg2/…; remembers ids for a few minutes. */
  async ensureFolderPath(segments: string[]): Promise<string> {
    let parent = this.rootFolderId
    let key = this.rootFolderId
    for (const segment of segments) {
      key = `${key}/${segment}`
      const hit = folderCache.get(key)
      if (hit && this.deps.now().getTime() - hit.at < FOLDER_TTL_MS) {
        parent = hit.id
        continue
      }
      parent = await this.findOrCreateFolder(segment, parent)
      folderCache.set(key, { id: parent, at: this.deps.now().getTime() })
    }
    return parent
  }

  /** Forget cached folder ids, for when Drive says one has gone. */
  forgetFolders() {
    folderCache.clear()
  }

  // ── Files ──────────────────────────────────────────────────────────────────

  /** A file this app created for `uploadId`, if one is already in the folder (an earlier attempt that was cut short). */
  async findByUploadId(folderId: string, uploadId: string): Promise<DriveFile | null> {
    const q = `'${escapeQuery(folderId)}' in parents and trashed = false and appProperties has { key='uploadId' and value='${escapeQuery(uploadId)}' }`
    const params = new URLSearchParams({
      q,
      fields: `files(${FILE_FIELDS})`,
      orderBy: 'createdTime',
      pageSize: '5',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
    })
    const out = await this.json<{ files: DriveFile[] }>(`${DRIVE}/files?${params}`, {}, 'drive_folder_missing')
    return out.files?.[0] ?? null
  }

  /** Names of the (non-folder) files already in a folder, so a new file can be given a free name. */
  async listFileNames(folderId: string): Promise<string[]> {
    const params = new URLSearchParams({
      q: `'${escapeQuery(folderId)}' in parents and trashed = false and mimeType != '${FOLDER_MIME}'`,
      fields: 'files(name)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
    })
    const out = await this.json<{ files?: { name: string }[] }>(`${DRIVE}/files?${params}`, {}, 'drive_folder_missing')
    return (out.files ?? []).map((f) => f.name)
  }

  async uploadFile(input: { folderId: string; name: string; mimeType: string; bytes: Uint8Array; appProperties: Record<string, string> }): Promise<DriveFile> {
    const boundary = `certipass-${this.deps.uuid()}`
    const meta = JSON.stringify({
      name: input.name,
      mimeType: input.mimeType,
      parents: [input.folderId],
      appProperties: { [APP_MARKER.key]: APP_MARKER.value, ...input.appProperties },
    })
    const enc = new TextEncoder()
    const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${input.mimeType}\r\n\r\n`)
    const tail = enc.encode(`\r\n--${boundary}--`)
    const body = new Uint8Array(head.length + input.bytes.length + tail.length)
    body.set(head, 0)
    body.set(input.bytes, head.length)
    body.set(tail, head.length + input.bytes.length)
    return this.json<DriveFile>(
      `${UPLOAD}/files?uploadType=multipart&supportsAllDrives=true&fields=${encodeURIComponent(FILE_FIELDS)}`,
      { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body },
      'drive_folder_missing',
    )
  }

  async getFile(fileId: string): Promise<DriveFile> {
    return this.json<DriveFile>(`${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=${encodeURIComponent(FILE_FIELDS)}`, {}, 'drive_file_missing')
  }

  /** The raw upstream response for a file's bytes. The caller streams it on and must have authorised the request already. */
  async download(fileId: string): Promise<Response> {
    return this.request(`${DRIVE}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {}, 'drive_file_missing')
  }

  /** Move to the bin (recoverable for 30 days) rather than deleting for good. */
  async trash(fileId: string): Promise<void> {
    await this.request(
      `${DRIVE}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id`,
      { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) },
      'drive_file_missing',
    )
  }

  /** One page of files this app created, newest activity not guaranteed. Used to look for orphans. */
  async listAppFiles(pageToken?: string): Promise<{ files: DriveFile[]; nextPageToken?: string }> {
    const params = new URLSearchParams({
      q: `appProperties has { key='${APP_MARKER.key}' and value='${APP_MARKER.value}' } and trashed = false and mimeType != '${FOLDER_MIME}'`,
      fields: `nextPageToken,files(${FILE_FIELDS})`,
      pageSize: '100',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
      corpora: 'allDrives',
    })
    if (pageToken) params.set('pageToken', pageToken)
    const out = await this.json<{ files?: DriveFile[]; nextPageToken?: string }>(`${DRIVE}/files?${params}`, {}, 'drive_folder_missing')
    return { files: out.files ?? [], nextPageToken: out.nextPageToken }
  }
}

/** Turn a failed Drive response into a DriveError the rest of the Worker understands. */
async function classify(res: Response, missing: 'drive_folder_missing' | 'drive_folder_inaccessible' | 'drive_file_missing'): Promise<DriveError> {
  const body = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; message?: string } }
  const reason = body.error?.errors?.[0]?.reason ?? ''
  if (res.status === 401) return new DriveError('drive_auth_failed', 'Google rejected the access token.')
  if (res.status === 403) {
    if (/storageQuotaExceeded|teamDriveFileLimitExceeded|driveFileLimitExceeded/i.test(reason)) {
      return new DriveError('drive_quota', 'The Drive account has no storage available for new files.')
    }
    if (/rateLimitExceeded|userRateLimitExceeded|sharingRateLimitExceeded/i.test(reason)) {
      return new DriveError('drive_rate_limited', 'Google Drive is rate limiting requests.', true)
    }
    return new DriveError('drive_folder_inaccessible', 'The account does not have permission to use this Drive folder.')
  }
  if (res.status === 404) return new DriveError(missing, missing === 'drive_file_missing' ? 'The file is not in Drive.' : 'The Drive folder was not found or is not shared with the account.')
  if (res.status === 429) return new DriveError('drive_rate_limited', 'Google Drive is rate limiting requests.', true)
  if (res.status >= 500) return new DriveError('drive_unavailable', 'Google Drive had a server error.', true)
  return new DriveError('drive_unavailable', `Google Drive returned an unexpected response (${res.status}).`, res.status === 408)
}
