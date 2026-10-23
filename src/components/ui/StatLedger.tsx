import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '../../lib/cn'

export interface LedgerItem {
  label: string
  value: number | string
  icon?: LucideIcon
  note?: ReactNode
  /** Pastel used for the tile's icon chip. */
  tone?: 'default' | 'navy' | 'lavender' | 'terracotta'
}

const toneChip: Record<NonNullable<LedgerItem['tone']>, string> = {
  default: 'bg-butter-200 text-butter-700',
  navy: 'bg-navy-800 text-white',
  lavender: 'bg-lavender-200 text-lavender-700',
  terracotta: 'bg-terracotta-100 text-terracotta-700',
}

/** Summary statistics as a row of compact white tiles, each with a pastel icon chip. */
export function StatLedger({ items, className, caption }: { items: LedgerItem[]; className?: string; caption?: string }) {
  return (
    <section aria-label={caption ?? 'Summary'} className={className}>
      <dl className={cn('grid grid-cols-2 gap-3', items.length > 4 ? 'md:grid-cols-3 2xl:grid-cols-6' : 'md:grid-cols-4')}>
        {items.map((item) => {
          const Icon = item.icon
          const tone = item.tone ?? 'default'
          return (
            <div key={item.label} className="paper flex flex-col gap-1 border-t-[3px] border-t-navy-800 p-4">
              <dt className="flex items-center gap-2 text-[12.5px] font-medium text-ink-muted">
                {Icon && (
                  <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', toneChip[tone])} aria-hidden>
                    <Icon className="size-3.5" />
                  </span>
                )}
                {item.label}
              </dt>
              <dd className="mt-1.5 text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">{item.value}</dd>
              {item.note && <dd className="text-[12px] text-ink-muted">{item.note}</dd>}
            </div>
          )
        })}
      </dl>
    </section>
  )
}
