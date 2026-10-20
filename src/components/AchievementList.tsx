import {
  Award,
  BookOpen,
  Briefcase,
  Code2,
  ArrowRight,
  Mic,
  Music4,
  Presentation,
  Sparkles,
  Trophy,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatDate } from '../lib/format'
import type { Achievement, AchievementCategory } from '../types'
import { ResultBadge, StatusBadge } from './ui/StatusBadge'

export const CATEGORY_ICON: Record<AchievementCategory, LucideIcon> = {
  Hackathon: Code2,
  Workshop: BookOpen,
  Internship: Briefcase,
  Competition: Trophy,
  Conference: Mic,
  'Paper Presentation': Presentation,
  Sports: Award,
  Cultural: Music4,
  Other: Sparkles,
}

export function CategoryGlyph({ category }: { category: AchievementCategory }) {
  const Icon = CATEGORY_ICON[category]
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-line bg-parchment text-navy-800">
      <Icon className="size-[18px]" strokeWidth={1.6} aria-hidden />
    </span>
  )
}

interface AchievementListProps {
  achievements: Achievement[]
  hrefFor: (a: Achievement) => string
}

/** Compact record list used on the student dashboard. */
export function AchievementList({ achievements, hrefFor }: AchievementListProps) {
  return (
    <ul className="divide-y divide-line">
      {achievements.map((a) => (
        <li key={a.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3.5">
            <CategoryGlyph category={a.category} />
            <div className="min-w-0">
              <p className="truncate font-medium text-navy-900">{a.eventName}</p>
              <p className="mt-0.5 flex flex-wrap gap-x-2 text-[13px] text-ink-muted">
                <span>{a.category}</span>
                <span aria-hidden>·</span>
                <time dateTime={a.eventDate}>{formatDate(a.eventDate)}</time>
                <span aria-hidden>·</span>
                <span className="text-ink-soft">{a.position ?? a.achievementType}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 pl-[54px] sm:justify-end sm:pl-0">
            <span className="hidden font-mono text-[11px] text-ink-muted lg:inline">{a.reference}</span>
            <span className="flex items-center gap-1.5">
              <ResultBadge type={a.achievementType} />
              {a.status === 'archived' && <StatusBadge status={a.status} compact />}
            </span>
            <Link
              to={hrefFor(a)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-navy-800 hover:bg-parchment"
            >
              View details
              <ArrowRight className="size-3.5" aria-hidden />
              <span className="sr-only">: {a.eventName}</span>
            </Link>
          </div>
        </li>
      ))}
    </ul>
  )
}
