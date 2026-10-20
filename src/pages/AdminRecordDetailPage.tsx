import { useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Archive, ArchiveRestore, Info, SearchX } from 'lucide-react'
import { CertificatePreview } from '../components/CertificatePreview'
import { CommentThread } from '../components/CommentThread'
import { DetailList, RecordHistory } from '../components/RecordDetails'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { Button, ButtonLink } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Field, TextArea } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/States'
import { ResultBadge, StatusBadge } from '../components/ui/StatusBadge'
import { useToast } from '../context/ToastContext'
import { batchCodeOf, batchLabel } from '../domain/batch'
import { isActiveRecord, MAX_NOTE_LENGTH, RECORD_STATUS_DEFINITIONS } from '../domain/status'
import { useAchievements, useRequiredUser, useUserMap } from '../hooks/useData'
import { formatDate, formatDateTime, YEAR_LABEL } from '../lib/format'
import { departmentName } from '../services/academicService'
import { setRecordArchived } from '../services/adminService'

/**
 * One achievement record for administrators: details, certificate,
 * conversation and full history.
 *
 * The only change an administrator can make is to archive the record or bring
 * it back. That is housekeeping, not a verdict on the achievement: an archived
 * record keeps every detail, its recorded result and its certificate, and
 * simply leaves the active register, counts and reports.
 */
export default function AdminRecordDetailPage() {
  const { id = '' } = useParams()
  const admin = useRequiredUser()
  const achievements = useAchievements()
  const users = useUserMap()
  const toast = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)
  const a = achievements.find((x) => x.id === id)

  if (!a) {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'Overview', to: '/admin' }, { label: 'Achievement Records', to: '/admin/records' }, { label: 'Not found' }]} />
        <div className="paper">
          <EmptyState
            icon={SearchX}
            title="Record not found"
            body="This achievement record doesn’t exist. Check the link, or find it in the register."
            action={
              <ButtonLink to="/admin/records" variant="secondary">
                Back to Achievement Records
              </ButtonLink>
            }
          />
        </div>
      </div>
    )
  }

  const s = users.get(a.studentId)
  const student = s?.role === 'student' ? s : undefined
  const active = isActiveRecord(a.status)

  async function applyArchive() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      await setRecordArchived(a!.id, active, reason)
      toast.success(active ? 'Record archived' : 'Record restored', `${a!.reference} · its details and certificate are unchanged.`)
      setDialogOpen(false)
      setReason('')
    } catch (err) {
      toast.error('Not completed', err instanceof Error ? err.message : 'Could not update the record.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: 'Overview', to: '/admin' }, { label: 'Achievement Records', to: '/admin/records' }, { label: a.reference }]} />
        <header className="flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="label-archival">
              Achievement record · <span className="text-navy-800">{a.reference}</span>
            </p>
            <h1 className="display mt-2 text-[20px] leading-tight md:text-[24px]">{a.eventName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <ResultBadge type={a.achievementType} position={a.position} />
              <StatusBadge status={a.status} />
              <span className="text-sm text-ink-muted">
                {student ? student.fullName : 'Unknown student'} · submitted {formatDate(a.submittedAt)}
              </span>
            </div>
          </div>
          <Button
            variant={active ? 'secondary' : 'accent'}
            onClick={() => {
              setReason('')
              setDialogOpen(true)
            }}
            icon={active ? <Archive className="size-4" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}
          >
            {active ? 'Archive Record' : 'Restore Record'}
          </Button>
        </header>
      </div>

      <p className="flex items-start gap-2.5 rounded-xl border border-line bg-parchment/50 px-4 py-3 text-[13.5px] text-ink-soft" role="note">
        <Info className="mt-0.5 size-4 shrink-0 text-lavender-700" aria-hidden />
        <span>
          {RECORD_STATUS_DEFINITIONS[a.status].description} The student’s details, recorded result and certificate are theirs and can’t be changed here —
          archiving is the only action available to administrators.
        </span>
      </p>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="cert-heading">
            <h2 id="cert-heading" className="label-archival mb-3">
              Certificate
            </h2>
            <CertificatePreview certificate={a.certificate} eventName={a.eventName} />
          </section>
          <section aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="label-archival mb-4">
              Comments {a.comments.length > 0 && `(${a.comments.length})`}
            </h2>
            <CommentThread achievementId={a.id} comments={a.comments} currentUser={admin} readOnly />
            <p className="mt-2 text-[12px] text-ink-muted">Administrators can read the conversation but not post in it.</p>
          </section>
        </div>

        <div className="space-y-8">
          {student && (
            <section aria-labelledby="student-heading" className="paper p-5">
              <h2 id="student-heading" className="label-archival mb-4">
                Student
              </h2>
              <DetailList
                rows={[
                  ['Full name', student.fullName],
                  ['Username', <span key="u" className="font-mono">@{student.username}</span>],
                  ['Register number', <span key="r" className="font-mono">{student.registerNumber}</span>],
                  ['Batch', batchLabel(batchCodeOf(student))],
                  ['Department', departmentName(student.department)],
                  ['Year', YEAR_LABEL[student.year]],
                  ['Section', student.section],
                ]}
              />
            </section>
          )}

          <section aria-labelledby="details-heading" className="paper p-5">
            <h2 id="details-heading" className="label-archival mb-4">
              Achievement information
            </h2>
            <DetailList
              rows={[
                ['Reference ID', <span key="ref" className="font-mono">{a.reference}</span>],
                ['Event name', a.eventName],
                ['Category', a.customCategory ? `${a.category} · ${a.customCategory}` : a.category],
                ['Organiser', a.organizer],
                ['Event date', formatDate(a.eventDate)],
                ['Location', a.location ?? '—'],
                ...(a.eventMode ? ([['Event mode', a.eventMode]] as [string, string][]) : []),
                ['Achievement result', a.achievementType],
                ['Prize or position', a.position ?? '—'],
                ['Submitted', formatDateTime(a.submittedAt)],
                ['Last updated', formatDateTime(a.updatedAt)],
                ['Record state', <StatusBadge key="st" status={a.status} />],
              ]}
            />
            <h3 className="label-archival mt-6 mb-2 text-[10px]">Student’s description</h3>
            <p className="border-l-2 border-lavender-300 pl-3 text-sm text-ink-soft italic">{a.description}</p>
            {a.details && (
              <>
                <h3 className="label-archival mt-5 mb-2 text-[10px]">Additional notes</h3>
                <p className="text-sm whitespace-pre-line text-ink-soft">{a.details}</p>
              </>
            )}
            {a.prizeDetails && (
              <>
                <h3 className="label-archival mt-5 mb-2 text-[10px]">Prize details</h3>
                <p className="text-sm whitespace-pre-line text-ink-soft">{a.prizeDetails}</p>
              </>
            )}
            {a.evidenceNote && (
              <>
                <h3 className="label-archival mt-5 mb-2 text-[10px]">About the certificate</h3>
                <p className="text-sm whitespace-pre-line text-ink-soft">{a.evidenceNote}</p>
              </>
            )}
          </section>

          <section aria-labelledby="history-heading">
            <h2 id="history-heading" className="label-archival mb-4">
              Record history
            </h2>
            <RecordHistory history={a.history} />
          </section>
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onClose={() => !busy && setDialogOpen(false)}
        size="md"
        title={active ? 'Archive this record?' : 'Restore this record?'}
        description={
          active
            ? 'It leaves the active register, faculty batch lists and reports. Nothing is deleted: its details, recorded result, certificate, comments and history are kept.'
            : 'It returns to the active register, faculty batch lists and reports, exactly as it was submitted.'
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialogOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={active ? 'danger' : 'accent'}
              loading={busy}
              onClick={applyArchive}
              icon={active ? <Archive className="size-4" aria-hidden /> : <ArchiveRestore className="size-4" aria-hidden />}
            >
              {active ? 'Archive record' : 'Restore record'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <DetailList
            rows={[
              ['Record', <span key="r" className="font-mono">{a.reference}</span>],
              ['Event', a.eventName],
              ['Student', student ? `${student.fullName} · ${student.registerNumber}` : 'Unknown student'],
              ['Recorded result', a.position ? `${a.achievementType} · ${a.position}` : a.achievementType],
            ]}
          />
          <Field label="Reason" optional hint="Recorded in the record’s history and the audit trail, e.g. “duplicate of CP-2025-0147”.">
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={MAX_NOTE_LENGTH} />
          </Field>
        </div>
      </Dialog>
    </div>
  )
}
