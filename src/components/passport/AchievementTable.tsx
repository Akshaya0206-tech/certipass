import { Link, useNavigate } from 'react-router-dom'
import { formatDate } from '../../lib/format'
import type { Achievement } from '../../types'
import { DataTable } from '../ui/DataTable'
import type { Column } from '../ui/DataTable'
import { ResultBadge, StatusBadge } from '../ui/StatusBadge'

/** Library list view. Secondary columns collapse on narrow screens; the table scrolls if needed. */
export function AchievementTable({ achievements, hrefFor }: { achievements: Achievement[]; hrefFor: (a: Achievement) => string }) {
  const navigate = useNavigate()
  const columns: Column<Achievement>[] = [
    {
      key: 'event',
      header: 'Event',
      render: (a) => (
        <div className="max-w-[320px] min-w-0 sm:min-w-[170px]">
          <Link to={hrefFor(a)} onClick={(e) => e.stopPropagation()} className="font-medium text-navy-900 hover:underline sm:block sm:truncate">
            {a.eventName}
          </Link>
          <p className="text-[12px] text-ink-muted sm:truncate">
            {a.organizer}
            <span className="sm:hidden"> · {formatDate(a.eventDate)}</span>
          </p>
          {/* On small screens the result column is hidden, so show it here. */}
          <ResultBadge type={a.achievementType} className="mt-1.5 sm:hidden" />
        </div>
      ),
    },
    { key: 'category', header: 'Category', render: (a) => <span className="text-ink-soft">{a.category}</span>, hideBelow: 'md' },
    { key: 'date', header: 'Event date', render: (a) => <time dateTime={a.eventDate} className="whitespace-nowrap text-ink-soft">{formatDate(a.eventDate)}</time>, hideBelow: 'sm' },
    { key: 'prize', header: 'Prize or position', render: (a) => <span className="text-ink">{a.position ?? '—'}</span>, hideBelow: 'lg' },
    {
      key: 'result',
      header: 'Result',
      hideBelow: 'sm',
      render: (a) => (
        <span className="flex items-center gap-1.5">
          <ResultBadge type={a.achievementType} />
          {a.status === 'archived' && <StatusBadge status={a.status} compact />}
        </span>
      ),
    },
    { key: 'updated', header: 'Last updated', render: (a) => <time dateTime={a.updatedAt} className="whitespace-nowrap text-ink-soft">{formatDate(a.updatedAt)}</time>, hideBelow: 'lg' },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      hideBelow: 'sm',
      render: (a) => (
        <Link
          to={hrefFor(a)}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex h-8 items-center rounded-lg border border-line-strong bg-white px-2.5 text-[13px] font-medium whitespace-nowrap text-navy-900 hover:border-navy-700"
        >
          View<span className="sr-only"> details: {a.eventName}</span>
        </Link>
      ),
    },
  ]
  return <DataTable caption="My achievements" columns={columns} rows={achievements} rowKey={(a) => a.id} onRowClick={(a) => navigate(hrefFor(a))} />
}
