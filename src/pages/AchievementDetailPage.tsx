import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Eye, FilePen, FilePlus2, SearchX } from 'lucide-react'
import { certificateSource, CertificatePreview, isStoredCertificate } from '../components/CertificatePreview'
import { CommentThread } from '../components/CommentThread'
import { PassportLoader } from '../components/passport/PassportLoader'
import { DetailList, StatusHistory } from '../components/RecordDetails'
import { Breadcrumbs } from '../components/ui/Breadcrumbs'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/States'
import { STATUS_META, StatusBadge } from '../components/ui/StatusBadge'
import { canStudentEdit } from '../domain/status'
import { useStudent } from '../hooks/useData'
import { useMyAchievements } from '../hooks/usePassport'
import { formatDate } from '../lib/format'
import { categoryLabel } from '../services/achievementValidation'
import { getAchievementById } from '../services/passportService'
import { RECORD_STATUS_DEFINITIONS } from '../domain/status'

export default function AchievementDetailPage() {
  return (
    <PassportLoader label="Loading achievement">
      <Detail />
    </PassportLoader>
  )
}

export function AchievementNotFound() {
  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: 'Dashboard', to: '/student' }, { label: 'My Achievements', to: '/student/achievements' }, { label: 'Not found' }]} />
      <div className="paper">
        <EmptyState
          icon={SearchX}
          title="Achievement not found"
          body="This achievement doesn’t exist in your passport. The link may be mistyped, or the record may belong to someone else."
          action={<ButtonLink to="/student/achievements" variant="secondary">Back to My Achievements</ButtonLink>}
        />
      </div>
    </div>
  )
}

function Detail() {
  const { id = '' } = useParams()
  const student = useStudent()
  const mine = useMyAchievements()
  // Scoped lookup: another student's record id resolves to "not found".
  const a = getAchievementById(student.id, id, mine)
  if (!a) return <AchievementNotFound />

  const meta = STATUS_META[a.status]
  const editable = canStudentEdit(a.status)
  const hasCertificate = !!certificateSource(a.certificate) || isStoredCertificate(a.certificate)

  return (
    <div className="space-y-8">
      <div>
        <Breadcrumbs items={[{ label: 'Dashboard', to: '/student' }, { label: 'My Achievements', to: '/student/achievements' }, { label: a.eventName }]} />
        <header className="paper flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="label-archival">
              {categoryLabel(a)} · <span className="text-navy-800">{a.reference}</span>
            </p>
            <h1 className="display mt-2 text-[20px] leading-tight md:text-[26px]">{a.eventName}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge status={a.status} />
              <span className="text-[13px] text-ink-muted">{meta.description}</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {editable && (
              <ButtonLink to={`/student/achievements/${a.id}/edit`} variant="accent" icon={<FilePen className="size-4" aria-hidden />}>
                Edit Achievement
              </ButtonLink>
            )}
            <a
              href="#certificate"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-line-strong bg-white px-3.5 text-[13.5px] font-medium text-ink hover:bg-parchment"
            >
              <Eye className="size-4" aria-hidden /> View Certificate
            </a>
            <ButtonLink to="/student/achievements/new" variant="ghost" icon={<FilePlus2 className="size-4" aria-hidden />}>
              Add Achievement
            </ButtonLink>
          </div>
        </header>
      </div>


      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr]">
        <div className="min-w-0 space-y-8">
          <section aria-labelledby="info-heading" className="paper p-5 sm:p-6">
            <h2 id="info-heading" className="label-archival mb-4">Achievement information</h2>
            <DetailList
              rows={[
                ['Event', a.eventName],
                ['Category', a.customCategory ? `${a.category} · ${a.customCategory}` : a.category],
                ['Organiser', a.organizer],
                ['Event date', formatDate(a.eventDate)],
                ...(a.location ? ([['Location', a.location]] as [string, string][]) : []),
                ...(a.eventMode ? ([['Event mode', a.eventMode]] as [string, string][]) : []),
                ['Achievement', a.achievementType],
                ...(a.position ? ([['Prize or position', a.position]] as [string, string][]) : []),
                ['Submitted', formatDate(a.submittedAt)],
                ['Last updated', formatDate(a.updatedAt)],
              ]}
            />
            <div className="mt-6 border-t border-line pt-5">
              <h3 className="label-archival mb-2">Description</h3>
              <p className="border-l-2 border-lavender-300 pl-3 text-sm text-ink-soft italic">{a.description}</p>
              {a.details && (
                <>
                  <h3 className="label-archival mt-5 mb-2">Additional notes</h3>
                  <p className="text-sm whitespace-pre-line text-ink-soft">{a.details}</p>
                </>
              )}
              {a.prizeDetails && (
                <>
                  <h3 className="label-archival mt-5 mb-2">Prize details</h3>
                  <p className="text-sm whitespace-pre-line text-ink-soft">{a.prizeDetails}</p>
                </>
              )}
              {a.evidenceNote && (
                <>
                  <h3 className="label-archival mt-5 mb-2">About the certificate</h3>
                  <p className="text-sm whitespace-pre-line text-ink-soft">{a.evidenceNote}</p>
                </>
              )}
            </div>
          </section>

          <section id="certificate" aria-labelledby="cert-heading" className="scroll-mt-20">
            <h2 id="cert-heading" className="label-archival mb-3">
              Certificate {hasCertificate ? '' : '· preview unavailable'}
            </h2>
            <CertificatePreview certificate={a.certificate} eventName={a.eventName} />
          </section>
        </div>

        <div className="space-y-8">
          <section aria-labelledby="record-heading" className="paper p-5">
            <h2 id="record-heading" className="label-archival mb-4">This record</h2>
            <div className="mb-5 flex items-start gap-3 rounded-md bg-parchment/60 p-3">
              <StatusBadge status={a.status} />
              <p className="text-[13px] text-ink-soft">{RECORD_STATUS_DEFINITIONS[a.status].description}</p>
            </div>
            <h3 className="label-archival mb-3 text-[10px]">Record history</h3>
            <StatusHistory history={a.history} />
          </section>

          <section aria-labelledby="comments-heading">
            <h2 id="comments-heading" className="label-archival mb-3">
              Comments {a.comments.length > 0 && `(${a.comments.length})`}
            </h2>
            <CommentThread
              achievementId={a.id}
              comments={a.comments}
              currentUser={student}
              placeholder="Ask your department’s faculty a question…"
            />
            <p className="mt-2 text-[12px] text-ink-muted">Comments are a conversation only — they don’t change the record.</p>
          </section>
        </div>
      </div>

      <div className="border-t border-line pt-5">
        <Link to="/student/achievements" className="inline-flex items-center gap-1.5 text-sm font-medium text-navy-800 hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Back to Achievements
        </Link>
      </div>
    </div>
  )
}
