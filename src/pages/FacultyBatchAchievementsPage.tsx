import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { FacultyRecordsTable } from '../components/FacultyRecordsTable'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { CHEVRON } from '../components/ui/FormField'
import { batchLabel } from '../domain/batch'
import { RESULT_GROUPS, RESULT_GROUP_ORDER, countByResult } from '../domain/result'
import type { ResultGroup } from '../domain/result'
import { activeRecords } from '../domain/status'
import { useFaculty, useFacultyBatches, useFacultyScope } from '../hooks/useFacultyRecords'
import { cn } from '../lib/cn'
import { getFacultyRecords } from '../services/facultyService'
import { useStore } from '../services/store'

type Tab = ResultGroup | 'all'

const TABS: { value: Tab; label: string }[] = [
  { value: 'all', label: 'All Achievements' },
  ...RESULT_GROUP_ORDER.map((g) => ({ value: g as Tab, label: RESULT_GROUPS[g].label })),
]

const isTab = (v: string | null): v is Tab => v === 'all' || (RESULT_GROUP_ORDER as string[]).includes(v ?? '')

/**
 * Batch Achievements — every submitted record for a chosen admission batch,
 * split by the result the student actually recorded.
 *
 * The tabs are achievement results (Winners, Runners-up, Participants, Other),
 * never approval states: a record appears the moment the student submits it.
 */
export default function FacultyBatchAchievementsPage() {
  const [params, setParams] = useSearchParams()
  const faculty = useFaculty()
  const scope = useFacultyScope()
  const batches = useFacultyBatches()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)

  // "all" covers every batch in scope; otherwise a batch the faculty actually has.
  const requested = params.get('batch')
  const batch = requested && (requested === 'all' || batches.some((b) => b.code === requested)) ? requested : 'all'
  const tab: Tab = isTab(params.get('result')) ? (params.get('result') as Tab) : 'all'

  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === 'all') next.delete(k)
      else next.set(k, v)
    }
    setParams(next, { replace: true })
  }

  // Tab counts come from the same scoped, batch-filtered records the table lists.
  const counts = useMemo(() => {
    const rows = getFacultyRecords(faculty.id, { batch: batch === 'all' ? undefined : batch }, achievements, users)
    return countByResult(activeRecords(rows.map((r) => r.achievement)))
  }, [faculty.id, batch, achievements, users])

  const countFor = (t: Tab) => (t === 'all' ? counts.total : counts[t])
  const batchName = batch === 'all' ? 'all batches' : `batch ${batchLabel(batch)}`

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`${scope.join(' · ')} · ${counts.total} ${counts.total === 1 ? 'record' : 'records'} in ${batchName}`}
        title="Batch Achievements"
        description="Every achievement students in your departments have submitted, grouped by the result they recorded. Records appear here as soon as they are submitted."
      />

      {batches.length === 0 ? (
        <div className="paper">
          <EmptyState
            icon={GraduationCap}
            title="No students in your departments yet"
            body="Once students are registered in the departments you cover, their batches and achievement records will appear here."
          />
        </div>
      ) : (
        <>
          {/* Batch picker */}
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-parchment/40 p-3 sm:flex-row sm:items-end sm:p-4">
            <div className="sm:w-64">
              <label htmlFor="batch-picker" className="mb-1 block text-[12px] text-ink-muted">
                Batch
              </label>
              <select
                id="batch-picker"
                value={batch}
                onChange={(e) => set({ batch: e.target.value })}
                style={{ backgroundImage: CHEVRON }}
                className={cn(
                  'h-10 w-full appearance-none rounded-lg border bg-white bg-[length:15px] bg-[right_9px_center] bg-no-repeat pr-8 pl-3 text-sm focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none',
                  batch !== 'all' ? 'border-lavender-300 bg-lavender-50' : 'border-line-strong',
                )}
              >
                <option value="all">All batches</option>
                {batches.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.label} ({b.students} {b.students === 1 ? 'student' : 'students'})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-[12.5px] text-ink-muted sm:pb-2.5">
              A batch is the admission cohort, taken from the student’s register number.
            </p>
          </div>

          {/* Result tabs — the recorded achievement result, not a review state */}
          <div role="tablist" aria-label="Achievement result" className="flex flex-wrap gap-1.5 border-b border-line pb-px">
            {TABS.map((t) => {
              const selected = tab === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => set({ result: t.value })}
                  className={cn(
                    'inline-flex h-9 items-center gap-2 rounded-t-lg border border-b-0 px-3.5 text-[13.5px] transition-colors',
                    selected ? 'border-line bg-white font-medium text-ink' : 'border-transparent text-ink-soft hover:bg-parchment hover:text-ink',
                  )}
                >
                  {t.label}
                  <span className={cn('rounded-full px-1.5 text-[11.5px] font-semibold tabular-nums', selected ? 'bg-lavender-200 text-ink' : 'bg-parchment text-ink-muted')}>
                    {countFor(t.value)}
                  </span>
                </button>
              )
            })}
          </div>

          <div role="tabpanel" aria-label={tab === 'all' ? 'All achievements' : RESULT_GROUPS[tab].label}>
            <p className="mb-3 text-[12.5px] text-ink-muted">
              {tab === 'all'
                ? `Every submitted record in ${batchName}. Archived records are not listed.`
                : `${RESULT_GROUPS[tab].description} Showing ${batchName}.`}
            </p>
            <FacultyRecordsTable
              key={`${batch}-${tab}`}
              result={tab === 'all' ? undefined : tab}
              batch={batch === 'all' ? undefined : batch}
              hrefFor={(id) => `/faculty/records/${id}${batch === 'all' ? '' : `?batch=${encodeURIComponent(batch)}`}`}
              caption={`${tab === 'all' ? 'All achievements' : RESULT_GROUPS[tab].label} · ${batchName}`}
              showResultFilter={false}
              showBatchFilter={false}
              emptyTitle={tab === 'all' ? 'No records in this batch yet' : `No ${RESULT_GROUPS[tab].label.toLowerCase()} in this batch yet`}
              emptyBody={
                tab === 'all'
                  ? 'Achievements submitted by students in this batch will appear here straight away.'
                  : 'Try another result tab, or switch batch.'
              }
            />
          </div>
        </>
      )}
    </div>
  )
}
