import { useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Inbox } from 'lucide-react'
import { CATEGORY_OPTIONS, STATUS_OPTIONS } from '../hooks/useAchievementFilters'
import { useFaculty, useReviewScope } from '../hooks/useReview'
import { formatDate, ordinalYear } from '../lib/format'
import { categoryLabel } from '../services/achievementValidation'
import { enteredQueueAt, getFacultyReviewQueue, QUEUE_SORT_OPTIONS } from '../services/reviewService'
import type { QueueRow, QueueSort } from '../services/reviewService'
import { useStore } from '../services/store'
import type { AchievementCategory, SubmissionStatus } from '../types'
import { DataTable } from './ui/DataTable'
import type { Column } from './ui/DataTable'
import { FilterBar, FilterSelect, SearchInput } from './ui/Filters'
import { CHEVRON } from './ui/FormField'
import { EmptyState } from './ui/States'
import { StatusBadge } from './ui/StatusBadge'

interface SubmissionsTableProps {
  /** Limit the table (and its status filter) to these statuses, e.g. the awaiting-review queue. */
  statuses?: SubmissionStatus[]
  /** Where opening a row goes. Receives the record id. */
  hrefFor: (id: string) => string
  caption: string
  limit?: number
  initialQuery?: string
  defaultSort?: QueueSort
  /** Shown when the reviewer has nothing at all in this view (before any filtering). */
  emptyTitle?: string
  emptyBody?: string
}

/**
 * The faculty review table. Rows come from the review service, so they are
 * already limited to the signed-in reviewer's departments and can never
 * include drafts. Search, filters and sort are applied together.
 */
export function SubmissionsTable({ statuses, hrefFor, caption, limit, initialQuery = '', defaultSort = 'newest', emptyTitle, emptyBody }: SubmissionsTableProps) {
  const navigate = useNavigate()
  const faculty = useFaculty()
  const scope = useReviewScope()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)
  const sortId = useId()
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all')
  const [status, setStatus] = useState<SubmissionStatus | 'all'>('all')
  const [department, setDepartment] = useState('all')
  const [year, setYear] = useState('all')
  const [sort, setSort] = useState<QueueSort>(defaultSort)

  const inView = (s: SubmissionStatus) => !statuses || statuses.includes(s)
  const base = useMemo(
    () => getFacultyReviewQueue(faculty.id, {}, achievements, users).filter((r) => inView(r.achievement.status)),
    [faculty.id, achievements, users, statuses?.join(',')],
  )
  const rows = useMemo(
    () => getFacultyReviewQueue(faculty.id, { query, category, status, department, year, sort }, achievements, users).filter((r) => inView(r.achievement.status)),
    [faculty.id, achievements, users, query, category, status, department, year, sort, statuses?.join(',')],
  )

  const visible = limit ? rows.slice(0, limit) : rows
  const active = query !== '' || category !== 'all' || status !== 'all' || department !== 'all' || year !== 'all'
  const statusOptions = statuses ? STATUS_OPTIONS.filter((o) => o.value === 'all' || statuses.includes(o.value as SubmissionStatus)) : STATUS_OPTIONS
  const reset = () => {
    setQuery('')
    setCategory('all')
    setStatus('all')
    setDepartment('all')
    setYear('all')
  }

  const columns: Column<QueueRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div className="min-w-[150px]">
          <p className="font-medium text-navy-900">{r.studentName}</p>
          <p className="font-mono text-[11.5px] text-ink-muted">{r.registerNumber}</p>
          <p className="text-[11.5px] text-ink-muted">
            {r.department}
            {r.year ? ` · Year ${ordinalYear(r.year)} · Sec. ${r.section}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'event',
      header: 'Event',
      render: (r) => (
        <div className="max-w-[190px] min-w-[150px]">
          <Link to={hrefFor(r.achievement.id)} onClick={(e) => e.stopPropagation()} className="text-ink hover:underline sm:block sm:truncate">
            {r.achievement.eventName}
          </Link>
          <p className="font-mono text-[11.5px] text-ink-muted">{r.achievement.reference}</p>
          <StatusBadge status={r.achievement.status} className="mt-1.5 sm:hidden" />
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (r) => <span className="text-ink-soft">{categoryLabel(r.achievement)}</span>, hideBelow: 'md' },
    {
      key: 'result',
      header: 'Result',
      render: (r) => <span className="block max-w-[140px] truncate text-ink-soft">{r.achievement.position ?? r.achievement.achievementType}</span>,
      hideBelow: 'lg',
    },
    {
      key: 'submitted',
      header: 'Submitted',
      hideBelow: 'lg',
      render: (r) => {
        const entered = enteredQueueAt(r.achievement)
        return (
          <span className="whitespace-nowrap text-ink-soft">
            <time dateTime={entered}>{formatDate(entered)}</time>
            {entered !== r.achievement.submittedAt && <span className="block text-[11px] text-ink-muted">resubmitted</span>}
          </span>
        )
      },
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.achievement.status} />, hideBelow: 'sm' },
    {
      key: 'action',
      header: <span className="sr-only">Action</span>,
      align: 'right',
      render: (r) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            navigate(hrefFor(r.achievement.id))
          }}
          className="inline-flex h-8 items-center gap-1 rounded-lg border border-line-strong bg-white px-2.5 text-[13px] font-medium whitespace-nowrap text-navy-900 hover:border-navy-700"
        >
          {r.achievement.status === 'submitted' ? 'Review' : r.achievement.status === 'under_review' ? 'Continue' : 'Open'}
          <ArrowRight className="size-3.5" aria-hidden />
          <span className="sr-only">: {r.achievement.eventName} by {r.studentName}</span>
        </button>
      ),
    },
  ]

  if (base.length === 0) {
    return (
      <div className="paper">
        <EmptyState icon={Inbox} title={emptyTitle ?? 'Nothing here yet'} body={emptyBody ?? 'Submissions from students in your departments will appear here.'} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <FilterBar active={active} onReset={reset} resultLabel={`${rows.length} of ${base.length} ${base.length === 1 ? 'submission' : 'submissions'}${limit && rows.length > limit ? ` · showing ${limit}` : ''}`}>
        <SearchInput value={query} onChange={setQuery} placeholder="Name, register no., event, reference…" className="md:w-72" label="Search submissions" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex">
          <FilterSelect label="Status" value={status} onChange={setStatus} options={statusOptions} className="md:w-40" />
          {scope.length > 1 && (
            <FilterSelect label="Department" value={department} onChange={setDepartment} options={[{ value: 'all', label: 'All departments' }, ...scope.map((d) => ({ value: d, label: d }))]} className="md:w-40" />
          )}
          <FilterSelect
            label="Year"
            value={year}
            onChange={setYear}
            options={[{ value: 'all', label: 'All years' }, ...[1, 2, 3, 4].map((y) => ({ value: String(y), label: `Year ${ordinalYear(y)}` }))]}
            className="md:w-32"
          />
          <FilterSelect label="Category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} className="md:w-40" />
        </div>
        <div className="md:w-48">
          <label htmlFor={sortId} className="sr-only">
            Sort by
          </label>
          <select
            id={sortId}
            value={sort}
            onChange={(e) => setSort(e.target.value as QueueSort)}
            style={{ backgroundImage: CHEVRON }}
            className="h-10 w-full appearance-none rounded-lg border border-line-strong bg-white bg-[length:15px] bg-[right_9px_center] bg-no-repeat pr-8 pl-3 text-sm text-ink-soft focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none"
          >
            {QUEUE_SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>
      <DataTable
        caption={caption}
        columns={columns}
        rows={visible}
        rowKey={(r) => r.achievement.id}
        onRowClick={(r) => navigate(hrefFor(r.achievement.id))}
        empty={<EmptyState title="No submissions match" body="Adjust the search or filters to see more." action={active ? <button type="button" onClick={reset} className="text-sm font-medium text-terracotta-600 hover:underline">Clear filters</button> : undefined} />}
      />
    </div>
  )
}
