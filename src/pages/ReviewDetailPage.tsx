import { useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowRight, BadgeCheck, CircleAlert, FileWarning, Hourglass, Info, ScanSearch, SearchX, Undo2 } from 'lucide-react'
import { certificateSource, CertificatePreview, hasCertificate } from '../components/CertificatePreview'
import { CommentThread } from '../components/CommentThread'
import { DetailList, ReviewHistory } from '../components/RecordDetails'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { Button, ButtonLink } from '../components/ui/Button'
import { Dialog } from '../components/ui/Dialog'
import { Field, TextArea } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/States'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useToast } from '../context/ToastContext'
import { departmentName } from '../services/academicService'
import { allowedReviewActions, isAwaitingReview, MIN_REASON_LENGTH, REVIEW_ACTIONS } from '../domain/status'
import type { ReviewAction } from '../domain/status'
import { useUserMap } from '../hooks/useData'
import { useFaculty, useFacultyAchievements } from '../hooks/useReview'
import { formatDate, formatDateTime, initials, YEAR_LABEL } from '../lib/format'
import { summarize } from '../services/achievementService'
import { ACCEPTED_TYPES, formatBytes } from '../services/fileService'
import {
  COMMENT_MAX_LENGTH,
  enteredQueueAt,
  getFacultyAccessibleAchievement,
  reopenReview,
  requestAchievementCorrection,
  startReview,
  verifyAchievement,
} from '../services/reviewService'

type OpenDialog = null | 'request_correction' | 'verify' | 'reopen'

export default function ReviewDetailPage() {
  const { id = '' } = useParams()
  const toast = useToast()
  const faculty = useFaculty()
  const records = useFacultyAchievements()
  const users = useUserMap()
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [reason, setReason] = useState('')
  const [notes, setNotes] = useState('')
  const [reasonError, setReasonError] = useState<string>()
  const [busy, setBusy] = useState<ReviewAction | null>(null)
  const inFlight = useRef(false)

  // Scoped lookup: unknown ids and records outside this reviewer's departments look the same.
  const achievement = getFacultyAccessibleAchievement(faculty.id, id, records)
  const user = achievement ? users.get(achievement.studentId) : undefined
  const student = user?.role === 'student' ? user : undefined

  const nextInQueue = useMemo(
    () => records.filter((a) => isAwaitingReview(a.status) && a.id !== id).sort((a, b) => enteredQueueAt(a).localeCompare(enteredQueueAt(b)))[0],
    [records, id],
  )
  const studentRecord = useMemo(() => (student ? summarize(records.filter((a) => a.studentId === student.id)) : null), [records, student])

  if (!achievement || !student) {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/faculty' }, { label: 'Review Queue', to: '/faculty/queue' }, { label: 'Not available' }]} />
        <div className="paper">
          <EmptyState
            icon={SearchX}
            title="Submission not available"
            body="This submission doesn’t exist, or it belongs to a department you don’t review. Check the link, or open it from your queue."
            action={<ButtonLink to="/faculty/queue" variant="secondary">Back to the review queue</ButtonLink>}
          />
        </div>
      </div>
    )
  }

  const a = achievement
  const actions = allowedReviewActions(a.status)
  const can = (action: ReviewAction) => actions.includes(action)
  const dept = { name: departmentName(student.department) }
  const certificatePresent = hasCertificate(a.certificate)
  const previewAvailable = certificatePresent && !!certificateSource(a.certificate)
  const lastDecision = [...a.history].reverse().find((h) => h.kind === 'status')

  function openDialog(next: Exclude<OpenDialog, null>) {
    setReason('')
    setNotes('')
    setReasonError(undefined)
    setDialog(next)
  }

  /** Run one review action. Repeat clicks while it is in flight are ignored. */
  async function run(action: ReviewAction, perform: () => Promise<unknown>, success: string) {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(action)
    try {
      await perform()
      toast.success(success, `${a.reference} · ${student!.fullName} has been notified.`)
      setDialog(null)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update the submission.'
      if (dialog && REVIEW_ACTIONS[action].requiresReason) setReasonError(message)
      else toast.error('Action not completed', message)
    } finally {
      inFlight.current = false
      setBusy(null)
    }
  }

  function submitReason(action: 'request_correction' | 'reopen') {
    const text = reason.trim()
    if (!text) return setReasonError(action === 'request_correction' ? 'Explain what the student needs to correct.' : 'Give a reason for reopening this review.')
    if (text.length < MIN_REASON_LENGTH) return setReasonError(`Please be more specific — at least ${MIN_REASON_LENGTH} characters.`)
    if (action === 'request_correction') void run(action, () => requestAchievementCorrection(faculty.id, a.id, text, notes), 'Correction requested')
    else void run(action, () => reopenReview(faculty.id, a.id, text), 'Review reopened')
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/faculty' }, { label: 'Review Queue', to: '/faculty/queue' }, { label: a.reference }]} />
        {nextInQueue && (
          <Link to={`/faculty/review/${nextInQueue.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-navy-800 hover:underline">
            Next in queue <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>

      <header className="flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="label-archival">
            Review · <span className="text-navy-800">{a.reference}</span>
          </p>
          <h1 className="display mt-2 text-[20px] leading-tight md:text-[24px]">{a.eventName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge status={a.status} />
            <span className="text-sm text-ink-muted">
              {student.fullName} · submitted {formatDate(a.submittedAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('start_review') && (
            <Button variant="primary" loading={busy === 'start_review'} onClick={() => run('start_review', () => startReview(faculty.id, a.id), 'Review started')} icon={<ScanSearch className="size-4" aria-hidden />}>
              Start Review
            </Button>
          )}
          {can('request_correction') && (
            <Button variant="danger" onClick={() => openDialog('request_correction')} disabled={!!busy} icon={<CircleAlert className="size-4" aria-hidden />}>
              Request Correction
            </Button>
          )}
          {can('verify') && (
            <Button variant="accent" onClick={() => openDialog('verify')} disabled={!!busy} icon={<BadgeCheck className="size-4" aria-hidden />}>
              Verify Achievement
            </Button>
          )}
          {can('reopen') && (
            <Button variant="secondary" onClick={() => openDialog('reopen')} disabled={!!busy} icon={<Undo2 className="size-4" aria-hidden />}>
              Reopen Review
            </Button>
          )}
        </div>
      </header>

      {/* What can happen next, so a missing button is never a mystery */}
      <p className="flex items-start gap-2.5 rounded-xl border border-line bg-parchment/50 px-4 py-3 text-[13.5px] text-ink-soft" role="note">
        {a.status === 'needs_attention' ? <Hourglass className="mt-0.5 size-4 shrink-0 text-terracotta-600" aria-hidden /> : <Info className="mt-0.5 size-4 shrink-0 text-lavender-700" aria-hidden />}
        <span>
          {a.status === 'submitted' && 'Start the review to take this submission. You can then verify it or request a correction.'}
          {a.status === 'under_review' && 'This submission is under review. Verify it, or request a correction if something needs fixing.'}
          {a.status === 'needs_attention' &&
            'Waiting on the student to edit and resubmit. Review actions are unavailable until it comes back to the queue; you can still add comments.'}
          {a.status === 'verified' &&
            `Verified${lastDecision ? ` by ${lastDecision.byName} on ${formatDate(lastDecision.at)}` : ''}. The record is read-only. If the decision was wrong, reopen the review with a reason.`}
        </span>
      </p>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="cert-heading">
            <h2 id="cert-heading" className="label-archival mb-3">Certificate</h2>
            <CertificatePreview certificate={a.certificate} eventName={a.eventName} />
            {certificatePresent && !previewAvailable && (
              <p className="mt-3 flex items-start gap-2 text-[12.5px] text-ink-muted">
                <FileWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                You’re reviewing from the recorded details only. If you need to see the document, request a correction asking the student to bring it to you.
              </p>
            )}
          </section>

          <section aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="label-archival mb-4">
              Comments {a.comments.length > 0 && `(${a.comments.length})`}
            </h2>
            <CommentThread achievementId={a.id} comments={a.comments} currentUser={faculty} placeholder="Ask the student a question or leave a note…" />
            <p className="mt-2 text-[12px] text-ink-muted">The student sees every comment and is notified. Comments can’t be edited or deleted.</p>
          </section>
        </div>

        <div className="space-y-8">
          <section aria-labelledby="student-heading" className="paper p-5">
            <h2 id="student-heading" className="label-archival mb-4">Student information</h2>
            <div className="mb-5 flex items-center gap-3">
              <span className="flex size-11 items-center justify-center rounded-full bg-lavender-100 text-sm font-semibold text-lavender-700" aria-hidden>
                {initials(student.fullName)}
              </span>
              <div>
                <p className="font-medium text-navy-900">{student.fullName}</p>
                <p className="font-mono text-[12px] text-ink-muted">@{student.username}</p>
              </div>
            </div>
            <DetailList
              rows={[
                ['Full name', student.fullName],
                ['Register number', <span key="r" className="font-mono">{student.registerNumber}</span>],
                ['Department', dept.name ?? student.department],
                ['Year', YEAR_LABEL[student.year]],
                ['Section', student.section],
                ['Their record', studentRecord ? `${studentRecord.total} submitted · ${studentRecord.verified} verified` : '—'],
              ]}
            />
            <p className="mt-4 text-[12px] text-ink-muted">Student details come from their profile and can’t be changed here.</p>
          </section>

          <section aria-labelledby="details-heading" className="paper p-5">
            <h2 id="details-heading" className="label-archival mb-4">Achievement information</h2>
            <DetailList
              rows={[
                ['Reference ID', <span key="ref" className="font-mono">{a.reference}</span>],
                ['Event name', a.eventName],
                ['Category', a.customCategory ? `${a.category} · ${a.customCategory}` : a.category],
                ['Organiser', a.organizer],
                ['Event date', formatDate(a.eventDate)],
                ['Location', a.location ?? '—'],
                ...(a.eventMode ? ([['Event mode', a.eventMode]] as [string, string][]) : []),
                ['Achievement type', a.achievementType],
                ['Prize or position', a.position ?? '—'],
                ['Submitted', formatDateTime(a.submittedAt)],
                ['Last updated', formatDateTime(a.updatedAt)],
                ['Current status', <StatusBadge key="s" status={a.status} />],
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
            <h2 id="history-heading" className="label-archival mb-4">Review history</h2>
            <ReviewHistory history={a.history} />
          </section>
        </div>
      </div>

      {/* Request correction */}
      <Dialog
        open={dialog === 'request_correction'}
        onClose={() => !busy && setDialog(null)}
        title="Request a correction"
        description="The submission moves to “Needs attention”. Your request is posted as a comment and the student is notified."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={!!busy}>
              Cancel
            </Button>
            <Button variant="primary" loading={busy === 'request_correction'} onClick={() => submitReason('request_correction')}>
              Send request
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="What does the student need to fix?" required error={reasonError} hint="Be specific — e.g. “The event date isn’t visible on the certificate. Please upload the full page.”">
            <TextArea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value)
                if (reasonError) setReasonError(undefined)
              }}
              rows={4}
              maxLength={COMMENT_MAX_LENGTH - 200}
              autoFocus
            />
          </Field>
          <Field label="Additional reviewer notes" optional hint="Anything else worth recording. Shown to the student after your request.">
            <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={180} />
          </Field>
        </div>
      </Dialog>

      {/* Verify */}
      <Dialog
        open={dialog === 'verify'}
        onClose={() => !busy && setDialog(null)}
        size="md"
        title="Verify this achievement?"
        description="The record becomes Verified and the student is notified. Their details and certificate are not changed."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={!!busy}>
              Cancel
            </Button>
            <Button variant="accent" loading={busy === 'verify'} onClick={() => run('verify', () => verifyAchievement(faculty.id, a.id, reason), 'Achievement verified')} icon={<BadgeCheck className="size-4" aria-hidden />}>
              Confirm verification
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <DetailList
            rows={[
              ['Student', `${student.fullName} · ${student.registerNumber}`],
              ['Achievement', a.eventName],
              ['Result', a.position ?? a.achievementType],
              ['Reference', <span key="r" className="font-mono">{a.reference}</span>],
              [
                'Certificate',
                certificatePresent ? `${a.certificate.fileName} (${ACCEPTED_TYPES[a.certificate.fileType]}, ${formatBytes(a.certificate.sizeBytes)})` : 'None attached',
              ],
              ['Verified by', faculty.fullName],
            ]}
          />
          {!previewAvailable && (
            <p role="alert" className="flex items-start gap-2 rounded-md border border-terracotta-300 bg-terracotta-50 px-3 py-2.5 text-[13px] text-terracotta-700">
              <FileWarning className="mt-0.5 size-4 shrink-0" aria-hidden />
              {certificatePresent
                ? 'The certificate file can’t be viewed in this prototype. Only confirm if you have checked the document another way.'
                : 'This record has no certificate attached. Only confirm if you have seen the document yourself.'}
            </p>
          )}
          <Field label="Verification remark" optional hint="Recorded in the history and posted as a comment, e.g. how you confirmed it.">
            <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} />
          </Field>
        </div>
      </Dialog>

      {/* Reopen */}
      <Dialog
        open={dialog === 'reopen'}
        onClose={() => !busy && setDialog(null)}
        title="Reopen this verified record?"
        description="It returns to “Under review” and stops counting as verified. The student is notified and sees your reason."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={!!busy}>
              Cancel
            </Button>
            <Button variant="danger" loading={busy === 'reopen'} onClick={() => submitReason('reopen')} icon={<Undo2 className="size-4" aria-hidden />}>
              Reopen review
            </Button>
          </>
        }
      >
        <Field label="Why is this being reopened?" required error={reasonError} hint="For example, new information from the organiser.">
          <TextArea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (reasonError) setReasonError(undefined)
            }}
            rows={3}
            maxLength={COMMENT_MAX_LENGTH}
            autoFocus
          />
        </Field>
      </Dialog>
    </div>
  )
}
