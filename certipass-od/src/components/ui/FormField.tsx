import { cloneElement, useId } from 'react'
import type { InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { AlertCircle, Lock } from 'lucide-react'
import { cn } from '../../lib/cn'

interface FieldProps {
  label: string
  hint?: string
  error?: string
  required?: boolean
  /** Verified, read-only profile data. */
  locked?: boolean
  className?: string
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>
}

/** Wires a label, hint and error message to a single control. */
export function Field({ label, hint, error, required, locked, className, children }: FieldProps) {
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-err` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 flex items-center gap-1.5 text-[13px] font-semibold text-ink">
        {label}
        {required && (
          <span className="text-red-fg" aria-hidden>
            *
          </span>
        )}
        {locked && <Lock className="size-3 text-ink-muted" aria-label="Verified from your profile" />}
      </label>
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-1 flex items-start gap-1 text-xs font-medium text-red-fg">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

const control =
  'block h-10 w-full rounded-md border border-line-strong bg-white px-3 text-sm text-ink placeholder:text-ink-muted/70 ' +
  'hover:border-purple-300 focus:border-purple focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-dark/70 ' +
  'aria-[invalid=true]:border-red-fg read-only:bg-lavender read-only:text-ink-soft disabled:bg-lavender disabled:text-ink-muted'

export function TextInput({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(control, className)} {...rest} />
}

export function SelectInput({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(control, 'pr-8', className)} {...rest}>
      {children}
    </select>
  )
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(control, 'h-auto min-h-24 py-2 leading-relaxed', className)} {...rest} />
}

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode
  error?: string
}

export function Checkbox({ label, error, className, id, ...rest }: CheckboxProps) {
  const auto = useId()
  const cid = id ?? auto
  return (
    <div className={className}>
      <label htmlFor={cid} className="flex cursor-pointer items-start gap-3 text-sm text-ink">
        <input
          id={cid}
          type="checkbox"
          className="mt-0.5 size-5 shrink-0 cursor-pointer rounded border-line-strong accent-purple"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${cid}-err` : undefined}
          {...rest}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p id={`${cid}-err`} role="alert" className="mt-1 ml-8 flex items-start gap-1 text-xs font-medium text-red-fg">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}
