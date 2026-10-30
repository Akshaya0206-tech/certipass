/*
 * npm run admin:create [-- --url http://127.0.0.1:8787]
 *
 * Creates the very first administrator account on a running Worker (local `npm run dev`, or the deployed one).
 * It asks for the person's college email, name and a password (typed hidden), and uses SETUP_TOKEN from
 * worker/.dev.vars (or from the SETUP_TOKEN environment variable, for a deployed Worker). The Worker hashes the
 * password itself; this script never stores or prints the password or the token.
 *
 * The Worker accepts this exactly once: as soon as any administrator exists it refuses for good.
 */
import { createInterface } from 'node:readline'
import { loadEnv } from './devVars'

const urlFlag = process.argv.indexOf('--url')
const base = (urlFlag === -1 ? 'http://127.0.0.1:8787' : String(process.argv[urlFlag + 1] ?? '')).replace(/\/+$/, '')

// A password must not cross the internet in the clear.
if (!/^https:\/\//i.test(base) && !/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(base)) {
  console.error('Use an https:// address (plain http:// is only allowed for localhost). Example: --url https://certipass.example.workers.dev')
  process.exit(1)
}

const setupToken = loadEnv().SETUP_TOKEN
if (!setupToken) {
  console.error('SETUP_TOKEN is not set. Add it to worker/.dev.vars (see .dev.vars.example), or set the SETUP_TOKEN environment variable for this run.')
  process.exit(1)
}

const rl = createInterface({ input: process.stdin, output: process.stdout })
const ask = (question: string) => new Promise<string>((resolve) => rl.question(question, (answer) => resolve(answer.trim())))

/** Reads a line without echoing it. Falls back to a normal line when input is piped. */
function askHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) return ask(question)
  return new Promise((resolve) => {
    rl.pause()
    process.stdout.write(question)
    process.stdin.setRawMode(true)
    process.stdin.resume()
    let value = ''
    const onData = (chunk: Buffer) => {
      for (const ch of chunk.toString('utf8')) {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false)
          process.stdin.off('data', onData)
          process.stdout.write('\n')
          rl.resume()
          return resolve(value)
        }
        if (ch === '\u0003') process.exit(130) // Ctrl+C
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    process.stdin.on('data', onData)
  })
}

console.log(`Creating the first administrator on ${base}\n`)
const email = await ask('College email (e.g. records@rajalakshmi.edu.in): ')
const fullName = await ask('Full name: ')
const password = await askHidden('Password (8+ characters, upper and lower case, a number): ')
const again = await askHidden('Password again: ')
rl.close()

if (password !== again) {
  console.error('\nThe two passwords do not match. Nothing was created.')
  process.exit(1)
}

let res: Response
try {
  res = await fetch(`${base}/api/setup/first-admin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupToken, email, fullName, password }),
  })
} catch {
  console.error(`\nCould not reach ${base}. Is the Worker running? (npm run dev)`)
  process.exit(1)
}

const body = (await res.json().catch(() => ({}))) as { user?: { email: string }; error?: { code?: string; message?: string } }
if (!res.ok) {
  console.error(`\nNot created: ${body.error?.message ?? `the server answered ${res.status}`}${body.error?.code ? ` (${body.error.code})` : ''}`)
  if (body.error?.code === 'not_found') console.error('The Worker has no SETUP_TOKEN configured (or it is shorter than 20 characters).')
  process.exit(1)
}
console.log(`\nAdministrator created: ${body.user?.email}`)
console.log('Sign in on the administrator page with that email and the password you just chose.')
