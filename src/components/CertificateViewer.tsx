import { useEffect, useState } from 'react'
import { ArrowLeft, FileSearch, Loader2, RefreshCw } from 'lucide-react'
import { batchLabel } from '../domain/batch'
import { resultLabel } from '../domain/result'
import { formatDate } from '../lib/format'
import { CertificateStorageError, lookupCertificate, storageAvailability, UNAVAILABLE_COPY } from '../services/certificateStorage'
import type { StoredCertificate } from '../services/certificateStorage'
import { ACCEPTED_TYPES, formatBytes } from '../services/fileService'
import type { Achievement, CertificateFile, StudentUser } from '../types'
import { certificateSource, CertificatePreview, hasCertificate, isStoredCertificate, Unavailable } from './CertificatePreview'
import { Button, buttonClasses } from './ui/Button'
import { Dialog } from './ui/Dialog'

/** Everything the viewer shows together: who, what, and the certificate. */
export interface ViewerTarget {
  achievementId: string
  /** Whose achievement it is: the storage service only knows an achievement id together with its student. */
  studentId: string
  eventName: string
  reference: string
  certificate: CertificateFile | undefined
  studentName: string
  registerNumber: string
  department: string
}

export const targetFor = (a: Achievement, student: Pick<StudentUser, 'fullName' | 'registerNumber' | 'department'>): ViewerTarget => ({
  achievementId: a.id,
  studentId: a.studentId,
  eventName: a.eventName,
  reference: a.reference,
  certificate: a.certificate,
  studentName: student.fullName,
  registerNumber: student.registerNumber,
  department: student.department,
})

/**
 * The "View Certificate" action. A record with no certificate details shows
 * plain text instead of a button, so there is never a link that goes nowhere.
 */
export function ViewCertificateButton({ certificate, label, onOpen }: { certificate: CertificateFile | undefined; label: string; onOpen: () => void }) {
  if (!hasCertificate(certificate)) {
    return <span className="text-[12.5px] whitespace-nowrap text-ink-muted">Certificate not available</span>
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
      className={buttonClasses('accent', 'sm')}
    >
      <FileSearch className="size-3.5" aria-hidden />
      View Certificate
      <span className="sr-only">: {label}</span>
    </button>
  )
}

type Lookup = { status: 'idle' } | { status: 'loading' } | { status: 'found'; certificate: StoredCertificate } | { status: 'missing' } | { status: 'error'; error: CertificateStorageError }

/** For a record that has file details but no storage reference: ask the service whether it has one. */
function useStoredLookup(achievementId: string, studentId: string, enabled: boolean) {
  const [state, setState] = useState<Lookup>({ status: 'idle' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    if (!enabled) {
      setState({ status: 'idle' })
      return
    }
    const controller = new AbortController()
    setState({ status: 'loading' })
    lookupCertificate(achievementId, studentId, controller.signal).then(
      (certificate) => !controller.signal.aborted && setState({ status: 'found', certificate }),
      (err) => {
        if (controller.signal.aborted) return
        if (err instanceof CertificateStorageError) setState(err.notAvailable ? { status: 'missing' } : { status: 'error', error: err })
        else setState({ status: 'error', error: new CertificateStorageError('unknown', 'The certificate could not be looked up.', true) })
      },
    )
    return () => controller.abort()
  }, [achievementId, studentId, enabled, attempt])
  return { state, retry: () => setAttempt((n) => n + 1) }
}

/** Decides honestly what can be shown for a record, then shows it. */
function CertificateView({ target }: { target: ViewerTarget }) {
  const { certificate } = target
  const present = hasCertificate(certificate)
  const hasFile = present && (isStoredCertificate(certificate) || !!certificateSource(certificate))
  const availability = storageAvailability()
  const lookup = useStoredLookup(target.achievementId, target.studentId, present && !hasFile && availability === 'ready')

  if (!present) {
    return <Unavailable title="Certificate not available" reason="No certificate file is on record for this achievement." />
  }
  if (hasFile) {
    return <CertificatePreview certificate={certificate} eventName={target.eventName} />
  }

  const details = `${ACCEPTED_TYPES[certificate.fileType]} · ${formatBytes(certificate.sizeBytes)} · ${certificate.fileName}`
  if (availability !== 'ready') {
    return <Unavailable title={UNAVAILABLE_COPY[availability].title} reason={`${UNAVAILABLE_COPY[availability].reason} On record: ${details}`} />
  }
  if (lookup.state.status === 'loading' || lookup.state.status === 'idle') {
    return (
      <div role="status" aria-busy="true" className="flex flex-col items-center px-6 py-14 text-center">
        <Loader2 className="size-7 animate-spin text-navy-700" aria-hidden />
        <p className="mt-3 font-medium text-navy-900">Checking college storage…</p>
      </div>
    )
  }
  if (lookup.state.status === 'found') {
    return <CertificatePreview certificate={{ ...certificate, storage: { provider: 'drive', certificateId: lookup.state.certificate.id } }} eventName={target.eventName} />
  }
  if (lookup.state.status === 'missing') {
    return <Unavailable title="Certificate not available" reason={`The file was never stored, or you don’t have access to it. On record: ${details}`} />
  }
  return (
    <Unavailable
      title="Couldn’t check certificate storage"
      reason={lookup.state.error.message}
      action={
        <Button size="sm" variant="secondary" onClick={lookup.retry} icon={<RefreshCw className="size-3.5" aria-hidden />}>
          Try again
        </Button>
      }
    />
  )
}

/** Student, register number, department and achievement — shown together above the certificate. */
function TargetDetails({ target }: { target: ViewerTarget }) {
  const rows: [string, string][] = [
    ['Student', target.studentName],
    ['Register no.', target.registerNumber || '—'],
    ['Department', target.department],
    ['Achievement', target.eventName],
    ['Reference', target.reference],
  ]
  return (
    <dl className="mb-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-line bg-ivory px-4 py-3 text-[13px] sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="label-archival text-[10px]">{k}</dt>
          <dd className={k === 'Register no.' || k === 'Reference' ? 'truncate font-mono text-[12.5px] text-ink' : 'truncate font-medium text-navy-900'} title={v}>
            {v}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** One record's certificate in a modal. */
export function CertificateViewerDialog({ target, onClose }: { target: ViewerTarget | null; onClose: () => void }) {
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      size="lg"
      title="Certificate"
      description={target ? `${target.studentName} · ${target.registerNumber}` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {target && (
        <>
          <TargetDetails target={target} />
          <CertificateView target={target} />
        </>
      )}
    </Dialog>
  )
}

/**
 * A student's achievements with a View Certificate action on each, for the
 * Students page, where a row stands for a person rather than one record.
 */
export function StudentCertificatesDialog({
  student,
  batch,
  records,
  onClose,
}: {
  student: StudentUser | null
  batch: string
  records: Achievement[]
  onClose: () => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => setSelectedId(null), [student?.id])
  const selected = records.find((r) => r.id === selectedId)

  return (
    <Dialog
      open={!!student}
      onClose={onClose}
      size="lg"
      title={student ? student.fullName : 'Certificates'}
      description={student ? `${student.registerNumber} · ${student.department} · Batch ${batchLabel(batch)}` : undefined}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      }
    >
      {student &&
        (selected ? (
          <div>
            <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={() => setSelectedId(null)} icon={<ArrowLeft className="size-3.5" aria-hidden />}>
              All achievements
            </Button>
            <TargetDetails target={targetFor(selected, student)} />
            <CertificateView target={targetFor(selected, student)} />
          </div>
        ) : records.length === 0 ? (
          <Unavailable title="No achievements yet" reason="This student hasn’t submitted any achievements, so there are no certificates to view." />
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {records.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1 basis-56">
                  <p className="truncate font-medium text-navy-900">{r.eventName}</p>
                  <p className="text-[12px] text-ink-muted">
                    <span className="font-mono">{r.reference}</span> · {resultLabel(r)} · {formatDate(r.eventDate)}
                  </p>
                </div>
                <ViewCertificateButton certificate={r.certificate} label={`${r.eventName} by ${student.fullName}`} onOpen={() => setSelectedId(r.id)} />
              </li>
            ))}
          </ul>
        ))}
    </Dialog>
  )
}
