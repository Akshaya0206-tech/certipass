import { CheckCircle2, Clock, Files, XCircle } from 'lucide-react'
import { ApplicationsTable } from '../../components/ApplicationsTable'
import { DepartmentBars, TrendColumns } from '../../components/charts/Charts'
import { LinkButton } from '../../components/ui/Button'
import { PageHeader, Section } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { StatCard } from '../../components/ui/StatCard'
import { DEPARTMENTS } from '../../data/seed'
import { useAppState, useApplications } from '../../hooks/useData'
import { countByDepartment, countByStatus, monthlyTrend } from '../../lib/stats'

export default function AdminDashboard() {
  const apps = useApplications()
  const { users } = useAppState()
  const counts = countByStatus(apps)
  const byDept = countByDepartment(apps, DEPARTMENTS.map((d) => d.code)).map((d) => ({ label: d.code, total: d.total, approved: d.approved }))
  const trend = monthlyTrend(apps, 6, new Date())
  const students = users.filter((u) => u.role === 'student')
  const faculty = users.filter((u) => u.role === 'faculty')

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Applications and accounts across the college." />

      <section aria-label="Application totals" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total applications" value={counts.total} icon={Files} to="/admin/reports" />
        <StatCard label="Pending" value={counts.pending} icon={Clock} emphasis={counts.pending > 0} hint="Awaiting a decision" />
        <StatCard label="Approved" value={counts.approved} icon={CheckCircle2} to="/admin/passes" />
        <StatCard label="Rejected" value={counts.rejected} icon={XCircle} />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Applications by department">
          <div className="p-4">
            <DepartmentBars data={byDept} />
          </div>
        </Section>
        <Section title="Monthly trend (last 6 months)">
          <div className="p-4">
            <TrendColumns data={trend} />
          </div>
        </Section>
      </div>

      <Section title="Latest applications" action={<LinkButton to="/admin/reports" variant="ghost" size="sm">Open reports</LinkButton>}>
        <ApplicationsTable apps={apps.slice(0, 6)} role="admin" caption="Latest OD applications" empty={<EmptyState title="No applications yet" />} />
      </Section>

      <Section title="Accounts" action={<LinkButton to="/admin/users" variant="ghost" size="sm">Manage accounts</LinkButton>}>
        <dl className="grid divide-y divide-line text-sm sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {[
            ['Students', students.filter((u) => u.active).length, students.length],
            ['Faculty', faculty.filter((u) => u.active).length, faculty.length],
          ].map(([label, active, total]) => (
            <div key={label as string} className="flex items-center justify-between px-4 py-3">
              <dt className="text-ink-soft">{label}</dt>
              <dd className="font-semibold text-purple-dark tabular-nums">
                {active} <span className="font-normal text-ink-muted">active of {total}</span>
              </dd>
            </div>
          ))}
        </dl>
      </Section>
    </div>
  )
}
