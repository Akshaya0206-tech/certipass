import type { ReactNode } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from './Button'

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <Loader2 className="size-5 animate-spin text-purple" aria-hidden />
      {label}…
    </div>
  )
}

interface EmptyProps {
  title: string
  body?: string
  action?: ReactNode
  icon?: LucideIcon
}

export function EmptyState({ title, body, action, icon: Icon }: EmptyProps) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      {Icon && (
        <span className="mb-3 flex size-14 items-center justify-center rounded-full bg-lavender-deep text-purple" aria-hidden>
          <Icon className="size-7" />
        </span>
      )}
      <h3 className="text-base font-semibold text-purple-dark">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', body, onRetry }: { title?: string; body?: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center px-4 py-10 text-center">
      <AlertTriangle className="mb-2 size-8 text-red-fg" aria-hidden />
      <h3 className="text-base font-semibold text-red-fg">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-muted">{body}</p>}
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2 p-4">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-10 animate-pulse rounded bg-lavender-deep" />
      ))}
    </div>
  )
}

export function InlineAlert({ tone = 'info', children }: { tone?: 'info' | 'error' | 'warning'; children: ReactNode }) {
  const cls =
    tone === 'error'
      ? 'border-red-line bg-red-bg text-red-fg'
      : tone === 'warning'
        ? 'border-amber-line bg-amber-bg text-amber-fg'
        : 'border-purple-200 bg-purple-100/60 text-purple-dark'
  return (
    <div role={tone === 'error' ? 'alert' : 'note'} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
      {children}
    </div>
  )
}
