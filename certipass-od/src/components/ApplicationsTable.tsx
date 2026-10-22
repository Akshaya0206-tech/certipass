import { Link } from 'react-router-dom'
import { Download, Eye, Pencil, ShieldCheck } from 'lucide-react'
import { buttonClass } from './ui/Button'
import { DataTable } from './ui/DataTable'
import type { Column } from './ui/DataTable'
import { StatusChip } from './ui/StatusChip'
import { formatDate, formatRange } from '../lib/format'
import type { OdApplication, Role } from '../types'

interface Props {
  apps: OdApplication[]
  /** Who is looking. Students see their own rows; reviewers also see the student. */
  role: Role
  caption: string
  empty: React.ReactNode
}

const detailPath = (role: Role, a: OdApplication) =>
  role === 'student' ? `/student/applications/${a.id}` : `/${role}/applications/${a.id}`
const passPath = (role: Role, a: OdApplication) => `/${role}/passes/${a.id}`

/** Row actions follow the status: a pass can only be opened for an approved application. */
function Actions({ app, role }: { app: OdApplication; role: Role }) {
  if (role === 'student' && app.status === 'draft') {
    return (
      <Link to={`/student/apply/${app.id}`} className={buttonClass('secondary', 'sm')}>
        <Pencil className="size-4" aria-hidden /> Edit draft
      </Link>
    )
  }
  const isReviewer = role !== 'student'
  const label = isReviewer && app.status === 'pending' ? 'Review' : 'View details'
  return (
    <div className="flex flex-wrap gap-2">
      <Link to={detailPath(role, app)} className={buttonClass(isReviewer && app.status === 'pending' ? 'primary' : 'secondary', 'sm')} aria-label={`${label}: ${app.id}`}>
        {isReviewer && app.status === 'pending' ? <ShieldCheck className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        {label}
      </Link>
      {app.status === 'approved' && app.passNumber && (
        <Link to={passPath(role, app)} className={buttonClass('accent', 'sm')} aria-label={`Download pass: ${app.id}`}>
          <Download className="size-4" aria-hidden /> {role === 'student' ? 'Download Pass' : 'View Pass'}
        </Link>
      )}
    </div>
  )
}

export function ApplicationsTable({ apps, role, caption, empty }: Props) {
  const reviewer = role !== 'student'
  const columns: Column<OdApplication>[] = [
    {
      key: 'id',
      header: 'Application ID',
      render: (a) => <span className="font-mono text-[13px] font-medium text-purple-dark">{a.id}</span>,
      className: 'whitespace-nowrap',
    },
    ...(reviewer
      ? [
          {
            key: 'student',
            header: 'Student',
            render: (a: OdApplication) => (
              <div>
                <p className="font-medium text-ink">{a.studentName}</p>
                <p className="font-mono text-xs text-ink-muted">{a.registerNo}</p>
              </div>
            ),
          },
          { key: 'dept', header: 'Dept', wide: true, render: (a: OdApplication) => a.department },
        ]
      : []),
    {
      key: 'event',
      header: 'Event',
      render: (a) => <span className="font-medium text-ink">{a.eventName || <span className="text-ink-muted italic">Untitled draft</span>}</span>,
      className: 'max-w-64',
    },
    { key: 'date', header: reviewer ? 'Event dates' : 'Event date', render: (a) => (a.eventStart ? formatRange(a.eventStart, a.eventEnd) : '—'), className: 'whitespace-nowrap' },
    { key: 'submitted', header: 'Submitted', render: (a) => formatDate(a.submittedAt), className: 'whitespace-nowrap', wide: true },
    { key: 'status', header: 'Status', render: (a) => <StatusChip status={a.status} /> },
    { key: 'actions', header: 'Action', render: (a) => <Actions app={a} role={role} /> },
  ]

  return (
    <DataTable
      caption={caption}
      columns={columns}
      rows={apps}
      rowKey={(a) => a.id}
      empty={empty}
      card={(a) => (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-ink-muted">{a.id}</p>
              <p className="font-semibold text-ink">{a.eventName || 'Untitled draft'}</p>
            </div>
            <StatusChip status={a.status} />
          </div>
          {reviewer && (
            <p className="text-[13px] text-ink-soft">
              {a.studentName} · <span className="font-mono">{a.registerNo}</span> · {a.department}
            </p>
          )}
          <p className="text-[13px] text-ink-muted">
            {a.eventStart ? formatRange(a.eventStart, a.eventEnd) : 'No dates yet'}
            {a.submittedAt && ` · Submitted ${formatDate(a.submittedAt)}`}
          </p>
          <Actions app={a} role={role} />
        </div>
      )}
    />
  )
}
