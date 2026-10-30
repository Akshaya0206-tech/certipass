/*
 * npm run drive:check            â€“ can the configured account reach and write to the folder?
 * npm run drive:check -- --write â€“ also upload a tiny test PDF, read it back, and bin it.
 *
 * This talks to the real Google Drive using worker/.dev.vars. It does NOT need
 * the database or sign-in. Run it before trusting a share link: a link that opens in a
 * browser does not mean the API account may upload to that folder.
 */
import { DriveClient } from '../src/drive'
import { defaultDeps } from '../src/types'
import { loadEnv } from './devVars'

const env = loadEnv()
const drive = new DriveClient(env, defaultDeps)
const write = process.argv.includes('--write')

const line = (ok: boolean, text: string) => console.log(`${ok ? '  OK ' : ' FAIL'}  ${text}`)

console.log(`Auth mode: ${drive.authMode}`)
if (!drive.configured) {
  line(false, 'Credentials or GOOGLE_DRIVE_ROOT_FOLDER_ID are missing in worker/.dev.vars.')
  process.exit(1)
}

const root = await drive.checkRoot()
line(root.ok, root.message)
if (root.folderName) console.log(`      Folder: â€œ${root.folderName}â€ (${root.inSharedDrive ? 'Shared Drive' : 'My Drive'})`)
if (root.folderUrl) console.log(`      Open it in Drive: ${root.folderUrl}`)
if (root.publiclyShared === undefined && root.ok) {
  console.log('      Note: Drive did not say who the folder is shared with. Open it in Drive and confirm General access is "Restricted".')
}
if (!root.ok) {
  console.log(`      Reason code: ${root.code}`)
  if (root.code === 'drive_folder_public') {
    console.log('      In Drive: right-click the folder â†’ Share â†’ General access â†’ change "Anyone with the link" to "Restricted",')
    console.log('      then share it with the specific admin accounts that should be able to browse it.')
  }
  if (root.code === 'drive_folder_inaccessible') {
    console.log('      Share the folder with the authorising Google account as Editor (or Content manager on a Shared Drive).')
  }
  if (root.code === 'drive_auth_failed') console.log('      Run `npm run drive:authorize` again. Apps in Googleâ€™s "Testing" mode lose refresh tokens after 7 days.')
  process.exit(1)
}

if (write) {
  const pdf = new Uint8Array([...new TextEncoder().encode('%PDF-1.4\n% CertiPass connectivity test\n')])
  const folder = await drive.ensureFolderPath(['_certipass_selftest'])
  const file = await drive.uploadFile({ folderId: folder, name: 'selftest.pdf', mimeType: 'application/pdf', bytes: pdf, appProperties: { uploadId: 'selftest' } })
  line(true, `Uploaded a test file (${pdf.length} bytes) to â€œ_certipass_selftestâ€.`)
  const back = new Uint8Array(await (await drive.download(file.id)).arrayBuffer())
  line(back.length === pdf.length && back.every((b, i) => b === pdf[i]), 'Downloaded it back and the bytes match.')
  await drive.trash(file.id)
  await drive.trash(folder)
  line(true, 'Moved the test file and folder to the bin.')
}

console.log('\nDrive access is working. No file was shared or made public.')
