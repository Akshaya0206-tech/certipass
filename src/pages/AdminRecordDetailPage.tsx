import { Link, useParams } from 'react-router-dom'
import { Info, SearchX } from 'lucide-react'
import { CertificatePreview } from '../components/CertificatePreview'
import { CommentThread } from '../components/CommentThread'
import { DetailList, ReviewHistory } from '../components/RecordDetails'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/States'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useAchievements, useRequiredUser, useUserMap } from '../hooks/useData'
import { formatDate, formatDateTime, YEAR_LABEL } from '../lib/format'
import { departmentName } from '../services/academicService'

/**
 * Read-only view of one achievement for administrators: details, certificate,
 * conversation and full review history. There are deliberately no status
 * controls here — verification belongs to the faculty workflow.
 */
export default function AdminRecordDetailPage() {
  const { id = '' } = useParams()
  const admin = useRequiredUser()
  const achievements = useAchievements()
  const users = useUserMap()
  const a = achievements.find((x) => x.id === id)

  if (!a) {
    return (
      <div className="space-y-6">
        <Breadcrumbs items={[{ label: 'Overview', to: '/admin' }, { label: 'Achievement Records', to: '/admin/records' }, { label: 'Not found' }]} />
        <div className="paper">
          <EmptyState icon={SearchX} title="Record not found" body="This achievement record doesn’t exist. Check the link, or find it in the register." action={<ButtonLink to="/admin/records" variant="secondary">Back to Achievement Records</ButtonLink>} />
        </div>
      </div>
    )
  }

  const s = users.get(a.studentId)
  const student = s?.role === 'student' ? s : undefined
  const reviewer = a.reviewerId ? users.get(a.reviewerId) : undefined

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: 'Overview', to: '/admin' }, { label: 'Achievement Records', to: '/admin/records' }, { label: a.reference }]} />
        <header className="border-b border-line pb-6">
          <p className="label-archival">
            Achievement record · <span className="text-navy-800">{a.reference}</span>
          </p>
          <h1 className="display mt-2 text-[20px] leading-tight md:text-[24px]">{a.eventName}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge status={a.status} />
            <span className="text-sm text-ink-muted">
              {student ? student.fullName : 'Unknown student'} · submitted {formatDate(a.submittedAt)}
            </span>
          </div>
        </header>
      </div>

      <p className="flex items-start gap-2.5 rounded-xl border border-line bg-parchment/50 px-4 py-3 text-[13.5px] text-ink-soft" role="note">
        <Info className="mt-0.5 size-4 shrink-0 text-lavender-700" aria-hidden />
        This record is read-only for administrators. Its status can only be changed by the faculty reviewer through the review workflow, so every decision stays in the review history.
      </p>

      <div className="grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="cert-heading">
            <h2 id="cert-heading" className="label-archival mb-3">Certificate</h2>
            <CertificatePreview certificate={a.certificate} eventName={a.eventName} />
          </section>
          <section aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="label-archival mb-4">
              Comments {a.comments.length > 0 && `(${a.comments.length})`}
            </h2>
            <CommentThread achievementId={a.id} comments={a.comments} currentUser={admin} readOnly />
          </section>
        </div>

        <div className="space-y-8">
          <section aria-labelledby="student-heading" className="paper p-5">
            <h2 id="student-heading" className="label-archival mb-4">Student</h2>
            {student ? (
              <>
                <DetailList
                  rows={[
                    ['Full name', <Link key="n" to={`/admin/users/${student.id}`} className="text-navy-800 underline decoration-line-strong underline-offset-2 hover:decoration-navy-700">{student.fullName}</Link>],
                    ['Register number', <span key="r" className="font-mono">{student.registerNumber}</span>],
                    ['Department', departmentName(student.department)],
                    ['Year', YEAR_LABEL[student.year]],
                    ['Section', student.section],
                  ]}
                />
              </>
            ) : (
              <p className="text-sm text-ink-muted">The student account for this record could not be found.</p>
            )}
          </section>

          <section aria-labelledby="details-heading" className="paper p-5">
            <h2 id="details-heading" className="label-archival mb-4">Achievement details</h2>
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
                ['Reviewer', reviewer ? <Link key="rv" to={`/admin/users/${reviewer.id}`} className="text-navy-800 underline decoration-line-strong underline-offset-2 hover:decoration-navy-700">{reviewer.fullName}</Link> : 'Not yet assigned'],
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
            <h2 id="history-heading" className="label-archival mb-4">Status history</h2>
            <ReviewHistory history={a.history} />
          </section>
        </div>
      </div>
    </div>
  )
}
