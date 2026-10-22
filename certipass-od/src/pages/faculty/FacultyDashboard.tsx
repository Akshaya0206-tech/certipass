import { CheckCircle2, ClipboardCheck, Clock, Inbox, XCircle } from 'lucide-react'
import { ApplicationsTable } from '../../components/ApplicationsTable'
import { DadaLogo } from '../../components/Logo'
import { LinkButton } from '../../components/ui/Button'
import { Section } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { StatCard } from '../../components/ui/StatCard'
import { useUser } from '../../context/AuthContext'
import { useApplications } from '../../hooks/useData'
import { countByStatus } from '../../lib/stats'

export default function FacultyDashboard() {
  const user = useUser()
  const apps = useApplications()
  const counts = countByStatus(apps)
  const mine = apps.filter((a) => a.decision?.byId === user.id).length
  const pending = apps.filter((a) => a.status === 'pending').sort((a, b) => (a.submittedAt ?? '').localeCompare(b.submittedAt ?? ''))

  return (
    <div className="space-y-6">
      <section className="panel flex items-center justify-between gap-6 border-l-4 border-l-gold p-5 sm:p-6">
        <div className="max-w-xl">
          <h1 className="page-title">Welcome back, {user.name.split(' ').slice(0, 2).join(' ')}</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {user.designation} · {user.permissions?.scope === 'all' ? 'All departments' : `${user.department} department`}
          </p>
          <p className="mt-3 text-sm text-ink-muted">{counts.pending > 0 ? `${counts.pending} ${counts.pending === 1 ? 'application needs' : 'applications need'} your decision.` : 'You are all caught up.'}</p>
          {counts.pending > 0 && (
            <LinkButton to="/faculty/pending" variant="accent" className="mt-4 h-11 px-5">
              Review pending applications
            </LinkButton>
          )}
        </div>
        <DadaLogo className="hidden h-16 shrink-0 md:block lg:h-24" />
      </section>

      <section aria-label="Review summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Pending requests" value={counts.pending} icon={Clock} to="/faculty/pending" emphasis={counts.pending > 0} />
        <StatCard label="Reviewed by you" value={mine} icon={ClipboardCheck} hint="Decisions under your name" />
        <StatCard label="Approved requests" value={counts.approved} icon={CheckCircle2} to="/faculty/passes" />
        <StatCard label="Rejected requests" value={counts.rejected} icon={XCircle} to="/faculty/applications" />
      </section>

      <Section title="Waiting for review" action={pending.length > 5 ? <LinkButton to="/faculty/pending" variant="ghost" size="sm">View all {pending.length}</LinkButton> : undefined}>
        <ApplicationsTable apps={pending.slice(0, 5)} role={user.role} caption="Applications waiting for review" empty={<EmptyState icon={Inbox} title="Nothing waiting for review" body="New applications appear here as students submit them." />} />
      </Section>
    </div>
  )
}
