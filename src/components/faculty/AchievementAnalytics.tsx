import { useId, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChartColumn } from 'lucide-react'
import { countByResult } from '../../domain/result'
import type { ResultGroup } from '../../domain/result'
import { CATEGORY_OPTIONS } from '../../hooks/useAchievementFilters'
import { useFaculty, useFacultyBatches, useFacultyScope } from '../../hooks/useFacultyRecords'
import { cn } from '../../lib/cn'
import { ordinalYear } from '../../lib/format'
import { getFacultyRecords } from '../../services/facultyService'
import { useStore } from '../../services/store'
import type { AchievementCategory } from '../../types'
import { FilterBar, FilterSelect, SearchInput } from '../ui/Filters'
import { SectionHeading } from '../ui/PageHeader'
import { EmptyState } from '../ui/States'
import { axisScale, groupData, uniqueById } from './analytics'
import type { GroupDatum } from './analytics'

/*
 * Achievement Analytics: the faculty member's achievement records as three
 * charts. They are built from the same records, by the same filtering code, as
 * the statistics cards and the record table (getFacultyRecords), so a new
 * submission shows up here at once and the four result groups always add up to
 * the total. No chart library: the shapes are plain SVG and CSS, like the other
 * charts in the app.
 *
 * The filters in this section narrow the charts only. The table further down
 * keeps its own filters.
 */

const SWATCH_EDGE = 'inset 0 0 0 1px rgb(0 0 0 / 0.1)'

type Active = ResultGroup | null

function ChartCard({ title, subtitle, children, className }: { title: string; subtitle: string; children: ReactNode; className?: string }) {
  const titleId = useId()
  return (
    <figure aria-labelledby={titleId} className={cn('paper flex min-w-0 flex-col p-5', className)}>
      <figcaption>
        <span id={titleId} className="block font-serif text-[15px] text-navy-900">
          {title}
        </span>
        <span className="mt-0.5 block text-[12px] text-ink-muted">{subtitle}</span>
      </figcaption>
      <div className="mt-5 flex flex-1 flex-col">{children}</div>
    </figure>
  )
}

function Swatch({ fill }: { fill: string }) {
  return <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: fill, boxShadow: SWATCH_EDGE }} aria-hidden />
}

const summary = (data: GroupDatum[], total: number) => `${data.map((d) => `${d.label}: ${d.count}`).join(', ')}. Total: ${total}.`

/** A. Doughnut: each result group's share of all records, with its count and percentage listed beside it. */
function DistributionChart({ data, total, active, onActive }: { data: GroupDatum[]; total: number; active: Active; onActive: (g: Active) => void }) {
  const centre = 70
  const radius = 52
  const stroke = 20
  const circumference = 2 * Math.PI * radius
  const shown = data.filter((d) => d.count > 0)
  const gap = shown.length > 1 ? 1.5 : 0
  let start = 0
  const arcs = shown.map((d) => {
    const length = (d.count / total) * circumference
    const arc = { d, length, start }
    start += length
    return arc
  })
  return (
    <>
      <svg viewBox="0 0 140 140" role="img" aria-label={`Doughnut chart. ${summary(data, total)}`} className="mx-auto size-36 shrink-0">
        <circle cx={centre} cy={centre} r={radius} fill="none" stroke="var(--color-parchment)" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${centre} ${centre})`}>
          {arcs.map(({ d, length, start: from }) => (
            <circle
              key={d.group}
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              stroke={d.fill}
              strokeWidth={stroke}
              strokeDasharray={`${Math.max(length - gap, 0.5)} ${circumference}`}
              strokeDashoffset={-from}
              opacity={active && active !== d.group ? 0.3 : 1}
              onMouseEnter={() => onActive(d.group)}
              onMouseLeave={() => onActive(null)}
              className="transition-opacity"
            />
          ))}
        </g>
        <text x={centre} y={centre - 1} textAnchor="middle" className="fill-ink text-[24px] font-semibold">
          {total}
        </text>
        <text x={centre} y={centre + 14} textAnchor="middle" className="fill-ink-muted text-[10px]">
          {total === 1 ? 'record' : 'records'}
        </text>
      </svg>
      <ul className="mt-5 space-y-1.5">
        {data.map((d) => (
          <li
            key={d.group}
            onMouseEnter={() => onActive(d.group)}
            onMouseLeave={() => onActive(null)}
            className={cn('flex items-center gap-2.5 rounded px-1.5 py-1 text-[13px] transition-opacity', active && active !== d.group && 'opacity-40')}
          >
            <Swatch fill={d.fill} />
            <span className="min-w-0 flex-1 text-ink-soft">{d.label}</span>
            <span className="font-medium text-ink tabular-nums">{d.count}</span>
            <span className="w-10 text-right text-[12px] text-ink-muted tabular-nums">{d.percent}%</span>
          </li>
        ))}
      </ul>
    </>
  )
}

/** B. Columns: the number of records in each result group, with the count printed above every column. */
function ComparisonChart({ data, total, active, onActive }: { data: GroupDatum[]; total: number; active: Active; onActive: (g: Active) => void }) {
  const { max, ticks } = axisScale(Math.max(...data.map((d) => d.count)))
  return (
    <div role="img" aria-label={`Bar chart. ${summary(data, total)}`}>
      <div className="relative pt-5 pl-7" aria-hidden>
        <div className="relative h-44">
          {ticks.map((t) => (
            <div key={t} className="absolute right-0 left-0 border-t border-line/70" style={{ bottom: `${(t / max) * 100}%` }}>
              <span className="absolute -top-2 -left-7 w-6 text-right text-[10.5px] text-ink-muted tabular-nums">{t}</span>
            </div>
          ))}
          <div className="absolute inset-0 flex items-end gap-3 px-1">
            {data.map((d) => (
              <div
                key={d.group}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center"
                onMouseEnter={() => onActive(d.group)}
                onMouseLeave={() => onActive(null)}
              >
                <div
                  className={cn('w-full max-w-11 rounded-t-[4px] transition-opacity', active && active !== d.group && 'opacity-30')}
                  style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 2 : 0, backgroundColor: d.fill, boxShadow: SWATCH_EDGE }}
                />
                <span className="absolute text-[13px] font-semibold text-ink tabular-nums" style={{ bottom: `calc(${(d.count / max) * 100}% + 4px)` }}>
                  {d.count}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="mt-2 flex gap-3 px-1">
          {data.map((d) => (
            <span key={d.group} className="min-w-0 flex-1 text-center text-[11.5px] leading-tight text-ink-soft">
              {d.short}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/** C. Horizontal bars: each group's share of all records as a bar, with its name and count at the ends. */
function OverviewChart({ data, total, active, onActive }: { data: GroupDatum[]; total: number; active: Active; onActive: (g: Active) => void }) {
  return (
    <>
      <ul className="space-y-3.5">
        {data.map((d) => (
          <li
            key={d.group}
            onMouseEnter={() => onActive(d.group)}
            onMouseLeave={() => onActive(null)}
            className={cn('transition-opacity', active && active !== d.group && 'opacity-40')}
          >
            <div className="flex items-baseline justify-between gap-3 text-[13px]">
              <span className="min-w-0 text-ink-soft">{d.label}</span>
              <span className="shrink-0 font-medium text-ink tabular-nums">
                {d.count}
                <span className="ml-1.5 text-[12px] font-normal text-ink-muted">{d.percent}%</span>
              </span>
            </div>
            <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-parchment" aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${(d.count / total) * 100}%`, minWidth: d.count ? 4 : 0, backgroundColor: d.fill, boxShadow: SWATCH_EDGE }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-auto flex items-baseline justify-between gap-3 border-t border-line pt-3 text-[13px]">
        <span className="font-medium text-navy-900">Total records</span>
        <span className="font-semibold text-navy-900 tabular-nums">{total}</span>
      </p>
    </>
  )
}

export function AchievementAnalytics() {
  const faculty = useFaculty()
  const scope = useFacultyScope()
  const batches = useFacultyBatches()
  const achievements = useStore((s) => s.achievements)
  const users = useStore((s) => s.users)

  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all')
  const [department, setDepartment] = useState('all')
  const [year, setYear] = useState('all')
  const [batch, setBatch] = useState('all')
  const [active, setActive] = useState<Active>(null)

  // Every record in scope, and the ones the filters leave. Each record once.
  const all = useMemo(() => uniqueById(getFacultyRecords(faculty.id, {}, achievements, users)), [faculty.id, achievements, users])
  const rows = useMemo(
    () => uniqueById(getFacultyRecords(faculty.id, { query, category, department, year, batch }, achievements, users)),
    [faculty.id, achievements, users, query, category, department, year, batch],
  )
  const counts = useMemo(() => countByResult(rows.map((r) => r.achievement)), [rows])
  const data = useMemo(() => groupData(counts), [counts])

  const filtered = query !== '' || category !== 'all' || department !== 'all' || year !== 'all' || batch !== 'all'
  const reset = () => {
    setQuery('')
    setCategory('all')
    setDepartment('all')
    setYear('all')
    setBatch('all')
  }

  return (
    <section aria-labelledby="analytics-heading" className="space-y-4">
      <div>
        <SectionHeading id="analytics-heading" title="Achievement Analytics" />
        <p className="-mt-1.5 text-[12px] text-ink-muted">
          Built from the same records as the figures above, and updated as students submit. The search and filters here change the charts only.
        </p>
      </div>

      {all.length === 0 ? (
        <div className="paper">
          <EmptyState
            icon={ChartColumn}
            title="No achievement data to chart yet"
            body="Charts appear here as soon as students in your departments submit achievements."
          />
        </div>
      ) : (
        <>
          <FilterBar active={filtered} onReset={reset} resultLabel={`${rows.length} of ${all.length} ${all.length === 1 ? 'record' : 'records'}`}>
            <SearchInput value={query} onChange={setQuery} placeholder="Name, register no., event…" className="md:w-72" label="Search records to chart" />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:flex">
              {batches.length > 1 && (
                <FilterSelect
                  label="Chart batch"
                  value={batch}
                  onChange={setBatch}
                  options={[{ value: 'all', label: 'All batches' }, ...batches.map((b) => ({ value: b.code, label: b.label }))]}
                  className="md:w-36"
                />
              )}
              {scope.length > 1 && (
                <FilterSelect
                  label="Chart department"
                  value={department}
                  onChange={setDepartment}
                  options={[{ value: 'all', label: 'All departments' }, ...scope.map((d) => ({ value: d, label: d }))]}
                  className="md:w-40"
                />
              )}
              <FilterSelect
                label="Chart year"
                value={year}
                onChange={setYear}
                options={[{ value: 'all', label: 'All years' }, ...[1, 2, 3, 4].map((y) => ({ value: String(y), label: `Year ${ordinalYear(y)}` }))]}
                className="md:w-32"
              />
              <FilterSelect label="Chart category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} className="md:w-40" />
            </div>
          </FilterBar>

          {rows.length === 0 ? (
            <div className="paper">
              <EmptyState icon={ChartColumn} title="No records match" body="Nothing to chart for this search and these filters. Use Clear filters to see every record again." />
            </div>
          ) : (
            // One column on a phone, two on a tablet, three where each card still has room for its labels.
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <ChartCard title="Achievement Distribution" subtitle="Each record counted once, by its recorded result.">
                <DistributionChart data={data} total={counts.total} active={active} onActive={setActive} />
              </ChartCard>
              <ChartCard title="Achievement Comparison" subtitle="Number of records in each result group.">
                <ComparisonChart data={data} total={counts.total} active={active} onActive={setActive} />
              </ChartCard>
              <ChartCard
                title="Achievement Overview"
                subtitle={`Share of the ${counts.total} ${counts.total === 1 ? 'record' : 'records'} shown.`}
                className="md:col-span-2 xl:col-span-1"
              >
                <OverviewChart data={data} total={counts.total} active={active} onActive={setActive} />
              </ChartCard>
            </div>
          )}
        </>
      )}
    </section>
  )
}
