import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import type { LinkProps } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger'
type Size = 'md' | 'sm'

/** Purple is the default; gold ("accent") is kept for the one key action on a screen. */
export function buttonClass(variant: Variant = 'primary', size: Size = 'md', extra?: string) {
  return cn(
    'inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-semibold whitespace-nowrap transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-55',
    size === 'md' ? 'h-10 px-4 text-sm' : 'h-9 px-3 text-[13px]',
    variant === 'primary' && 'bg-purple text-white hover:bg-purple-700 active:bg-purple-dark',
    variant === 'accent' && 'bg-gold text-purple-dark hover:bg-gold-dark active:bg-gold-dark',
    variant === 'secondary' && 'border border-line-strong bg-white text-purple-dark hover:bg-lavender',
    variant === 'ghost' && 'text-purple hover:bg-lavender-deep',
    variant === 'danger' && 'border border-red-line bg-white text-red-fg hover:bg-red-bg',
    extra,
  )
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, loading, disabled, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClass(variant, size, className)}
      {...rest}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  )
})

interface LinkButtonProps extends LinkProps {
  variant?: Variant
  size?: Size
}

export function LinkButton({ variant, size, className, ...rest }: LinkButtonProps) {
  return <Link className={buttonClass(variant, size, className)} {...rest} />
}
