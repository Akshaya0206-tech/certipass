import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { FilterBar, FilterSelect, SearchInput } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { useFacultyAchievements, useFacultyStudents, useReviewScope } from '../hooks/useReview'
import { ordinalYear } from '../lib/format'
import { summarize } from '../services/achievementService'
import type { StatusSummary } from '../services/achievementService'
import type { StudentUser } from '../types'

type Row = StudentUser & { stats: StatusSummary }

export default function FacultyStudentsPage() {
  const students = useFacultyStudents()
  const achievements = useFacultyAchievements()
  const scope = useReviewScope()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('all')
  const [year, setYear] = useState('all')

  const rows = useMemo<Row[]>(() => {
    const q = query.trim().toLowerCase()
    return students
      .filter((u) => (department === 'all' || u.department === department) && (year === 'all' || String(u.year) === year))
      .filter((u) => !q || `${u.fullName} ${u.registerNumber} ${u.username}`.toLowerCase().includes(q))
      .map((u) => ({ ...u, stats: summarize(achievements.filter((a) => a.studentId === u.id)) }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [students, achievements, query, department, year])

  const columns: Column<Row>[] = [
    {
      key: 'name',
      header: 'Student',
      render: (r) => (
        <div>
          <p className="font-medium text-navy-900">{r.fullName}</p>
          <p className="font-mono text-[11.5px] text-ink-muted">{r.registerNumber}</p>
        </div>
      ),
    },
    { key: 'dept', header: 'Department', render: (r) => r.department },
    { key: 'year', header: 'Year · Sec.', render: (r) => `${ordinalYear(r.year)} · ${r.section}`, hideBelow: 'sm' },
    { key: 'total', header: 'Submitted', render: (r) => <span className="tabular-nums">{r.stats.total}</span>, align: 'right', hideBelow: 'md' },
    { key: 'verified', header: 'Verified', render: (r) => <span className="tabular-nums text-navy-800">{r.stats.verified}</span>, align: 'right' },
    {
      key: 'open',
      header: 'Awaiting',
      align: 'right',
      render: (r) => <span className="tabular-nums text-lavender-700">{r.stats.submitted + r.stats.underReview}</span>,
      hideBelow: 'md',
    },
    {
      key: 'attention',
      header: 'Attention',
      align: 'right',
      render: (r) => <span className={r.stats.needsAttention ? 'font-medium text-terracotta-600 tabular-nums' : 'text-ink-muted tabular-nums'}>{r.stats.needsAttention}</span>,
      hideBelow: 'lg',
    },
  ]

  return (
    <div className="space-y-6">
      <PageHeader kicker="Review desk" title="Students" description="Students in the departments you review, and the state of their records. Select a student to see their submissions." />
      <FilterBar
        active={query !== '' || department !== 'all' || year !== 'all'}
        onReset={() => {
          setQuery('')
          setDepartment('all')
          setYear('all')
        }}
        resultLabel={`${rows.length} students`}
      >
        <SearchInput value={query} onChange={setQuery} placeholder="Name or register number…" className="md:w-64" label="Search students" />
        <div className="grid grid-cols-2 gap-2 md:flex">
          {scope.length > 1 && (
            <FilterSelect label="Department" value={department} onChange={setDepartment} options={[{ value: 'all', label: 'All departments' }, ...scope.map((d) => ({ value: d, label: d }))]} className="md:w-40" />
          )}
          <FilterSelect label="Year" value={year} onChange={setYear} options={[{ value: 'all', label: 'All years' }, ...[1, 2, 3, 4].map((y) => ({ value: String(y), label: `Year ${ordinalYear(y)}` }))]} className="md:w-32" />
        </div>
      </FilterBar>
      <DataTable
        caption="Students"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/faculty/submissions?q=${encodeURIComponent(r.registerNumber)}`)}
        empty={<EmptyState title="No students match" body="Try another name, department or year." />}
      />
    </div>
  )
}
