import { Link } from 'react-router-dom'
import { ArrowRight, Paperclip } from 'lucide-react'
import { formatDate } from '../../lib/format'
import type { Achievement } from '../../types'
import { CATEGORY_ICON } from '../AchievementList'
import { ResultBadge, StatusBadge } from '../ui/StatusBadge'

/** Restrained library card: an archival index card rather than a promo tile. */
export function AchievementCard({ achievement: a, href }: { achievement: Achievement; href: string }) {
  const Icon = CATEGORY_ICON[a.category]
  return (
    <article className="group flex w-full flex-col rounded-xl border border-line bg-white shadow-paper transition-colors hover:border-line-strong" aria-labelledby={`card-${a.id}`}>
      <div className="flex items-center justify-between gap-3 border-b border-line/70 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-[12.5px] text-ink-soft">
          <Icon className="size-3.5 text-navy-700" strokeWidth={1.7} aria-hidden />
          {a.category}
        </span>
        <span className="flex items-center gap-1.5">
          {a.status === 'archived' && <StatusBadge status={a.status} />}
          <ResultBadge type={a.achievementType} />
        </span>
      </div>
      <div className="flex flex-1 flex-col px-4 pt-3 pb-4">
        <h3 id={`card-${a.id}`} className="font-serif text-[15px] leading-snug text-navy-900">
          {a.eventName}
        </h3>
        <p className="mt-0.5 text-[13px] text-ink-muted">{a.organizer}</p>
        <dl className="mt-4 mb-4 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px]">
          <div>
            <dt className="label-archival text-[9.5px]">Event date</dt>
            <dd className="text-ink">{formatDate(a.eventDate)}</dd>
          </div>
          <div>
            <dt className="label-archival text-[9.5px]">Result</dt>
            <dd className="truncate text-ink">{a.position ?? a.achievementType}</dd>
          </div>
          <div className="col-span-2">
            <dt className="sr-only">Certificate file</dt>
            <dd className="flex items-center gap-1.5 truncate font-mono text-[11.5px] text-ink-muted">
              <Paperclip className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{a.certificate.fileName}</span>
            </dd>
          </div>
        </dl>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-dashed border-line pt-3">
          <p className="text-[11.5px] text-ink-muted">
            Updated <time dateTime={a.updatedAt}>{formatDate(a.updatedAt)}</time>
          </p>
          <Link to={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-navy-800 hover:underline">
            View details <ArrowRight className="size-3.5" aria-hidden />
            <span className="sr-only">: {a.eventName}</span>
          </Link>
        </div>
      </div>
    </article>
  )
}
