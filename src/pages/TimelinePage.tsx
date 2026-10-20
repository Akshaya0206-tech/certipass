import { useMemo, useState } from 'react'
import { FilePlus2 } from 'lucide-react'
import { AchievementTimeline } from '../components/AchievementTimeline'
import { PassportLoader } from '../components/passport/PassportLoader'
import { ButtonLink } from '../components/ui/Button'
import { FilterBar, FilterSelect } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { CATEGORY_OPTIONS, RESULT_OPTIONS, STATUS_OPTIONS } from '../hooks/useAchievementFilters'
import { useStudent } from '../hooks/useData'
import { useMyAchievements } from '../hooks/usePassport'
import { eventYearsOf, searchAchievements } from '../services/passportService'
import type { ResultGroup } from '../domain/result'
import type { AchievementCategory, RecordStatus } from '../types'

export default function TimelinePage() {
  return (
    <PassportLoader label="Loading your timeline">
      <Timeline />
    </PassportLoader>
  )
}

function Timeline() {
  const student = useStudent()
  const mine = useMyAchievements()
  const [category, setCategory] = useState<AchievementCategory | 'all'>('all')
  const [status, setStatus] = useState<RecordStatus | 'all'>('all')
  const [result, setResult] = useState<ResultGroup | 'all'>('all')
  const [year, setYear] = useState('all')

  // Only the signed-in student's own records, grouped by the year of the event.
  const timeline = useMemo(
    () => searchAchievements(student.id, { category, status, result, year }, mine),
    [student.id, mine, category, status, result, year],
  )
  const years = useMemo(() => eventYearsOf(mine), [mine])
  const filtersActive = category !== 'all' || status !== 'all' || result !== 'all' || year !== 'all'

  function resetFilters() {
    setCategory('all')
    setStatus('all')
    setResult('all')
    setYear('all')
  }

  return (
    <div className="space-y-8">
      <PageHeader
        kicker="Chronicle"
        title="Achievement timeline"
        description="Your achievements in order of event date, newest first, with the result you recorded for each."
        actions={
          <ButtonLink to="/student/achievements/new" variant="accent" icon={<FilePlus2 className="size-4" aria-hidden />}>
            Add Achievement
          </ButtonLink>
        }
      />

      {mine.length === 0 ? (
        <div className="paper">
          <EmptyState
            title="Your timeline is empty"
            body="Once you add an achievement it will appear here under the year of the event."
            action={<ButtonLink to="/student/achievements/new" icon={<FilePlus2 className="size-4" aria-hidden />}>Add your first achievement</ButtonLink>}
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <p className="text-[13px] text-ink-muted" aria-live="polite">
              Showing {timeline.length} of {mine.length} {mine.length === 1 ? 'achievement' : 'achievements'}
            </p>
            <FilterBar active={filtersActive} onReset={resetFilters}>
              <FilterSelect label="Category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} className="md:w-44" />
              <FilterSelect label="Result" value={result} onChange={setResult} options={RESULT_OPTIONS} className="md:w-40" />
              <FilterSelect label="Record state" value={status} onChange={setStatus} options={STATUS_OPTIONS} className="md:w-40" />
              <FilterSelect label="Event year" value={year} onChange={setYear} options={[{ value: 'all', label: 'All years' }, ...years.map((y) => ({ value: y, label: y }))]} className="md:w-32" />
            </FilterBar>
          </div>
          {timeline.length ? (
            <AchievementTimeline achievements={timeline} hrefFor={(a) => `/student/achievements/${a.id}`} />
          ) : (
            <EmptyState title="No entries match these filters" body="Try a different category, result or year." className="paper" />
          )}
        </>
      )}
    </div>
  )
}
