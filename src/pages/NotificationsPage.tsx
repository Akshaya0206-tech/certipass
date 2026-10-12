import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BadgeCheck, BellOff, Check, CheckCheck, CircleAlert, Info } from 'lucide-react'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState } from '../components/ui/States'
import { useStudent } from '../hooks/useData'
import { useMyNotifications } from '../hooks/usePassport'
import { cn } from '../lib/cn'
import { formatDate, formatRelative } from '../lib/format'
import { markAllNotificationsAsRead, markNotificationAsRead } from '../services/passportService'
import type { AppNotification } from '../types'

const TONE: Record<AppNotification['tone'], { icon: typeof Info; className: string }> = {
  success: { icon: BadgeCheck, className: 'text-navy-800 bg-navy-50' },
  attention: { icon: CircleAlert, className: 'text-terracotta-600 bg-terracotta-50' },
  info: { icon: Info, className: 'text-lavender-700 bg-lavender-100' },
}

export default function NotificationsPage() {
  const student = useStudent()
  const mine = useMyNotifications()
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const unread = mine.filter((n) => !n.read).length
  const shown = filter === 'unread' ? mine.filter((n) => !n.read) : mine

  return (
    <div className="space-y-6">
      <PageHeader
        kicker={unread ? `${unread} unread` : 'All caught up'}
        title="Notifications"
        description="Updates about your achievements: submissions, reviewer requests and verifications. In-app only — nothing is emailed."
        actions={
          <Button variant="secondary" size="sm" disabled={!unread} onClick={() => markAllNotificationsAsRead(student.id)} icon={<CheckCheck className="size-4" aria-hidden />}>
            Mark all as read
          </Button>
        }
      />

      <div role="tablist" aria-label="Filter notifications" className="flex gap-5 border-b border-line">
        {(['all', 'unread'] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={cn('-mb-px border-b-2 pb-2.5 text-sm capitalize', filter === f ? 'border-terracotta-500 font-medium text-navy-900' : 'border-transparent text-ink-muted hover:text-navy-900')}
          >
            {f}
            {f === 'unread' && unread > 0 && <span className="ml-1.5 rounded-full bg-lavender-200 px-1.5 text-[11px] text-navy-900">{unread}</span>}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="paper">
          <EmptyState
            icon={BellOff}
            title={filter === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
            body={filter === 'unread' ? 'There are no unread notifications.' : 'You’ll be notified here when you submit an achievement and when a reviewer responds.'}
            action={filter === 'unread' && mine.length > 0 ? <Button variant="secondary" onClick={() => setFilter('all')}>Show all notifications</Button> : undefined}
          />
        </div>
      ) : (
        <ul className="paper divide-y divide-line">
          {shown.map((n) => {
            const t = TONE[n.tone]
            const Icon = t.icon
            return (
              <li key={n.id} className={cn('flex items-start gap-4 px-4 py-4 sm:px-5', !n.read && 'bg-lavender-50/50')}>
                <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full', t.className)}>
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className={cn('text-[14.5px]', n.read ? 'text-ink-soft' : 'font-medium text-navy-900')}>{n.title}</span>
                    {!n.read && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-terracotta-600">
                        <span className="size-1.5 rounded-full bg-terracotta-500" aria-hidden />
                        Unread
                      </span>
                    )}
                  </p>
                  <p className="text-[13px] text-ink-muted">{n.body}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
                    <time dateTime={n.createdAt} title={formatDate(n.createdAt)} className="text-ink-muted">
                      {formatRelative(n.createdAt)}
                    </time>
                    {n.achievementId && (
                      <Link
                        to={`/student/achievements/${n.achievementId}`}
                        onClick={() => !n.read && markNotificationAsRead(student.id, n.id)}
                        className="inline-flex items-center gap-1 font-medium text-navy-800 hover:underline"
                      >
                        View achievement <ArrowRight className="size-3" aria-hidden />
                      </Link>
                    )}
                    {!n.read && (
                      <button type="button" onClick={() => markNotificationAsRead(student.id, n.id)} className="inline-flex items-center gap-1 font-medium text-ink-soft hover:text-navy-900 hover:underline">
                        <Check className="size-3" aria-hidden /> Mark as read<span className="sr-only">: {n.title}</span>
                      </button>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
