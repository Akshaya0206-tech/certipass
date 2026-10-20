import { useId, useMemo, useState } from 'react'
import { Download, FileSpreadsheet } from 'lucide-react'
import { DataTable } from '../components/ui/DataTable'
import type { Column } from '../components/ui/DataTable'
import { Button } from '../components/ui/Button'
import { FilterSelect, SearchInput } from '../components/ui/Filters'
import { PageHeader, SectionHeading } from '../components/ui/PageHeader'
import { StatLedger } from '../components/ui/StatLedger'
import { EmptyState } from '../components/ui/States'
import { useToast } from '../context/ToastContext'
import { batchLabel } from '../domain/batch'
import { RESULT_GROUPS, RESULT_GROUP_ORDER } from '../domain/result'
import type { ResultGroup } from '../domain/result'
import { useFaculty, useFacultyBatches, useFacultyScope } from '../hooks/useFacultyRecords'
import { CATEGORY_OPTIONS } from '../hooks/useAchievementFilters'
import { cn } from '../lib/cn'
import { downloadCsv, fileDate } from '../lib/csv'
import { formatDate, ordinalYear } from '../lib/format'
import { departmentName } from '../services/academicService'
import { buildReport, describeReport, EMPTY_REPORT_FILTERS, rangeInvalid, reportCsv, reportFileName, resultBreakdown } from '../services/reportService'
import type { ReportFilters, ReportRow } from '../services/reportService'
import { useStore } from '../services/store'
import type { AchievementCategory } from '../types'

const RESULT_OPTIONS: { value: ResultGroup | 'all'; label: string }[] = [
  { value: 'all', label: 'All results' },
  ...RESULT_GROUP_ORDER.map((g) => ({ value: g as ResultGroup | 'all', label: RESULT_GROUPS[g].label })),
]

const PREVIEW_LIMIT = 25

/**
 * The Academic Report Generator — the HOD's report.
 *
 * Reports are built from submitted achievement records. Winner, Runner-up and
 * Participant come from each record's own recorded result; there is no
 * verification or approval filter, because that workflow no longer exists.
 * The preview and the download are produced from the same filtered dataset.
 */
export default function FacultyReportsPage() {
  const faculty = useFaculty()
  const scope = useFacultyScope()
  const batches = useFacultyBatches()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)
  const toast = useToast()
  const fromId = useId()
  const toId = useId()
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_REPORT_FILTERS)

  const set = <K extends keyof ReportFilters>(key: K, value: ReportFilters[K]) => setFilters((f) => ({ ...f, [key]: value }))
  const invalid = rangeInvalid(filters)

  // One dataset: the summary, the preview table and the download all read it.
  const report = useMemo(
    () => buildReport(faculty.id, filters, achievements, users),
    [faculty.id, filters, achievements, users],
  )

  const breakdown = resultBreakdown(report.totals)

  function download() {
    if (report.rows.length === 0) {
      toast.error('Nothing to export', 'No records match these filters, so there is no report to download.')
      return
    }
    downloadCsv(reportFileName(filters, fileDate()), reportCsv(report))
    toast.success('Report downloaded', `${report.rows.length} ${report.rows.length === 1 ? 'record' : 'records'} · ${describeReport(filters)}`)
  }

  const columns: Column<ReportRow>[] = [
    {
      key: 'student',
      header: 'Student',
      render: (r) => (
        <div className="min-w-[150px]">
          <p className="font-medium text-navy-900">{r.studentName}</p>
          <p className="font-mono text-[11.5px] text-ink-muted">{r.registerNumber}</p>
        </div>
      ),
    },
    { key: 'batch', header: 'Batch', render: (r) => <span className="whitespace-nowrap text-ink-soft">{r.batchLabel}</span>, hideBelow: 'md' },
    {
      key: 'department',
      header: 'Department',
      render: (r) => (
        <span className="text-ink-soft">
          {r.department}
          {r.year ? <span className="block text-[11.5px] text-ink-muted">Year {ordinalYear(r.year)} · Sec. {r.section}</span> : null}
        </span>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'event',
      header: 'Event',
      render: (r) => (
        <div className="max-w-[220px] min-w-[150px]">
          <p className="truncate text-ink">{r.achievement.eventName}</p>
          <p className="font-mono text-[11.5px] text-ink-muted">{r.achievement.reference}</p>
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (r) => <span className="text-ink-soft">{r.achievement.category}</span>, hideBelow: 'lg' },
    {
      key: 'result',
      header: 'Result',
      render: (r) => (
        <div className="max-w-[150px]">
          <p className="font-medium text-navy-900">{r.achievement.achievementType}</p>
          {r.achievement.position && <p className="truncate text-[11.5px] text-ink-muted">{r.achievement.position}</p>}
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Event date',
      render: (r) => <span className="whitespace-nowrap text-ink-soft">{formatDate(r.achievement.eventDate)}</span>,
      hideBelow: 'sm',
    },
  ]

  const dateInput = 'h-10 w-full rounded-lg border bg-white px-3 text-sm focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none'

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Academic reports · ${scope.join(' · ')}`}
        title="Academic Reports"
        description="Generate the department report from submitted achievement records. Choose a batch, department, category, result, event or date range — the preview and the download use exactly the same records."
        actions={
          <Button variant="accent" onClick={download} disabled={report.rows.length === 0} icon={<Download className="size-4" aria-hidden />}>
            Download CSV
          </Button>
        }
      />

      {/* Filters */}
      <section aria-labelledby="report-filters" className="space-y-3 rounded-xl border border-line bg-parchment/40 p-3 sm:p-4">
        <h2 id="report-filters" className="label-archival">
          Report filters
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <FilterSelect
            label="Batch"
            value={filters.batch}
            onChange={(v) => set('batch', v)}
            options={[{ value: 'all', label: 'All batches' }, ...batches.map((b) => ({ value: b.code, label: b.label }))]}
          />
          <FilterSelect
            label="Department"
            value={filters.department}
            onChange={(v) => set('department', v)}
            options={[{ value: 'all', label: 'All departments' }, ...scope.map((d) => ({ value: d, label: `${d} — ${departmentName(d)}` }))]}
          />
          <FilterSelect
            label="Category"
            value={filters.category}
            onChange={(v) => set('category', v as AchievementCategory | 'all')}
            options={CATEGORY_OPTIONS}
          />
          <FilterSelect label="Result" value={filters.result} onChange={(v) => set('result', v)} options={RESULT_OPTIONS} />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
          <SearchInput
            value={filters.event}
            onChange={(v) => set('event', v)}
            placeholder="Event name…"
            label="Filter by event name"
            className="sm:w-64"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor={fromId} className="mb-1 block text-[12px] text-ink-muted">
                Event date from
              </label>
              <input
                id={fromId}
                type="date"
                value={filters.from}
                max={filters.to || undefined}
                onChange={(e) => set('from', e.target.value)}
                className={cn(dateInput, filters.from ? 'border-navy-700' : 'border-line-strong')}
              />
            </div>
            <div>
              <label htmlFor={toId} className="mb-1 block text-[12px] text-ink-muted">
                to
              </label>
              <input
                id={toId}
                type="date"
                value={filters.to}
                min={filters.from || undefined}
                onChange={(e) => set('to', e.target.value)}
                aria-invalid={invalid || undefined}
                className={cn(dateInput, invalid ? 'border-terracotta-500' : filters.to ? 'border-navy-700' : 'border-line-strong')}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-ink-soft sm:pb-2.5">
            <input
              type="checkbox"
              checked={filters.includeArchived}
              onChange={(e) => set('includeArchived', e.target.checked)}
              className="size-4 rounded border-line-strong text-navy-800 focus:ring-2 focus:ring-lavender-300"
            />
            Include archived records
          </label>
          {report.filtered && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_REPORT_FILTERS)}
              className="text-[13px] font-medium text-terracotta-600 underline-offset-2 hover:underline sm:ml-auto sm:pb-3"
            >
              Reset filters
            </button>
          )}
        </div>
        {invalid && (
          <p role="alert" className="text-[12.5px] text-terracotta-700">
            The start date is after the end date, so no records can match.
          </p>
        )}
      </section>

      {/* Summary of exactly what the report contains */}
      <div>
        <StatLedger
          caption="Report summary"
          items={[
            { label: 'Records', value: report.totals.total, icon: FileSpreadsheet },
            ...breakdown.map((b) => ({
              label: b.label,
              value: b.count,
              tone: (b.group === 'winner' ? 'navy' : b.group === 'runner_up' ? 'lavender' : b.group === 'other' ? 'terracotta' : 'default') as
                | 'navy'
                | 'lavender'
                | 'terracotta'
                | 'default',
            })),
            { label: 'Students', value: report.students },
          ]}
        />
        <p className="mt-2 text-[12px] text-ink-muted">
          {describeReport(filters)}. Each record counts once by its recorded result, so Winners + Runners-up + Participants + Other = Records.{' '}
          {report.events} distinct {report.events === 1 ? 'event' : 'events'}. Students’ drafts are never included.
        </p>
      </div>

      {report.byBatch.length > 1 && (
        <section aria-labelledby="by-batch">
          <SectionHeading id="by-batch" title="Records by batch" />
          <ul className="flex flex-wrap gap-2">
            {report.byBatch.map((b) => (
              <li key={b.code} className="rounded-lg border border-line bg-white px-3 py-1.5 text-[13px] text-ink-soft">
                {b.label} <span className="ml-1 font-semibold text-navy-900 tabular-nums">{b.count}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Preview — the same rows the download contains */}
      <section aria-labelledby="preview-heading">
        <SectionHeading
          id="preview-heading"
          title="Report preview"
          aside={
            report.rows.length > PREVIEW_LIMIT ? (
              <span className="text-[13px] text-ink-muted">
                Showing the first {PREVIEW_LIMIT} of {report.rows.length} — the download contains all {report.rows.length}.
              </span>
            ) : undefined
          }
        />
        {report.rows.length === 0 ? (
          <div className="paper">
            <EmptyState
              icon={FileSpreadsheet}
              title="No records match these filters"
              body="Widen the date range, choose another batch or result, or reset the filters to see the full report."
              action={
                report.filtered ? (
                  <Button variant="secondary" onClick={() => setFilters(EMPTY_REPORT_FILTERS)}>
                    Reset filters
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <DataTable
            caption={`Report preview — ${describeReport(filters)}`}
            columns={columns}
            rows={report.rows.slice(0, PREVIEW_LIMIT)}
            rowKey={(r) => r.achievement.id}
          />
        )}
      </section>

      {report.byCategory.length > 0 && (
        <section aria-labelledby="by-category">
          <SectionHeading id="by-category" title="Records by category" />
          <div className="paper overflow-x-auto">
            <table className="w-full border-collapse text-left text-[13.5px]">
              <caption className="sr-only">Records per achievement category in this report</caption>
              <thead>
                <tr className="border-b border-line bg-ivory">
                  <th scope="col" className="px-4 py-2.5 text-[12px] font-medium text-ink-muted">
                    Category
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right text-[12px] font-medium text-ink-muted">
                    Records
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.byCategory.map((c) => (
                  <tr key={c.category} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 text-ink-soft">{c.category}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{c.count}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-ivory font-medium">
                  <td className="px-4 py-2.5">Total</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{report.totals.total}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      <p className="text-[12px] text-ink-muted">
        {batches.length} {batches.length === 1 ? 'batch' : 'batches'} and {scope.length} {scope.length === 1 ? 'department' : 'departments'} are available to
        you{batches.length ? `: ${batches.map((b) => batchLabel(b.code)).join(', ')}` : ''}.
      </p>
    </div>
  )
}
