import { Link } from 'react-router-dom'
import { Download } from 'lucide-react'
import { buttonClass } from './ui/Button'
import { DataTable } from './ui/DataTable'
import type { Column } from './ui/DataTable'
import { formatDate, formatRange } from '../lib/format'
import type { OdApplication, Role } from '../types'

/** Lists approved applications only; a pass link is shown solely when a pass number exists. */
export function PassesTable({ apps, role, empty }: { apps: OdApplication[]; role: Role; empty: React.ReactNode }) {
  const reviewer = role !== 'student'
  const open = (a: OdApplication) => (
    <Link to={`/${role}/passes/${a.id}`} className={buttonClass('accent', 'sm')} aria-label={`${role === 'student' ? 'Download' : 'View'} pass ${a.passNumber}`}>
      <Download className="size-4" aria-hidden /> {role === 'student' ? 'Download Pass' : 'View Pass'}
    </Link>
  )
  const columns: Column<OdApplication>[] = [
    { key: 'pass', header: 'OD Pass No.', render: (a) => <span className="font-mono text-[13px] font-medium text-purple-dark">{a.passNumber}</span>, className: 'whitespace-nowrap' },
    ...(reviewer
      ? [
          {
            key: 'student',
            header: 'Student',
            render: (a: OdApplication) => (
              <div>
                <p className="font-medium">{a.studentName}</p>
                <p className="font-mono text-xs text-ink-muted">
                  {a.registerNo} · {a.department}
                </p>
              </div>
            ),
          },
        ]
      : []),
    { key: 'event', header: 'Event', render: (a) => <span className="font-medium">{a.eventName}</span>, className: 'max-w-64' },
    { key: 'od', header: 'OD dates', render: (a) => formatRange(a.odFrom, a.odUntil), className: 'whitespace-nowrap' },
    { key: 'approved', header: 'Approved', render: (a) => formatDate(a.decision?.at), className: 'whitespace-nowrap', wide: true },
    { key: 'action', header: 'Pass', render: open },
  ]
  return (
    <DataTable
      caption="Approved OD passes"
      columns={columns}
      rows={apps.filter((a) => a.status === 'approved' && a.passNumber)}
      rowKey={(a) => a.id}
      empty={empty}
      card={(a) => (
        <div className="space-y-1.5">
          <p className="font-mono text-xs text-ink-muted">{a.passNumber}</p>
          <p className="font-semibold">{a.eventName}</p>
          {reviewer && (
            <p className="text-[13px] text-ink-soft">
              {a.studentName} · {a.registerNo}
            </p>
          )}
          <p className="text-[13px] text-ink-muted">OD {formatRange(a.odFrom, a.odUntil)}</p>
          <div className="pt-1">{open(a)}</div>
        </div>
      )}
    />
  )
}
