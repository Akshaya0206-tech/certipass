import { cn } from '../lib/cn'

/*
 * Rajalakshmi Engineering College artwork (supplied by the college), served from /public.
 * Do not recolour, stretch or crop it.
 */

/** The REC mark (R and torch). The size classes set the box (default size-8); the artwork keeps its own proportions inside it. */
export function LogoMark({ className, inverse }: { className?: string; inverse?: boolean }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', className ?? 'size-8', inverse && 'rounded-md bg-white p-0.5')} aria-hidden>
      <img src="/rec-mark.png" width={324} height={486} alt="" draggable={false} className="h-full w-auto select-none" />
    </span>
  )
}

export function Logo({ className, inverse, subtitle }: { className?: string; inverse?: boolean; subtitle?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark inverse={inverse} className="size-9" />
      <span className="flex flex-col leading-none">
        <span className={cn('text-[17px] font-semibold tracking-[-0.02em]', inverse ? 'text-white' : 'text-navy-900')}>CertiPass</span>
        {subtitle && <span className={cn('mt-1 text-[11px] font-medium', inverse ? 'text-white/60' : 'text-ink-muted')}>{subtitle}</span>}
      </span>
    </span>
  )
}

/** The DADA logo, cut out so it sits on white or on the dark purple sign-in page. Set the height with a class, e.g. `h-9`. */
export function DadaLogo({ className }: { className?: string }) {
  return <img src="/dada-logo.webp" width={560} height={378} alt="DADA" draggable={false} className={cn('w-auto select-none', className)} />
}
