import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, FilePen, FileUp, Settings2, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { formatDateTime, formatRelative } from '../../lib/format'
import type { AdminActivityItem, AdminActivityType } from '../../services/adminService'

const ICON: Record<AdminActivityType, { icon: LucideIcon; tone: string }> = {
  submitted: { icon: FileUp, tone: 'text-navy-800 bg-navy-50' },
  updated: { icon: FilePen, tone: 'text-ink-soft bg-parchment' },
  archived: { icon: Archive, tone: 'text-ink-muted bg-parchment' },
  restored: { icon: ArchiveRestore, tone: 'text-ink-soft bg-parchment' },
  account_created: { icon: UserPlus, tone: 'text-lavender-700 bg-lavender-100' },
  admin_action: { icon: Settings2, tone: 'text-navy-800 bg-navy-50' },
}

/** Institution activity, newest first. Each entry links to the record or account it concerns. */
export function ActivityList({ items }: { items: AdminActivityItem[] }) {
  return (
    <ol className="divide-y divide-line">
      {items.map((item) => {
        const { icon: Icon, tone } = ICON[item.type]
        const href = item.achievementId ? `/admin/records/${item.achievementId}` : item.userId ? `/admin/users/${item.userId}` : undefined
        return (
          <li key={item.id} className="flex gap-3.5 py-3 first:pt-0 last:pb-0">
            <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full', tone)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-medium text-navy-900">{item.title}</p>
              <p className="text-[13px] break-words text-ink-soft">
                {href ? (
                  <Link to={href} className="underline decoration-line-strong underline-offset-2 hover:text-navy-900 hover:decoration-navy-700">
                    {item.detail}
                  </Link>
                ) : (
                  item.detail
                )}
              </p>
              <p className="mt-0.5 text-[12px] text-ink-muted">
                {item.actor} ·{' '}
                <time dateTime={item.at} title={formatDateTime(item.at)}>
                  {formatRelative(item.at)}
                </time>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
