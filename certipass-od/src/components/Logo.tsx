import { cn } from '../lib/cn'

/*
 * Official REC mark (the R and torch), supplied by the college and cut out of
 * the supplied JPEG. The file lives in /public. Do not recolour, stretch or
 * crop it. On small dark surfaces it sits on a white plate so it keeps its
 * official colours.
 */
const MARK = { src: '/rec-mark.png', width: 324, height: 486 }
const DADA = { src: '/dada-logo.webp', width: 560, height: 378 }

const NAME = 'Rajalakshmi Engineering College'

/** The R-and-torch mark. Set the height with a class, e.g. `h-8`. */
export function LogoMark({ className, decorative }: { className?: string; decorative?: boolean }) {
  return (
    <img
      src={MARK.src}
      width={MARK.width}
      height={MARK.height}
      alt={decorative ? '' : `${NAME} logo`}
      aria-hidden={decorative || undefined}
      draggable={false}
      className={cn('w-auto select-none', className)}
    />
  )
}

/** Mark beside the portal name, used in the sidebar. */
export function Logo({ onDark }: { onDark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className={cn('flex h-11 w-10 shrink-0 items-center justify-center rounded-sm', onDark && 'bg-white')}>
        <LogoMark decorative className="h-8" />
      </span>
      <span className="leading-tight">
        <span className={cn('block text-sm font-semibold', onDark ? 'text-white' : 'text-purple-dark')}>{NAME}</span>
        <span className={cn('block text-xs', onDark ? 'text-purple-200' : 'text-ink-muted')}>OD Certificate Pass Portal</span>
      </span>
    </span>
  )
}

/** The DADA logo, cut out of its dark background so it sits on white. Set the height with a class, e.g. `h-24`. */
export function DadaLogo({ className }: { className?: string }) {
  return (
    <img
      src={DADA.src}
      width={DADA.width}
      height={DADA.height}
      alt="DADA"
      draggable={false}
      className={cn('w-auto select-none', className)}
    />
  )
}
