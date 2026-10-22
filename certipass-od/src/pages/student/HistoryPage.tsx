import { Link } from 'react-router-dom'
import { History } from 'lucide-react'
import { PageHeader, Section } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { StatusChip } from '../../components/ui/StatusChip'
import { useApplications } from '../../hooks/useData'
import { formatDateTime } from '../../lib/format'

const LABEL = {
  created: 'Created',
  draft_saved: 'Draft saved',
  submitted: 'Submitted',
  edited: 'Edited',
  approved: 'Approved',
  rejected: 'Rejected',
} as const

/** A chronological record of everything that has happened to the student's applications. */
export default function HistoryPage() {
  const apps = useApplications()
  const events = apps
    .flatMap((a) => a.audit.map((e) => ({ ...e, app: a })))
    .filter((e) => e.action !== 'draft_saved')
    .sort((x, y) => y.at.localeCompare(x.at))

  return (
    <div>
      <PageHeader title="Application history" description="Every submission and decision on your applications, newest first." />
      <Section title="Activity">
        {events.length === 0 ? (
          <EmptyState icon={History} title="No history yet" body="Submitted applications and decisions will be recorded here." />
        ) : (
          <ol className="divide-y divide-line">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <p className="w-40 shrink-0 text-xs text-ink-muted tabular-nums">{formatDateTime(e.at)}</p>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-semibold">{LABEL[e.action]}</span> ·{' '}
                    <Link to={`/student/applications/${e.app.id}`} className="text-purple underline underline-offset-2">
                      {e.app.id}
                    </Link>{' '}
                    <span className="text-ink-soft">{e.app.eventName}</span>
                  </p>
                  <p className="text-xs text-ink-muted">By {e.actorName}</p>
                </div>
                {(e.action === 'approved' || e.action === 'rejected') && <StatusChip status={e.action} />}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  )
}
