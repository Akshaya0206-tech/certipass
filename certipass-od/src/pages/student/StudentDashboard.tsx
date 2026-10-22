import { CheckCircle2, Clock, FilePlus2, Files, XCircle } from 'lucide-react'
import { ApplicationsTable } from '../../components/ApplicationsTable'
import { DadaLogo } from '../../components/Logo'
import { LinkButton } from '../../components/ui/Button'
import { Section } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { StatCard } from '../../components/ui/StatCard'
import { useUser } from '../../context/AuthContext'
import { useApplications } from '../../hooks/useData'
import { countByStatus } from '../../lib/stats'

export default function StudentDashboard() {
  const user = useUser()
  const apps = useApplications()
  const counts = countByStatus(apps)
  const recent = apps.slice(0, 5)

  return (
    <div className="space-y-6">
      <section className="panel flex items-center justify-between gap-6 border-l-4 border-l-gold p-5 sm:p-6">
        <div className="max-w-xl">
          <h1 className="page-title">Welcome back!</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {user.name} · {user.department} · Year {user.year}, Section {user.section}
          </p>
          <p className="mt-3 text-sm text-ink-muted">
            {counts.pending > 0 ? `${counts.pending} ${counts.pending === 1 ? 'application is' : 'applications are'} waiting for a faculty decision.` : 'Nothing is waiting for review right now.'}
          </p>
          <LinkButton to="/student/apply" variant="accent" className="mt-4 h-11 px-5">
            <FilePlus2 className="size-4" aria-hidden /> Apply for OD Pass
          </LinkButton>
        </div>
        <DadaLogo className="hidden h-16 shrink-0 md:block lg:h-24" />
      </section>

      <section aria-label="Application summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total applications" value={counts.total} icon={Files} to="/student/applications" />
        <StatCard label="Pending" value={counts.pending} icon={Clock} to="/student/applications?status=pending" emphasis={counts.pending > 0} />
        <StatCard label="Approved" value={counts.approved} icon={CheckCircle2} to="/student/passes" />
        <StatCard label="Rejected" value={counts.rejected} icon={XCircle} to="/student/applications?status=rejected" />
      </section>

      <Section title="Recent applications" action={apps.length > 5 ? <LinkButton to="/student/applications" variant="ghost" size="sm">View all</LinkButton> : undefined}>
        <ApplicationsTable
          apps={recent}
          role="student"
          caption="Your most recent OD applications"
          empty={
            <EmptyState
              icon={Files}
              title="No applications yet"
              body="When you apply for an OD pass it will appear here with its current status."
              action={
                <LinkButton to="/student/apply" variant="primary">
                  Start an application
                </LinkButton>
              }
            />
          }
        />
      </Section>
    </div>
  )
}
