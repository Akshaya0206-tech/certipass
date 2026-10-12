import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, CircleAlert, Inbox, ScanSearch } from 'lucide-react'
import { SubmissionsTable } from '../components/SubmissionsTable'
import { SectionHeading } from '../components/ui/PageHeader'
import { StatLedger } from '../components/ui/StatLedger'
import { departmentName } from '../services/academicService'
import { useFaculty, useFacultyAchievements, useFacultySummary, useReviewScope } from '../hooks/useReview'
import { formatRelative } from '../lib/format'

export default function FacultyDashboard() {
  const faculty = useFaculty()
  const scope = useReviewScope()
  // Counts and queue are built from the same scoped records, so they always agree.
  const summary = useFacultySummary()
  const records = useFacultyAchievements()
  const waiting = summary.awaitingReview + summary.underReview

  const recentComments = useMemo(
    () =>
      records
        .flatMap((a) => a.comments.map((c) => ({ ...c, achievement: a })))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5),
    [records],
  )
  const scopeNames = scope.map((code) => departmentName(code))

  return (
    <div className="space-y-6">
      <header className="paper p-5">
        <p className="label-archival">Faculty review desk · {scope.join(' · ')}</p>
        <h1 className="display mt-1.5 text-[20px] leading-tight md:text-[22px]">
          {waiting ? (
            <>
              <em>{waiting}</em> {waiting === 1 ? 'submission is' : 'submissions are'} waiting for you.
            </>
          ) : (
            'The queue is clear.'
          )}
        </h1>
        <p className="mt-1.5 text-[13.5px] text-ink-soft">
          Signed in as {faculty.fullName} · {faculty.designation}
        </p>
        <p className="mt-1 text-[13px] text-ink-muted">You review submissions from students in {scopeNames.join(' and ')}.</p>
      </header>

      <div>
        <StatLedger
          caption="Review summary for your departments"
          items={[
            { label: 'Awaiting Review', value: summary.awaitingReview, icon: Inbox, note: 'submitted, not yet started' },
            { label: 'Under Review', value: summary.underReview, icon: ScanSearch, tone: 'lavender', note: 'in progress' },
            { label: 'Needs Attention', value: summary.needsAttention, icon: CircleAlert, tone: 'terracotta', note: 'waiting on the student' },
            { label: 'Verified', value: summary.verified, icon: BadgeCheck, tone: 'navy' },
          ]}
        />
        <p className="mt-2 text-[12px] text-ink-muted">
          Counted from the {summary.total} submitted {summary.total === 1 ? 'record' : 'records'} in your departments. Each record is counted once, by its current status. Students’ drafts are never included.
        </p>
      </div>

      <div className="grid gap-5 2xl:grid-cols-[1fr_280px]">
        <section aria-labelledby="queue-heading" className="min-w-0">
          <SectionHeading
            id="queue-heading"
            title="Review queue"
            aside={
              <Link to="/faculty/queue" className="inline-flex items-center gap-1 text-sm font-medium text-navy-800 hover:underline">
                Full queue <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
          />
          <SubmissionsTable
            statuses={['submitted', 'under_review']}
            hrefFor={(id) => `/faculty/review/${id}`}
            caption="Submissions waiting for review"
            defaultSort="oldest_pending"
            limit={6}
            emptyTitle="The queue is clear"
            emptyBody="There are no submissions waiting for review in your departments."
          />
        </section>

        <aside aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="label-archival mb-4">Recent comments</h2>
          {recentComments.length === 0 ? (
            <p className="text-[13px] text-ink-muted">No comments yet.</p>
          ) : (
            <ol className="space-y-4 border-l border-line-strong pl-4">
              {recentComments.map((c) => (
                <li key={c.id} className="text-[13px]">
                  <Link to={`/faculty/review/${c.achievement.id}`} className="font-medium text-navy-900 hover:underline">
                    {c.achievement.eventName}
                  </Link>
                  <p className="mt-0.5 line-clamp-2 text-ink-soft">{c.body}</p>
                  <p className="mt-0.5 text-[11.5px] text-ink-muted">
                    {c.authorName} · <span className="capitalize">{c.authorRole}</span> · {formatRelative(c.createdAt)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </div>
    </div>
  )
}
