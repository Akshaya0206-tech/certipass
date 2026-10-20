import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '../lib/cn'
import { formatMonth } from '../lib/format'
import { groupByYear } from '../services/passportService'
import type { Achievement } from '../types'
import { resultGroupOf } from '../domain/result'
import { ResultBadge } from './ui/StatusBadge'

/** Marker colour by recorded result, so a year reads at a glance. */
const RESULT_DOT: Record<string, string> = {
  winner: 'bg-navy-800',
  runner_up: 'bg-lavender-500',
  participant: 'bg-sky-500',
  other: 'bg-butter-500',
}

interface AchievementTimelineProps {
  achievements: Achievement[]
  /** Where each entry links to (usually the achievement's detail page). */
  hrefFor: (a: Achievement) => string
  className?: string
}

/**
 * Chronological record grouped by year. Each year opens with a large
 * editorial numeral; entries hang off a single ruled spine with a marker
 * whose colour reflects the result the student recorded.
 */
export function AchievementTimeline({ achievements, hrefFor, className }: AchievementTimelineProps) {
  const groups = useMemo(() => groupByYear(achievements).map((g) => [g.year, g.entries] as const), [achievements])

  return (
    <ol className={cn('space-y-8', className)} aria-label="Achievement timeline">
      {groups.map(([year, items]) => {
        const wins = items.filter((i) => i.achievementType === 'Winner').length
        return (
          <li key={year} className="grid grid-cols-[minmax(0,1fr)] gap-x-6 gap-y-3 sm:grid-cols-[96px_minmax(0,1fr)]">
            <div className="flex items-baseline gap-3 sm:block">
              <p className="display text-[24px] leading-none text-navy-900/85 sm:text-[29px]">{year}</p>
              <p className="label-archival mt-1.5 text-[10px]">
                {items.length} {items.length === 1 ? 'entry' : 'entries'}
                {wins > 0 ? ` · ${wins} won` : ''}
              </p>
            </div>
            <ol className="relative min-w-0 border-l border-line-strong">
              {items.map((a) => {
                const dot = RESULT_DOT[resultGroupOf(a)]
                return (
                  <li key={a.id} className="relative pb-4 pl-6 last:pb-0">
                    <span
                      className={cn('absolute top-[18px] -left-[5px] size-[9px] rounded-full ring-4 ring-ivory', dot)}
                      aria-hidden
                    />
                    <Link
                      to={hrefFor(a)}
                      className="group flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-white/80 sm:flex-row sm:items-center sm:gap-4"
                    >
                      <time dateTime={a.eventDate} className="w-[4.5rem] shrink-0 font-mono text-[11px] tracking-wider text-ink-muted uppercase">
                        {formatMonth(a.eventDate)} <span className="normal-case">{a.eventDate.slice(8, 10).replace(/^0/, '')}</span>
                      </time>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-navy-900 group-hover:underline group-hover:decoration-line-strong group-hover:underline-offset-4">
                          {a.eventName}
                        </span>
                        <span className="block text-[13px] text-ink-muted">
                          {a.category} · {a.position ?? a.achievementType}
                        </span>
                      </span>
                      <ResultBadge type={a.achievementType} className="self-start sm:self-center" />
                    </Link>
                  </li>
                )
              })}
            </ol>
          </li>
        )
      })}
    </ol>
  )
}
