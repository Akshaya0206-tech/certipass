import { useEffect, useId, useMemo, useState } from 'react'
import { FilePlus2, LayoutGrid, List, X } from 'lucide-react'
import { AchievementCard } from '../components/passport/AchievementCard'
import { AchievementTable } from '../components/passport/AchievementTable'
import { DraftList } from '../components/passport/DraftList'
import { PassportLoader } from '../components/passport/PassportLoader'
import { Button, ButtonLink } from '../components/ui/Button'
import { FilterSelect, SearchInput } from '../components/ui/Filters'
import { CHEVRON } from '../components/ui/FormField'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { recordStatusLabel } from '../domain/status'
import { RESULT_GROUPS } from '../domain/result'
import { CATEGORY_OPTIONS, RESULT_OPTIONS, STATUS_OPTIONS, useAchievementFilters } from '../hooks/useAchievementFilters'
import { useStudent } from '../hooks/useData'
import { useMyAchievements, useMyDrafts } from '../hooks/usePassport'
import { cn } from '../lib/cn'
import { formatDate } from '../lib/format'
import { eventYearsOf, searchAchievements, SORT_OPTIONS } from '../services/passportService'
import type { Achievement } from '../types'

type View = 'list' | 'cards'
const VIEW_KEY = 'certipass.ui.libraryView'
const detailHref = (a: Achievement) => `/student/achievements/${a.id}`

/** The chosen view is remembered for this browser session only (a UI preference, not data). */
function readView(): View {
  try {
    return sessionStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'list'
  } catch {
    return 'list'
  }
}

export default function AchievementsPage() {
  return (
    <PassportLoader label="Loading your achievements">
      <Library />
    </PassportLoader>
  )
}

function Library() {
  const student = useStudent()
  const mine = useMyAchievements()
  const drafts = useMyDrafts()
  const { filters, update, reset, active } = useAchievementFilters()
  const [view, setView] = useState<View>(readView)
  const fromId = useId()
  const toId = useId()
  const sortId = useId()

  useEffect(() => {
    try {
      sessionStorage.setItem(VIEW_KEY, view)
    } catch {
      /* ignore */
    }
  }, [view])

  const results = useMemo(() => searchAchievements(student.id, filters, mine), [student.id, filters, mine])
  const years = useMemo(() => eventYearsOf(mine), [mine])
  const rangeInvalid = !!filters.from && !!filters.to && filters.from > filters.to

  const chips: { key: string; label: string; clear: () => void }[] = []
  if (filters.query) chips.push({ key: 'q', label: `“${filters.query}”`, clear: () => update({ q: '' }) })
  if (filters.category !== 'all') chips.push({ key: 'category', label: filters.category, clear: () => update({ category: '' }) })
  if (filters.result !== 'all') chips.push({ key: 'result', label: RESULT_GROUPS[filters.result].label, clear: () => update({ result: '' }) })
  if (filters.status !== 'all') chips.push({ key: 'status', label: recordStatusLabel(filters.status), clear: () => update({ status: '' }) })
  if (filters.year !== 'all') chips.push({ key: 'year', label: `Year ${filters.year}`, clear: () => update({ year: '' }) })
  if (filters.from) chips.push({ key: 'from', label: `From ${formatDate(filters.from)}`, clear: () => update({ from: '' }) })
  if (filters.to) chips.push({ key: 'to', label: `To ${formatDate(filters.to)}`, clear: () => update({ to: '' }) })

  const dateInput =
    'h-10 w-full rounded-lg border bg-white px-3 text-sm focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none'

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={`Passport · ${mine.length} ${mine.length === 1 ? 'record' : 'records'}`}
        title="My Achievements"
        description="Your certificate library: every achievement you have submitted, with the result you recorded for each."
        actions={
          <ButtonLink to="/student/achievements/new" variant="accent" icon={<FilePlus2 className="size-4" aria-hidden />}>
            Add Achievement
          </ButtonLink>
        }
      />

      {drafts.length > 0 && (
        <section aria-labelledby="drafts-heading">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 id="drafts-heading" className="font-serif text-[15px] text-navy-900">
              Drafts <span className="font-sans text-[13px] text-ink-muted">({drafts.length})</span>
            </h2>
            <p className="text-[12.5px] text-ink-muted">Not submitted — only you can see these.</p>
          </div>
          <DraftList drafts={drafts} />
        </section>
      )}

      {mine.length === 0 ? (
        <div className="paper">
          <EmptyState
            title="No achievements yet"
            body={drafts.length ? 'Nothing submitted yet. Finish a draft above, or start a new achievement.' : 'Your submitted certificates will be listed here, with the result you recorded for each.'}
            action={<ButtonLink to="/student/achievements/new" icon={<FilePlus2 className="size-4" aria-hidden />}>Add your first achievement</ButtonLink>}
          />
        </div>
      ) : (
        <>
          {/* Search, filters, sort and view */}
          <div role="search" aria-label="Search and filter achievements" className="space-y-3 rounded-xl border border-line bg-parchment/40 p-3 sm:p-4">
            <div className="flex flex-col gap-2 lg:flex-row">
              <SearchInput
                value={filters.query}
                onChange={(q) => update({ q })}
                placeholder="Event, organiser, result, file name…"
                className="lg:flex-1"
                label="Search achievements"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex">
                <FilterSelect label="Category" value={filters.category} onChange={(v) => update({ category: v })} options={CATEGORY_OPTIONS} className="lg:w-44" />
                <FilterSelect label="Result" value={filters.result} onChange={(v) => update({ result: v })} options={RESULT_OPTIONS} className="lg:w-40" />
                <FilterSelect label="Record state" value={filters.status} onChange={(v) => update({ status: v })} options={STATUS_OPTIONS} className="lg:w-40" />
                <FilterSelect
                  label="Event year"
                  value={filters.year}
                  onChange={(v) => update({ year: v })}
                  options={[{ value: 'all', label: 'All years' }, ...years.map((y) => ({ value: y, label: y }))]}
                  className="lg:w-32"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="grid grid-cols-2 gap-2 sm:w-auto">
                <div>
                  <label htmlFor={fromId} className="mb-1 block text-[12px] text-ink-muted">Event date from</label>
                  <input
                    id={fromId}
                    type="date"
                    value={filters.from}
                    max={filters.to || undefined}
                    onChange={(e) => update({ from: e.target.value })}
                    className={cn(dateInput, filters.from ? 'border-navy-700' : 'border-line-strong')}
                  />
                </div>
                <div>
                  <label htmlFor={toId} className="mb-1 block text-[12px] text-ink-muted">to</label>
                  <input
                    id={toId}
                    type="date"
                    value={filters.to}
                    min={filters.from || undefined}
                    onChange={(e) => update({ to: e.target.value })}
                    aria-invalid={rangeInvalid || undefined}
                    className={cn(dateInput, rangeInvalid ? 'border-terracotta-500' : filters.to ? 'border-navy-700' : 'border-line-strong')}
                  />
                </div>
              </div>
              <div className="sm:w-52">
                <label htmlFor={sortId} className="mb-1 block text-[12px] text-ink-muted">Sort by</label>
                <select
                  id={sortId}
                  value={filters.sort}
                  onChange={(e) => update({ sort: e.target.value })}
                  style={{ backgroundImage: CHEVRON }}
                  className="h-10 w-full appearance-none rounded-lg border border-line-strong bg-white bg-[length:15px] bg-[right_9px_center] bg-no-repeat pr-8 pl-3 text-sm focus:border-navy-700 focus:ring-2 focus:ring-lavender-300 focus:outline-none"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div role="group" aria-label="View" className="inline-flex self-start rounded-lg border border-line-strong bg-white p-0.5 sm:ml-auto sm:self-end">
                {(
                  [
                    ['list', 'List', List],
                    ['cards', 'Cards', LayoutGrid],
                  ] as const
                ).map(([v, label, Icon]) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setView(v)}
                    aria-pressed={view === v}
                    className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-[13px]', view === v ? 'bg-lavender-200 font-medium text-ink' : 'text-ink-soft hover:bg-parchment')}
                  >
                    <Icon className="size-3.5" aria-hidden />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {rangeInvalid && (
              <p role="alert" className="text-[12.5px] text-terracotta-700">The start date is after the end date, so no records can match.</p>
            )}
          </div>

          {/* Result count and active filters */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-1 text-[13px] text-ink-soft" aria-live="polite">
              Showing <span className="font-medium text-navy-900">{results.length}</span> of {mine.length}
            </p>
            {chips.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" aria-label="Active filters">
                {chips.map((c) => (
                  <li key={c.key}>
                    <button
                      type="button"
                      onClick={c.clear}
                      className="inline-flex items-center gap-1 rounded-full border border-navy-700/30 bg-navy-50 py-0.5 pr-1.5 pl-2.5 text-[12px] text-navy-800 hover:border-navy-700"
                    >
                      {c.label}
                      <X className="size-3" aria-hidden />
                      <span className="sr-only">Remove filter</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {active && (
              <button type="button" onClick={reset} className="text-[13px] font-medium text-navy-800 underline-offset-2 hover:underline">
                Clear filters
              </button>
            )}
          </div>

          {results.length === 0 ? (
            <div className="paper">
              <EmptyState
                title="No achievements match"
                body="Try a different search term, widen the date range or clear the filters."
                action={<Button variant="secondary" onClick={reset}>Clear filters</Button>}
              />
            </div>
          ) : view === 'list' ? (
            <AchievementTable achievements={results} hrefFor={detailHref} />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Achievements">
              {results.map((a) => (
                <li key={a.id} className="flex">
                  <AchievementCard achievement={a} href={detailHref(a)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}
