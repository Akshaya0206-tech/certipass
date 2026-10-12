import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

interface PageHeaderProps {
  kicker?: ReactNode
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ kicker, title, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-3 md:flex-row md:items-end md:justify-between', className)}>
      <div className="min-w-0">
        {kicker && <p className="label-archival mb-1.5">{kicker}</p>}
        <h1 className="display text-[20px] leading-tight md:text-[24px]">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-[13.5px] text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionHeading({ title, aside, id }: { title: ReactNode; aside?: ReactNode; id?: string }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <h2 id={id} className="font-serif text-[16px] text-navy-900">
        {title}
      </h2>
      {aside}
    </div>
  )
}
