import { useMemo, useState } from 'react'
import { Inbox, SearchX } from 'lucide-react'
import { ApplicationsTable } from '../../components/ApplicationsTable'
import { FilterTabs, SearchInput } from '../../components/ui/Filters'
import { SelectInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { useUser } from '../../context/AuthContext'
import { DEPARTMENTS } from '../../data/seed'
import { useApplications } from '../../hooks/useData'
import { countByStatus } from '../../lib/stats'
import type { OdStatus } from '../../types'

type Filter = 'all' | Exclude<OdStatus, 'draft'>

/** "pending" shows only the review queue; "all" adds status filters. */
export default function QueuePage({ mode }: { mode: 'pending' | 'all' }) {
  const user = useUser()
  const apps = useApplications()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [dept, setDept] = useState('')
  const counts = countByStatus(apps)
  const multiDept = user.role === 'admin' || user.permissions?.scope === 'all'

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps
      .filter((a) => (mode === 'pending' ? a.status === 'pending' : filter === 'all' || a.status === filter))
      .filter((a) => !dept || a.department === dept)
      .filter((a) => !q || [a.id, a.studentName, a.registerNo, a.eventName].some((v) => v.toLowerCase().includes(q)))
      // Oldest pending first so nothing waits; otherwise newest first.
      .sort((a, b) => (mode === 'pending' ? (a.submittedAt ?? '').localeCompare(b.submittedAt ?? '') : (b.submittedAt ?? '').localeCompare(a.submittedAt ?? '')))
  }, [apps, mode, filter, query, dept])

  return (
    <div>
      <PageHeader
        title={mode === 'pending' ? 'Pending applications' : 'All applications'}
        description={
          mode === 'pending'
            ? 'Waiting for a decision, oldest first.'
            : multiDept
              ? 'Applications from every department you can access.'
              : `Applications from the ${user.department} department.`
        }
      />
      <div className="panel">
        <div className="space-y-3 border-b border-line p-4">
          {mode === 'all' && (
            <FilterTabs
              label="Filter by status"
              value={filter}
              onChange={setFilter}
              tabs={[
                { value: 'all', label: 'All', count: counts.total },
                { value: 'pending', label: 'Pending', count: counts.pending },
                { value: 'approved', label: 'Approved', count: counts.approved },
                { value: 'rejected', label: 'Rejected', count: counts.rejected },
              ]}
            />
          )}
          <div className="flex flex-col gap-3 sm:flex-row">
            <SearchInput value={query} onChange={setQuery} placeholder="Search ID, student, register no. or event" label="Search applications" />
            {multiDept && (
              <div className="sm:w-56">
                <label htmlFor="dept-filter" className="sr-only">
                  Filter by department
                </label>
                <SelectInput id="dept-filter" value={dept} onChange={(e) => setDept(e.target.value)}>
                  <option value="">All departments</option>
                  {DEPARTMENTS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                </SelectInput>
              </div>
            )}
          </div>
        </div>
        <p className="sr-only" role="status">
          {rows.length} {rows.length === 1 ? 'application' : 'applications'} shown
        </p>
        <ApplicationsTable
          apps={rows}
          role={user.role}
          caption={mode === 'pending' ? 'Applications waiting for review' : 'All applications'}
          empty={
            <EmptyState
              icon={mode === 'pending' && !query && !dept ? Inbox : SearchX}
              title={mode === 'pending' && !query && !dept ? 'Nothing waiting for review' : 'No applications match'}
              body={mode === 'pending' && !query && !dept ? 'New applications will appear here as students submit them.' : 'Try a different search or filter.'}
            />
          }
        />
      </div>
    </div>
  )
}
