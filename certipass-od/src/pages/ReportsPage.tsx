import { useMemo, useState } from 'react'
import { Download, SearchX, X } from 'lucide-react'
import { ApplicationsTable } from '../components/ApplicationsTable'
import { Button } from '../components/ui/Button'
import { SearchInput } from '../components/ui/Filters'
import { SelectInput, TextInput } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { StatCard } from '../components/ui/StatCard'
import { CheckCircle2, Clock, Files, XCircle } from 'lucide-react'
import { useUser } from '../context/AuthContext'
import { DEPARTMENTS, departmentName } from '../data/seed'
import { useApplications } from '../hooks/useData'
import { downloadCsv, toCsv } from '../lib/csv'
import { formatDate, todayISO } from '../lib/format'
import { countByStatus } from '../lib/stats'

/** Searchable application history with CSV export. Scope follows the signed-in account. */
export default function ReportsPage() {
  const user = useUser()
  const apps = useApplications()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [dept, setDept] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const multiDept = user.role === 'admin' || user.permissions?.scope === 'all'

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps.filter(
      (a) =>
        (!status || a.status === status) &&
        (!dept || a.department === dept) &&
        (!from || (a.submittedAt ?? '').slice(0, 10) >= from) &&
        (!to || (a.submittedAt ?? '9999').slice(0, 10) <= to) &&
        (!q || [a.id, a.studentName, a.registerNo, a.eventName, a.organizer].some((v) => v.toLowerCase().includes(q))),
    )
  }, [apps, query, status, dept, from, to])

  const counts = countByStatus(rows)
  const active = query || status || dept || from || to
  const clear = () => {
    setQuery('')
    setStatus('')
    setDept('')
    setFrom('')
    setTo('')
  }

  function exportCsv() {
    downloadCsv(
      `od-applications-${todayISO()}.csv`,
      toCsv(
        ['Application ID', 'Status', 'Student', 'Register number', 'Department', 'Year', 'Section', 'Event', 'Event type', 'Organiser', 'Event start', 'Event end', 'OD from', 'OD until', 'Submitted', 'Decided by', 'Decided on', 'Pass number', 'Remarks'],
        rows.map((a) => [a.id, a.status, a.studentName, a.registerNo, departmentName(a.department), a.year, a.section, a.eventName, a.eventType, a.organizer, a.eventStart, a.eventEnd, a.odFrom, a.odUntil, formatDate(a.submittedAt), a.decision?.byName, formatDate(a.decision?.at), a.passNumber, a.decision?.remarks]),
      ),
    )
  }

  return (
    <div>
      <PageHeader
        title={user.role === 'admin' ? 'Reports and application history' : 'Reports'}
        description="Filter the application record and export what you see."
        actions={
          <Button variant="primary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-4" aria-hidden /> Export CSV
          </Button>
        }
      />

      <section aria-label="Totals for the current filter" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Matching" value={counts.total} icon={Files} />
        <StatCard label="Pending" value={counts.pending} icon={Clock} />
        <StatCard label="Approved" value={counts.approved} icon={CheckCircle2} />
        <StatCard label="Rejected" value={counts.rejected} icon={XCircle} />
      </section>

      <div className="panel">
        <div className="grid gap-3 border-b border-line p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] lg:items-end">
          <SearchInput value={query} onChange={setQuery} placeholder="ID, student, event…" label="Search reports" />
          <label className="text-xs font-semibold text-ink-soft">
            Status
            <SelectInput value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1">
              <option value="">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </SelectInput>
          </label>
          {multiDept ? (
            <label className="text-xs font-semibold text-ink-soft">
              Department
              <SelectInput value={dept} onChange={(e) => setDept(e.target.value)} className="mt-1">
                <option value="">All departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d.code} value={d.code}>
                    {d.code}
                  </option>
                ))}
              </SelectInput>
            </label>
          ) : (
            <div className="hidden lg:block" />
          )}
          <label className="text-xs font-semibold text-ink-soft">
            Submitted from
            <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1" />
          </label>
          <label className="text-xs font-semibold text-ink-soft">
            Submitted to
            <TextInput type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} className="mt-1" />
          </label>
          {active ? (
            <Button variant="ghost" onClick={clear}>
              <X className="size-4" aria-hidden /> Clear
            </Button>
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
        <p className="sr-only" role="status">
          {rows.length} applications match
        </p>
        <ApplicationsTable apps={rows} role={user.role} caption="Application history" empty={<EmptyState icon={SearchX} title="No applications match" body="Try widening the filters." action={active ? <Button variant="secondary" onClick={clear}>Clear filters</Button> : undefined} />} />
      </div>
    </div>
  )
}
