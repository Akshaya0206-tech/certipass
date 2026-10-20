import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, FilePen, FileUp, MessageSquareText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatRelative } from '../../lib/format'
import type { ActivityItem, ActivityType } from '../../services/passportService'

const ICON: Record<ActivityType, { icon: LucideIcon; tone: string }> = {
  submitted: { icon: FileUp, tone: 'text-navy-800 bg-navy-50' },
  updated: { icon: FilePen, tone: 'text-ink-soft bg-parchment' },
  archived: { icon: Archive, tone: 'text-ink-muted bg-parchment' },
  restored: { icon: ArchiveRestore, tone: 'text-ink-soft bg-parchment' },
  comment: { icon: MessageSquareText, tone: 'text-lavender-700 bg-lavender-100' },
}

/** Journal-style log of what happened to the student's records, newest first. */
export function ActivityFeed({ items, hrefFor }: { items: ActivityItem[]; hrefFor: (achievementId: string) => string }) {
  return (
    <ol className="divide-y divide-line">
      {items.map((item) => {
        const { icon: Icon, tone } = ICON[item.type]
        return (
          <li key={item.id} className="flex gap-3.5 py-3 first:pt-0 last:pb-0">
            <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', tone)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] text-navy-900">
                <span className="font-medium">{item.label}</span>
                <span className="text-ink-muted"> · </span>
                <Link to={hrefFor(item.achievementId)} className="text-ink-soft underline decoration-line-strong underline-offset-2 hover:text-navy-900 hover:decoration-navy-700">
                  {item.eventName}
                </Link>
              </p>
              {item.excerpt && <p className="mt-0.5 line-clamp-2 text-[13px] text-ink-muted italic">“{item.excerpt}”</p>}
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {item.actor} · <time dateTime={item.at}>{formatRelative(item.at)}</time>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
