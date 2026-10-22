import { CheckCircle2, Clock, FileEdit, XCircle } from 'lucide-react'
import { cn } from '../../lib/cn'
import type { OdStatus } from '../../types'

const META = {
  pending: { label: 'Pending', icon: Clock, cls: 'border-amber-line bg-amber-bg text-amber-fg' },
  approved: { label: 'Approved', icon: CheckCircle2, cls: 'border-purple-200 bg-purple-100 text-purple-dark border-l-[3px] border-l-gold-dark' },
  rejected: { label: 'Rejected', icon: XCircle, cls: 'border-red-line bg-red-bg text-red-fg' },
  draft: { label: 'Draft', icon: FileEdit, cls: 'border-line-strong bg-white text-ink-muted' },
} as const

/** Status is always shown as an icon plus a word, never colour alone. */
export function StatusChip({ status, className }: { status: OdStatus; className?: string }) {
  const m = META[status]
  const Icon = m.icon
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-semibold whitespace-nowrap', m.cls, className)}
    >
      <Icon className="size-3.5" aria-hidden />
      {m.label}
    </span>
  )
}

export const statusLabel = (s: OdStatus) => META[s].label
