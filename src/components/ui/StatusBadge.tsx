import { Archive, FileCheck2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { RECORD_STATUS_DEFINITIONS } from '../../domain/status'
import type { RecordStatus } from '../../types'

const VISUALS: Record<RecordStatus, { icon: LucideIcon; badge: string; dot: string }> = {
  submitted: { icon: FileCheck2, badge: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
  archived: { icon: Archive, badge: 'border-line-strong bg-parchment text-ink-muted', dot: 'bg-ink-muted' },
}

/** Label and meaning come from domain/status; this adds the visual treatment. */
export const STATUS_META: Record<RecordStatus, { label: string; description: string; icon: LucideIcon; badge: string; dot: string }> = Object.fromEntries(
  (Object.keys(VISUALS) as RecordStatus[]).map((s) => [
    s,
    { ...VISUALS[s], label: RECORD_STATUS_DEFINITIONS[s].label, description: RECORD_STATUS_DEFINITIONS[s].description },
  ]),
) as Record<RecordStatus, { label: string; description: string; icon: LucideIcon; badge: string; dot: string }>

/**
 * A record's state: Submitted, or Archived once the records office has
 * retired it. This is never an approval state — there is no approval step.
 */
export function StatusBadge({ status, className, compact }: { status: RecordStatus; className?: string; compact?: boolean }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11.5px] leading-5 font-medium whitespace-nowrap', meta.badge, className)}
    >
      <Icon className="size-3.5" aria-hidden />
      {compact ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  )
}

const RESULT_TONE = 'border-navy-700/25 bg-navy-50 text-navy-800'

/**
 * The result a student recorded for an achievement — Winner, Runner-up,
 * Participant and so on. Shown wherever the outcome matters, which is
 * everywhere the old verification badge used to appear.
 */
export function ResultBadge({ type, position, className }: { type: string; position?: string; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-px text-[11.5px] leading-5 font-medium whitespace-nowrap', RESULT_TONE, className)}
    >
      {type}
      {position ? ` · ${position}` : ''}
    </span>
  )
}
