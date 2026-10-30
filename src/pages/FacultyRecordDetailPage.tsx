import { useMemo } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ExternalLink, FileWarning, Files, SearchX, UserRound } from 'lucide-react'
import { certificateSource, CertificatePreview, hasCertificate, isStoredCertificate } from '../components/CertificatePreview'
import { CommentThread } from '../components/CommentThread'
import { DetailList } from '../components/RecordDetails'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/States'
import { batchLabel, batchCodeOf } from '../domain/batch'
import { countByResult } from '../domain/result'
import { departmentName } from '../services/academicService'
import { useUserMap } from '../hooks/useData'
import { useFaculty, useFacultyAchievements } from '../hooks/useFacultyRecords'
import { formatDate, formatDateTime, initials, ordinalYear, YEAR_LABEL } from '../lib/format'
import { activeRecords, isActiveRecord, recordStatusLabel } from '../domain/status'
import { ACCEPTED_TYPES, formatBytes } from '../services/fileService'
import { getFacultyAccessibleAchievement } from '../services/facultyService'

/**
 * One achievement record, for faculty: the student it belongs to, the event,
 * the recorded result, and the certificate.
 *
 * This page records and reports; it decides nothing. There is no approval,
 * no correction request and no status to change — a submitted record is
 * already part of the register. The recorded result is shown on its own
 * terms, independently of any state the record is in.
 */
export default function FacultyRecordDetailPage() {
  const { id = '' } = useParams()
  const [params] = useSearchParams()
  const faculty = useFaculty()
  const records = useFacultyAchievements()
  const users = useUserMap()

  // Scoped lookup: unknown ids and records outside this account's departments look the same.
  const achievement = getFacultyAccessibleAchievement(faculty.id, id, records)
  const user = achievement ? users.get(achievement.studentId) : undefined
  const student = user?.role === 'student' ? user : undefined

  const studentRecord = useMemo(
    () => (student ? countByResult(activeRecords(records.filter((a) => a.studentId === student.id))) : null),
    [records, student],
  )

  // Coming from a batch list, going back should land on the same list.
  const batchParam = params.get('batch')
  const backTo = batchParam ? `/faculty/batches?batch=${encodeURIComponent(batchParam)}` : '/faculty/batches'

  if (!achievement || !student) {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/faculty' }, { label: 'Batch Achievements', to: '/faculty/batches' }, { label: 'Not available' }]} />
        <div className="paper">
          <EmptyState
            icon={SearchX}
            title="Record not available"
            body="This record doesn’t exist, or it belongs to a department you don’t cover. Check the link, or find it in Batch Achievements."
            action={
              <ButtonLink to="/faculty/batches" variant="secondary">
                Back to Batch Achievements
              </ButtonLink>
            }
          />
        </div>
      </div>
    )
  }

  const a = achievement
  const batch = batchCodeOf(student)
  const certificatePresent = hasCertificate(a.certificate)
  // A bundled demo file has a plain link; a certificate in Drive is opened (and downloaded) from the preview itself.
  const certificateHref = certificateSource(a.certificate)
  const previewAvailable = certificatePresent && (!!certificateHref || isStoredCertificate(a.certificate))

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6">
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/faculty' }, { label: 'Batch Achievements', to: backTo }, { label: a.reference }]} />
      </div>

      <header className="flex flex-col gap-4 border-b border-line pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="label-archival">
            Achievement record · <span className="text-navy-800">{a.reference}</span>
          </p>
          <h1 className="display mt-2 text-[20px] leading-tight md:text-[24px]">{a.eventName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {/* The recorded result, not a workflow state. */}
            <span className="inline-flex items-center gap-1 rounded-full border border-navy-700/25 bg-navy-50 px-2.5 py-px text-[11.5px] leading-5 font-medium text-navy-800">
              {a.achievementType}
              {a.position ? ` · ${a.position}` : ''}
            </span>
            <span className="text-sm text-ink-muted">
              {student.fullName} · submitted {formatDate(a.submittedAt)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to={`/faculty/students?q=${encodeURIComponent(student.registerNumber || student.username)}`} variant="secondary" icon={<UserRound className="size-4" aria-hidden />}>
            View Student Profile
          </ButtonLink>
          {previewAvailable && certificateHref && (
            <a
              href={certificateHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-line-strong bg-white px-3.5 text-sm font-medium text-navy-900 hover:border-navy-700"
            >
              <ExternalLink className="size-4" aria-hidden />
              Open Certificate
            </a>
          )}
          <ButtonLink to={backTo} variant="secondary" icon={<Files className="size-4" aria-hidden />}>
            Back to Batch Achievements
          </ButtonLink>
        </div>
      </header>

      {!isActiveRecord(a.status) && (
        <p className="flex items-start gap-2.5 rounded-xl border border-line bg-parchment/50 px-4 py-3 text-[13.5px] text-ink-soft" role="note">
          <FileWarning className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
          <span>
            This record has been archived by the Office of Academic Records, so it is left out of batch lists and reports. Its details and certificate are
            kept exactly as submitted.
          </span>
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="cert-heading">
            <h2 id="cert-heading" className="label-archival mb-3">
              Certificate
            </h2>
            <CertificatePreview certificate={a.certificate} eventName={a.eventName} />
            <div className="mt-3">
              <DetailList
                rows={[
                  ['File name', certificatePresent ? <span key="f" className="font-mono text-[12.5px]">{a.certificate.fileName}</span> : 'None attached'],
                  ...(certificatePresent
                    ? ([
                        ['File type', ACCEPTED_TYPES[a.certificate.fileType] ?? a.certificate.fileType],
                        ['File size', formatBytes(a.certificate.sizeBytes)],
                      ] as [string, string][])
                    : []),
                ]}
              />
            </div>
            {certificatePresent && !previewAvailable && (
              <p className="mt-3 flex items-start gap-2 text-[12.5px] text-ink-muted">
                <FileWarning className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                The certificate file itself isn’t stored in this prototype, so it can’t be opened here. The file details above are what the student recorded.
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
            <h2 id="student-heading" className="label-archival mb-4">
              Student information
            </h2>
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
                ['Username', <span key="u" className="font-mono">@{student.username}</span>],
                ['Register number', <span key="r" className="font-mono">{student.registerNumber}</span>],
                ['Batch', batchLabel(batch)],
                ['Department', departmentName(student.department)],
                ['Study year', `${YEAR_LABEL[student.year]} (Year ${ordinalYear(student.year)})`],
                ['Section', student.section],
                [
                  'Their record',
                  studentRecord
                    ? `${studentRecord.total} ${studentRecord.total === 1 ? 'record' : 'records'} · ${studentRecord.winner} won · ${studentRecord.runner_up} runner-up`
                    : '—',
                ],
              ]}
            />
            <Link
              to={`/faculty/students?q=${encodeURIComponent(student.registerNumber || student.username)}`}
              className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-navy-800 hover:underline"
            >
              <UserRound className="size-3.5" aria-hidden /> View student profile
            </Link>
            <p className="mt-3 text-[12px] text-ink-muted">Student details come from their profile and can’t be changed here.</p>
          </section>

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
                ['Record state', recordStatusLabel(a.status)],
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
        </div>
      </div>
    </div>
  )
}
