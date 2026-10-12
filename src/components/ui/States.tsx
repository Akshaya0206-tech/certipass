import type { ReactNode } from 'react'
import { BookDashed, CircleAlert, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

export function EmptyState({
  icon: Icon = BookDashed,
  title,
  body,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  body?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-lavender-100 text-lavender-700">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="font-serif text-[15px] text-navy-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', body, action }: { title?: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-terracotta-100 bg-terracotta-50 px-6 py-10 text-center">
      <CircleAlert className="mb-3 size-6 text-terracotta-600" aria-hidden />
      <p className="font-serif text-[15px] text-navy-900">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-soft">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function Spinner({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <span role="status" className={cn('inline-flex items-center gap-2 text-sm text-ink-muted', className)}>
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  )
}

/** Skeleton rows that echo the shape of a record list while it loads. */
export function LoadingRows({ rows = 4, label = 'Loading records' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-4">
          <div className="h-9 w-9 animate-pulse rounded bg-parchment-deep/70" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 animate-pulse rounded bg-parchment-deep/80" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-parchment-deep/60" />
          </div>
          <div className="h-5 w-20 animate-pulse rounded-full bg-parchment-deep/60" />
        </div>
      ))}
      <span className="sr-only">{label}</span>
    </div>
  )
}
