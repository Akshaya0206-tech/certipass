/*
 * The checks behind `npm run drive:sample`, kept separate from the command-line
 * wrapper so they can be tested against a fake Drive (worker/test/sample.test.ts).
 */
import type { DriveClient } from '../src/drive'
import { certificateBaseName, certificateFolderPath, EXTENSION, pickFileName, uploadYear } from '../src/naming'

export const SAMPLE_ROOT = '_CertiPass sample'

/** A tiny but valid one-page PDF, so the file can be opened and recognised in Drive's viewer. */
export function samplePdf(): Uint8Array {
  const text = [
    'BT /F1 26 Tf 60 760 Td (CertiPass sample certificate) Tj ET',
    'BT /F1 13 Tf 60 725 Td (Rajalakshmi Engineering College) Tj ET',
    'BT /F1 11 Tf 60 690 Td (This is a test file created by the CertiPass setup script.) Tj ET',
    'BT /F1 11 Tf 60 672 Td (It is safe to delete: npm run drive:sample -- --cleanup) Tj ET',
  ].join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, i) => {
    offsets.push(pdf.length)
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new TextEncoder().encode(pdf)
}

export interface SampleOptions {
  /** The clock, for the year folder. Tests pass a fixed one. */
  now?: () => Date
  cleanup: boolean
  /** Used for the "can an anonymous visitor read it?" check. Real fetch in the CLI. */
  anonymousFetch: typeof fetch
  log: (text: string) => void
}

/** Returns true when every check passed. */
export async function runSample(drive: DriveClient, { cleanup, anonymousFetch, log, now }: SampleOptions): Promise<boolean> {
  let ok = true
  const line = (pass: boolean, text: string) => {
    if (!pass) ok = false
    log(`${pass ? '  OK ' : ' FAIL'}  ${text}`)
  }

  // 1 + 2. Folder reachable, writable, not public.
  const root = await drive.checkRoot()
  line(root.ok, root.message)
  if (root.folderName) log(`      Folder: “${root.folderName}” (${root.inSharedDrive ? 'Shared Drive' : 'My Drive'})`)
  if (root.publiclyShared === undefined && root.ok) log('      Drive did not say who the folder is shared with — confirm in Drive that General access is "Restricted".')
  if (!root.ok) {
    log(`      Reason code: ${root.code}`)
    return false
  }

  if (cleanup) {
    await drive.trash(await drive.ensureFolderPath([SAMPLE_ROOT]))
    line(true, `Moved “${SAMPLE_ROOT}” and everything in it to the Drive bin.`)
    return ok
  }

  // Same layout and naming a student's upload produces, for a made-up student.
  const placement = { year: uploadYear((now?.() ?? new Date()).toISOString()), department: 'AIDS', registerNumber: '2023AIDS0417' }
  const category = 'Hackathon'
  const path = [SAMPLE_ROOT, ...certificateFolderPath(placement)]
  const bytes = samplePdf()
  const folderId = await drive.ensureFolderPath(path)
  const name = pickFileName(await drive.listFileNames(folderId), certificateBaseName(placement.registerNumber, category), EXTENSION['application/pdf'])
  const file = await drive.uploadFile({
    folderId,
    name,
    mimeType: 'application/pdf',
    bytes,
    // Not the "1" marker CertiPass puts on real certificates, so the orphan scan never mistakes a sample for one.
    appProperties: { certipass: 'sample', uploadId: `sample-${Date.now()}` },
  })
  line(true, `Uploaded ${bytes.length} bytes as “${name}”.`)

  // 3. It is really there, in the expected place.
  line((await drive.listFileNames(folderId)).includes(name), `Drive lists it in ${path.join(' / ')}`)

  // 4. Read it back.
  const back = new Uint8Array(await (await drive.download(file.id)).arrayBuffer())
  line(back.length === bytes.length && back.every((b, i) => b === bytes[i]), 'Downloaded it back through the API and the bytes are identical.')

  // 5. An anonymous visitor must not be able to read it.
  const anon = await anonymousFetch(`https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}`, { redirect: 'manual' }).catch(() => null)
  const readable = !!anon && anon.status === 200 && (anon.headers.get('content-type') ?? '').includes('pdf')
  line(!readable, readable ? 'An anonymous request COULD read the file: the folder is effectively public. Restrict it now.' : 'An anonymous request (no Google sign-in) could not read the file.')

  log('\nNow open your certificate folder in Google Drive:')
  log(`  ${root.folderUrl}`)
  log(`  → “${SAMPLE_ROOT}” → ${path.slice(1).join(' → ')} → ${name}`)
  log(`  Direct link to the sample's folder: https://drive.google.com/drive/folders/${folderId}`)
  log('\nWhen you have seen it, remove it with:  npm run drive:sample -- --cleanup')
  return ok
}
