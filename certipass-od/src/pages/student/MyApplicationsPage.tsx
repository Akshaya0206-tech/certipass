import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowDownWideNarrow, Files, SearchX, X } from 'lucide-react'
import { ApplicationsTable } from '../../components/ApplicationsTable'
import { Button, LinkButton } from '../../components/ui/Button'
import { FilterTabs, SearchInput } from '../../components/ui/Filters'
import { TextInput } from '../../components/ui/FormField'
import { PageHeader } from '../../components/ui/PageHeader'
import { EmptyState } from '../../components/ui/States'
import { useApplications } from '../../hooks/useData'
import { countByStatus } from '../../lib/stats'
import type { OdApplication } from '../../types'

type Filter = 'all' | 'pending' | 'approved' | 'rejected' | 'draft'
const FILTERS: Filter[] = ['all', 'pending', 'approved', 'rejected', 'draft']

/** Newest first by default; the toggle reverses it. */
const when = (a: OdApplication) => a.submittedAt ?? a.createdAt

export default function MyApplicationsPage() {
  const apps = useApplications()
  const [params, setParams] = useSearchParams()
  const initial = params.get('status') as Filter | null
  const [filter, setFilter] = useState<Filter>(initial && FILTERS.includes(initial) ? initial : 'all')
  const [query, setQuery] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [oldestFirst, setOldestFirst] = useState(false)
  const counts = countByStatus(apps)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return apps
      .filter((a) => (filter === 'all' ? true : a.status === filter))
      .filter((a) => !q || a.id.toLowerCase().includes(q) || a.eventName.toLowerCase().includes(q))
      .filter((a) => (!from || a.eventStart >= from) && (!to || (a.eventStart !== '' && a.eventStart <= to)))
      .sort((a, b) => (oldestFirst ? when(a).localeCompare(when(b)) : when(b).localeCompare(when(a))))
  }, [apps, filter, query, from, to, oldestFirst])

  const filtered = filter !== 'all' || query || from || to
  const clear = () => {
    setFilter('all')
    setQuery('')
    setFrom('')
    setTo('')
    setParams({})
  }

  return (
    <div>
      <PageHeader
        title="My applications"
        description="Every OD request you have made, with its current status."
        actions={
          <LinkButton to="/student/apply" variant="accent">
            Apply for OD Pass
          </LinkButton>
        }
      />

      <div className="panel">
        <div className="space-y-3 border-b border-line p-4">
          <FilterTabs
            label="Filter by status"
            value={filter}
            onChange={setFilter}
            tabs={[
              { value: 'all', label: 'All', count: apps.length },
              { value: 'pending', label: 'Pending', count: counts.pending },
              { value: 'approved', label: 'Approved', count: counts.approved },
              { value: 'rejected', label: 'Rejected', count: counts.rejected },
              { value: 'draft', label: 'Drafts', count: counts.draft },
            ]}
          />
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <SearchInput value={query} onChange={setQuery} placeholder="Search by ID or event name" label="Search applications by ID or event name" />
            <div className="flex flex-1 flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-ink-soft">
                Event from
                <TextInput type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
              </label>
              <label className="text-xs font-semibold text-ink-soft">
                Event to
                <TextInput type="date" min={from || undefined} value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
              </label>
              <Button variant="secondary" onClick={() => setOldestFirst(!oldestFirst)} aria-label={`Sorted ${oldestFirst ? 'oldest' : 'newest'} first. Change sort order`}>
                <ArrowDownWideNarrow className="size-4" aria-hidden /> {oldestFirst ? 'Oldest first' : 'Newest first'}
              </Button>
              {filtered && (
                <Button variant="ghost" onClick={clear}>
                  <X className="size-4" aria-hidden /> Clear
                </Button>
              )}
            </div>
          </div>
        </div>
        <p className="sr-only" role="status">
          {rows.length} {rows.length === 1 ? 'application' : 'applications'} shown
        </p>
        <ApplicationsTable
          apps={rows}
          role="student"
          caption="Your OD applications"
          empty={
            filtered ? (
              <EmptyState icon={SearchX} title="No applications match" body="Try a different status, search or date range." action={<Button variant="secondary" onClick={clear}>Clear filters</Button>} />
            ) : (
              <EmptyState icon={Files} title="No applications yet" body="Start your first OD application." action={<LinkButton to="/student/apply">Apply for OD Pass</LinkButton>} />
            )
          }
        />
      </div>
    </div>
  )
}
