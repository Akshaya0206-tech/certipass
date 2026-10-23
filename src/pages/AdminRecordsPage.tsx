import { useId, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '../components/ui/Filters'
import { CHEVRON } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination, usePagination } from '../components/ui/Pagination'
import { EmptyState } from '../components/ui/States'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useToast } from '../context/ToastContext'
import { CATEGORY_OPTIONS, STATUS_OPTIONS } from '../hooks/useAchievementFilters'
import { useAchievements, useUsers } from '../hooks/useData'
import { downloadCsv, fileDate } from '../lib/csv'
import { batchLabel } from '../domain/batch'
import { formatDate, ordinalYear } from '../lib/format'
import { categoryLabel } from '../services/achievementValidation'
import { exportFilteredAchievements, getAdminRecords, RECORD_SORT_OPTIONS } from '../services/adminService'
import type { AdminRecordRow, RecordSort } from '../services/adminService'
import { useStore } from '../services/store'
import type { AchievementCategory, RecordStatus } from '../types'

export default function AdminRecordsPage() {
  const achievements = useAchievements()
  const users = useUsers()
  const drafts = useStore((s) => s.drafts)
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const sortId = useId()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState<RecordStatus | 'all'>('all')
  const [department, setDepartment] = useState('all')
  const [year, setYear] = useState('all')
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all')
  const [sort, setSort] = useState<RecordSort>('date_desc')

  const rows = useMemo(() => getAdminRecords({ query, status, department, year, category, sort }, achievements, users), [query, status, department, year, category, sort, achievements, users])
  // Departments that actually have students, so the filter never offers an empty choice by mistake.
  const departments = useMemo(() => [...new Set(users.filter((u) => u.role === 'student').map((u) => u.department))].sort(), [users])
  const active = query !== '' || status !== 'all' || department !== 'all' || year !== 'all' || category !== 'all'
  const paging = usePagination(rows, 12, `${query}|${status}|${department}|${year}|${category}|${sort}`)
  const reset = () => {
    setQuery('')
    setStatus('all')
    setDepartment('all')
    setYear('all')
    setCategory('all')
  }

  function exportCsv() {
    if (rows.length === 0) {
      toast.info('Nothing to export', 'No records match the current search and filters.')
      return
    }
    // Exports every row that matches the current filters, not just the page on screen.
    downloadCsv(`certipass-achievement-records-${fileDate()}.csv`, exportFilteredAchievements(rows))
    toast.success('CSV exported', `${rows.length} ${rows.length === 1 ? 'record' : 'records'}${active ? ' matching your filters' : ''}.`)
  }

  const columns: Column<AdminRecordRow>[] = [
    {
      key: 'ref',
      header: 'Reference',
      render: (r) => (
        <Link to={`/admin/records/${r.achievement.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-[12.5px] whitespace-nowrap text-navy-900 hover:underline">
          {r.achievement.reference}
        </Link>
      ),
    },
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div className="min-w-[140px]">
          <p className="font-medium text-navy-900">{r.studentName}</p>
          <p className="font-mono text-[11.5px] text-ink-muted">{r.registerNumber}</p>
          <StatusBadge status={r.achievement.status} className="mt-1.5 sm:hidden" />
        </div>
      ),
    },
    { key: 'dept', header: 'Dept.', render: (r) => <span className="whitespace-nowrap text-ink-soft">{r.department}{r.year ? ` · ${ordinalYear(r.year)}` : ''}</span>, hideBelow: 'md' },
    {
      key: 'event',
      header: 'Event',
      hideBelow: 'sm',
      render: (r) => (
        <div className="max-w-[240px] min-w-[150px]">
          <p className="truncate text-ink">{r.achievement.eventName}</p>
          <p className="truncate text-[12px] text-ink-muted">{categoryLabel(r.achievement)} · {r.achievement.position ?? r.achievement.achievementType}</p>
        </div>
      ),
    },
    { key: 'submitted', header: 'Submitted', render: (r) => <time dateTime={r.achievement.submittedAt} className="whitespace-nowrap text-ink-soft">{formatDate(r.achievement.submittedAt)}</time>, hideBelow: 'lg' },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.achievement.status} />, hideBelow: 'sm' },
    { key: 'batch', header: 'Batch', render: (r) => <span className="whitespace-nowrap text-ink-soft">{batchLabel(r.batch)}</span>, hideBelow: 'lg' },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Administration · ${achievements.length} submitted records`}
        title="Achievement Records"
        description="The register of every submitted achievement across departments. Open a record to see its details, certificate, comments and history. Records can be archived here, which keeps them in full but leaves them out of active lists and reports."
        actions={
          <Button variant="secondary" onClick={exportCsv} icon={<Download className="size-4" aria-hidden />}>
            Export CSV
          </Button>
        }
      />
      <FilterBar active={active} onReset={reset} resultLabel={`${rows.length} of ${achievements.length} records`}>
        <SearchInput value={query} onChange={setQuery} placeholder="Student, register no., event, reference…" className="md:w-72" label="Search records" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex">
          <FilterSelect label="Record state" value={status} onChange={setStatus} options={STATUS_OPTIONS} className="md:w-40" />
          <FilterSelect label="Department" value={department} onChange={setDepartment} options={[{ value: 'all', label: 'All departments' }, ...departments.map((d) => ({ value: d, label: d }))]} className="md:w-40" />
          <FilterSelect label="Year" value={year} onChange={setYear} options={[{ value: 'all', label: 'All years' }, ...[1, 2, 3, 4].map((y) => ({ value: String(y), label: `Year ${ordinalYear(y)}` }))]} className="md:w-32" />
          <FilterSelect label="Category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} className="md:w-40" />
        </div>
        <div className="md:w-44">
          <label htmlFor={sortId} className="sr-only">
            Sort by
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => setSort(e.target.value as RecordSort)}
            style={{ backgroundImage: CHEVRON }}
            className="h-10 w-full appearance-none rounded-lg border border-line-strong bg-white bg-[length:15px] bg-[right_9px_center] bg-no-repeat pr-8 pl-3 text-sm text-ink-soft focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none"
          >
            {RECORD_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      {achievements.length === 0 ? (
        <div className="paper">
          <EmptyState title="No achievement records yet" body="Submitted achievements will be listed here." />
        </div>
      ) : (
        <DataTable
          caption="Achievement records"
          columns={columns}
          rows={paging.pageRows}
          rowKey={(r) => r.achievement.id}
          onRowClick={(r) => navigate(`/admin/records/${r.achievement.id}`)}
          empty={<EmptyState title="No records match" body="Adjust the search or filters." action={active ? <button type="button" onClick={reset} className="text-sm font-medium text-navy-800 hover:underline">Clear filters</button> : undefined} />}
        />
      )}
      <Pagination {...paging} onPage={paging.setPage} />
      <p className="text-[12px] text-ink-muted">
        Only submitted achievements are listed. {drafts.length} unfinished {drafts.length === 1 ? 'draft is' : 'drafts are'} private to {drafts.length === 1 ? 'its student' : 'their students'} and not shown or exported.
      </p>
    </div>
  )
}
