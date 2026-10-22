import type { LucideIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '../../lib/cn'

interface StatCardProps {
  label: string
  value: number | string
  icon: LucideIcon
  hint?: string
  to?: string
  /** Gold top rule for the one figure that needs attention. */
  emphasis?: boolean
}

export function StatCard({ label, value, icon: Icon, hint, to, emphasis }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="kicker">{label}</p>
        <Icon className="size-5 text-purple-500" aria-hidden />
      </div>
      <p className="mt-2 text-3xl font-semibold tracking-tight text-purple-dark tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </>
  )
  const cls = cn('panel block border-t-[3px] p-4', emphasis ? 'border-t-gold' : 'border-t-purple', to && 'transition-colors hover:bg-lavender')
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  )
}
