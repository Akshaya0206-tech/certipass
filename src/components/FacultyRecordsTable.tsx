import { useId, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Files } from 'lucide-react'
import { batchLabel } from '../domain/batch'
import { RESULT_GROUPS } from '../domain/result'
import type { ResultGroup } from '../domain/result'
import { CATEGORY_OPTIONS } from '../hooks/useAchievementFilters'
import { useFaculty, useFacultyBatches, useFacultyScope } from '../hooks/useFacultyRecords'
import { formatDate, ordinalYear } from '../lib/format'
import { categoryLabel } from '../services/achievementValidation'
import { getFacultyRecords, RECORD_SORT_OPTIONS } from '../services/facultyService'
import type { FacultyRecordRow, RecordSort } from '../services/facultyService'
import { useStore } from '../services/store'
import type { AchievementCategory } from '../types'
import { DataTable } from './ui/DataTable'
import type { Column } from './ui/DataTable'
import { FilterBar, FilterSelect, SearchInput } from './ui/Filters'
import { CHEVRON } from './ui/FormField'
import { EmptyState } from './ui/States'

interface FacultyRecordsTableProps {
  /** Where opening a row goes. Receives the record id. */
  hrefFor: (id: string) => string
  caption: string
  /** Fix the table to one recorded result, e.g. the Winners tab. */
  result?: ResultGroup
  /** Fix the table to one admission-year batch. */
  batch?: string
  limit?: number
  initialQuery?: string
  defaultSort?: RecordSort
  /** Offer the batch filter. Off when the page already scopes to one batch. */
  showBatchFilter?: boolean
  /** Offer the result filter. Off when the page uses result tabs instead. */
  showResultFilter?: boolean
  /** Shown when there is nothing at all in this view, before any filtering. */
  emptyTitle?: string
  emptyBody?: string
}

const RESULT_OPTIONS: { value: ResultGroup | 'all'; label: string }[] = [
  { value: 'all', label: 'All results' },
  { value: 'winner', label: RESULT_GROUPS.winner.label },
  { value: 'runner_up', label: RESULT_GROUPS.runner_up.label },
  { value: 'participant', label: RESULT_GROUPS.participant.label },
  { value: 'other', label: RESULT_GROUPS.other.label },
]

/**
 * The faculty record table. Rows come from the faculty service, so they are
 * already limited to the signed-in account's departments and can never
 * include drafts. Search, filters and sort are applied together.
 *
 * There is no status column and no status filter: every row is a submitted
 * record, and what distinguishes rows is the recorded achievement result.
 */
export function FacultyRecordsTable({
  hrefFor,
  caption,
  result,
  batch,
  limit,
  initialQuery = '',
  defaultSort = 'newest',
  showBatchFilter = true,
  showResultFilter = true,
  emptyTitle,
  emptyBody,
}: FacultyRecordsTableProps) {
  const navigate = useNavigate()
  const faculty = useFaculty()
  const scope = useFacultyScope()
  const batches = useFacultyBatches()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)
  const sortId = useId()
  const [query, setQuery] = useState(initialQuery)
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all')
  const [resultFilter, setResultFilter] = useState<ResultGroup | 'all'>('all')
  const [department, setDepartment] = useState('all')
  const [year, setYear] = useState('all')
  const [batchFilter, setBatchFilter] = useState('all')
  const [sort, setSort] = useState<RecordSort>(defaultSort)

  // A fixed result or batch comes from the page and can't be filtered away.
  const fixed = useMemo(() => ({ result, batch }), [result, batch])
  const base = useMemo(
    () => getFacultyRecords(faculty.id, { result: fixed.result, batch: fixed.batch }, achievements, users),
    [faculty.id, achievements, users, fixed],
  )
  const rows = useMemo(
    () =>
      getFacultyRecords(
        faculty.id,
        {
          query,
          category,
          result: fixed.result ?? resultFilter,
          department,
          year,
          batch: fixed.batch ?? batchFilter,
          sort,
        },
        achievements,
        users,
      ),
    [faculty.id, achievements, users, query, category, resultFilter, department, year, batchFilter, sort, fixed],
  )

  const visible = limit ? rows.slice(0, limit) : rows
  const active =
    query !== '' ||
    category !== 'all' ||
    (showResultFilter && !fixed.result && resultFilter !== 'all') ||
    department !== 'all' ||
    year !== 'all' ||
    (showBatchFilter && !fixed.batch && batchFilter !== 'all')
  const reset = () => {
    setQuery('')
    setCategory('all')
    setResultFilter('all')
    setDepartment('all')
    setYear('all')
    setBatchFilter('all')
  }

  const columns: Column<FacultyRecordRow>[] = [
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
          <p className="mt-0.5 text-[11.5px] text-ink-muted sm:hidden">{r.achievement.achievementType}</p>
        </div>
      ),
    },
    { key: 'batch', header: 'Batch', render: (r) => <span className="whitespace-nowrap text-ink-soft">{batchLabel(r.batch)}</span>, hideBelow: 'lg' },
    { key: 'category', header: 'Category', render: (r) => <span className="text-ink-soft">{categoryLabel(r.achievement)}</span>, hideBelow: 'md' },
    {
      key: 'result',
      header: 'Result',
      render: (r) => (
        <div className="max-w-[160px]">
          <p className="font-medium text-navy-900">{r.achievement.achievementType}</p>
          {r.achievement.position && <p className="truncate text-[11.5px] text-ink-muted">{r.achievement.position}</p>}
        </div>
      ),
      hideBelow: 'sm',
    },
    {
      key: 'submitted',
      header: 'Submitted',
      hideBelow: 'lg',
      render: (r) => (
        <span className="whitespace-nowrap text-ink-soft">
          <time dateTime={r.achievement.submittedAt}>{formatDate(r.achievement.submittedAt)}</time>
        </span>
      ),
    },
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
          Open
          <ArrowRight className="size-3.5" aria-hidden />
          <span className="sr-only">
            : {r.achievement.eventName} by {r.studentName}
          </span>
        </button>
      ),
    },
  ]

  if (base.length === 0) {
    return (
      <div className="paper">
        <EmptyState
          icon={Files}
          title={emptyTitle ?? 'No records yet'}
          body={emptyBody ?? 'Achievements submitted by students in your departments appear here straight away.'}
        />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <FilterBar
        active={active}
        onReset={reset}
        resultLabel={`${rows.length} of ${base.length} ${base.length === 1 ? 'record' : 'records'}${limit && rows.length > limit ? ` · showing ${limit}` : ''}`}
      >
        <SearchInput value={query} onChange={setQuery} placeholder="Name, register no., event, reference…" className="md:w-72" label="Search records" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex">
          {showResultFilter && !fixed.result && (
            <FilterSelect label="Result" value={resultFilter} onChange={setResultFilter} options={RESULT_OPTIONS} className="md:w-40" />
          )}
          {showBatchFilter && !fixed.batch && batches.length > 1 && (
            <FilterSelect
              label="Batch"
              value={batchFilter}
              onChange={setBatchFilter}
              options={[{ value: 'all', label: 'All batches' }, ...batches.map((b) => ({ value: b.code, label: b.label }))]}
              className="md:w-36"
            />
          )}
          {scope.length > 1 && (
            <FilterSelect
              label="Department"
              value={department}
              onChange={setDepartment}
              options={[{ value: 'all', label: 'All departments' }, ...scope.map((d) => ({ value: d, label: d }))]}
              className="md:w-40"
            />
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
      <DataTable
        caption={caption}
        columns={columns}
        rows={visible}
        rowKey={(r) => r.achievement.id}
        onRowClick={(r) => navigate(hrefFor(r.achievement.id))}
        empty={
          <EmptyState
            title="No records match"
            body="Adjust the search or filters to see more."
            action={
              active ? (
                <button type="button" onClick={reset} className="text-sm font-medium text-navy-800 hover:underline">
                  Clear filters
                </button>
              ) : undefined
            }
          />
        }
      />
    </div>
  )
}
