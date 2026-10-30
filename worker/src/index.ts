/*
 * CertiPass backend Worker: accounts, sessions and certificate storage in Google Drive.
 *
 * Public (no sign-in):
 *   GET    /api/health
 *   POST   /api/auth/login                           email + password → session token
 *   POST   /api/auth/register                        a student registers and is signed in (REGISTRATION_MODE=approval: waits for an administrator)
 *   POST   /api/setup/first-admin                    one-time: create the first administrator (needs SETUP_TOKEN)
 *
 * Any signed-in user:
 *   POST   /api/auth/logout        GET /api/auth/me        POST /api/auth/change-password
 *
 * Certificates (what each role may do is decided from the database on every request):
 *   POST   /api/certificates                         student: upload a certificate (multipart)
 *   GET    /api/certificates                         list the certificates you may see (?q ?department ?batch ?category ?studentId ?achievementId ?limit ?offset)
 *   GET    /api/certificates/by-achievement/:id      look up a student's certificate for an achievement (?student=<uuid> for faculty/admin)
 *   GET    /api/certificates/:id                     a certificate's details
 *   GET    /api/certificates/:id/file?disposition=   stream the file (inline preview or attachment)
 *   DELETE /api/certificates/:id                     admin: remove a certificate
 *
 * Administrators:
 *   GET/POST /api/admin/users     PATCH/DELETE /api/admin/users/:id     POST /api/admin/users/:id/reset-password
 *   GET /api/admin/audit          GET /api/admin/stats          GET /api/storage/status        POST /api/admin/reconcile[?orphans=1&trash=1]
 */
import { authenticate, changePassword, firstAdmin, login, logout, me, register } from './auth'
import {
  getCertificateByAchievement,
  getCertificateMeta,
  listCertificatesRoute,
  reconcile,
  reconcileRoute,
  removeCertificate,
  serveCertificateFile,
  storageStatus,
  uploadCertificate,
} from './certificates'
import type { Ctx } from './ctx'
import { Db, DbError } from './db'
import { DriveClient } from './drive'
import { ApiError } from './errors'
import { json } from './http'
import { auditRoute, createUserRoute, deleteUserRoute, listUsersRoute, resetPasswordRoute, statsRoute, updateUserRoute } from './users'
import { defaultDeps } from './types'
import type { Deps, Env } from './types'

export function makeCtx(env: Env, deps: Deps): Ctx {
  return { env, deps, db: new Db(env.DB, deps.now), drive: new DriveClient(env, deps) }
}

export async function handleRequest(request: Request, env: Env, deps: Deps = defaultDeps): Promise<Response> {
  const origin = request.headers.get('origin')
  const cors = corsHeaders(origin, env)

  if (request.method === 'OPTIONS') {
    // A preflight from an origin we don't list gets nothing, so the browser blocks the real request.
    return new Response(null, { status: cors ? 204 : 403, headers: cors ?? {} })
  }

  let response: Response
  try {
    response = await route(request, env, deps)
  } catch (err) {
    response = errorResponse(err)
  }
  const out = new Response(response.body, response)
  for (const [k, v] of Object.entries(cors ?? {})) out.headers.set(k, v)
  out.headers.set('X-Content-Type-Options', 'nosniff')
  if (!out.headers.has('Cache-Control')) out.headers.set('Cache-Control', 'no-store')
  return out
}

async function route(request: Request, env: Env, deps: Deps): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = request.method

  if (path === '/api/health' && method === 'GET') return json({ ok: true })

  const ctx = makeCtx(env, deps)

  // Routes that must work before anyone is signed in.
  if (path === '/api/auth/login' && method === 'POST') return login(ctx, request)
  if (path === '/api/auth/register' && method === 'POST') return register(ctx, request)
  if (path === '/api/setup/first-admin' && method === 'POST') return firstAdmin(ctx, request)

  if (path.startsWith('/api/')) {
    const caller = await authenticate(request, ctx)

    if (path === '/api/auth/logout' && method === 'POST') return logout(ctx, caller)
    if (path === '/api/auth/me' && method === 'GET') return me(ctx, caller)
    if (path === '/api/auth/change-password' && method === 'POST') return changePassword(ctx, caller, request)

    if (path === '/api/certificates' && method === 'POST') return uploadCertificate(ctx, caller, request)
    if (path === '/api/certificates' && method === 'GET') return listCertificatesRoute(ctx, caller, url)

    const byAchievement = /^\/api\/certificates\/by-achievement\/([^/]+)$/.exec(path)
    if (byAchievement && method === 'GET') return getCertificateByAchievement(ctx, caller, decodeURIComponent(byAchievement[1]), url.searchParams.get('student'))

    const file = /^\/api\/certificates\/([^/]+)\/file$/.exec(path)
    if (file && method === 'GET') {
      const disposition = url.searchParams.get('disposition') === 'attachment' ? 'attachment' : 'inline'
      return serveCertificateFile(ctx, caller, decodeURIComponent(file[1]), disposition)
    }

    const one = /^\/api\/certificates\/([^/]+)$/.exec(path)
    if (one && method === 'GET') return getCertificateMeta(ctx, caller, decodeURIComponent(one[1]))
    if (one && method === 'DELETE') return removeCertificate(ctx, caller, decodeURIComponent(one[1]))

    if (path === '/api/storage/status' && method === 'GET') return storageStatus(ctx, caller)
    if (path === '/api/admin/reconcile' && method === 'POST') return reconcileRoute(ctx, caller, url)

    if (path === '/api/admin/users' && method === 'GET') return listUsersRoute(ctx, caller, url)
    if (path === '/api/admin/users' && method === 'POST') return createUserRoute(ctx, caller, request)
    if (path === '/api/admin/audit' && method === 'GET') return auditRoute(ctx, caller, url)
    if (path === '/api/admin/stats' && method === 'GET') return statsRoute(ctx, caller)
    const userReset = /^\/api\/admin\/users\/([^/]+)\/reset-password$/.exec(path)
    if (userReset && method === 'POST') return resetPasswordRoute(ctx, caller, decodeURIComponent(userReset[1]), request)
    const userOne = /^\/api\/admin\/users\/([^/]+)$/.exec(path)
    if (userOne && method === 'PATCH') return updateUserRoute(ctx, caller, decodeURIComponent(userOne[1]), request)
    if (userOne && method === 'DELETE') return deleteUserRoute(ctx, caller, decodeURIComponent(userOne[1]))
  }

  throw new ApiError(404, 'not_found', 'Not found.')
}

function errorResponse(err: unknown): Response {
  if (err instanceof ApiError) {
    const response = json({ error: { code: err.code, message: err.message, retryable: err.retryable, ...err.extra } }, err.status)
    const wait = err.extra.retryAfterSeconds
    if (typeof wait === 'number') response.headers.set('Retry-After', String(wait))
    return response
  }
  if (err instanceof DbError) {
    console.error(JSON.stringify({ event: 'database_error', code: err.code, detail: err.detail }))
    return json({ error: { code: 'database_unavailable', message: 'The records database could not be reached. Try again in a moment.', retryable: true } }, 503)
  }
  // Log the kind of failure, never the request, headers or any credential.
  console.error(JSON.stringify({ event: 'unhandled_error', name: err instanceof Error ? err.name : typeof err }))
  return json({ error: { code: 'internal_error', message: 'Something went wrong. Try again in a moment.', retryable: true } }, 500)
}

/** CORS headers for an allowed origin, or null. Only exact matches are allowed; there is no wildcard. */
function corsHeaders(origin: string | null, env: Env): Record<string, string> | null {
  const base = { Vary: 'Origin' }
  if (!origin) return base
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean)
  if (!allowed.includes(origin)) return null
  return {
    ...base,
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Disposition, Content-Length, Content-Type, Retry-After',
    'Access-Control-Max-Age': '600',
  }
}

export default {
  fetch: (request: Request, env: Env) => handleRequest(request, env),
  /** Cron: finish interrupted uploads, clear flagged Drive files and forget old sessions. Never trashes orphans on its own. */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const c = makeCtx(env, defaultDeps)
    ctx.waitUntil(
      (async () => {
        await reconcile(c)
        await c.db.purgeExpiredSessions().catch(() => 0)
        await c.db.purgeThrottle(new Date(Date.now() - 2 * 3_600_000).toISOString()).catch(() => 0)
      })(),
    )
  },
}
