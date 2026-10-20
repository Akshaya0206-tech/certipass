import type { ReactNode } from 'react'
import { ArrowRight } from 'lucide-react'
import { recordStatusLabel } from '../domain/status'
import { cn } from '../lib/cn'
import { formatDate, formatDateTime } from '../lib/format'
import type { Achievement, RecordEvent } from '../types'
import { STATUS_META } from './ui/StatusBadge'

export function DetailList({ rows, className }: { rows: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(110px,auto)_1fr] gap-x-5 gap-y-2.5 text-sm', className)}>
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-muted">{k}</dt>
          <dd className="min-w-0 break-words text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The status before an event: recorded on newer entries, otherwise the previous entry's status. */
export function previousStatus(history: RecordEvent[], index: number) {
  return history[index].fromStatus ?? (index > 0 ? history[index - 1].status : undefined)
}

/** What happened, in words. */
export function historyActionLabel(history: RecordEvent[], index: number) {
  const h = history[index]
  if (h.kind === 'updated') return 'Details updated by the student'
  if (h.kind === 'archived') return 'Archived by the records office'
  if (h.kind === 'restored') return 'Restored by the records office'
  return 'Submitted'
}

function actorRole(h: RecordEvent) {
  if (h.actorRole) return h.actorRole
  return h.kind === 'archived' || h.kind === 'restored' ? 'admin' : 'student'
}

/** Compact history trail for students, newest first. */
export function StatusHistory({ history }: { history: Achievement['history'] }) {
  return (
    <ol className="space-y-3 border-l border-line-strong pl-4">
      {history
        .map((h, i) => ({ h, i }))
        .reverse()
        .map(({ h, i }) => (
          <li key={`${h.at}-${i}`} className="relative text-[13px]">
            <span className={cn('absolute top-[7px] -left-[20.5px] size-2 rounded-full ring-4 ring-ivory', STATUS_META[h.status].dot)} aria-hidden />
            <span className="font-medium text-navy-900">{historyActionLabel(history, i)}</span>
            <span className="block text-ink-muted">
              {h.byName} · <time dateTime={h.at}>{formatDate(h.at)}</time>
            </span>
          </li>
        ))}
    </ol>
  )
}

/**
 * The record's full history in chronological order: what happened, who did
 * it and in what role, when, and any note recorded with it.
 */
export function RecordHistory({ history }: { history: Achievement['history'] }) {
  return (
    <ol className="space-y-4 border-l border-line-strong pl-4" aria-label="Record history, oldest first">
      {history.map((h, i) => {
        const from = previousStatus(history, i)
        return (
          <li key={`${h.at}-${i}`} className="relative text-[13px]">
            <span className={cn('absolute top-[7px] -left-[20.5px] size-2 rounded-full ring-4 ring-ivory', STATUS_META[h.status].dot)} aria-hidden />
            <p className="font-medium text-navy-900">{historyActionLabel(history, i)}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-ink-soft">
              {from ? (
                <>
                  <span>{recordStatusLabel(from)}</span>
                  <ArrowRight className="size-3 text-ink-muted" aria-label="to" />
                </>
              ) : (
                <span className="text-ink-muted">New record ·</span>
              )}
              <span className="font-medium">{recordStatusLabel(h.status)}</span>
            </p>
            <p className="mt-0.5 text-ink-muted">
              {h.byName} <span className="label-archival text-[9.5px]">{actorRole(h)}</span> · <time dateTime={h.at}>{formatDateTime(h.at)}</time>
            </p>
            {h.note && <p className="mt-1.5 border-l-2 border-lavender-300 pl-2.5 whitespace-pre-line text-ink-soft italic">“{h.note}”</p>}
          </li>
        )
      })}
    </ol>
  )
}
