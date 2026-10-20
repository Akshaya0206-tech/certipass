import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { batchLabel } from '../domain/batch'
import { useFacultyBatches, useFacultyScope, useFacultyStudentRows } from '../hooks/useFacultyRecords'
import { formatDate, ordinalYear } from '../lib/format'
import { activeSections } from '../services/academicService'
import type { FacultyStudentRow } from '../services/facultyService'

/**
 * Students in the departments this member of faculty covers, with how many
 * achievements each has on record. Search by name, register number or
 * username; filter by batch, department, study year and section.
 *
 * The counts are achievement results, not approval states.
 */
export default function FacultyStudentsPage() {
  const rowsAll = useFacultyStudentRows()
  const scope = useFacultyScope()
  const batches = useFacultyBatches()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [department, setDepartment] = useState('all')
  const [year, setYear] = useState('all')
  const [section, setSection] = useState('all')
  const [batch, setBatch] = useState('all')

  // A link from a record detail page arrives with ?q=<register number>.
  useEffect(() => {
    const q = params.get('q')
    if (q !== null) setQuery(q)
  }, [params])

  // Sections actually present among these students, plus any still configured.
  const sections = useMemo(() => {
    const present = new Set(rowsAll.map((r) => r.student.section).filter(Boolean))
    for (const s of activeSections()) present.add(s)
    return [...present].sort()
  }, [rowsAll])

  const rows = useMemo<FacultyStudentRow[]>(() => {
    const q = query.trim().toLowerCase()
    return rowsAll
      .filter((r) => department === 'all' || r.student.department === department)
      .filter((r) => year === 'all' || String(r.student.year) === year)
      .filter((r) => section === 'all' || r.student.section === section)
      .filter((r) => batch === 'all' || r.batch === batch)
      .filter((r) => !q || `${r.student.fullName} ${r.student.registerNumber} ${r.student.username}`.toLowerCase().includes(q))
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName))
  }, [rowsAll, query, department, year, section, batch])

  const active = query !== '' || department !== 'all' || year !== 'all' || section !== 'all' || batch !== 'all'
  const reset = () => {
    setQuery('')
    setDepartment('all')
    setYear('all')
    setSection('all')
    setBatch('all')
    if (params.get('q') !== null) {
      const next = new URLSearchParams(params)
      next.delete('q')
      setParams(next, { replace: true })
    }
  }

  const columns: Column<FacultyStudentRow>[] = [
    {
      key: 'name',
      header: 'Student',
      render: (r) => (
        <div className="min-w-[150px]">
          <p className="font-medium text-navy-900">{r.student.fullName}</p>
          <p className="font-mono text-[11.5px] text-ink-muted">{r.student.registerNumber}</p>
          <p className="font-mono text-[11.5px] text-ink-muted">@{r.student.username}</p>
        </div>
      ),
    },
    { key: 'batch', header: 'Batch', render: (r) => <span className="whitespace-nowrap text-ink-soft">{batchLabel(r.batch)}</span>, hideBelow: 'sm' },
    { key: 'dept', header: 'Department', render: (r) => <span className="text-ink-soft">{r.student.department}</span> },
    {
      key: 'year',
      header: 'Year · Sec.',
      render: (r) => <span className="whitespace-nowrap text-ink-soft">{`${ordinalYear(r.student.year)} · ${r.student.section}`}</span>,
      hideBelow: 'sm',
    },
    { key: 'total', header: 'Records', render: (r) => <span className="tabular-nums">{r.counts.total}</span>, align: 'right' },
    { key: 'winner', header: 'Winner', render: (r) => <span className="tabular-nums text-navy-800">{r.counts.winner}</span>, align: 'right', hideBelow: 'md' },
    {
      key: 'runner_up',
      header: 'Runner-up',
      render: (r) => <span className="tabular-nums text-lavender-700">{r.counts.runner_up}</span>,
      align: 'right',
      hideBelow: 'md',
    },
    {
      key: 'participant',
      header: 'Participant',
      render: (r) => <span className="tabular-nums text-ink-soft">{r.counts.participant}</span>,
      align: 'right',
      hideBelow: 'lg',
    },
    {
      key: 'last',
      header: 'Last submitted',
      render: (r) => (
        <span className="whitespace-nowrap text-ink-soft">{r.lastSubmittedAt ? formatDate(r.lastSubmittedAt) : <span className="text-ink-muted">—</span>}</span>
      ),
      align: 'right',
      hideBelow: 'lg',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Faculty records · ${scope.join(' · ')}`}
        title="Students"
        description="Students in the departments you cover, with how many achievements each has on record. Select a student to see their achievement records."
      />
      <FilterBar active={active} onReset={reset} resultLabel={`${rows.length} of ${rowsAll.length} ${rowsAll.length === 1 ? 'student' : 'students'}`}>
        <SearchInput value={query} onChange={setQuery} placeholder="Name, register number or username…" className="md:w-72" label="Search students" />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex">
          {batches.length > 1 && (
            <FilterSelect
              label="Batch"
              value={batch}
              onChange={setBatch}
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
          {sections.length > 1 && (
            <FilterSelect
              label="Section"
              value={section}
              onChange={setSection}
              options={[{ value: 'all', label: 'All sections' }, ...sections.map((s) => ({ value: s, label: `Section ${s}` }))]}
              className="md:w-36"
            />
          )}
        </div>
      </FilterBar>
      <DataTable
        caption="Students in your departments"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.student.id}
        onRowClick={(r) => navigate(`/faculty/batches?batch=${encodeURIComponent(r.batch)}`)}
        empty={
          <EmptyState
            title="No students match"
            body="Try another name, batch, department, year or section."
            action={
              active ? (
                <button type="button" onClick={reset} className="text-sm font-medium text-terracotta-600 hover:underline">
                  Clear filters
                </button>
              ) : undefined
            }
          />
        }
      />
      <p className="text-[12px] text-ink-muted">
        Record counts are each student’s submitted achievements, grouped by the result they recorded. Drafts are private to the student and never counted.
      </p>
    </div>
  )
}
