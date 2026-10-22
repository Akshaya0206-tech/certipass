import { Link, useParams } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { LinkButton } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/States'
import { useApplications } from '../../hooks/useData'
import { formatDateTime } from '../../lib/format'

export default function ConfirmationPage() {
  const { id } = useParams()
  const app = useApplications().find((a) => a.id === id && a.status !== 'draft')
  if (!app) {
    return (
      <div className="panel">
        <EmptyState title="Application not found" action={<Link to="/student/applications" className="font-semibold text-purple underline">Go to my applications</Link>} />
      </div>
    )
  }
  return (
    <div className="panel mx-auto max-w-xl overflow-hidden text-center">
      <div className="h-1.5 bg-gold" aria-hidden />
      <div className="px-5 py-8 sm:px-8">
        <span className="mx-auto flex size-16 items-center justify-center rounded-full border-2 border-gold bg-gold-50" aria-hidden>
          <CheckCircle2 className="size-9 text-purple" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-purple-dark" role="status">
          Application submitted
        </h1>
        <p className="mt-1 text-sm text-ink-muted">Your faculty reviewer has been notified (within this demo). You can track the decision from your applications list.</p>

        <dl className="mx-auto mt-6 max-w-sm space-y-3 rounded-md border border-line bg-lavender p-4 text-left text-sm">
          <div>
            <dt className="kicker">Application ID</dt>
            <dd className="font-mono text-lg font-semibold text-purple-dark">{app.id}</dd>
          </div>
          <div>
            <dt className="kicker">Event</dt>
            <dd>{app.eventName}</dd>
          </div>
          <div>
            <dt className="kicker">Submitted</dt>
            <dd>{formatDateTime(app.submittedAt)}</dd>
          </div>
        </dl>

        <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
          <LinkButton to={`/student/applications/${app.id}`} variant="primary">
            Track status
          </LinkButton>
          <LinkButton to="/student" variant="secondary">
            Back to dashboard
          </LinkButton>
        </div>
      </div>
    </div>
  )
}
