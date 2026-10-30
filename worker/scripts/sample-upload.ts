/*
 * npm run drive:sample               â€“ upload a sample certificate to your real Drive folder and LEAVE it there
 * npm run drive:sample -- --cleanup  â€“ move the sample folder (and the file in it) to the Drive bin
 *
 * This is the real-world test of the Drive half of CertiPass. It uses the same
 * folder layout, file naming and Drive client as a student's upload, and checks
 * against real Google Drive that:
 *   1. the folder is reachable and the account may add files (Editor access);
 *   2. the folder is not shared with "anyone with the link";
 *   3. the file really is in Drive, with the expected name, in the expected folders;
 *   4. the bytes read back from Drive are identical to what was sent;
 *   5. an anonymous request (no Google sign-in) can NOT read the file.
 * Then open the folder in Drive and look for "_CertiPass sample".
 *
 * It does not need the database or sign-in. It does need the Google values in worker/.dev.vars.
 */
import { DriveClient } from '../src/drive'
import { defaultDeps } from '../src/types'
import { loadEnv } from './devVars'
import { runSample } from './sampleFlow'

const env = loadEnv()
const drive = new DriveClient(env, defaultDeps)

console.log(`Auth mode: ${drive.authMode}`)
if (!drive.configured) {
  const missing = [
    ['GOOGLE_DRIVE_ROOT_FOLDER_ID', env.GOOGLE_DRIVE_ROOT_FOLDER_ID],
    ...(drive.authMode === 'oauth'
      ? [['GOOGLE_OAUTH_CLIENT_ID', env.GOOGLE_OAUTH_CLIENT_ID], ['GOOGLE_OAUTH_CLIENT_SECRET', env.GOOGLE_OAUTH_CLIENT_SECRET], ['GOOGLE_OAUTH_REFRESH_TOKEN', env.GOOGLE_OAUTH_REFRESH_TOKEN]]
      : [['GOOGLE_SERVICE_ACCOUNT_EMAIL', env.GOOGLE_SERVICE_ACCOUNT_EMAIL], ['GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY', env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY]]),
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k)
  console.log(` FAIL  Not configured. Missing in worker/.dev.vars: ${missing.join(', ')}`)
  console.log('      See docs/GOOGLE_DRIVE_SETUP.md steps 1â€“4 (Google Cloud OAuth client, then `npm run drive:authorize`).')
  process.exit(1)
}

const passed = await runSample(drive, { cleanup: process.argv.includes('--cleanup'), anonymousFetch: fetch, log: console.log })
process.exit(passed ? 0 : 1)
