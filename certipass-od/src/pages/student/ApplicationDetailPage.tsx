import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Download, FileQuestion, Pencil } from 'lucide-react'
import { ApplicationTimeline } from '../../components/ApplicationTimeline'
import { DecisionPanel, DocumentList, EventInfo, StudentInfo } from '../../components/ApplicationDetails'
import { LinkButton } from '../../components/ui/Button'
import { Section } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { StatusChip } from '../../components/ui/StatusChip'
import { useAppState } from '../../hooks/useData'
import { getApplication } from '../../services/odService'

export default function ApplicationDetailPage() {
  const { id = '' } = useParams()
  const state = useAppState()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const app = useMemo(() => getApplication(id), [id, state])

  if (!app) {
    return (
      <div className="panel">
        <EmptyState icon={FileQuestion} title="Application not found" body="It may not exist, or it belongs to another account." action={<LinkButton to="/student/applications" variant="secondary">Back to my applications</LinkButton>} />
      </div>
    )
  }

  return (
    <div>
      <Link to="/student/applications" className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-purple hover:underline">
        <ArrowLeft className="size-4" aria-hidden /> My applications
      </Link>
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-sm text-ink-muted">{app.id}</p>
          <h1 className="page-title">{app.eventName || 'Untitled draft'}</h1>
          <div className="mt-2">
            <StatusChip status={app.status} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {app.status === 'draft' && (
            <LinkButton to={`/student/apply/${app.id}`} variant="primary">
              <Pencil className="size-4" aria-hidden /> Edit draft
            </LinkButton>
          )}
          {app.status === 'approved' && app.passNumber && (
            <LinkButton to={`/student/passes/${app.id}`} variant="accent">
              <Download className="size-4" aria-hidden /> Download Pass
            </LinkButton>
          )}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <StudentInfo app={app} />
          <EventInfo app={app} />
          <DocumentList docs={app.documents} />
        </div>
        <div className="space-y-5">
          <DecisionPanel app={app} />
          {app.status === 'rejected' && (
            <p className="rounded-md border border-line bg-white p-3 text-sm text-ink-soft">
              A rejected application is final. You can submit a new application with the corrections requested.{' '}
              <Link to="/student/apply" className="font-semibold text-purple underline">
                Start a new application
              </Link>
            </p>
          )}
          <Section title="Timeline">
            <div className="p-4 pl-6">
              <ApplicationTimeline app={app} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  )
}
