import { useMemo, useState } from 'react'
import { Download, ScrollText } from 'lucide-react'
import { PassesTable } from '../components/PassesTable'
import { SearchInput } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { Button } from '../components/ui/Button'
import { useUser } from '../context/AuthContext'
import { useApplications } from '../hooks/useData'
import { downloadCsv, toCsv } from '../lib/csv'
import { formatDate, todayISO } from '../lib/format'

/** OD pass records for faculty (own scope) and administrators (everything). */
export default function PassRecordsPage() {
  const user = useUser()
  const apps = useApplications()
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps
      .filter((a) => a.status === 'approved' && a.passNumber)
      .filter((a) => !q || [a.passNumber!, a.studentName, a.registerNo, a.eventName].some((v) => v.toLowerCase().includes(q)))
  }, [apps, query])

  function exportCsv() {
    downloadCsv(
      `od-pass-records-${todayISO()}.csv`,
      toCsv(
        ['Pass number', 'Application ID', 'Student', 'Register number', 'Department', 'Event', 'OD from', 'OD until', 'Approved on', 'Approved by'],
        rows.map((a) => [a.passNumber, a.id, a.studentName, a.registerNo, a.department, a.eventName, a.odFrom, a.odUntil, formatDate(a.decision?.at), a.decision?.byName]),
      ),
    )
  }

  return (
    <div>
      <PageHeader
        title={user.role === 'admin' ? 'OD pass records' : 'Approved passes'}
        description="Every pass here comes from an approved application. Open one to view or print it."
        actions={
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="size-4" aria-hidden /> Export CSV
          </Button>
        }
      />
      <div className="panel">
        <div className="border-b border-line p-4">
          <SearchInput value={query} onChange={setQuery} placeholder="Search pass no., student or event" label="Search OD passes" />
        </div>
        <p className="sr-only" role="status">
          {rows.length} passes shown
        </p>
        <PassesTable apps={rows} role={user.role} empty={<EmptyState icon={ScrollText} title="No passes found" body={query ? 'Try a different search.' : 'Passes appear here once applications are approved.'} />} />
      </div>
    </div>
  )
}
