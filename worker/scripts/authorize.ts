/*
 * npm run drive:authorize [-- --port 8977] [--no-open]
 *
 * One-off helper that signs in to Google in your browser and stores a refresh token for the Worker. Run it AS
 * THE GOOGLE ACCOUNT that has Editor access to the certificate folder.
 *
 * The refresh token is written straight into worker/.dev.vars (git-ignored), replacing only the
 * GOOGLE_OAUTH_REFRESH_TOKEN line, and is NOT printed. For the deployed Worker, copy it from that file into
 * `npx wrangler secret put GOOGLE_OAUTH_REFRESH_TOKEN` (the prompt hides what you paste).
 *
 * Needs GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET (worker/.dev.vars), from a Google Cloud OAuth
 * client of type "Desktop app". The sign-in logic lives in oauthFlow.ts.
 */
import { spawn } from 'node:child_process'
import { authorize } from './oauthFlow'
import { loadEnv, setDevVar } from './devVars'

const REFRESH_TOKEN_KEY = 'GOOGLE_OAUTH_REFRESH_TOKEN'
const DEFAULT_PORT = 8976
const TIMEOUT_MS = 10 * 60 * 1000

/** Best effort: opens the default browser. Only ever called with this run's own http://127.0.0.1 link. If it fails, the printed link still works. */
function openInBrowser(url: string): void {
  const [command, args]: [string, string[]] =
    process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]]
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' })
    child.on('error', () => {})
    child.unref()
  } catch {
    // ignored
  }
}

const env = loadEnv()
const clientId = env.GOOGLE_OAUTH_CLIENT_ID
const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET
if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in worker/.dev.vars first (see docs/GOOGLE_DRIVE_SETUP.md).')
  process.exit(1)
}

const portFlag = process.argv.indexOf('--port')
const port = portFlag === -1 ? DEFAULT_PORT : Number(process.argv[portFlag + 1])
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error('--port must be a whole number between 1024 and 65535, e.g. npm run drive:authorize -- --port 8977')
  process.exit(1)
}

const outcome = await authorize({
  clientId,
  clientSecret,
  port,
  timeoutMs: TIMEOUT_MS,
  onListening: ({ authUrl, startUrl, redirectUri }) => {
    console.log('Sign in to Google to authorise CertiPass.\n')
    console.log('  1. Open this short link in your browser (this run tries to open it for you):\n')
    console.log(`       ${startUrl}\n`)
    console.log('  2. Choose the Google account that has Editor access to the certificate folder, then click Allow.')
    console.log('  3. Use ONLY the link from this run. Links and tabs from earlier runs are rejected.\n')
    console.log('If the short link cannot be opened, this is the same sign-in as one long line (copy ALL of it, or part of it will be missing):\n')
    console.log(authUrl)
    console.log(`\nWaiting for Google to redirect to ${redirectUri} (gives up after 10 minutes, Ctrl+C to cancel) ...`)
    if (!process.argv.includes('--no-open')) openInBrowser(startUrl)
  },
  onIgnored: (message) => console.warn(`\n${message}`),
})

if (!outcome.ok) {
  console.error(`\n${outcome.message}`)
  if (outcome.code === 'port_in_use') {
    console.error('Most likely an earlier `npm run drive:authorize` is still waiting in another terminal. Close it (Ctrl+C), or find what holds the port:')
    console.error(`  PowerShell:  Get-NetTCPConnection -LocalPort ${port} | Select-Object OwningProcess`)
    console.error(`Or use another port:  npm run drive:authorize -- --port ${port + 1}`)
  }
  process.exitCode = 1
} else {
  const hadToken = !!env.GOOGLE_OAUTH_REFRESH_TOKEN
  console.log(`\nAuthorised as: ${outcome.account ?? 'unknown account'}`)
  console.log('This account must have Editor access to the certificate folder.')
  try {
    setDevVar(REFRESH_TOKEN_KEY, outcome.refreshToken)
    console.log(`Saved ${REFRESH_TOKEN_KEY} to worker/.dev.vars (git-ignored). The token was not printed.`)
    if (hadToken) {
      console.log('It replaced the token that was there, but the old token still works at Google until it is revoked. To kill it, revoke the app')
      console.log('at https://myaccount.google.com/permissions (this removes every token for it, including the new one) and then run this command again.')
    }
    if (process.env[REFRESH_TOKEN_KEY]) {
      console.warn(`\nNote: ${REFRESH_TOKEN_KEY} is also set in your shell environment, and that value overrides worker/.dev.vars. Remove it from the environment.`)
    }
    console.log('\nNext:  npm run drive:check')
  } catch {
    // The one-time authorisation code is already spent, so the token must not be lost. This is the only place it is shown.
    console.error(`\nCould not write worker/.dev.vars. Add this line to it yourself, then keep the token private:\n\n${REFRESH_TOKEN_KEY}=${outcome.refreshToken}\n`)
    process.exitCode = 1
  }
}
