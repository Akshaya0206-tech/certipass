import { cn } from '../lib/cn'

/** Compact mark: a certificate page with a lavender seal. */
export function LogoMark({ className, inverse }: { className?: string; inverse?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-8', className)} aria-hidden>
      <rect width="32" height="32" rx="9" className={inverse ? 'fill-white' : 'fill-navy-800'} />
      <path
        d="M10 8h9.5a3.5 3.5 0 0 1 3.5 3.5V24H12.5A2.5 2.5 0 0 1 10 21.5V8z"
        fill="none"
        strokeWidth="1.8"
        className={inverse ? 'stroke-navy-800' : 'stroke-white'}
      />
      <path d="M13.5 12.5h6M13.5 15.5h4" strokeWidth="1.4" strokeLinecap="round" className={inverse ? 'stroke-navy-800/50' : 'stroke-white/55'} />
      <circle cx="19" cy="21" r="3" className="fill-lavender-300" />
    </svg>
  )
}

export function Logo({ className, inverse, subtitle }: { className?: string; inverse?: boolean; subtitle?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark inverse={inverse} />
      <span className="flex flex-col leading-none">
        <span className={cn('text-[17px] font-semibold tracking-[-0.02em]', inverse ? 'text-white' : 'text-ink')}>CertiPass</span>
        {subtitle && <span className={cn('mt-1 text-[11px] font-medium', inverse ? 'text-white/60' : 'text-ink-muted')}>{subtitle}</span>}
      </span>
    </span>
  )
}
