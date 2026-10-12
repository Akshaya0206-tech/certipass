import { BadgeCheck, CircleAlert, Clock3, ScanSearch } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { STATUS_DEFINITIONS } from '../../domain/status'
import type { SubmissionStatus } from '../../types'

const VISUALS: Record<SubmissionStatus, { icon: LucideIcon; badge: string; dot: string }> = {
  submitted: { icon: Clock3, badge: 'border-butter-200 bg-butter-50 text-butter-700', dot: 'bg-butter-500' },
  under_review: { icon: ScanSearch, badge: 'border-lavender-200 bg-lavender-100 text-lavender-700', dot: 'bg-lavender-500' },
  needs_attention: { icon: CircleAlert, badge: 'border-terracotta-100 bg-terracotta-50 text-terracotta-700', dot: 'bg-terracotta-500' },
  verified: { icon: BadgeCheck, badge: 'border-sky-200 bg-sky-50 text-sky-700', dot: 'bg-sky-500' },
}

/** Label and meaning come from domain/status; this adds the visual treatment. */
export const STATUS_META: Record<SubmissionStatus, { label: string; description: string; icon: LucideIcon; badge: string; dot: string }> =
  Object.fromEntries(
    (Object.keys(VISUALS) as SubmissionStatus[]).map((s) => [s, { ...VISUALS[s], label: STATUS_DEFINITIONS[s].label, description: STATUS_DEFINITIONS[s].description }]),
  ) as Record<SubmissionStatus, { label: string; description: string; icon: LucideIcon; badge: string; dot: string }>

export function StatusBadge({ status, className, compact }: { status: SubmissionStatus; className?: string; compact?: boolean }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-px text-[11.5px] leading-5 font-medium whitespace-nowrap',
        meta.badge,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {compact ? <span className="sr-only">{meta.label}</span> : meta.label}
    </span>
  )
}
