/*
 * The browser sign-in behind `npm run drive:authorize`: OAuth 2.0 authorisation-code flow with PKCE for a
 * Google "Desktop app" client, using a one-shot server on 127.0.0.1 to receive Google's redirect.
 *
 * Each call makes its own random `state` and PKCE verifier, so a link from an earlier run can never complete
 * this one. A callback that does not belong to this run is rejected but does NOT stop the run (a stale browser
 * tab must not be able to kill the sign-in you are actually doing). The run ends only on a valid callback, a
 * clear terminal error, or the timeout. Nothing here logs the authorisation code, the client secret or any
 * token; the refresh token is only handed back to the caller.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive'
const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const ABOUT_ENDPOINT = 'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)'

export type FailureCode = 'port_in_use' | 'server_error' | 'declined' | 'google_error' | 'no_code' | 'token_exchange_failed' | 'no_refresh_token' | 'timeout'

export type AuthorizeOutcome = { ok: true; refreshToken: string; account?: string } | { ok: false; code: FailureCode; message: string }

export interface AuthorizeOptions {
  clientId: string
  clientSecret: string
  /** Port for the callback server. 0 lets the OS pick one (used by tests). */
  port: number
  /** Give up and close the server after this long without a valid callback. */
  timeoutMs: number
  fetch?: typeof fetch
  /**
   * Called once the server is listening. `startUrl` is a short local link that sends the browser to this run's Google
   * page, so nothing long has to be copied; `authUrl` is the same Google page, for when the short link can't be used.
   */
  onListening: (info: { authUrl: string; startUrl: string; redirectUri: string }) => void
  /** Called with a fixed message when a callback is rejected without ending the run. Never contains request values. */
  onIgnored?: (message: string) => void
}

interface TokenResponse {
  access_token?: string
  refresh_token?: string
  error?: string
  error_description?: string
}

const TOKEN_HINTS: Record<string, string> = {
  invalid_client: 'Google rejected the client id or secret. Check GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in worker/.dev.vars, and that the OAuth client type is "Desktop app".',
  invalid_grant: 'The authorisation code was already used, expired, or came from another run. Start again and use only the new link.',
  redirect_uri_mismatch: 'Google did not accept the redirect address. The OAuth client type must be "Desktop app".',
}

// Google puts `state` on every redirect, success or error. So a callback that carries a result from Google but no
// state means the link it started from was incomplete, while one with nothing attached was simply opened by hand.
const IGNORED_INCOMPLETE_LINK = 'Google redirected back without a "state" value, so the callback was ignored. The sign-in link that was opened was incomplete (usually cut off when copied). Use the short link from this run. Still waiting.'
const IGNORED_OPENED_DIRECTLY = 'The callback address was opened with no sign-in data attached (for example from browser history, a bookmark or address-bar autocomplete) and was ignored. Still waiting for the sign-in from this run.'
const IGNORED_OTHER_RUN = 'A callback from a different sign-in attempt was ignored (usually an old browser tab). Use only the link printed by this run. Still waiting.'

/** Keep only short printable ASCII, so text that came from outside can't carry escape codes into the terminal. */
const printable = (value: unknown, max: number) => String(value ?? '').replace(/[^\x20-\x7E]/g, '').slice(0, max)

function send(res: ServerResponse, status: number, text: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    // No keep-alive: once the run ends nothing can still be talking to the server.
    Connection: 'close',
  })
  res.end(text)
}

export function authorize(opts: AuthorizeOptions): Promise<AuthorizeOutcome> {
  const doFetch = opts.fetch ?? fetch
  const state = randomBytes(32).toString('hex')
  const verifier = randomBytes(64).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const expectedState = Buffer.from(state)
  let redirectUri = ''
  let startUrl = ''
  let authUrl = ''
  let claimed = false

  return new Promise<AuthorizeOutcome>((resolve) => {
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (outcome: AuthorizeOutcome) => {
      if (done) return
      done = true
      clearTimeout(timer)
      server.close()
      server.closeIdleConnections()
      resolve(outcome)
    }
    const fail = (code: FailureCode, message: string) => finish({ ok: false, code, message })

    const handle = async (req: IncomingMessage, res: ServerResponse) => {
      let url: URL
      try {
        url = new URL(req.url ?? '/', 'http://127.0.0.1')
      } catch {
        return send(res, 400, 'Bad request.')
      }
      if (url.pathname !== '/callback' && url.pathname !== '/start') return send(res, 404, 'Not found.')
      if (req.method !== 'GET') return send(res, 405, 'Method not allowed.')

      // One valid callback per run. A repeat (refresh, double click, a second tab) must not start a second token exchange.
      if (claimed) return send(res, 409, 'This sign-in link was already used. Return to the terminal.')

      // The short link: always sends the browser to the Google page for THIS run, however many times it is opened.
      if (url.pathname === '/start') {
        res.writeHead(302, { Location: authUrl, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', Connection: 'close' })
        return void res.end()
      }

      // The state check comes first: nothing else in the request is trusted until it passes.
      const received = url.searchParams.getAll('state')
      if (received.length === 0 || received[0] === '') {
        const fromGoogle = url.searchParams.has('code') || url.searchParams.has('error')
        opts.onIgnored?.(fromGoogle ? IGNORED_INCOMPLETE_LINK : IGNORED_OPENED_DIRECTLY)
        return send(res, 400, fromGoogle
          ? `Google sent you back, but the link you started from was incomplete. Close this tab and open ${startUrl} instead.`
          : `This address was opened without a sign-in attached. Start the sign-in by opening ${startUrl}`)
      }
      const got = Buffer.from(received[0])
      if (received.length !== 1 || got.length !== expectedState.length || !timingSafeEqual(got, expectedState)) {
        opts.onIgnored?.(IGNORED_OTHER_RUN)
        return send(res, 400, 'This link belongs to a different sign-in attempt. Close this tab, return to the terminal, and use the link printed by the run that is currently waiting.')
      }
      claimed = true

      const error = url.searchParams.get('error')
      if (error) {
        const reason = printable(error, 64) || 'unknown_error'
        send(res, 400, 'Access was not granted. Return to the terminal.')
        return reason === 'access_denied'
          ? fail('declined', 'Access was not granted in the browser (access_denied). Run this again and choose Allow.')
          : fail('google_error', `Google returned an error: ${reason}.`)
      }
      const code = url.searchParams.get('code')
      if (!code || code.length > 2048) {
        send(res, 400, 'Google did not send an authorisation code. Return to the terminal.')
        return fail('no_code', 'Google did not return an authorisation code. Start again.')
      }

      let token: TokenResponse = {}
      let status = 0
      try {
        const tokenRes = await doFetch(TOKEN_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: opts.clientId, client_secret: opts.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier }),
        })
        status = tokenRes.status
        token = (await tokenRes.json()) as TokenResponse
        if (!tokenRes.ok) token.access_token = undefined
      } catch {
        // Network failure or a reply that wasn't JSON: reported below without echoing anything.
      }
      if (!token.access_token) {
        const reason = printable(token.error, 64) || (status ? `http_${status}` : 'network_error')
        const detail = printable(token.error_description, 200)
        send(res, 502, 'The authorisation code could not be exchanged. Return to the terminal.')
        return fail('token_exchange_failed', `Google would not exchange the authorisation code (${reason}${detail ? `: ${detail}` : ''}). ${TOKEN_HINTS[reason] ?? 'Start again.'}`.trim())
      }
      if (!token.refresh_token) {
        send(res, 502, 'Google did not issue a refresh token. Return to the terminal.')
        return fail('no_refresh_token', 'Google did not return a refresh token. Remove CertiPass at https://myaccount.google.com/permissions and run this again.')
      }

      // Only for the message "Authorised as ...": a failure here doesn't matter, the token is already good.
      let account: string | undefined
      try {
        const about = await doFetch(ABOUT_ENDPOINT, { headers: { Authorization: `Bearer ${token.access_token}` } })
        if (about.ok) account = printable(((await about.json()) as { user?: { emailAddress?: string } }).user?.emailAddress, 200) || undefined
      } catch {
        // ignored
      }
      send(res, 200, 'Authorisation complete. You can close this tab and return to the terminal.')
      finish({ ok: true, refreshToken: token.refresh_token, account })
    }

    const server = createServer((req, res) => {
      handle(req, res).catch(() => {
        if (!res.headersSent) send(res, 500, 'Something went wrong. Return to the terminal.')
        fail('server_error', 'Unexpected error while handling the callback. Start again.')
      })
    })
    server.on('error', (err: NodeJS.ErrnoException) =>
      err.code === 'EADDRINUSE'
        ? fail('port_in_use', `Port ${opts.port} is already in use.`)
        : fail('server_error', `The callback server failed (${printable(err.code, 32) || 'unknown'}).`),
    )
    server.listen(opts.port, '127.0.0.1', () => {
      const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      redirectUri = `${origin}/callback`
      startUrl = `${origin}/start`
      timer = setTimeout(() => fail('timeout', `No sign-in arrived within ${Math.round(opts.timeoutMs / 60000) || 1} minute(s), so this run stopped. Start again for a new link.`), opts.timeoutMs)
      authUrl = `${AUTH_ENDPOINT}?${new URLSearchParams({
        client_id: opts.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        // The full Drive scope is required: the narrower drive.file scope cannot write into a folder this app didn't create.
        scope: DRIVE_SCOPE,
        access_type: 'offline',
        // Always show the account chooser (the account must be the one with Editor access to the folder), and always ask for consent so Google issues a refresh token.
        prompt: 'select_account consent',
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      })}`
      opts.onListening({ authUrl, startUrl, redirectUri })
    })
  })
}
