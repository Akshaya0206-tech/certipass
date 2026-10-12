import { cloneElement, isValidElement, useId, useState } from 'react'
import type { InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import { cn } from '../../lib/cn'

const controlBase =
  'w-full rounded-lg border bg-white px-3 text-[14px] text-ink placeholder:text-ink-muted/70 transition-colors focus:outline-none focus-visible:outline-none focus:ring-2 focus:ring-lavender-300 disabled:bg-parchment disabled:text-ink-muted'

export function controlClasses(invalid?: boolean, className?: string) {
  return cn(
    controlBase,
    invalid ? 'border-terracotta-500 focus:border-terracotta-500' : 'border-line-strong focus:border-navy-700',
    className,
  )
}

interface FieldProps {
  label: string
  required?: boolean
  optional?: boolean
  hint?: ReactNode
  error?: string
  className?: string
  /** A single form control. It receives id, aria-invalid and aria-describedby. */
  children: ReactElement<Record<string, unknown>>
}

export function Field({ label, required, optional, hint, error, className, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  const control = isValidElement(children)
    ? cloneElement(children, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        'aria-required': required || undefined,
        invalid: error ? true : undefined,
      })
    : children

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline gap-1.5 text-[13px] font-medium text-ink-soft">
        {label}
        {required && (
          <span className="text-terracotta-600" aria-hidden>
            *
          </span>
        )}
        {optional && <span className="font-normal text-ink-muted">(optional)</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-[12.5px] text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-[12.5px] text-terracotta-700" role="alert">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

type InvalidProp = { invalid?: boolean }

export function TextInput({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & InvalidProp) {
  return <input className={controlClasses(invalid, cn('h-10', className))} {...rest} />
}

export function PasswordInput({ invalid, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & InvalidProp) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        className={controlClasses(invalid, cn('h-10 pr-11', className))}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-ink-muted hover:text-navy-900"
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
      >
        {visible ? <EyeOff className="size-[18px]" aria-hidden /> : <Eye className="size-[18px]" aria-hidden />}
      </button>
    </div>
  )
}

export function SelectInput({ invalid, className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & InvalidProp) {
  return (
    <select className={controlClasses(invalid, cn('h-10 appearance-none bg-[length:16px] bg-[right_10px_center] bg-no-repeat pr-9', className))} style={{ backgroundImage: CHEVRON }} {...rest}>
      {children}
    </select>
  )
}

export function TextArea({ invalid, className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & InvalidProp) {
  return <textarea className={controlClasses(invalid, cn('min-h-24 py-2.5 leading-relaxed', className))} {...rest} />
}

export const CHEVRON =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23707782' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")"
