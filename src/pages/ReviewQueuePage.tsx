import { useSearchParams } from 'react-router-dom'
import { SubmissionsTable } from '../components/SubmissionsTable'
import { PageHeader } from '../components/ui/PageHeader'
import { useFacultySummary } from '../hooks/useReview'

/** Queue = submissions in your departments still waiting on faculty (submitted or under review). */
export default function ReviewQueuePage() {
  const summary = useFacultySummary()
  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Review desk · ${summary.awaitingReview} awaiting · ${summary.underReview} under review`}
        title="Review Queue"
        description="Submissions from your departments that are waiting for a decision. Longest-waiting first by default."
      />
      <SubmissionsTable
        statuses={['submitted', 'under_review']}
        hrefFor={(id) => `/faculty/review/${id}`}
        caption="Review queue"
        defaultSort="oldest_pending"
        emptyTitle="The queue is clear"
        emptyBody="There are no submissions waiting for review in your departments."
      />
    </div>
  )
}

export function AllSubmissionsPage() {
  const [params] = useSearchParams()
  return (
    <div className="space-y-6">
      <PageHeader kicker="Review desk" title="All Submissions" description="Every submitted record from students in your departments, whatever its status." />
      <SubmissionsTable hrefFor={(id) => `/faculty/review/${id}`} caption="All submissions" initialQuery={params.get('q') ?? ''} />
    </div>
  )
}
