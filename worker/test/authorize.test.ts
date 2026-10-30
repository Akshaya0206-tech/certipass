import { createHash } from 'node:crypto'
import { createServer } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { DRIVE_SCOPE, authorize, type AuthorizeOptions, type AuthorizeOutcome } from '../scripts/oauthFlow'

const CLIENT_ID = 'test-client.apps.googleusercontent.com'
const CLIENT_SECRET = 'TEST-CLIENT-SECRET-VALUE'
const AUTH_CODE = 'AUTH-CODE-THAT-MUST-NOT-LEAK'
const ACCESS_TOKEN = 'ACCESS-TOKEN-THAT-MUST-NOT-LEAK'
const REFRESH_TOKEN = 'REFRESH-TOKEN-VALUE'

interface Reply {
  status?: number
  body: Record<string, unknown> | string
}

function fakeGoogle(token: Reply = { body: { access_token: ACCESS_TOKEN, refresh_token: REFRESH_TOKEN } }) {
  const tokenCalls: URLSearchParams[] = []
  let gate: Promise<void> | undefined
  const reply = ({ status = 200, body }: Reply) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status })
  return {
    tokenCalls,
    hold() {
      let release!: () => void
      gate = new Promise<void>((r) => (release = r))
      return release
    },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://oauth2.googleapis.com/token') {
        tokenCalls.push(new URLSearchParams(String(init?.body)))
        await gate
        return reply(token)
      }
      if (url.startsWith('https://www.googleapis.com/drive/v3/about')) return reply({ body: { user: { emailAddress: 'records@rajalakshmi.edu.in' } } })
      throw new Error(`unexpected request to ${url}`)
    }) as unknown as typeof fetch,
  }
}

async function begin(token?: Reply, flow: Partial<AuthorizeOptions> = {}) {
  const google = fakeGoogle(token)
  const ignored: string[] = []
  type Listening = { authUrl: string; startUrl: string; redirectUri: string }
  let ready!: (info: Listening) => void
  const listening = new Promise<Listening>((r) => (ready = r))
  const outcome = authorize({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    port: 0,
    timeoutMs: 10000,
    fetch: google.fetch,
    onListening: ready,
    onIgnored: (m) => ignored.push(m),
    ...flow,
  })
  const { authUrl, startUrl, redirectUri } = await listening
  const params = new URL(authUrl).searchParams
  return {
    outcome,
    authUrl,
    startUrl,
    redirectUri,
    params,
    state: params.get('state')!,
    google,
    ignored,
    callback: (query: Record<string, string> | string) => fetch(`${redirectUri}?${typeof query === 'string' ? query : new URLSearchParams(query)}`),
  }
}

const stillWaiting = (p: Promise<AuthorizeOutcome>) => Promise.race([p.then(() => false), new Promise<boolean>((r) => setTimeout(() => r(true), 150))])
const refused = (url: string) => expect(fetch(url)).rejects.toThrow()

describe('authorisation URL', () => {
  it('carries every parameter Google needs, with the redirect address of the running server', async () => {
    const run = await begin()
    expect(run.authUrl.startsWith('https://accounts.google.com/o/oauth2/v2/auth?')).toBe(true)
    expect(run.params.get('response_type')).toBe('code')
    expect(run.params.get('client_id')).toBe(CLIENT_ID)
    expect(run.params.get('redirect_uri')).toBe(run.redirectUri)
    expect(run.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect(run.params.get('scope')).toBe(DRIVE_SCOPE)
    expect(run.params.get('access_type')).toBe('offline')
    expect(run.params.get('prompt')).toBe('select_account consent')
    expect(run.params.get('code_challenge_method')).toBe('S256')
    expect(run.params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(run.state).toMatch(/^[0-9a-f]{64}$/)
    expect(run.authUrl).not.toContain(CLIENT_SECRET)
    await run.callback({ error: 'access_denied', state: run.state })
    await run.outcome
  })

  it('uses a fresh state and PKCE challenge on every run', async () => {
    const first = await begin()
    const second = await begin()
    expect(first.state).not.toBe(second.state)
    expect(first.params.get('code_challenge')).not.toBe(second.params.get('code_challenge'))
    expect(first.redirectUri).not.toBe(second.redirectUri)
    for (const run of [first, second]) {
      await run.callback({ error: 'access_denied', state: run.state })
      await run.outcome
    }
  })
})

describe('short start link', () => {
  it('redirects the browser to this run\'s own Google page, however many times it is opened', async () => {
    const run = await begin()
    expect(run.startUrl).toBe(run.redirectUri.replace('/callback', '/start'))
    for (let i = 0; i < 2; i++) {
      const res = await fetch(run.startUrl, { redirect: 'manual' })
      expect(res.status).toBe(302)
      expect(res.headers.get('location')).toBe(run.authUrl)
    }
    expect(await stillWaiting(run.outcome)).toBe(true)
    await run.callback({ state: run.state, code: AUTH_CODE })
    expect(await run.outcome).toMatchObject({ ok: true })
  })

  it('belongs to one run: another run\'s short link leads to that run\'s own state', async () => {
    const first = await begin()
    const second = await begin()
    const toFirst = await fetch(first.startUrl, { redirect: 'manual' })
    const toSecond = await fetch(second.startUrl, { redirect: 'manual' })
    expect(new URL(toFirst.headers.get('location')!).searchParams.get('state')).toBe(first.state)
    expect(new URL(toSecond.headers.get('location')!).searchParams.get('state')).toBe(second.state)
    for (const run of [first, second]) {
      await run.callback({ error: 'access_denied', state: run.state })
      await run.outcome
    }
  })

  it('is closed once the sign-in has been used, and accepts GET only', async () => {
    const run = await begin()
    expect((await fetch(run.startUrl, { method: 'POST' })).status).toBe(405)
    await run.callback({ state: run.state, code: AUTH_CODE })
    await run.outcome
    await refused(run.startUrl)
  })

  it('answers 409 for the short link while the code exchange is still in flight', async () => {
    const run = await begin()
    const release = run.google.hold()
    const first = run.callback({ state: run.state, code: AUTH_CODE })
    await vi.waitFor(() => expect(run.google.tokenCalls).toHaveLength(1))
    expect((await fetch(run.startUrl, { redirect: 'manual' })).status).toBe(409)
    release()
    await first
    await run.outcome
  })
})

describe('successful callback', () => {
  it('exchanges the code with the same redirect address and a verifier that matches the challenge', async () => {
    const run = await begin()
    const res = await run.callback({ state: run.state, code: AUTH_CODE })
    expect(res.status).toBe(200)

    const outcome = await run.outcome
    expect(outcome).toEqual({ ok: true, refreshToken: REFRESH_TOKEN, account: 'records@rajalakshmi.edu.in' })

    expect(run.google.tokenCalls).toHaveLength(1)
    const body = run.google.tokenCalls[0]
    expect(body.get('grant_type')).toBe('authorization_code')
    expect(body.get('code')).toBe(AUTH_CODE)
    expect(body.get('client_id')).toBe(CLIENT_ID)
    expect(body.get('client_secret')).toBe(CLIENT_SECRET)
    expect(body.get('redirect_uri')).toBe(run.params.get('redirect_uri'))
    const verifier = body.get('code_verifier')!
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/)
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(run.params.get('code_challenge'))
  })

  it('closes the server once finished', async () => {
    const run = await begin()
    await run.callback({ state: run.state, code: AUTH_CODE })
    await run.outcome
    await refused(run.redirectUri)
  })
})

describe('callbacks that do not belong to this run', () => {
  it('rejects a callback with a different state but keeps waiting, so the real one still works', async () => {
    const run = await begin()
    const stale = await run.callback({ state: 'a'.repeat(64), code: 'stale-code' })
    expect(stale.status).toBe(400)
    expect(await stillWaiting(run.outcome)).toBe(true)
    expect(run.google.tokenCalls).toHaveLength(0)
    expect(run.ignored).toHaveLength(1)

    const real = await run.callback({ state: run.state, code: AUTH_CODE })
    expect(real.status).toBe(200)
    expect(await run.outcome).toMatchObject({ ok: true, refreshToken: REFRESH_TOKEN })
    expect(run.google.tokenCalls).toHaveLength(1)
    expect(run.google.tokenCalls[0].get('code')).toBe(AUTH_CODE)
  })

  it('rejects a callback from an earlier run of the command', async () => {
    const earlier = await begin()
    const current = await begin()
    const res = await current.callback({ state: earlier.state, code: AUTH_CODE })
    expect(res.status).toBe(400)
    expect(await stillWaiting(current.outcome)).toBe(true)
    expect(current.google.tokenCalls).toHaveLength(0)
    for (const run of [earlier, current]) {
      await run.callback({ error: 'access_denied', state: run.state })
      await run.outcome
    }
  })

  it('rejects a callback with no state, and says so separately from a mismatch', async () => {
    const run = await begin()
    expect((await run.callback({ code: AUTH_CODE })).status).toBe(400)
    expect((await run.callback('state=&code=x')).status).toBe(400)
    expect(await stillWaiting(run.outcome)).toBe(true)
    expect(run.google.tokenCalls).toHaveLength(0)
    expect(run.ignored[0]).toContain('without a "state"')
    await run.callback({ error: 'access_denied', state: run.state })
    await run.outcome
  })

  it('tells a truncated link (Google sent a result, no state) apart from the bare address opened by hand', async () => {
    const run = await begin()
    const truncated = await run.callback({ code: AUTH_CODE, scope: 'drive' })
    expect(await truncated.text()).toContain(run.startUrl)
    expect(run.ignored[0]).toContain('incomplete')

    const bare = await fetch(run.redirectUri)
    expect(bare.status).toBe(400)
    expect(await bare.text()).toContain(run.startUrl)
    expect(run.ignored[1]).toContain('opened with no sign-in data')
    expect(run.ignored[1]).not.toContain('incomplete')

    expect(await stillWaiting(run.outcome)).toBe(true)
    expect(run.google.tokenCalls).toHaveLength(0)
    await run.callback({ state: run.state, code: AUTH_CODE })
    expect(await run.outcome).toMatchObject({ ok: true })
  })

  it('rejects a repeated state parameter even when one copy is right', async () => {
    const run = await begin()
    const res = await run.callback(`state=${run.state}&state=${run.state}&code=${AUTH_CODE}`)
    expect(res.status).toBe(400)
    expect(run.google.tokenCalls).toHaveLength(0)
    await run.callback({ error: 'access_denied', state: run.state })
    await run.outcome
  })

  it('does not let an unauthenticated "error" callback end the run', async () => {
    const run = await begin()
    expect((await run.callback({ error: 'access_denied' })).status).toBe(400)
    expect((await run.callback({ error: 'access_denied', state: 'wrong' })).status).toBe(400)
    expect(await stillWaiting(run.outcome)).toBe(true)
    await run.callback({ state: run.state, code: AUTH_CODE })
    expect(await run.outcome).toMatchObject({ ok: true })
  })

  it('never puts the rejected request values into the messages it reports', async () => {
    const run = await begin()
    await run.callback({ state: 'SECRET-STALE-STATE', code: 'SECRET-STALE-CODE' })
    expect(run.ignored.join(' ')).not.toMatch(/SECRET-STALE/)
    await run.callback({ error: 'access_denied', state: run.state })
    await run.outcome
  })

  it('answers other paths and methods without affecting the run', async () => {
    const run = await begin()
    expect((await fetch(new URL('/favicon.ico', run.redirectUri))).status).toBe(404)
    expect((await fetch(run.redirectUri, { method: 'POST' })).status).toBe(405)
    expect(await stillWaiting(run.outcome)).toBe(true)
    expect(run.ignored).toHaveLength(0)
    await run.callback({ state: run.state, code: AUTH_CODE })
    expect(await run.outcome).toMatchObject({ ok: true })
  })
})

describe('terminal errors', () => {
  it('stops cleanly when the user declines, without a token request', async () => {
    const run = await begin()
    const res = await run.callback({ state: run.state, error: 'access_denied' })
    expect(res.status).toBe(400)
    expect(await run.outcome).toMatchObject({ ok: false, code: 'declined' })
    expect(run.google.tokenCalls).toHaveLength(0)
    await refused(run.redirectUri)
  })

  it('reports any other Google error by its code only', async () => {
    const run = await begin()
    await run.callback({ state: run.state, error: 'invalid_scope\u001b[31m' })
    const outcome = await run.outcome
    expect(outcome).toMatchObject({ ok: false, code: 'google_error' })
    expect((outcome as { message: string }).message).not.toContain('\u001b')
  })

  it('stops cleanly when Google sends no authorisation code', async () => {
    const run = await begin()
    const res = await run.callback({ state: run.state })
    expect(res.status).toBe(400)
    expect(await run.outcome).toMatchObject({ ok: false, code: 'no_code' })
    expect(run.google.tokenCalls).toHaveLength(0)
    await refused(run.redirectUri)
  })

  it('reports a refused code exchange with a hint, and leaks no secret, code or token', async () => {
    const run = await begin({ status: 400, body: { error: 'invalid_grant', error_description: 'Bad Request' } })
    await run.callback({ state: run.state, code: AUTH_CODE })
    const outcome = await run.outcome
    expect(outcome).toMatchObject({ ok: false, code: 'token_exchange_failed' })
    const text = JSON.stringify(outcome)
    expect(text).toContain('invalid_grant')
    for (const secret of [CLIENT_SECRET, AUTH_CODE, ACCESS_TOKEN, REFRESH_TOKEN]) expect(text).not.toContain(secret)
    await refused(run.redirectUri)
  })

  it('points at the client id and secret when Google says invalid_client', async () => {
    const run = await begin({ status: 401, body: { error: 'invalid_client' } })
    await run.callback({ state: run.state, code: AUTH_CODE })
    const outcome = (await run.outcome) as { message: string }
    expect(outcome.message).toContain('GOOGLE_OAUTH_CLIENT_SECRET')
  })

  it('survives a token reply that is not JSON', async () => {
    const run = await begin({ status: 502, body: '<html>bad gateway</html>' })
    await run.callback({ state: run.state, code: AUTH_CODE })
    expect(await run.outcome).toMatchObject({ ok: false, code: 'token_exchange_failed' })
  })

  it('does not accept a response with no refresh token', async () => {
    const run = await begin({ body: { access_token: ACCESS_TOKEN } })
    const res = await run.callback({ state: run.state, code: AUTH_CODE })
    expect(res.status).toBe(502)
    expect(await run.outcome).toMatchObject({ ok: false, code: 'no_refresh_token' })
  })

  it('reports a busy port instead of crashing', async () => {
    const blocker = createServer()
    await new Promise<void>((r) => blocker.listen(0, '127.0.0.1', r))
    const port = (blocker.address() as { port: number }).port
    try {
      const onListening = vi.fn()
      const outcome = await authorize({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET, port, timeoutMs: 1000, onListening })
      expect(outcome).toMatchObject({ ok: false, code: 'port_in_use' })
      expect((outcome as { message: string }).message).toContain(String(port))
      expect(onListening).not.toHaveBeenCalled()
    } finally {
      blocker.close()
    }
  })

  it('gives up and closes the server when nobody signs in', async () => {
    const run = await begin(undefined, { timeoutMs: 60 })
    expect(await run.outcome).toMatchObject({ ok: false, code: 'timeout' })
    await refused(run.redirectUri)
  })
})

describe('duplicate callbacks', () => {
  it('lets only one callback start the code exchange, even while it is still in flight', async () => {
    const run = await begin()
    const release = run.google.hold()
    const first = run.callback({ state: run.state, code: AUTH_CODE })
    await vi.waitFor(() => expect(run.google.tokenCalls).toHaveLength(1))

    const repeat = await run.callback({ state: run.state, code: AUTH_CODE })
    expect(repeat.status).toBe(409)

    release()
    expect((await first).status).toBe(200)
    expect(await run.outcome).toMatchObject({ ok: true })
    expect(run.google.tokenCalls).toHaveLength(1)
  })

  it('refuses a repeat after the run has finished', async () => {
    const run = await begin()
    await run.callback({ state: run.state, code: AUTH_CODE })
    await run.outcome
    await refused(`${run.redirectUri}?state=${run.state}&code=${AUTH_CODE}`)
  })
})
