import { useRef, useState } from 'react'
import type { ChangeEvent, ComponentPropsWithRef, FormEvent } from 'react'
import { CheckCircle2, CircleAlert, Download, Eye, RefreshCw, UploadCloud } from 'lucide-react'
import { CertificateDetailsDialog, certificateName } from '../components/CertificateDetailsDialog'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { Field, SelectInput, TextInput } from '../components/ui/FormField'
import { PageHeader, SectionHeading } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingRows } from '../components/ui/States'
import { useToast } from '../context/ToastContext'
import { useCertificateList } from '../hooks/useCertificateList'
import { formatDate } from '../lib/format'
import { downloadCertificate, storageAvailability, storageErrorMessage, UNAVAILABLE_COPY, uploadCertificate } from '../services/certificateStorage'
import type { ListedCertificate } from '../services/certificateStorage'
import { ACCEPT_ATTRIBUTE, ACCEPTED_LABEL, formatBytes, FILE_RULES, inspectCertificateFile } from '../services/fileService'
import { ACHIEVEMENT_CATEGORIES } from '../types'

/*
 * "My Certificates": the simple way for a student to put a certificate in the college's Google Drive.
 * Fill in four details, choose the file, press Upload. The file goes to the CertiPass server, which checks it again
 * and stores it privately in Drive; the student sees progress, then a clear success or error, and their certificates
 * below with Preview and Download. Nothing here holds a Google credential or a Drive link.
 */

type Phase = 'idle' | 'uploading' | 'saving' | 'done' | 'failed'
interface FormValues {
  title: string
  category: string
  issuer: string
  issueDate: string
}
type Errors = Partial<Record<keyof FormValues | 'file', string>>

const EMPTY: FormValues = { title: '', category: '', issuer: '', issueDate: '' }
const todayLocal = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in the student's own time zone

const newIds = () => ({ uploadId: crypto.randomUUID(), achievementId: `cert-${crypto.randomUUID()}` })

export function validateCertificateForm(values: FormValues, fileOk: boolean, today = todayLocal()): Errors {
  const e: Errors = {}
  const title = values.title.trim()
  if (!title) e.title = 'Enter a title for the certificate.'
  else if (title.length < 3 || title.length > 120) e.title = 'The title must be 3–120 characters.'
  if (!(ACHIEVEMENT_CATEGORIES as readonly string[]).includes(values.category)) e.category = 'Select a category.'
  const issuer = values.issuer.trim()
  if (!issuer) e.issuer = 'Enter who issued the certificate.'
  else if (issuer.length < 2 || issuer.length > 120) e.issuer = 'The name must be 2–120 characters.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(values.issueDate) || Number.isNaN(Date.parse(values.issueDate))) e.issueDate = 'Enter the date on the certificate.'
  else if (values.issueDate > today) e.issueDate = 'The issue date can’t be in the future.'
  else if (values.issueDate < '1990-01-01') e.issueDate = 'Enter a date after 1990.'
  if (!fileOk) e.file = 'Choose the certificate file.'
  return e
}

/** A file picker. Field passes `invalid` to its child; a native input must not receive it. */
function FileInput({ invalid, ...rest }: ComponentPropsWithRef<'input'> & { invalid?: boolean }) {
  return (
    <input
      type="file"
      className={`block w-full cursor-pointer rounded-lg border bg-white text-[13.5px] text-ink-soft file:mr-3 file:cursor-pointer file:border-0 file:bg-navy-800 file:px-4 file:py-2.5 file:text-[13px] file:font-medium file:text-white hover:file:bg-navy-900 ${invalid ? 'border-terracotta-500' : 'border-line-strong'}`}
      {...rest}
    />
  )
}

function UploadForm({ onUploaded }: { onUploaded: () => void }) {
  const toast = useToast()
  const [values, setValues] = useState<FormValues>(EMPTY)
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Errors>({})
  const [phase, setPhase] = useState<Phase>('idle')
  const [progress, setProgress] = useState(0)
  const [message, setMessage] = useState('')
  const ids = useRef(newIds())
  const inFlight = useRef(false)
  const fileInput = useRef<HTMLInputElement>(null)

  const busy = phase === 'uploading' || phase === 'saving'
  const set = (key: keyof FormValues) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null
    setPhase('idle')
    if (!picked) {
      setFile(null)
      return
    }
    const check = await inspectCertificateFile(picked)
    if (!check.ok) {
      setFile(null)
      setErrors((prev) => ({ ...prev, file: check.message }))
      if (fileInput.current) fileInput.current.value = ''
      return
    }
    // A different file is a different upload; the same file keeps its reference, which is what makes a retry safe.
    ids.current = newIds()
    setFile(picked)
    setErrors((prev) => ({ ...prev, file: undefined }))
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (inFlight.current) return
    const problems = validateCertificateForm(values, file !== null)
    setErrors(problems)
    if (Object.keys(problems).length > 0 || !file) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus())
      return
    }
    inFlight.current = true
    setPhase('uploading')
    setProgress(0)
    setMessage('')
    try {
      const stored = await uploadCertificate({
        ...ids.current,
        category: values.category,
        title: values.title.trim(),
        issuer: values.issuer.trim(),
        issueDate: values.issueDate,
        file,
        onProgress: (fraction) => {
          setProgress(fraction)
          if (fraction >= 1) setPhase('saving')
        },
      })
      setPhase('done')
      setMessage(stored.title || values.title.trim())
      toast.success('Certificate uploaded', 'It is now stored in the college’s Google Drive.')
      setValues(EMPTY)
      setFile(null)
      if (fileInput.current) fileInput.current.value = ''
      ids.current = newIds()
      onUploaded()
    } catch (err) {
      setPhase('failed')
      setMessage(storageErrorMessage(err))
      toast.error('Certificate not uploaded', 'Nothing was saved. You can try again.')
    } finally {
      inFlight.current = false
    }
  }

  const percent = Math.round(progress * 100)
  return (
    <section aria-labelledby="upload-heading" className="paper p-5 md:p-6">
      <SectionHeading id="upload-heading" title="Upload a certificate" />
      <form onSubmit={submit} noValidate className="grid gap-x-5 gap-y-4 md:grid-cols-2">
        <Field label="Certificate title" required error={errors.title}>
          <TextInput value={values.title} onChange={set('title')} maxLength={120} placeholder="e.g. CodeHarbour 36-Hour Hackathon" disabled={busy} autoComplete="off" />
        </Field>
        <Field label="Category" required error={errors.category}>
          <SelectInput value={values.category} onChange={set('category')} disabled={busy}>
            <option value="">Select a category</option>
            {ACHIEVEMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Issuing organisation" required error={errors.issuer}>
          <TextInput value={values.issuer} onChange={set('issuer')} maxLength={120} placeholder="e.g. Rajalakshmi Institute of Technology" disabled={busy} autoComplete="off" />
        </Field>
        <Field label="Issue date" required error={errors.issueDate}>
          <TextInput type="date" value={values.issueDate} onChange={set('issueDate')} max={todayLocal()} disabled={busy} />
        </Field>
        <Field
          className="md:col-span-2"
          label="Certificate file"
          required
          error={errors.file}
          hint={`${ACCEPTED_LABEL} · up to ${formatBytes(FILE_RULES.maxBytes)}. It is stored privately in the college’s Google Drive.`}
        >
          <FileInput ref={fileInput} accept={ACCEPT_ATTRIBUTE} onChange={onFile} disabled={busy} />
        </Field>

        {file && !errors.file && (
          <p className="text-[13px] text-ink-muted md:col-span-2">
            Ready to upload: <span className="font-medium text-ink">{file.name}</span> ({formatBytes(file.size)})
          </p>
        )}

        {busy && (
          <div className="space-y-1.5 md:col-span-2" aria-live="polite">
            <div
              role="progressbar"
              aria-label="Upload progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-2 w-full overflow-hidden rounded-full bg-parchment"
            >
              <div className="h-full rounded-full bg-navy-800 transition-[width]" style={{ width: `${percent}%` }} />
            </div>
            <p className="text-[12.5px] text-ink-muted">{phase === 'saving' ? 'Saving to Google Drive…' : `Uploading… ${percent}%`}</p>
          </div>
        )}

        {phase === 'done' && (
          <div role="status" className="flex items-start gap-2.5 rounded-md border border-navy-100 bg-navy-50 px-3.5 py-3 text-sm text-navy-900 md:col-span-2">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-sky-700" aria-hidden />
            <span>
              <strong className="font-medium">Uploaded.</strong> “{message}” is stored in Google Drive and appears in your list below.
            </span>
          </div>
        )}
        {phase === 'failed' && (
          <div role="alert" className="flex flex-wrap items-start gap-2.5 rounded-md border border-terracotta-300 bg-terracotta-50 px-3.5 py-3 text-sm text-terracotta-700 md:col-span-2">
            <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <strong className="font-medium">Your certificate was not uploaded.</strong> {message} Nothing was saved.
            </span>
            <Button size="sm" variant="secondary" onClick={() => void submit()} icon={<RefreshCw className="size-3.5" aria-hidden />}>
              Try again
            </Button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <Button type="submit" size="lg" loading={busy} icon={<UploadCloud className="size-4" aria-hidden />}>
            {busy ? 'Uploading…' : 'Upload certificate'}
          </Button>
        </div>
      </form>
    </section>
  )
}

/** Remounted (via its key) after each upload, which reloads the list. */
function MyCertificates() {
  const toast = useToast()
  const list = useCertificateList({ limit: 200 }, true)
  const [viewing, setViewing] = useState<ListedCertificate | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  async function download(c: ListedCertificate) {
    setDownloading(c.id)
    try {
      await downloadCertificate(c.id, c.fileName)
    } catch (err) {
      toast.error('Download failed', storageErrorMessage(err))
    } finally {
      setDownloading(null)
    }
  }

  const columns: Column<ListedCertificate>[] = [
    {
      key: 'title',
      header: 'Certificate',
      render: (c) => (
        <div className="min-w-0">
          <p className="max-w-[18rem] truncate font-medium text-navy-900">{certificateName(c)}</p>
          {c.title && <p className="max-w-[18rem] truncate font-mono text-[11.5px] text-ink-muted">{c.fileName}</p>}
        </div>
      ),
    },
    { key: 'category', header: 'Category', hideBelow: 'md', render: (c) => c.category },
    { key: 'issuer', header: 'Issued by', hideBelow: 'lg', render: (c) => c.issuer || '—' },
    { key: 'issued', header: 'Issue date', hideBelow: 'sm', render: (c) => (c.issueDate ? formatDate(c.issueDate) : '—') },
    { key: 'uploaded', header: 'Uploaded', hideBelow: 'md', render: (c) => (c.uploadedAt ? formatDate(c.uploadedAt) : '—') },
    { key: 'size', header: 'Size', hideBelow: 'lg', render: (c) => formatBytes(c.sizeBytes) },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (c) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => setViewing(c)} icon={<Eye className="size-3.5" aria-hidden />}>
            Preview<span className="sr-only">: {certificateName(c)}</span>
          </Button>
          <Button size="sm" variant="secondary" loading={downloading === c.id} onClick={() => void download(c)} icon={<Download className="size-3.5" aria-hidden />}>
            Download<span className="sr-only">: {certificateName(c)}</span>
          </Button>
        </div>
      ),
    },
  ]

  return (
    <section aria-labelledby="mine-heading" className="space-y-3">
      <SectionHeading id="mine-heading" title="Your certificates" aside={list.data ? <span className="text-[13px] text-ink-muted">{list.data.total} stored</span> : undefined} />
      {list.status === 'loading' && !list.data && <LoadingRows label="Loading your certificates" />}
      {list.status === 'error' && !list.data && (
        <ErrorState
          title="Couldn’t load your certificates"
          body={list.error.message}
          action={
            <Button size="sm" variant="secondary" onClick={list.reload} icon={<RefreshCw className="size-3.5" aria-hidden />}>
              Try again
            </Button>
          }
        />
      )}
      {list.data && (
        <DataTable
          caption="Your uploaded certificates"
          columns={columns}
          rows={list.data.certificates}
          rowKey={(c) => c.id}
          empty={<EmptyState icon={UploadCloud} title="No certificates yet" body="Certificates you upload above will appear here, ready to preview and download." />}
        />
      )}
      <CertificateDetailsDialog item={viewing} showStudent={false} onClose={() => setViewing(null)} />
    </section>
  )
}

export default function StudentCertificatesPage() {
  const availability = storageAvailability()
  const [refreshKey, setRefreshKey] = useState(0)
  return (
    <div className="space-y-7">
      <PageHeader
        kicker="Student passport"
        title="My Certificates"
        description="Upload a certificate and it is stored privately in the college’s Google Drive. Only you, your department’s faculty and the records office can open it."
      />
      {availability !== 'ready' ? (
        <ErrorState title={UNAVAILABLE_COPY[availability].title} body={UNAVAILABLE_COPY[availability].reason} />
      ) : (
        <>
          <UploadForm onUploaded={() => setRefreshKey((k) => k + 1)} />
          <MyCertificates key={refreshKey} />
        </>
      )}
    </div>
  )
}
