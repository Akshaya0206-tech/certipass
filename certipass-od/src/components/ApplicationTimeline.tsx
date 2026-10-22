import { CheckCircle2, Clock, FileEdit, Pencil, Send, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatDateTime } from '../lib/format'
import type { AuditAction, OdApplication } from '../types'

const META: Record<AuditAction, { label: string; icon: LucideIcon }> = {
  created: { label: 'Application created', icon: FileEdit },
  draft_saved: { label: 'Draft saved', icon: FileEdit },
  submitted: { label: 'Submitted for review', icon: Send },
  edited: { label: 'Application edited', icon: Pencil },
  approved: { label: 'Approved', icon: CheckCircle2 },
  rejected: { label: 'Rejected', icon: XCircle },
}

/** Every entry comes from the application's audit history; nothing here is invented. */
export function ApplicationTimeline({ app }: { app: OdApplication }) {
  const entries = [...app.audit].sort((a, b) => a.at.localeCompare(b.at))
  const awaiting = app.status === 'pending'
  return (
    <ol className="relative space-y-5 border-l-2 border-line pl-6">
      {entries.map((e) => {
        const m = META[e.action]
        const Icon = m.icon
        const final = e.action === 'approved' || e.action === 'rejected'
        return (
          <li key={e.id} className="relative">
            <span className={`absolute -left-[34px] flex size-6 items-center justify-center rounded-full border-2 bg-white ${e.action === 'approved' ? 'border-gold-dark text-purple' : e.action === 'rejected' ? 'border-red-fg text-red-fg' : 'border-purple-300 text-purple'}`}>
              <Icon className="size-3.5" aria-hidden />
            </span>
            <p className="text-sm font-semibold text-ink">{m.label}</p>
            <p className="text-xs text-ink-muted">
              {e.actorName} · {formatDateTime(e.at)}
            </p>
            {e.note && final && <p className="mt-1.5 rounded-sm border-l-[3px] border-purple-300 bg-lavender px-3 py-2 text-sm text-ink-soft">{e.note}</p>}
          </li>
        )
      })}
      {awaiting && (
        <li className="relative">
          <span className="absolute -left-[34px] flex size-6 items-center justify-center rounded-full border-2 border-dashed border-amber-line bg-white text-amber-fg">
            <Clock className="size-3.5" aria-hidden />
          </span>
          <p className="text-sm font-semibold text-amber-fg">Awaiting faculty decision</p>
        </li>
      )}
    </ol>
  )
}
