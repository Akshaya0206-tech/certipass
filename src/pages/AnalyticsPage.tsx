import { useId, useMemo, useState } from 'react'
import { Award, Download, Files, Medal, Percent, Users, UsersRound } from 'lucide-react'
import { BarList, ChartFrame, ColumnChart, DepartmentBars, ResultSplit } from '../components/charts/Charts'
import { Button } from '../components/ui/Button'
import { CHEVRON } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { StatLedger } from '../components/ui/StatLedger'
import { useToast } from '../context/ToastContext'
import { useAcademicConfig } from '../hooks/useAcademics'
import { useAchievements, useUsers } from '../hooks/useData'
import { downloadCsv, fileDate } from '../lib/csv'
import { formatDate } from '../lib/format'
import { exportAnalyticsSummary, exportFilteredAchievements, getAdminRecords } from '../services/adminService'
import {
  filterByTimeRange,
  formatRate,
  getAchievementTrends,
  getAdminOverview,
  getAwardRate,
  getBatchAchievementStats,
  getCategoryAchievementStats,
  getDepartmentAchievementStats,
  getResultDistribution,
  METRIC_DEFINITIONS,
  rangeStart,
  submissionSpan,
  TIME_RANGE_OPTIONS,
} from '../services/analyticsService'
import { RESULT_GROUPS } from '../domain/result'
import type { TimeRange } from '../services/analyticsService'
import { useStore } from '../services/store'

const GRANULARITY = { day: 'day', week: 'week', month: 'month' } as const

export default function AnalyticsPage() {
  const all = useAchievements()
  const users = useUsers()
  const drafts = useStore((s) => s.drafts)
  const config = useAcademicConfig()
  const toast = useToast()
  const rangeId = useId()
  const [range, setRange] = useState<TimeRange>('all')

  // One "now" per range choice, so every figure on the page uses the same window.
  const now = useMemo(() => new Date(), [range]) // eslint-disable-line react-hooks/exhaustive-deps
  const records = useMemo(() => filterByTimeRange(all, range, now), [all, range, now])
  const overview = useMemo(() => getAdminOverview(users, records), [users, records])
  const rate = useMemo(() => getAwardRate(records), [records])
  const results = useMemo(() => getResultDistribution(records), [records])
  const batches = useMemo(() => getBatchAchievementStats(records, users, now).filter((b) => b.counts.total > 0), [records, users, now])
  const departments = useMemo(() => getDepartmentAchievementStats(records, users, config.departments), [records, users, config])
  const categories = useMemo(() => getCategoryAchievementStats(records), [records])
  const trend = useMemo(() => getAchievementTrends(all, range, now), [all, range, now])
  const span = useMemo(() => submissionSpan(all), [all])
  const studentsWithRecords = new Set(records.map((a) => a.studentId)).size
  const rangeLabel = TIME_RANGE_OPTIONS.find((o) => o.value === range)!.label
  const from = rangeStart(range, now)
  const empty = records.length === 0
  const emptyMessage = empty ? (all.length === 0 ? 'No achievement records yet.' : `No records were submitted in this range (${rangeLabel.toLowerCase()}).`) : undefined
  const other = categories.find((c) => c.category === 'Other')

  function exportSummary() {
    downloadCsv(`certipass-analytics-summary-${range}-${fileDate()}.csv`, exportAnalyticsSummary(records, users, range, rangeLabel, now))
    toast.success('Summary exported', `Analytics figures for “${rangeLabel}”.`)
  }

  function exportRecords() {
    if (empty) {
      toast.info('Nothing to export', 'No records were submitted in this range.')
      return
    }
    downloadCsv(`certipass-achievement-records-${range}-${fileDate()}.csv`, exportFilteredAchievements(getAdminRecords({ sort: 'date_desc' }, records, users)))
    toast.success('CSV exported', `${records.length} ${records.length === 1 ? 'record' : 'records'} from “${rangeLabel}”.`)
  }

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Administration"
        title="Analytics & Reports"
        description="Every figure is calculated from the current records, including changes made in this browser. Drafts are never counted."
        actions={
          <>
            <Button variant="secondary" onClick={exportSummary} icon={<Download className="size-4" aria-hidden />}>
              Export summary (CSV)
            </Button>
            <Button variant="secondary" onClick={exportRecords} icon={<Download className="size-4" aria-hidden />}>
              Export records (CSV)
            </Button>
          </>
        }
      />

      {/* Time range */}
      <div className="flex flex-col gap-3 rounded-xl border border-line bg-parchment/40 p-4 sm:flex-row sm:items-center">
        <div className="sm:w-56">
          <label htmlFor={rangeId} className="mb-1 block text-[12px] text-ink-muted">
            Time range
          </label>
          <select
            id={rangeId}
            value={range}
            onChange={(e) => setRange(e.target.value as TimeRange)}
            style={{ backgroundImage: CHEVRON }}
            className="h-10 w-full appearance-none rounded-lg border border-line-strong bg-white bg-[length:15px] bg-[right_9px_center] bg-no-repeat pr-8 pl-3 text-sm focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none"
          >
            {TIME_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[13px] text-ink-soft" aria-live="polite">
          {from ? (
            <>
              Records first submitted from <span className="font-medium text-ink">{formatDate(from.toISOString())}</span> to today{range === 'academic_year' && ' (the academic year is taken to start on 1 June)'}.
            </>
          ) : (
            'All submitted records.'
          )}{' '}
          <span className="font-medium text-ink">{records.length}</span> of {all.length} records fall in this range.
          {span && (
            <span className="block text-[12px] text-ink-muted">
              Uses each record’s first submission date. Records on file run from {formatDate(span.first)} to {formatDate(span.last)}.
            </span>
          )}
        </p>
      </div>

      {/* A. Achievement overview */}
      <section aria-labelledby="overview-heading">
        <h2 id="overview-heading" className="mb-4 font-serif text-[16px] text-navy-900">Achievement overview</h2>
        <StatLedger
          caption="Achievement overview for the selected range"
          items={[
            { label: 'Total records', value: overview.totalRecords, icon: Files, note: `${overview.recent} in the last 30 days` },
            { label: 'Winners', value: overview.winner, icon: Award, tone: 'navy' },
            { label: 'Runners-up', value: overview.runner_up, icon: Medal, tone: 'lavender' },
            { label: 'Participants', value: overview.participant, icon: Users, note: `${overview.other} other / unclassified` },
            { label: 'Awarded share', value: formatRate(rate), icon: Percent, tone: 'navy', note: 'records with a result above Participant' },
            { label: 'Students represented', value: studentsWithRecords, icon: UsersRound, note: 'with at least one record' },
          ]}
        />
        <p className="mt-2 text-[12.5px] text-ink-muted">
          <span className="font-medium text-ink-soft">Winners:</span> {METRIC_DEFINITIONS.winners} Winners + runners-up + participants + other = total, because each
          record counts once by the result its student recorded. {drafts.length} unfinished {drafts.length === 1 ? 'draft is' : 'drafts are'} excluded
          {overview.archived > 0 ? `, along with ${overview.archived} archived ${overview.archived === 1 ? 'record' : 'records'}` : ''}.
        </p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartFrame
          title="Achievement results"
          calculation="Share of the records in range by the result the student recorded."
          table={{ headers: ['Result', 'Records'], rows: results.map((r) => [RESULT_GROUPS[r.group].label, r.count]) }}
          emptyMessage={emptyMessage}
        >
          <ResultSplit data={results} />
        </ChartFrame>

        {/* D. Time */}
        <ChartFrame
          title="Submissions over time"
          calculation={`Records by first submission date, one column per ${GRANULARITY[trend.granularity]}. Periods with no submissions are shown as zero.`}
          table={{ headers: [trend.granularity === 'month' ? 'Month' : trend.granularity === 'week' ? 'Week starting' : 'Day', 'Submissions'], rows: trend.buckets.map((b) => [b.label, b.count]) }}
          emptyMessage={trend.buckets.every((b) => b.count === 0) ? emptyMessage ?? 'No submissions in this range.' : undefined}
        >
          <ColumnChart data={trend.buckets} />
        </ChartFrame>
      </div>

      {/* B. Departments */}
      <section aria-labelledby="dept-heading">
        <h2 id="dept-heading" className="font-serif text-[16px] text-navy-900">Departments</h2>
        <p className="mt-1 mb-4 text-sm text-ink-muted">
          A record counts toward the department of the student who submitted it. “Students with achievements” counts each student once, however many records they have. Winners, runners-up and participants are the results students recorded.
        </p>
        <div className="paper relative overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Department-wise achievement figures for the selected range</caption>
              <thead>
                <tr className="border-b border-line bg-parchment/60">
                  {['Department', 'Total', 'Winners', 'Runners-up', 'Participants', 'Students with achievements', 'Records per student'].map((h, i) => (
                    <th key={h} scope="col" className={`label-archival px-3 py-2.5 font-medium ${i > 0 ? 'text-right' : ''} ${i === 4 || i === 6 ? 'hidden md:table-cell' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {departments.map((d) => (
                  <tr key={d.code} className="border-b border-line/70 last:border-0">
                    <th scope="row" className="px-3 py-2.5 font-normal">
                      <span className="font-mono text-[12.5px] text-terracotta-600">{d.code}</span>
                      <span className="block text-[12px] text-ink-muted">{d.name}</span>
                    </th>
                    <td className="px-3 py-2.5 text-right text-navy-900 tabular-nums">{d.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{d.counts.winner}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{d.counts.runner_up}</td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{d.counts.participant}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {d.studentsWithAchievements}
                      <span className="text-ink-muted"> of {d.students}</span>
                    </td>
                    <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{d.perStudent ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-line-strong bg-parchment/40 font-medium">
                  <th scope="row" className="px-3 py-2.5 text-left">All departments</th>
                  <td className="px-3 py-2.5 text-right tabular-nums">{departments.reduce((n, d) => n + d.total, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{departments.reduce((n, d) => n + d.counts.winner, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{departments.reduce((n, d) => n + d.counts.runner_up, 0)}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">{departments.reduce((n, d) => n + d.counts.participant, 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{departments.reduce((n, d) => n + d.studentsWithAchievements, 0)}</td>
                  <td className="hidden px-3 py-2.5 text-right tabular-nums md:table-cell">
                    {studentsWithRecords ? Math.round((records.length / studentsWithRecords) * 10) / 10 : '—'}
                  </td>
                </tr>
              </tfoot>
            </table>
        </div>
      </section>

      {/* B2. Batches */}
      {batches.length > 0 && (
        <section aria-labelledby="batch-heading">
          <h2 id="batch-heading" className="font-serif text-[16px] text-navy-900">
            Batches
          </h2>
          <p className="mt-1 mb-4 text-sm text-ink-muted">
            A batch is the admission cohort, taken from each student’s register number. A record counts toward the batch of the student who submitted it.
          </p>
          <div className="paper relative overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <caption className="sr-only">Batch-wise achievement figures for the selected range</caption>
              <thead>
                <tr className="border-b border-line bg-parchment/60">
                  {['Batch', 'Records', 'Winners', 'Runners-up', 'Participants', 'Other'].map((h, i) => (
                    <th key={h} scope="col" className={`label-archival px-3 py-2.5 font-medium ${i > 0 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => (
                  <tr key={b.code} className="border-b border-line/70 last:border-0">
                    <th scope="row" className="px-3 py-2.5 font-normal">
                      {b.label}
                      <span className="block text-[12px] text-ink-muted">
                        {b.students} {b.students === 1 ? 'student' : 'students'}
                      </span>
                    </th>
                    <td className="px-3 py-2.5 text-right text-navy-900 tabular-nums">{b.counts.total}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.counts.winner}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.counts.runner_up}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.counts.participant}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{b.counts.other}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* C. Categories */}
      <section aria-labelledby="cat-heading">
        <h2 id="cat-heading" className="mb-4 font-serif text-[16px] text-navy-900">Department and category breakdown</h2>
        <div className="grid gap-5 lg:grid-cols-2">
        <ChartFrame
          title="Records by department"
          calculation="Total records per department; the inner bar is the winners’ share."
          table={{ headers: ['Department', 'Winners', 'Records'], rows: departments.map((d) => [d.code, d.counts.winner, d.total]) }}
          emptyMessage={emptyMessage}
        >
          <DepartmentBars data={departments.map((d) => ({ code: d.code, total: d.total, winners: d.counts.winner }))} />
        </ChartFrame>
        <ChartFrame
          title="Records by achievement category"
          calculation="Count of records in range per category. All nine categories are listed, including those with none."
          table={{ headers: ['Category', 'Records', 'Winners'], rows: categories.map((c) => [c.category, c.count, c.winners]) }}
          emptyMessage={emptyMessage}
        >
          <BarList data={categories.map((c) => ({ label: c.category, value: c.count }))} />
          {other?.customLabels && other.customLabels.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-[12.5px] text-ink-muted">
              Custom labels under “Other”: {other.customLabels.map((l) => `${l.label} (${l.count})`).join(', ')}.
            </p>
          )}
        </ChartFrame>
        </div>
      </section>

      <p className="text-[12px] text-ink-muted">
        Exports are CSV files created in your browser. “Export summary” contains the figures on this page for the selected range; “Export records” contains the records in the range. Neither includes usernames, passwords or sign-in data.
      </p>
    </div>
  )
}
